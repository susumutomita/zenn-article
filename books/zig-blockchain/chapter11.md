---
title: "Solidity ABIを簡易EVMで動かす"
free: true
---

## この章のゴール

第10章で作ったEVMへ、Solidityと同じABI形式のcalldataを渡します。ここでは次の境界を固めます。

- Solidityのcreation codeとruntime codeの違いを確認する
- `add(uint256,uint256)` の関数セレクタと引数配置を理解する
- 同じ処理を `src/evm.zig` のテストで再現する
- デプロイ処理がruntime codeを保存し、採掘済みブロックへ記録する流れを確認する

この章の完成コードと完全差分は次のとおりです。

- 章チェックポイント: `references/chapter11/`
- 第8章と第10章からの完全差分: `references/book-patches/chapter11.patch`
- 本書の完成形: リポジトリ直下の `src/` と `contract/`

`references/chapter11/`は、第12章で追加する`--deploy`、`--call`、`EVM_TX`、64 KiBフレームをまだ含まない、第11章だけのスナップショットです。実装は、第8章のP2Pスナップショットと第10章のEVMスナップショットから作業コピーを組み立て、章の完全差分を適用して始めます。以降の各節はpatch内の変更と同じ順序で、なぜそのコードが必要かを確認します。

## P2PとEVMの作業コピーを作る

```text
対象パス:   .zig-book-work/chapter11/
開始地点:   references/chapter8、references/chapter10の全ゲートが成功した状態
今回の変更: 第8章のP2Pノードへ第10章のEVMを置き、chapter11.patchを適用
テスト:     git apply --check、zig fmt --check .、zig build test --summary all、zig build
実行:       なし。CLIと複数ノード受け入れは第12章で追加する
期待結果:   読者の作業コピー自身が第11章の全モジュールをビルド・テストできる
```

リポジトリルートで作業コピーを作ります。`references/chapter11/`や`references/EVMchapter/`を作業元としてコピーしません。

```bash
ROOT=$(git rev-parse --show-toplevel)
WORK="$ROOT/.zig-book-work/chapter11"
cd "$ROOT"
mkdir -p .zig-book-work
test ! -e "$WORK" || {
  echo ".zig-book-work/chapter11 already exists" >&2
  exit 1
}
cp -R references/chapter8 "$WORK"
cp references/chapter10/src/evm_types.zig "$WORK/src/"
cp references/chapter10/src/evm.zig "$WORK/src/"
mkdir -p "$WORK/contract"

git -C "$WORK" init -q
git -C "$WORK" apply --check \
  "$ROOT/references/book-patches/chapter11.patch"
git -C "$WORK" apply \
  "$ROOT/references/book-patches/chapter11.patch"
rm -rf "$WORK/.git"

cd "$WORK"
zig fmt --check .
zig build test --summary all
zig build
```

`git apply --check`が失敗した場合はpatchを強制適用せず、作業コピーを作り直してください。一時的な`.git`は、親の`BlockChain`作業ツリーではなく`.zig-book-work/chapter11/`へだけpatchを適用する境界です。この完全差分には、各節の掲載コードだけでなく、import、所有権処理、JSON往復、改ざんテスト、`build.zig`と`build.zig.zon`まで含まれます。したがって、本文に出ていない接着コードを読者が推測する必要はありません。

| 本文の節 | `chapter11.patch`で完成する主なファイル |
| --- | --- |
| 0. EVMトランザクション | `src/types.zig`、`src/blockchain.zig`、`src/parser.zig` |
| 1. Solidityコントラクト | `contract/SimpleAdder.sol` |
| 2〜4. ABIとエラー情報 | `src/evm.zig`、`src/evm_types.zig` |
| 5. デプロイブロック | `src/blockchain.zig`、`src/p2p.zig` |
| 6. 章ゲート | `build.zig`、`build.zig.zon`を含む作業コピー全体 |

第8章の`build.zig`は実行ファイル名が`chapter8`のままで、追加したEVMも`zig build test`の対象になりません。適用したpatchは`build.zig`を次の内容へ置き換え、P2PとEVMの全モジュールを同じ品質ゲートへ入れます。手入力で追う場合も、このコードブロック全体を使います。

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe_mod.addImport("evmchapter_lib", lib_mod);

    const lib = b.addLibrary(.{
        .linkage = .static,
        .name = "evmchapter",
        .root_module = lib_mod,
    });
    b.installArtifact(lib);

    const exe = b.addExecutable(.{
        .name = "evmchapter",
        .root_module = exe_mod,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);
    const run_step = b.step("run", "Run the chapter 11 EVM node");
    run_step.dependOn(&run_cmd.step);

    const test_step = b.step("test", "Run unit tests");
    const test_modules = [_][]const u8{
        "root",   "main", "blockchain", "errors", "evm",   "evm_types",
        "logger", "p2p",  "parser",     "types",  "utils",
    };
    for (test_modules) |name| {
        const module = b.createModule(.{
            .root_source_file = b.path(b.fmt("src/{s}.zig", .{name})),
            .target = target,
            .optimize = optimize,
        });
        const unit_tests = b.addTest(.{
            .name = b.fmt("test-{s}", .{name}),
            .root_module = module,
        });
        const run_unit_tests = b.addRunArtifact(unit_tests);
        test_step.dependOn(&run_unit_tests.step);
    }
}
```

`build.zig.zon`のパッケージ名も作業章へ合わせます。Zig 0.14.0は名前とfingerprintの組を検証するため、新しい章スナップショットとして表示されたfingerprintへ同時に更新します。

```diff
-.name = .chapter8,
+.name = .chapter11,
-.fingerprint = 0x262fdb695906c817,
+.fingerprint = 0x6656a2d994203d47,
```

patch適用後の読者の作業コピーをもう一度確認します。

```bash
zig fmt --check .
zig build test
zig test src/evm.zig
zig build
```

macOSでは、第10章までと同様にZig 0.14.0のDockerイメージ内で同じ4コマンドを実行してください。以降の相対パスは、この`.zig-book-work/chapter11/`を基準にします。`references/chapter11/`だけをテストして読者の作業コピーの合格に置き換えてはいけません。

## 0. EVMトランザクションをブロックへ組み込む

```text
対象パス:   .zig-book-work/chapter11/src/types.zig、blockchain.zig、parser.zig
開始地点:   ch10-sec06-evm-engine
今回の変更: EVM用トランザクションフィールドを追加し、その全フィールドをブロックhashとJSONへ含める
テスト:     zig build test --summary all
実行:       第5節のデプロイブロック作成
期待結果:   evm_data、gas_limit、runtime codeのどれかを書き換えるとPoW検証に失敗し、JSON往復後もhashが一致する
```

`src/types.zig`の`Transaction`へEVM実行に必要なフィールドを追加し、`Block`へデプロイ済みruntime codeを同期するマップを追加します。

```zig
pub const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
    tx_type: u8 = 0, // 0:送金、1:deploy、2:call
    evm_data: ?[]const u8 = null,
    gas_limit: usize = 1_000_000,
    gas_price: u64 = 20_000_000_000,
    id: [32]u8 = [_]u8{0} ** 32,
};

pub const Block = struct {
    // 第8章までのフィールドはそのまま
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    nonce: u64,
    data: []const u8,
    hash: [32]u8,
    contracts: ?std.StringHashMap([]const u8) = null,
};
```

第8章の`calculateHash`でsender、receiver、amountだけをハッシュしたままでは、`evm_data`やruntime codeを書き換えてもブロックhashが変わりません。また、可変長文字列を長さなしで連結すると、異なるフィールド境界が同じバイト列になる可能性があります。ここではバージョンタグ、件数、長さ、nullマーカーを含む正規形へ変更します。

`calculateHash`を次へ置き換え、直後へ4つの補助関数を追加します。

```zig
pub fn calculateHash(block: *const types.Block) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update("ZIG_BLOCK_V2");

    const index_bytes = utils.toBytesU32(block.index);
    const timestamp_bytes = utils.toBytesU64(block.timestamp);
    const nonce_bytes = utils.toBytesU64(block.nonce);
    hasher.update(&index_bytes);
    hasher.update(&timestamp_bytes);
    hasher.update(&nonce_bytes);
    hasher.update(&block.prev_hash);

    hashLength(&hasher, block.transactions.items.len);
    for (block.transactions.items) |tx| {
        hashTransactionFields(&hasher, &tx, true);
    }

    hashBytes(&hasher, block.data);
    hashContracts(&hasher, block.contracts);
    return hasher.finalResult();
}

fn hashTransactionFields(
    hasher: *Sha256,
    tx: *const types.Transaction,
    include_id: bool,
) void {
    hashBytes(hasher, tx.sender);
    hashBytes(hasher, tx.receiver);

    const amount_bytes = utils.toBytesU64(tx.amount);
    const gas_limit_bytes = utils.toBytesU64(@intCast(tx.gas_limit));
    const gas_price_bytes = utils.toBytesU64(tx.gas_price);
    hasher.update(&amount_bytes);
    hasher.update(&[_]u8{tx.tx_type});
    hasher.update(&gas_limit_bytes);
    hasher.update(&gas_price_bytes);
    if (include_id) hasher.update(&tx.id);

    if (tx.evm_data) |evm_data| {
        hasher.update(&[_]u8{1});
        hashBytes(hasher, evm_data);
    } else {
        hasher.update(&[_]u8{0});
    }
}

fn hashLength(hasher: *Sha256, len: usize) void {
    const len_bytes = utils.toBytesU64(@intCast(len));
    hasher.update(&len_bytes);
}

fn hashBytes(hasher: *Sha256, bytes: []const u8) void {
    hashLength(hasher, bytes.len);
    hasher.update(bytes);
}

fn hashContracts(
    hasher: *Sha256,
    maybe_contracts: ?std.StringHashMap([]const u8),
) void {
    const contracts = maybe_contracts orelse {
        hasher.update(&[_]u8{0});
        return;
    };
    hasher.update(&[_]u8{1});
    hashLength(hasher, contracts.count());

    var previous_key: ?[]const u8 = null;
    var emitted: usize = 0;
    while (emitted < contracts.count()) : (emitted += 1) {
        var candidate: ?[]const u8 = null;
        var it = contracts.iterator();
        while (it.next()) |entry| {
            const key = entry.key_ptr.*;
            if (previous_key) |previous| {
                if (std.mem.order(u8, previous, key) != .lt) continue;
            }
            if (candidate == null or
                std.mem.order(u8, key, candidate.?) == .lt)
            {
                candidate = key;
            }
        }

        const key = candidate orelse unreachable;
        hashBytes(hasher, key);
        hashBytes(hasher, contracts.get(key).?);
        previous_key = key;
    }
}
```

`StringHashMap`の反復順には依存せず、アドレスを辞書順に選び直します。学習用ブロックのコントラクト数は少ないため、割り当てなしのO(n²)走査を使います。トランザクションID用の関数も追加し、自己参照になる`id`だけを対象外にします。

```zig
pub fn calculateTransactionHash(tx: *const types.Transaction) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update("ZIG_TX_V2");
    hashTransactionFields(&hasher, tx, false);
    return hasher.finalResult();
}
```

`parser.zig`のブロックJSONにも`tx_type`、`gas_limit`、`gas_price`、`evm_data`、64桁の`id`を含め、受信時に同じ値へ戻してください。hashへ含めたフィールドを通信で落とすと、受信側の再計算hashが一致しません。

`sender`、`receiver`、ブロックの`data`、コントラクトアドレスは利用者入力を含む文字列です。`"{s}"`へ直接差し込まず、先に`std.json.stringifyAlloc`で引用符とバックスラッシュをescapeし、返されたJSON文字列を引用符なしの`{s}`へ埋め込みます。

```zig
const sender_json = try std.json.stringifyAlloc(allocator, tx.sender, .{});
defer allocator.free(sender_json);
const receiver_json = try std.json.stringifyAlloc(allocator, tx.receiver, .{});
defer allocator.free(receiver_json);
const tx_json_base = try std.fmt.allocPrintZ(
    allocator,
    "{{\"sender\":{s},\"receiver\":{s},\"amount\":{d}}}",
    .{ sender_json, receiver_json, tx.amount },
);

const data_json = try std.json.stringifyAlloc(allocator, block.data, .{});
defer allocator.free(data_json);
```

これにより、`say "hello" \\ path`のような入力もJSON往復後に同じバイト列へ戻ります。文字列を手書きで連結すると、ローカルでは採掘できてもピア側のJSON解析だけが失敗します。

JSONから読む合意対象の数値は、整数だけを受理します。特に`Block.index`は`u32`なので、JSON整数であっても`4294967296`は拒否します。`amount: 1.5`のような小数を暗黙に丸めることもありません。

```zig
test "block parser rejects out-of-range and floating consensus numbers" {
    const zero_hash = "0000000000000000000000000000000000000000000000000000000000000000";
    const invalid_index = try std.fmt.allocPrint(std.testing.allocator, "{{\"index\":4294967296,\"timestamp\":0,\"prev_hash\":\"{s}\",\"transactions\":[],\"nonce\":0,\"data\":\"\",\"hash\":\"{s}\",\"contracts\":null}}", .{ zero_hash, zero_hash });
    defer std.testing.allocator.free(invalid_index);
    try std.testing.expectError(error.InvalidFormat, parseBlockJson(invalid_index));

    const floating_amount = try std.fmt.allocPrint(std.testing.allocator, "{{\"index\":0,\"timestamp\":0,\"prev_hash\":\"{s}\",\"transactions\":[{{\"sender\":\"a\",\"receiver\":\"b\",\"amount\":1.5}}],\"nonce\":0,\"data\":\"\",\"hash\":\"{s}\",\"contracts\":null}}", .{ zero_hash, zero_hash });
    defer std.testing.allocator.free(floating_amount);
    try std.testing.expectError(error.InvalidFormat, parseBlockJson(floating_amount));
}
```

`parseBlockJson`はJSON解析用arenaの参照を返しません。文字列、`evm_data`、トランザクション、コントラクトmapを独立した所有メモリへ複製して返します。`addBlock`成功時はチェインへ所有権を移し、拒否時やテスト終了時は`parser.deinitParsedBlock`でまとめて解放します。

```zig
test "block hash commits EVM transaction payload and gas fields" {
    var evm_data = [_]u8{ 0x01, 0x02, 0x03 };
    var block = types.Block{
        .index = 1,
        .timestamp = 1672531201,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(std.testing.allocator),
        .nonce = 0,
        .data = "EVM transaction",
        .hash = [_]u8{0} ** 32,
        .contracts = null,
    };
    defer block.transactions.deinit();
    try block.transactions.append(.{
        .sender = "0xsender",
        .receiver = "0xreceiver",
        .amount = 0,
        .tx_type = 2,
        .evm_data = evm_data[0..],
        .gas_limit = 100_000,
        .gas_price = 10,
    });

    const original = calculateHash(&block);
    evm_data[0] ^= 0xff;
    const payload_tampered = calculateHash(&block);
    try std.testing.expect(!std.mem.eql(u8, original[0..], payload_tampered[0..]));

    evm_data[0] ^= 0xff;
    block.transactions.items[0].gas_limit += 1;
    const gas_tampered = calculateHash(&block);
    try std.testing.expect(!std.mem.eql(u8, original[0..], gas_tampered[0..]));
}
```

`contracts = null`と「non-nullだが0件のmap」はhash上で別の値です。`serializeBlock`は前者を`null`、後者を`{}`として出力し、`parseBlockJson`も区別して戻します。空mapを`null`へ変換するとJSON往復後のPoWが壊れるため、次の回帰テストも追加します。

JSONオブジェクトを`ArrayList(u8)`へ直接組み立てる箇所では、開始と終了を`appendSlice("{")`、`appendSlice("}")`と書きます。`std.fmt`の書式文字列で必要な`"{{"`、`"}}"`を生文字列のappendへ流用すると、空mapが不正な`{{}}`になり、`parseBlockJson`が`SyntaxError`を返します。

```zig
test "serialized block preserves a non-null empty contracts map" {
    var block = types.Block{
        .index = 1,
        .timestamp = 1_672_531_203,
        .prev_hash = [_]u8{0x11} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(
            std.testing.allocator,
        ),
        .nonce = 0,
        .data = "empty contracts round trip",
        .hash = [_]u8{0} ** 32,
        .contracts = std.StringHashMap([]const u8).init(
            std.testing.allocator,
        ),
    };
    defer block.transactions.deinit();
    defer block.contracts.?.deinit();
    mineBlock(&block, DIFFICULTY);

    const json = try parser.serializeBlock(block);
    defer std.heap.page_allocator.free(json);
    var decoded = try parser.parseBlockJson(json);
    defer parser.deinitParsedBlock(&decoded);

    try std.testing.expect(decoded.contracts != null);
    try std.testing.expectEqual(@as(usize, 0), decoded.contracts.?.count());
    try std.testing.expect(verifyBlockPow(&decoded));
}
```

デプロイ済みruntime codeも同じブロックの合意対象です。creation codeとruntime codeのどちらか1バイトを変えた場合に、保存済みPoWが無効になることを確認します。

```zig
test "EVM payload and deployed runtime tampering invalidate block PoW" {
    var evm_data = [_]u8{ 0x60, 0x01, 0x60, 0x02 };
    var runtime_code = [_]u8{ 0x60, 0x03, 0x60, 0x04 };
    var block = types.Block{
        .index = 1,
        .timestamp = 1_672_531_201,
        .prev_hash = [_]u8{0x22} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(
            std.testing.allocator,
        ),
        .nonce = 0,
        .data = "Contract Deployment",
        .hash = [_]u8{0} ** 32,
        .contracts = std.StringHashMap([]const u8).init(
            std.testing.allocator,
        ),
    };
    defer block.transactions.deinit();
    defer block.contracts.?.deinit();
    try block.transactions.append(.{
        .sender = "0xsender",
        .receiver = "0xcontract",
        .amount = 0,
        .tx_type = 1,
        .evm_data = &evm_data,
        .gas_limit = 3_000_000,
        .gas_price = 10,
    });
    try block.contracts.?.put("0xcontract", &runtime_code);
    mineBlock(&block, DIFFICULTY);
    try std.testing.expect(verifyBlockPow(&block));

    evm_data[0] ^= 0xff;
    try std.testing.expect(!verifyBlockPow(&block));
    evm_data[0] ^= 0xff;
    try std.testing.expect(verifyBlockPow(&block));

    runtime_code[0] ^= 0xff;
    try std.testing.expect(!verifyBlockPow(&block));
}
```

## 1. Solidityコントラクトを用意する

```text
対象パス:   .zig-book-work/chapter11/contract/SimpleAdder.sol
開始地点:   ch11-sec00-evm-transaction-fields
今回の変更: add/sub/mul/divを持つ教材コントラクトを追加し、本章ではaddを呼び出す
テスト:     solc 0.8.24で--bin --abi
実行:       Adder.binとAdder.abiを生成
期待結果:   両ファイルが空でなく、creation codeを取得できる
```

### 対象ファイル

`contract/SimpleAdder.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Adder {
    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }

    function sub(uint256 a, uint256 b) public pure returns (uint256) {
        require(b <= a, "underflow");
        return a - b;
    }

    function mul(uint256 a, uint256 b) public pure returns (uint256) {
        return a * b;
    }

    function div(uint256 a, uint256 b) public pure returns (uint256) {
        require(b != 0, "division by zero");
        return a / b;
    }
}
```

本章で呼び出すのは`add`だけです。`sub`、`mul`、`div`も含めることで、creation codeとruntime codeを含む実際のP2Pフレームが4 KiBを超える境界も第12章で確認します。コントラクト名は `Adder` です。そのため、`solc -o` が作るファイル名も `Adder.bin` と `Adder.abi` になります。

### コンパイルする

ローカルにsolcを入れず、バージョンを固定したコンテナを使います。生成物は、macOSからも共有しやすいリポジトリ直下の `.zig-book-out/` へ置きます。

```bash
mkdir -p .zig-book-out

docker run --rm \
  -v "$PWD:/work" \
  ethereum/solc:0.8.24 \
  --bin --abi --evm-version berlin /work/contract/SimpleAdder.sol \
  -o /work/.zig-book-out --overwrite

ls .zig-book-out/Adder.bin .zig-book-out/Adder.abi
```

`--evm-version berlin`は省略しません。コンパイラのデフォルトターゲットに依存せず、本章で受け入れ確認した命令構成へcreation codeを固定するためです。期待する結果は、両ファイルが存在することです。`Adder.bin` はデプロイ時に実行するcreation codeを16進文字列で保持します。creation codeを実行した戻り値がruntime codeです。

## 2. 関数セレクタとcalldataを組み立てる

```text
対象パス:   シェル変数DATA（ソース変更なし）
開始地点:   ch11-sec01-solidity-contract
今回の変更: セレクタと2つの32バイト引数を連結
テスト:     セレクタが771602f7、DATAが0xを含め138文字
実行:       printf '%s\n' "$DATA"
期待結果:   add(5,3)用の68バイトcalldataになる
```

EVMの関数呼び出しでは、calldataを次の順に並べます。

1. 4バイトの関数セレクタ
2. 32バイトへ左ゼロ埋めした第1引数
3. 32バイトへ左ゼロ埋めした第2引数

`add(uint256,uint256)` のセレクタをsolcで確認します。

```bash
docker run --rm \
  -v "$PWD:/work" \
  ethereum/solc:0.8.24 \
  --hashes /work/contract/SimpleAdder.sol
```

期待する行は次のとおりです。

```text
771602f7: add(uint256,uint256)
```

`add(5, 3)` のcalldataはシェルでも組み立てられます。

```bash
DATA="0x771602f7$(printf '%064x' 5)$(printf '%064x' 3)"
printf '%s\n' "$DATA"
```

全体は `0x` を除いて136桁、つまり68バイトになります。

## 3. ABI形式をEVMテストへ落とす

```text
対象パス:   .zig-book-work/chapter11/src/evm.zig
開始地点:   ch11-sec02-abi-calldata
今回の変更: CALLDATALOADと関数セレクタ分岐を使うABIテストを追加
テスト:     zig test src/evm.zig --test-filter "ABI calldata"
実行:       テスト内でruntime codeへ68バイトcalldataを渡す
期待結果:   32バイトの戻り値の末尾が08になる
```

### 対象ファイル

- `.zig-book-work/chapter11/src/evm.zig`
- 章末見本の`references/chapter11/src/evm.zig`

次のテストは完全差分によって読者の作業コピーへ入ります。小さなruntime codeがセレクタを検査し、calldataのオフセット4と36から引数を読み、32バイトの結果を返します。

```zig
test "ABI calldataでadd関数を実行" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    const runtime_bytecode = [_]u8{
        0x60, 0x00, // PUSH1 0
        0x35, // CALLDATALOAD
        0x60, 0xe0, // PUSH1 224
        0x1c, // SHR
        0x63, 0x77, 0x16, 0x02, 0xf7, // PUSH4 add(uint256,uint256)
        0x14, // EQ
        0x60, 0x10, // PUSH1 0x10 (JUMPDEST)
        0x57, // JUMPI
        0x00, // STOP
        0x5b, // JUMPDEST
        0x60, 0x04, // PUSH1 4
        0x35, // CALLDATALOAD
        0x60, 0x24, // PUSH1 36
        0x35, // CALLDATALOAD
        0x01, // ADD
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    var calldata = [_]u8{0} ** 68;
    @memcpy(calldata[0..4], &[_]u8{ 0x77, 0x16, 0x02, 0xf7 });
    calldata[35] = 5;
    calldata[67] = 3;

    const result = try execute(allocator, &runtime_bytecode, &calldata, 100_000);
    defer allocator.free(result);

    try std.testing.expectEqual(@as(usize, 32), result.len);
    for (result[0..31]) |byte| try std.testing.expectEqual(@as(u8, 0), byte);
    try std.testing.expectEqual(@as(u8, 8), result[31]);
}
```

ジャンプ先は `0x10` です。配列の16バイト目にある `JUMPDEST` と一致しない値を指定すると、EVMは不正ジャンプとして拒否します。

### テストする

まず共通のZig 0.14.0イメージを作ります。

```bash
docker build -t zig-blockchain-book .
```

ここでもテスト対象は読者の作業コピーです。

```bash
docker run --rm \
  --mount "type=bind,src=$PWD,dst=/work,readonly" \
  -w /work \
  zig-blockchain-book \
  zig test src/evm.zig --test-filter "ABI calldata"
```

`All 1 tests passed.` になれば成功です。章末見本との一致はリポジトリの`rebuild-book-code.sh`が別に検査するため、ここで見本のテストを読者実装の代わりにはしません。

## 4. 詳細な失敗情報を返す

```text
対象パス:   .zig-book-work/chapter11/src/evm.zig
開始地点:   ch11-sec03-abi-test
今回の変更: 成否、EVMError、失敗PC、メッセージを返す実行入口を追加
テスト:     zig test src/evm.zig --test-filter "EVM execution with error info"
実行:       不正opcodeをexecuteWithErrorInfoへ渡す
期待結果:   success=falseでerror_type、error_pc、error_messageがすべて設定される
```

完成形には通常の `execute` に加えて、エラー種別、失敗したPC、メッセージを返す `executeWithErrorInfo` があります。

### 対象ファイル

`src/evm.zig`

```zig
pub const EvmExecutionResult = struct {
    success: bool,
    data: []const u8,
    error_message: ?[]const u8,
    error_type: ?EVMError,
    error_pc: ?usize,
};

pub fn executeWithErrorInfo(
    allocator: std.mem.Allocator,
    code: []const u8,
    calldata: []const u8,
    gas_limit: usize,
) EvmExecutionResult {
    var context = EvmContext.init(allocator, code, calldata);
    context.gas = gas_limit;
    defer context.deinit();

    var result = EvmExecutionResult{
        .success = false,
        .data = &[_]u8{},
        .error_message = null,
        .error_type = null,
        .error_pc = null,
    };

    while (context.pc < context.code.len and !context.stopped) {
        executeStep(&context) catch |err| {
            result.error_type = switch (err) {
                EVMError.OutOfGas => EVMError.OutOfGas,
                EVMError.StackOverflow => EVMError.StackOverflow,
                EVMError.StackUnderflow => EVMError.StackUnderflow,
                EVMError.InvalidJump => EVMError.InvalidJump,
                EVMError.InvalidOpcode => EVMError.InvalidOpcode,
                EVMError.MemoryOutOfBounds => EVMError.MemoryOutOfBounds,
                EVMError.Revert => EVMError.Revert,
                else => EVMError.InvalidOpcode,
            };
            result.error_pc = context.pc;
            if (context.error_msg) |message| {
                result.error_message = allocator.dupe(u8, message) catch null;
            } else {
                result.error_message = std.fmt.allocPrint(
                    allocator,
                    "EVM実行エラー: {s} at PC={d}",
                    .{ @errorName(err), context.pc },
                ) catch null;
            }
            return result;
        };
    }

    result.success = true;
    result.data = allocator.dupe(u8, context.returndata.items) catch &[_]u8{};
    return result;
}
```

デプロイやコールの入口は、この結果を確認してからコードを保存します。失敗したcreation codeをコントラクトとして残さないためです。

既存の異常系テストだけを実行します。

```bash
docker run --rm zig-blockchain-book \
  zig test src/evm.zig --test-filter "EVM execution with error info"
```

期待する結果は `All 1 tests passed.` です。

## 5. デプロイをブロックへ記録する

```text
対象パス:   .zig-book-work/chapter11/src/blockchain.zig、main.zig
開始地点:   ch11-sec04-error-info
今回の変更: creation codeを実行し、runtime codeと所有権を持つTransactionをPoW済みブロックへ保存
テスト:     zig build test --summary all
実行:       第12章の--deployと--call
期待結果:   失敗時は保存せず、成功時だけcontracts=1のindex=1ブロックを作る
```

まずコントラクトアドレスからruntime codeを引くプロセス内ストレージを、`chain_store`と同じ場所へ追加します。チェインとEVM状態は必ず同じmutexで読み書きし、片方だけ更新された途中状態を別threadへ見せません。

```zig
pub var chain_store = std.ArrayList(types.Block).init(std.heap.page_allocator);

pub var contract_storage = std.StringHashMap([]const u8).init(std.heap.page_allocator);

var state_mutex: std.Thread.Mutex = .{};
```

第8章の`addBlock`が行っていたhash、PoW、index、`prev_hash`検証は、EVM状態を追加しても先に実行します。無効ブロックの`contracts`を先に保存すると、チェインへ追加されていないruntime codeだけが状態へ残るためです。既存の`AddBlockResult`を次へ拡張し、`addBlock`と補助関数を置き換えます。

```zig
pub const AddBlockResult = enum {
    added,
    duplicate,
    invalid_pow,
    invalid_index,
    invalid_prev_hash,
    invalid_genesis,
    storage_error,
};

pub fn addBlock(new_block: types.Block) AddBlockResult {
    state_mutex.lock();
    defer state_mutex.unlock();

    // 内容、PoW、チェーン上の位置をすべて検証し終えるまで、
    // contract_storage と chain_store には一切触れない。
    if (!verifyBlockPow(&new_block)) {
        std.log.warn("Received block fails hash/PoW check. Rejecting it.", .{});
        return .invalid_pow;
    }

    for (chain_store.items) |existing_block| {
        if (std.mem.eql(u8, &existing_block.hash, &new_block.hash)) {
            std.log.info("Block already exists; ignoring duplicate index={d}, hash={x}", .{ new_block.index, new_block.hash });
            return .duplicate;
        }
    }

    if (chain_store.items.len == 0) {
        if (new_block.index != 0) {
            std.log.warn("First block must have index 0, got {d}", .{new_block.index});
            return .invalid_index;
        }
        if (!isZeroHash(new_block.prev_hash)) {
            std.log.warn("Genesis block must have an all-zero prev_hash", .{});
            return .invalid_prev_hash;
        }
        if (!isDeterministicGenesis(&new_block)) {
            std.log.warn("First block does not match the deterministic genesis policy", .{});
            return .invalid_genesis;
        }
    } else {
        const tip = &chain_store.items[chain_store.items.len - 1];
        const expected_index = tip.index + 1;
        if (new_block.index != expected_index) {
            std.log.warn("Unexpected block index: expected={d}, got={d}", .{ expected_index, new_block.index });
            return .invalid_index;
        }
        if (!std.mem.eql(u8, &tip.hash, &new_block.prev_hash)) {
            std.log.warn("Block prev_hash does not match the current tip", .{});
            return .invalid_prev_hash;
        }
    }

    std.log.info("Adding block to chain: index={d}, hash={x}", .{ new_block.index, new_block.hash });

    // 追加領域を先に確保する。確保失敗時はEVM状態を変更しない。
    chain_store.ensureUnusedCapacity(1) catch |err| {
        std.log.err("Failed to reserve chain storage: {any}", .{err});
        return .storage_error;
    };

    // EVM状態は一時mapへ構築し、全処理が成功した場合だけ差し替える。
    // これにより.addedはchainとEVM状態の両方が更新されたことを表す。
    const next_contract_storage = cloneContractStorageWithBlock(&contract_storage, new_block) catch |err| {
        std.log.warn("Failed to prepare contract state: {any}", .{err});
        return .storage_error;
    };
    contract_storage.deinit();
    contract_storage = next_contract_storage;
    chain_store.appendAssumeCapacity(new_block);
    std.log.info("Added new block index={d}, nonce={d}, hash={x}", .{ new_block.index, new_block.nonce, new_block.hash });

    // state_mutexを保持したまま公開関数を呼ぶと自己deadlockするため、
    // ロック取得済みの内部関数を使う。
    printChainStateLocked();
    return .added;
}

fn cloneContractStorageWithBlock(
    current: *std.StringHashMap([]const u8),
    new_block: types.Block,
) !std.StringHashMap([]const u8) {
    var next = std.StringHashMap([]const u8).init(std.heap.page_allocator);
    errdefer next.deinit();

    var current_it = current.iterator();
    while (current_it.next()) |entry| {
        try next.put(entry.key_ptr.*, entry.value_ptr.*);
    }
    try applyBlockState(&next, new_block);
    return next;
}

fn applyBlockState(
    storage: *std.StringHashMap([]const u8),
    new_block: types.Block,
) !void {

    // ブロックに含まれるコントラクトがあれば、コントラクトストレージに追加
    if (new_block.contracts) |contracts| {
        std.log.info("Block contains {d} contracts to process", .{contracts.count()});
        var it = contracts.iterator();
        var contract_count: usize = 0;
        while (it.next()) |entry| {
            const address = entry.key_ptr.*;
            const code = entry.value_ptr.*;
            contract_count += 1;

            // 既存コードの有無にかかわらず **必ず** 上書きする
            try storage.put(address, code);
            std.log.info("Updated contract {s} (stored {d} bytes)", .{ address, code.len });
        }
        std.log.info("Processed {d} contracts from received block", .{contract_count});
    }

    // トランザクションにコントラクトデプロイが含まれているか確認
    for (new_block.transactions.items) |tx| {
        if (tx.tx_type == 1) { // コントラクトデプロイトランザクション
            std.log.info("Found contract deploy transaction in block for address: {s}", .{tx.receiver});

            // コントラクトがまだ保存されていないかつ、evm_dataがある場合
            if (!storage.contains(tx.receiver) and tx.evm_data != null) {
                // ローカルで再実行して結果を保存
                const allocator = std.heap.page_allocator;
                const evm_data = tx.evm_data.?;
                const calldata = "";

                const result = try @import("evm.zig").execute(allocator, evm_data, calldata, tx.gas_limit);
                errdefer allocator.free(result);

                // 結果をコントラクトストレージに保存
                try storage.put(tx.receiver, result);
                std.log.info("Re-executed and stored contract at address: {s}, code length: {d} bytes", .{ tx.receiver, result.len });
            }
        }
    }
}

fn isZeroHash(hash: [32]u8) bool {
    return std.mem.eql(u8, &hash, &([_]u8{0} ** 32));
}

/// 全ノードが同じジェネシスを選ぶよう、内容だけでなく
/// nonce 0から最初に見つかるPoW解まで一致させる。
fn isDeterministicGenesis(block: *const types.Block) bool {
    if (block.timestamp != 1_672_531_200 or
        !std.mem.eql(u8, block.data, "Hello, Zig Blockchain!") or
        block.transactions.items.len != 1)
    {
        return false;
    }

    const tx = block.transactions.items[0];
    if (!std.mem.eql(u8, tx.sender, "Alice") or
        !std.mem.eql(u8, tx.receiver, "Bob") or
        tx.amount != 100 or
        tx.tx_type != 0 or
        tx.evm_data != null or
        tx.gas_limit != 1_000_000 or
        tx.gas_price != 20_000_000_000 or
        !isZeroHash(tx.id))
    {
        return false;
    }
    // null と空mapはhash上で別の値になるため、決定的genesisでは
    // contractsを必ずnullに固定する。
    if (block.contracts != null) return false;

    var expected = block.*;
    expected.nonce = 0;
    expected.hash = [_]u8{0} ** 32;
    mineBlock(&expected, DIFFICULTY);
    return expected.nonce == block.nonce and std.mem.eql(u8, &expected.hash, &block.hash);
}
```

`addBlock`は検証開始から2つの状態の差し替えまで`state_mutex`を保持します。表示はロック取得済みの`printChainStateLocked`を使い、自己deadlockを避けます。`applyBlockState`は構造検証の後、一時mapに対してだけ呼ばれます。受信ブロックにruntime codeが含まれない場合は、ハッシュへ含まれたcreation codeを再実行して復元します。全て成功した場合だけ`contract_storage`を差し替えるため、`.added`はチェインとEVM状態の両方が更新されたことを表します。P2P側も`addBlock(...) == .added`の場合だけ、そのブロックを別ピアへ再伝播します。

無効なindexや親hashを持つブロックに、状態を書き換えるコントラクトを入れて拒否順序を固定します。

```zig
test "addBlock rejects wrong index and link before contract side effects" {
    chain_store.clearRetainingCapacity();
    contract_storage.clearRetainingCapacity();
    defer chain_store.clearRetainingCapacity();
    defer contract_storage.clearRetainingCapacity();

    const genesis = try createTestGenesisBlock(std.heap.page_allocator);
    try std.testing.expectEqual(AddBlockResult.added, addBlock(genesis));

    var contracts = std.StringHashMap([]const u8).init(
        std.heap.page_allocator,
    );
    defer contracts.deinit();
    try contracts.put("0xevil", "must-not-be-stored");

    var wrong_index = createBlock("wrong index", genesis);
    defer wrong_index.transactions.deinit();
    wrong_index.index += 1;
    wrong_index.contracts = contracts;
    mineBlock(&wrong_index, DIFFICULTY);
    try std.testing.expectEqual(
        AddBlockResult.invalid_index,
        addBlock(wrong_index),
    );
    try std.testing.expect(!contract_storage.contains("0xevil"));

    var wrong_link = createBlock("wrong link", genesis);
    defer wrong_link.transactions.deinit();
    wrong_link.prev_hash = [_]u8{0} ** 32;
    wrong_link.contracts = contracts;
    mineBlock(&wrong_link, DIFFICULTY);
    try std.testing.expectEqual(
        AddBlockResult.invalid_prev_hash,
        addBlock(wrong_link),
    );
    try std.testing.expect(!contract_storage.contains("0xevil"));
    try std.testing.expectEqual(@as(usize, 1), chain_store.items.len);
}
```

構造検証後のEVM状態適用そのものが失敗した場合も、チェインと状態の両方を元のまま保つことを固定します。次のcreation codeは`REVERT`するため、ブロックのPoWは正しくても追加結果は`.storage_error`です。

```zig
test "addBlock leaves chain and contract state unchanged when EVM state application fails" {
    chain_store.clearRetainingCapacity();
    contract_storage.clearRetainingCapacity();
    defer chain_store.clearRetainingCapacity();
    defer contract_storage.clearRetainingCapacity();

    const genesis = try createTestGenesisBlock(std.heap.page_allocator);
    try std.testing.expectEqual(AddBlockResult.added, addBlock(genesis));

    var invalid_deploy = createBlock("invalid deployment", genesis);
    defer invalid_deploy.transactions.deinit();
    try invalid_deploy.transactions.append(.{
        .sender = "0xsender",
        .receiver = "0xinvalid",
        .amount = 0,
        .tx_type = 1,
        .evm_data = &[_]u8{ 0x60, 0x00, 0x60, 0x00, 0xfd },
        .gas_limit = 100_000,
        .gas_price = 10,
    });
    mineBlock(&invalid_deploy, DIFFICULTY);

    try std.testing.expectEqual(
        AddBlockResult.storage_error,
        addBlock(invalid_deploy),
    );
    try std.testing.expectEqual(@as(usize, 1), chain_store.items.len);
    try std.testing.expect(!contract_storage.contains("0xinvalid"));
}
```

`processEvmTransactionWithErrorDetails`はdeployとcallを分け、`executeWithErrorInfo`が失敗した場合はコードやブロックを保存しません。deployのruntime codeはここで先に`contract_storage`へ入れず、後続の`recordContractDeployment`がブロック追加まで成功した時だけ反映します。次が省略なしの実装です。

```zig
pub fn processEvmTransactionWithErrorDetails(tx: *types.Transaction) ![]const u8 {
    if (std.mem.eql(u8, &tx.id, &[_]u8{0} ** 32)) {
        tx.id = calculateTransactionHash(tx);
    }

    const evm_data = tx.evm_data orelse return error.NoEvmData;
    const allocator = std.heap.page_allocator;
    var result: []const u8 = "";
    var contract_deployed = false;

    switch (tx.tx_type) {
        1 => {
            std.log.info("スマートコントラクトをデプロイしています: 送信者={s}, ガス上限={d}", .{ tx.sender, tx.gas_limit });
            const evm_result = @import("evm.zig").executeWithErrorInfo(allocator, evm_data, "", tx.gas_limit);
            if (!evm_result.success) {
                logEvmExecutionFailure(evm_result);
                return error.EvmExecutionFailed;
            }

            result = evm_result.data;
            contract_deployed = true;
            std.log.info("コントラクトが正常にデプロイされました: アドレス={s}, コード長={d}バイト", .{ tx.receiver, result.len });
        },
        2 => {
            std.log.info("スマートコントラクトを呼び出しています: アドレス={s}, 送信者={s}, ガス上限={d}", .{ tx.receiver, tx.sender, tx.gas_limit });
            const contract_code = getContractCode(tx.receiver) orelse {
                std.log.err("コントラクトが見つかりません: アドレス={s}", .{tx.receiver});
                return error.ContractNotFound;
            };

            const evm_result = @import("evm.zig").executeWithErrorInfo(allocator, contract_code, evm_data, tx.gas_limit);
            if (!evm_result.success) {
                logEvmExecutionFailure(evm_result);
                return error.EvmExecutionFailed;
            }

            result = evm_result.data;
            std.log.info("コントラクト呼び出しが完了しました: 結果長={d}バイト", .{result.len});
        },
        else => return error.NotEvmTransaction,
    }

    if (contract_deployed) {
        try recordContractDeployment(tx, result, allocator);
    }
    return result;
}

fn logEvmExecutionFailure(result: @import("evm.zig").EvmExecutionResult) void {
    if (result.error_message) |message| {
        std.log.err("EVM_EXECUTION_FAILED message={s}", .{message});
    }
    if (result.error_type) |error_type| {
        std.log.err("EVM_EXECUTION_FAILED type={any} pc={d}", .{ error_type, result.error_pc orelse 0 });
    }
}
```

deploy成功時は、CLI引数の一時スライスをそのままチェインへ保存せず、sender、receiver、creation codeを複製します。runtime codeは`Block.contracts`へ入れ、PoW完了後のブロックだけを伝播します。

```zig
fn recordContractDeployment(tx: *const types.Transaction, runtime_code: []const u8, allocator: std.mem.Allocator) !void {
    if (getChainHeight() == 0) {
        const genesis = try createTestGenesisBlock(allocator);
        switch (addBlock(genesis)) {
            .added => @import("p2p.zig").broadcastBlock(genesis, null),
            // 別threadが同じ決定的genesisを先に追加した場合は続行できる。
            .duplicate => {},
            else => return error.GenesisRejected,
        }
    }

    const last_block = getChainTip() orelse return error.MissingGenesis;
    var new_block = createBlock("Contract Deployment", last_block);

    // CLIの入力バッファはdeployContract終了時に解放されるため、
    // チェインが保持するトランザクションは文字列とバイト列を複製する。
    var stored_tx = tx.*;
    stored_tx.sender = try allocator.dupe(u8, tx.sender);
    stored_tx.receiver = try allocator.dupe(u8, tx.receiver);
    stored_tx.evm_data = if (tx.evm_data) |data|
        try allocator.dupe(u8, data)
    else
        null;
    try new_block.transactions.append(stored_tx);

    var contracts = std.StringHashMap([]const u8).init(allocator);
    const stored_address = try allocator.dupe(u8, tx.receiver);
    try contracts.put(stored_address, runtime_code);
    new_block.contracts = contracts;

    mineBlock(&new_block, DIFFICULTY);
    if (addBlock(new_block) != .added) return error.DeploymentBlockRejected;
    @import("p2p.zig").broadcastBlock(new_block, null);

    std.log.info("コントラクトデプロイブロックを作成しました: address={s}, transactions={d}, contracts={d}", .{
        tx.receiver,
        new_block.transactions.items.len,
        contracts.count(),
    });
}
```

この段階ではdeployトランザクションそのものを`EVM_TX`として先に送信しません。各ノードが別々のnonceでデプロイブロックを作るのを避け、同じPoW済みブロックを同期単位にします。

## 6. 章チェックポイントを検証する

```text
対象パス:   .zig-book-work/chapter11/ 全体
開始地点:   ch11-sec05-deploy-block
今回の変更: 章内の型、EVM、ブロック統合を1つのチェックポイントとして確定
テスト:     zig fmt --check . && zig build test --summary all && zig build
実行:       なし。CLIと2ノード受入は第12章で追加
期待結果:   自分の作業コードで全テストとビルドが成功し、ABI、改ざん、状態更新のテストが0件ではない
```

自分の作業コピーを対象に実行します。完成見本を先にテストして、このゲートの代わりにしてはいけません。

```bash
cd "$(git rev-parse --show-toplevel)/.zig-book-work/chapter11"
zig fmt --check .
zig build test --summary all
zig build
```

macOSでホストのZigを使わない場合も、マウントするのは自分の作業コピーです。

```bash
docker run --rm \
  --mount "type=bind,src=$PWD,dst=/work,readonly" \
  -w /work \
  zig-blockchain-book \
  sh -c 'zig fmt --check . && zig build test --summary all && zig build'
```

ここで合格対象になっているのは、patchを適用した`.zig-book-work/chapter11/`そのものです。章末見本だけをビルドしても、このゲートを通したことにはなりません。

リポジトリの保守時は、ルートから次を実行すると、第8章と第10章からpatchで再構築した内容が`references/chapter11/`と一致することまで自動検査できます。

```bash
cd "$(git rev-parse --show-toplevel)"
sh scripts/rebuild-book-code.sh
```

この再構築検査は配布patchと章末見本のドリフトを防ぐためのゲートです。読者の作業コピーのformat、全テスト、buildを省略するためのコマンドではありません。実際のcreation codeをCLIからデプロイし、別ノードから`add(2, 3)`を呼ぶ統合手順は第12章で行います。

## まとめ

- Solidity ABIは4バイトのセレクタと32バイト単位の引数で構成する
- `CALLDATALOAD` の引数位置はセレクタを含めて4、36となる
- 掲載テストと `src/evm.zig` のテストを同じコードにした
- デプロイはEVM実行後のruntime codeを保存し、PoW済みブロックとして伝播する
- 第11章の完全差分と専用スナップショットを、読者の作業コピー上の全テストで確認した
- 次章では、このブロックを2ノード間で同期して呼び出す
