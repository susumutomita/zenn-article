---
title: "EVMコントラクトをP2Pノードへ統合する"
free: true
---

第11章までで、EVMの実行とSolidityの関数呼び出しを確認しました。本章では、その実行結果をブロックへ記録し、別ノードへ同期します。章末では`Adder.add(2, 3)`を1ノードと2ノードの両方で実行します。

> **対応コード:** この章の完成コードは`BlockChain/references/EVMchapter/`、第11章からの完全差分は`references/book-patches/chapter12.patch`です。完全差分を読者の作業コピーへ適用し、本文の節ごとにコードと動きを確認します。`references/EVMchapter/`だけを先に実行して、自分の作業コピーの検査に置き換えてはいけません。

## 第11章の作業コピーから開始する

```text
対象パス:   .zig-book-work/chapter12/
開始地点:   ch11-sec05-deployment-blockの全ゲートが成功した状態
今回の変更: 第11章終了時のコードを複製し、chapter12.patchでCLIとP2Pを統合する
テスト:     git apply --check、zig fmt --check .、zig build test --summary all、zig build
実行:       章末で1ノードと2ノードの実TCP受け入れ確認
期待結果:   第11章の作業元を変えず、第12章の作業コピー自身が全ゲートに成功する
```

`BlockChain`リポジトリのルートへ戻り、第11章の作業結果を複製します。

```bash
cd "$(git rev-parse --show-toplevel)"
ROOT=$(git rev-parse --show-toplevel)
WORK="$ROOT/.zig-book-work/chapter12"
test ! -e "$WORK" || {
  echo ".zig-book-work/chapter12 already exists" >&2
  exit 1
}
cp -R .zig-book-work/chapter11 "$WORK"

git -C "$WORK" init -q
git -C "$WORK" apply --check \
  "$ROOT/references/book-patches/chapter12.patch"
git -C "$WORK" apply \
  "$ROOT/references/book-patches/chapter12.patch"
rm -rf "$WORK/.git"

cd "$WORK"

zig fmt --check .
zig build test --summary all
zig build
```

`git apply --check`が失敗した場合はpatchを強制適用せず、第11章の章末ゲートからやり直してください。一時的な`.git`はchapter12作業コピーだけを適用対象に固定するための境界です。以降の`src/...`は、この作業コピーからの相対パスです。

本文のコード片は、各処理の中心を読める大きさに絞っています。一方、`chapter12.patch`は次の対応で、CLIの引数解析、import、グローバル状態、補助関数、所有権処理、テストまで含む適用可能な完全差分です。コード片にない接着部分を読者が推測して追加する必要はありません。

| 本文の節 | `chapter12.patch`で完成する主なコード |
| --- | --- |
| デプロイ用トランザクション | `src/main.zig`のCLI解析、`--gas`、`--sender`、`deployContract` |
| runtime codeとブロック | `src/blockchain.zig`のdeploy/call処理、ログ、atomicな状態反映 |
| ABI calldataでcall | `src/main.zig`の`callContract`と同期完了後の保留call |
| EVMトランザクション送受信 | `src/parser.zig`のJSON往復、`src/p2p.zig`の`EVM_TX`、保留キュー、`CHAIN_SYNC_COMPLETE` |
| チェイン同期とフレーム | `src/blockchain.zig`の候補検証とatomicな`syncChain`、`src/p2p.zig`の64 KiB上限 |
| 自動受け入れ確認 | `scripts/acceptance.sh`、`Dockerfile`、`contract/SimpleAdder.sol` |

## この章の到達点

- `--deploy`からcreation bytecodeを実行し、返されたruntime codeを保存する。
- デプロイトランザクションとruntime codeをブロックへ含める。
- `--call`からABI calldataを渡し、32バイトの戻り値を得る。
- 採掘済みデプロイブロックの同期と`EVM_TX`によって、別ノードでもコントラクトを参照する。
- 成功ケースだけでなく、入力不正とコントラクト未検出も確認する。

本書のEVMとP2Pは学習用のサブセットです。Ethereumとの完全な互換性や、信頼できないネットワークでの安全性は提供しません。

## チェックポイントをビルドする

```text
対象パス:   .zig-book-work/chapter12/全体
開始地点:   ch11-sec05-deployment-blockのテストが成功した状態
今回の変更: 完全差分を適用した統合後コードを検査し、失敗を残したまま先へ進まない
テスト:     zig fmt --check . && zig build test --summary all
実行:       zig build
期待結果:   fmt、全テスト、ビルドが終了コード0になり、デプロイブロックの改ざんテストも通る
```

対象ディレクトリは、完全差分を適用した`.zig-book-work/chapter12/`です。前節に続けて次を実行します。

```bash
zig fmt --check .
zig build test --summary all
zig build
```

3コマンドが終了コード0なら、完全差分を適用した読者のコードは静的ゲートに成功しています。macOSでは、作業コピーを読み取り専用でマウントしたZig 0.14.0のDockerコンテナ内で同じコマンドを実行します。章末見本のテストはリポジトリ保守用であり、自分の作業コードの合格には置き換えられません。

## デプロイ用トランザクションを作る

```text
対象パス:   src/main.zig
開始地点:   ch12-sec00-build-gate
今回の変更: --deployの16進bytecodeをtx_type=1のTransactionへ変換し、ローカル実行後だけPoW済みブロックを作る
テスト:     zig build test --summary all
実行:       第1ノード受け入れ確認の--deploy
期待結果:   失敗したcreation codeは保存・伝播されず、成功時だけデプロイブロックを1つ作る
```

### 対象ファイル

`chapter12.patch`のうち、`src/main.zig`へ`utils`のimport、`--deploy`の引数解析、デフォルト値、`deployContract`を追加するhunkがこの節に対応します。次のコード片はトランザクション生成の中心部分です。関数全体とCLIから呼び出す接着部分は完全差分に含まれています。

### 実装

コマンドラインで受け取った16進文字列をバイト列へ変換し、`tx_type = 1`のトランザクションを作ります。

```zig
const bytecode = try utils.hexToBytes(allocator, bytecode_hex);
defer allocator.free(bytecode);

const tx = types.Transaction{
    .sender = sender_address,
    .receiver = contract_address,
    .amount = 0,
    .tx_type = 1,
    .evm_data = bytecode,
    .gas_limit = gas_limit,
    .gas_price = 10,
};
```

`tx_type`は、この学習用実装では`1`をデプロイ、`2`をコールとして扱います。Ethereumのトランザクション形式を再現した番号ではありません。

デプロイトランザクションは、まずローカルで実行します。成功すると`processEvmTransactionWithErrorDetails`がruntime codeを保存します。次にトランザクションとruntime codeを含むブロックを採掘し、その完成済みブロックをピアへ送ります。未実行のデプロイトランザクションを`EVM_TX`として先に送ると、各ノードが別々にブロックを作ってしまうためです。

```zig
var tx_copy = tx;
const result = blockchain.processEvmTransactionWithErrorDetails(&tx_copy) catch |err| {
    std.log.err("ローカルでのデプロイ処理エラー: {any}", .{err});
    return;
};
try blockchain.logEvmResult(&tx_copy, result);
```

この経路では`deployContract`から`broadcastEvmTransaction`を呼びません。ネットワークへ伝播するのは、次節の`recordContractDeployment`がPoWを終えた後の`Block`です。

### 確認

CLIを含むテストは読者の作業コピーの`src/main.zig`からコンパイルされます。全テストを実行し、引数の型や`Transaction`のフィールドが実際にコンパイルできることを確認します。

```bash
zig build test
```

## runtime codeを保存してブロックへ入れる

```text
対象パス:   src/blockchain.zig
開始地点:   ch12-sec01-deploy-transaction
今回の変更: creation codeの戻り値をruntime codeとして保存し、所有権を持つTransactionと一緒にPoW済みブロックへ入れる
テスト:     zig build test --summary all
実行:       第1ノード受け入れ確認の--deploy
期待結果:   contracts=1のindex=1ブロックができ、ブロックhashはEVMデータとガス条件の変更を検出する
```

### 対象ファイル

`chapter12.patch`のうち、`src/blockchain.zig`へEVM処理、ログ、候補チェイン検証を追加するhunkがこの節に対応します。具体的な関数は`processEvmTransaction`と`logEvmResult`です。第11章で作った2つの関数も、そのままコンパイルされます。対象は`processEvmTransactionWithErrorDetails`と`recordContractDeployment`です。`addBlock`が成功した後だけ状態を確定します。

### 実装

デプロイではcreation bytecodeを実行します。戻り値は、以後のコールで実行するruntime codeです。ただし、この時点ではまだグローバル状態へ保存しません。次の`recordContractDeployment`がPoW、構造検証、チェイン追加まで成功した時だけ、`addBlock`がruntime codeを反映します。

```zig
const calldata = "";
const result = try @import("evm.zig").execute(
    allocator,
    evm_data,
    calldata,
    tx.gas_limit,
);
```

次に、元のデプロイトランザクションとruntime codeを新しいブロックへ含めます。CLI引数とbytecodeのバッファは`deployContract`終了時に解放されるため、ブロックが保持する値は複製します。

```zig
if (contract_deployed) {
    try recordContractDeployment(tx, result, allocator);
}

fn recordContractDeployment(
    tx: *const types.Transaction,
    runtime_code: []const u8,
    allocator: std.mem.Allocator,
) !void {
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
}
```

コントラクトの保存先は、プロセス内の`contract_storage`と、同期用の`Block.contracts`の2箇所です。後者がないと、新しく接続したノードがデプロイ済みコードを復元できません。

## ABI calldataでコントラクトを呼ぶ

```text
対象パス:   src/main.zig、src/blockchain.zig
開始地点:   ch12-sec02-runtime-code
今回の変更: --callをtx_type=2へ変換し、保存済みruntime codeへABI calldataを渡す
テスト:     zig test src/evm.zig --test-filter "ABI calldataでadd関数を実行"
実行:       Adder.add(2,3)のcalldataを--callへ渡す
期待結果:   32バイト戻り値の末尾が05で、u256表示が5になる
```

### 対象ファイル

`chapter12.patch`のうち、`src/main.zig`の`--call`引数解析、`callContract`、同期前の保留処理がこの節に対応します。`src/blockchain.zig`のコール分岐も同じ節の変更です。入力バッファの解放と`CHAIN_SYNC_COMPLETE`後の再実行は完全差分に含まれます。

### 実装

`--call`で受け取ったABI calldataを`tx_type = 2`のトランザクションへ入れます。

```zig
const input_data = try utils.hexToBytes(allocator, input_hex);

const tx = types.Transaction{
    .sender = sender_address,
    .receiver = contract_address,
    .amount = 0,
    .tx_type = 2,
    .evm_data = input_data,
    .gas_limit = gas_limit,
    .gas_price = 10,
};
```

実行側はアドレスからruntime codeを取り出し、calldataと一緒にEVMへ渡します。

```zig
const contract_code = getContractCode(tx.receiver) orelse {
    return error.ContractNotFound;
};
const result = try @import("evm.zig").execute(
    allocator,
    contract_code,
    evm_data,
    tx.gas_limit,
);
```

コントラクトがローカルにない場合、`main.zig`は呼び出し情報を保留します。`CHAIN_SYNC_COMPLETE`を受け取った後、`p2p.zig`が同期済みブロックからコードを復元して呼び出します。

## EVMトランザクションを送受信する

```text
対象パス:   src/parser.zig、src/p2p.zig
開始地点:   ch12-sec03-abi-call
今回の変更: EVM_TXのJSON往復、保留キュー、デプロイブロックを収める64 KiBの改行フレームを実装する
テスト:     zig test src/p2p.zig && zig build test --summary all
実行:       第2ノード受け入れ確認でデプロイブロック同期後にcallを流す
期待結果:   4 KiB超のデプロイブロックを切らずに同期し、同じコントラクトアドレスの呼び出し結果が両ノードで5になる
```

### 対象ファイル

`chapter12.patch`では、`src/parser.zig`へ`serializeTransaction`と`parseTransactionJson`を追加します。`src/p2p.zig`には`broadcastEvmTransaction`、保留キュー、`EVM_TX`受信、`CHAIN_SYNC_COMPLETE`、64 KiBフレームを追加します。これらが本節に対応する完全差分です。次のコード片に省いたロック、エラー処理、所有権とテストもpatchに入っています。

### 送信

現行CLIでは、`broadcastEvmTransaction`をコールトランザクションの伝播に使います。メッセージは1行を1フレームとし、JSONの前に`EVM_TX:`を付けます。接続済みピアがなければ、JSONを`pending_evm_txs`へ保存します。

`serializeTransaction`でも`sender`と`receiver`を`std.json.stringifyAlloc`へ通します。ブロックJSONとEVMトランザクションJSONでescape規則を分けると、同じ入力が経路によって受理・拒否へ分かれるためです。

```zig
const payload = try parser.serializeTransaction(allocator, tx);
defer allocator.free(payload);

var sent = false;
const peers = try copyPeerSnapshot();
defer allocator.free(peers);
for (peers) |peer| {
    sendEvmTx(peer.stream.writer(), peer.address, payload) catch continue;
    sent = true;
}

if (!sent) {
    const queued_payload = try allocator.dupe(u8, payload);
    errdefer allocator.free(queued_payload);
    try queuePendingEvmTx(queued_payload);
}
```

ピア一覧と保留キューをロック外で直接走査・更新しません。`copyPeerSnapshot`はmutex内で値コピーだけを行い、送信はロック解放後に実行します。保留データは所有権ごと`queuePendingEvmTx`へ渡します。

### 受信

受信側は接頭辞を除去し、JSONを`Transaction`へ戻してから実行します。

```zig
const payload = msg["EVM_TX:".len..];
var evm_tx = try parser.parseTransactionJson(payload);
defer parser.deinitParsedTransaction(&evm_tx);
const result = try blockchain.processEvmTransaction(&evm_tx);
try blockchain.logEvmResult(&evm_tx, result);
```

`parseTransactionJson`は解析用arenaとは別の所有メモリへ`sender`、`receiver`、`evm_data`を複製して返します。受信処理は`deinitParsedTransaction`を`defer`し、処理結果にかかわらず解放します。また`amount`、`tx_type`、`gas_limit`などの整数フィールドに小数を許しません。

```zig
test "transaction parser rejects floating integer fields" {
    try std.testing.expectError(error.InvalidFormat, parseTransactionJson("{\"sender\":\"a\",\"receiver\":\"b\",\"amount\":1.5}"));
    try std.testing.expectError(error.InvalidFormat, parseTransactionJson("{\"sender\":\"a\",\"receiver\":\"b\",\"amount\":1,\"tx_type\":1.5}"));
    try std.testing.expectError(error.InvalidFormat, parseTransactionJson("{\"sender\":\"a\",\"receiver\":\"b\",\"amount\":1,\"gas_limit\":1.5}"));
}
```

### 長い候補チェインを検証する補助関数

`blocks.len`だけを比較して先に`chain_store`を消去すると、長い不正チェインで正常な履歴とコントラクト状態を失います。テストから候補チェインを一括適用する`syncChain`を次へ置き換え、全ブロックを検証した後だけ状態を再構築します。

```zig
pub fn syncChain(blocks: []types.Block) !void {
    if (blocks.len == 0) return;

    state_mutex.lock();
    defer state_mutex.unlock();

    // 受信したチェーンが現在のチェーンより長い場合のみ同期
    if (blocks.len > chain_store.items.len) {
        // 不正な長いチェーンでローカルのチェーンやEVM状態を壊さないよう、
        // 置換前にチェーン全体を検証する。
        try validateReplacementChain(blocks);
        // 置換後のappendがOOMで途中停止しないよう、ローカル状態を消す前に
        // 必要なチェーン領域をすべて確保する。
        try chain_store.ensureTotalCapacity(blocks.len);
        std.log.info("Synchronizing chain with {d} blocks (current chain has {d} blocks)", .{ blocks.len, chain_store.items.len });

        // コントラクトストレージの状態をログに出力（同期前）
        var contract_count_before: usize = 0;
        var it_before = contract_storage.iterator();
        while (it_before.next()) |_| {
            contract_count_before += 1;
        }
        std.log.info("Contract storage before sync: {d} contracts", .{contract_count_before});

        // 新しいEVM状態も一時mapへ構築し、全ブロックの適用成功後だけ
        // chain_storeと同時に差し替える。
        var next_contract_storage = std.StringHashMap([]const u8).init(std.heap.page_allocator);
        errdefer next_contract_storage.deinit();
        for (blocks) |block| {
            try applyBlockState(&next_contract_storage, block);
        }

        chain_store.clearRetainingCapacity();
        for (blocks) |block| {
            chain_store.appendAssumeCapacity(block);
            std.log.info("Added block {d} to chain during sync", .{block.index});
        }
        contract_storage.deinit();
        contract_storage = next_contract_storage;

        // コントラクトストレージの状態をログに出力（同期後）
        var contract_count_after: usize = 0;
        var it_after = contract_storage.iterator();
        while (it_after.next()) |entry| {
            contract_count_after += 1;
            std.log.info("Contract in storage after sync: address={s}, code_length={d}", .{ entry.key_ptr.*, entry.value_ptr.*.len });
        }
        std.log.info("Contract storage after sync: {d} contracts", .{contract_count_after});

        std.log.info("Chain synchronized with {d} blocks", .{blocks.len});
    } else {
        std.log.info("Received chain ({d} blocks) is not longer than current chain ({d} blocks)", .{ blocks.len, chain_store.items.len });
    }
}

fn validateReplacementChain(blocks: []const types.Block) !void {
    for (blocks, 0..) |*block, i| {
        if (!verifyBlockPow(block)) return error.InvalidChainPow;

        // 同一チェーン内のハッシュ重複を拒否する。
        for (blocks[0..i]) |previous_block| {
            if (std.mem.eql(u8, &previous_block.hash, &block.hash)) {
                return error.DuplicateBlock;
            }
        }

        if (i == 0) {
            if (block.index != 0) return error.InvalidChainIndex;
            if (!isZeroHash(block.prev_hash)) return error.InvalidChainLink;
            if (!isDeterministicGenesis(block)) return error.InvalidGenesis;
            continue;
        }

        const previous = &blocks[i - 1];
        if (block.index != previous.index + 1) return error.InvalidChainIndex;
        if (!std.mem.eql(u8, &block.prev_hash, &previous.hash)) return error.InvalidChainLink;
    }
}
```

`state_mutex`は`addBlock`と`syncChain`を同じ境界で直列化します。`validateReplacementChain`、領域確保、EVM状態の一時mapへの再構築のどこで失敗しても、`chain_store`と`contract_storage`は変更されません。全て成功した後だけ2つを差し替えるため、同期先でもruntime codeを復元できます。

重要な境界として、現在のP2P実通信は`syncChain`を呼びません。`GET_CHAIN`への応答は`BLOCK:`を順番に送り、受信側が`addBlock`で現在のtipへ直接つながるブロックだけを追加するprefix追随です。したがって空ノードや同じprefixを持つ遅れたノードは追いつけますが、既に別の短い分岐を持つノードが長い候補へ置換する経路は未実装です。上の関数は置換規則と失敗時atomicityをユニットテストする補助関数であり、ネットワーク上のフォーク選択を実装したとは扱いません。

### 4 KiBを超えるデプロイブロックを受信する

`SimpleAdder.sol`のcreation codeとruntime codeはJSON内で16進文字列になります。両方を持つデプロイブロックは4 KiBを超えるため、第8章の受信バッファをそのまま使うと、実際の2ノード確認で`Message too long`になります。無制限に受け取るのではなく、学習用プロトコルの上限を64 KiBと名前付きで固定します。

```zig
/// 1つの改行区切りP2Pフレームとして受信できる最大サイズ。
/// Solidityのcreation bytecodeとruntime bytecodeを含むデプロイブロックは
/// 4 KiBを超えるため、学習用コントラクトを余裕を持って同期できる64 KiBとする。
pub const MAX_FRAME_BYTES: usize = 64 * 1024;
```

`peerCommunicationLoop`にある第8章のバッファ宣言は、次の1行へ置き換えます。改行フレーム処理は残します。

```zig
var buf: [MAX_FRAME_BYTES]u8 = undefined;
```

実際のデプロイブロック相当のサイズを、固定値だけに依存しないテストで確認します。

```zig
test "Solidity deployment block fits in one P2P frame" {
    const allocator = std.testing.allocator;
    const creation_code = [_]u8{0xab} ** 1300;
    const runtime_code = [_]u8{0xcd} ** 1300;

    var transactions = std.ArrayList(types.Transaction).init(allocator);
    defer transactions.deinit();
    try transactions.append(.{
        .sender = "0x000000000000000000000000000000000000dead",
        .receiver = "0x000000000000000000000000000000000000abcd",
        .amount = 0,
        .tx_type = 1,
        .evm_data = &creation_code,
        .gas_limit = 3_000_000,
        .gas_price = 10,
    });

    var contracts = std.StringHashMap([]const u8).init(allocator);
    defer contracts.deinit();
    try contracts.put(
        "0x000000000000000000000000000000000000abcd",
        &runtime_code,
    );

    const block = types.Block{
        .index = 1,
        .timestamp = 1_672_531_200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = transactions,
        .nonce = 0,
        .data = "Contract Deployment",
        .hash = [_]u8{0} ** 32,
        .contracts = contracts,
    };

    const payload = try parser.serializeBlock(block);
    defer std.heap.page_allocator.free(payload);

    const framed_len = "BLOCK:".len + payload.len + 1;
    try std.testing.expect(framed_len > 4096);
    try std.testing.expect(framed_len <= MAX_FRAME_BYTES);
}
```

### テスト

`src/p2p.zig`には、ローカル生成ブロックを1回だけキューへ入れるテストがあります。
さらに、中継済みブロックの再キュー抑止、EVMトランザクションのキューイング、JSONの往復も確認します。

```bash
zig test src/p2p.zig
```

`src/p2p.zig`で直接定義した7件のテストがすべて通ることを確認します。7件目は、次の標準入力でバッファが再利用されても、採掘済みブロックの`data`が変化しない所有権テストです。Docker検証では章末の`zig build test`から、依存モジュールを含む全テストも実行します。

## 自動受け入れ確認を先に通す

```text
対象パス:   .zig-book-work/chapter12/scripts/acceptance.sh、作業コピー全体
開始地点:   ch12-sec04-evm-p2p
今回の変更: pinned Zigとsolcで、全テスト、1ノード、2ノードを失敗時即終了の1コマンドへまとめる
テスト:     sh scripts/acceptance.sh
実行:       SimpleAdderの実コンパイル、deploy、add(2,3)、デプロイブロック同期、同期後call
期待結果:   154件の全テスト、1ノード=5、2ノード両側=5の後にEVM_ACCEPTANCE PASS
```

ここまでを確認したら、手動で複数ターミナルを操作する前に、patchで読者の作業コピーへ追加された受け入れスクリプトを実行します。Zig 0.14.0、digest固定したsolc 0.8.24、実際のTCP接続を使い、終了時にはコンテナ、ネットワーク、一時イメージを削除します。

```bash
cd "$(git rev-parse --show-toplevel)"
sh .zig-book-work/chapter12/scripts/acceptance.sh \
  .zig-book-work/chapter12
```

このコマンドが読むスクリプトとプロジェクト本体は、`.zig-book-work/chapter12/`にあります。対応見本だけを実行するコマンドではありません。配布patchと章末見本のドリフトは、後述する`rebuild-book-code.sh`が別に検出します。

成功時の末尾は次のとおりです。途中のコマンドを`|| true`で無視せず、この行まで終了コード0で到達することが合格条件です。

```text
ONE_NODE_EVM PASS: add(2,3)=5
TWO_NODE_EVM PASS: deployment synchronized and add(2,3)=5 on both nodes
EVM_ACCEPTANCE PASS
zig=0.14.0
solc=0.8.24+commit.e11b9ed9.Linux.g++
selector=771602f7
one_node_result=5
two_node_sync=complete
two_node_result=5
```

以降の1ノード、2ノード手順は、スクリプトが自動化した通信をターミナルで観察するための手動版です。自動ゲートが失敗している状態で、ログの一部だけを見て成功とは判定しません。

## 1ノードでデプロイからコールまで動かす

```text
対象パス:   contract/SimpleAdder.sol、src/main.zig、src/blockchain.zig、src/evm.zig
開始地点:   ch12-sec05-acceptance-script
今回の変更: なし。実際のcreation bytecodeを同じノードでdeployし、ABI callまで観察する
テスト:     acceptance.shのONE_NODE_EVMゲート
実行:       --deployと--callを同じプロセスへ渡す
期待結果:   デプロイブロックが1つ作られ、EVM実行結果(u256): 5が完全一致で1行以上出る
```

### Solidityをコンパイルする

第12章の作業コピーへ戻り、`Adder`のcreation bytecodeを生成します。

```bash
cd "$(git rev-parse --show-toplevel)/.zig-book-work/chapter12"
```

Linuxで`solc` 0.8.24をインストールしている場合は次を実行します。コンパイラのデフォルトターゲットに左右されず、本書で受け入れ確認した命令構成を再現するため、ターゲットはBerlinへ固定します。

```bash
mkdir -p /tmp/zig-book-out
solc --bin --evm-version berlin \
  contract/SimpleAdder.sol -o /tmp/zig-book-out --overwrite
```

次に`add(uint256,uint256)`の関数セレクタと、`2`、`3`をABI形式で連結します。

```bash
SEL=$(solc --hashes contract/SimpleAdder.sol | awk '/add\(uint256,uint256\)/{print $1}' | sed 's/://')
A=$(printf "%064x" 2)
B=$(printf "%064x" 3)
DATA="0x${SEL}${A}${B}"
```

macOSでは、`solc`をホストへインストールせず公式Dockerイメージで同じファイルを生成できます。Apple Siliconでamd64イメージの警告が出る場合も、Docker Desktopのエミュレーションで実行できます。

```bash
mkdir -p .zig-book-out
docker run --rm \
  -w /sources \
  -v "$PWD/contract:/sources:ro" \
  -v "$PWD/.zig-book-out:/out" \
  ethereum/solc:0.8.24 \
  --bin --evm-version berlin SimpleAdder.sol -o /out --overwrite

SEL=$(docker run --rm \
  -w /sources \
  -v "$PWD/contract:/sources:ro" \
  ethereum/solc:0.8.24 \
  --hashes SimpleAdder.sol \
  | awk '/add\(uint256,uint256\)/{print $1}' | sed 's/://')
A=$(printf "%064x" 2)
B=$(printf "%064x" 3)
DATA="0x${SEL}${A}${B}"
```

### 実行する

```bash
zig build run -- \
  --listen 9000 \
  --deploy "$(cat /tmp/zig-book-out/Adder.bin)" 0x000000000000000000000000000000000000abcd \
  --call 0x000000000000000000000000000000000000abcd "$DATA" \
  --gas 3000000 \
  --sender 0x000000000000000000000000000000000000dead
```

ノードは待受けを続けるため、結果を確認したら`Ctrl+C`で終了します。ログの32バイト値の末尾が`05`で、u256表示が`5`なら成功です。

### macOSでDocker実行する

Zig 0.14.0を含む実行イメージを作り、前項で生成したbytecodeと`DATA`を渡します。

```bash
docker build -t zig-blockchain-book:0.14.0 .
docker run --rm -it \
  -e DATA="$DATA" \
  -v "$PWD/.zig-book-out:/contract:ro" \
  zig-blockchain-book:0.14.0 \
  sh -ec 'exec zig build run -- \
    --listen 9000 \
    --deploy "$(cat /contract/Adder.bin)" 0x000000000000000000000000000000000000abcd \
    --call 0x000000000000000000000000000000000000abcd "$DATA" \
    --gas 3000000 \
    --sender 0x000000000000000000000000000000000000dead'
```

結果を確認したら`Ctrl+C`で終了します。`--rm`を付けているため、停止したコンテナは自動で削除されます。

## 2ノードで同期を確認する

```text
対象パス:   src/p2p.zig、src/parser.zig、src/blockchain.zig
開始地点:   ch12-sec06-one-node
今回の変更: なし。デプロイ側のPoW済みブロックをコール側へ同期し、復元したruntime codeを呼ぶ
テスト:     acceptance.shのTWO_NODE_EVMゲート
実行:       deploy側へcall側をTCP接続し、同期完了後にadd(2,3)を実行
期待結果:   contract更新と同期完了の後、deploy側とcall側の両方でu256結果が5になる
```

まずターミナル1でデプロイ側を起動します。

```bash
zig build run -- \
  --listen 9000 \
  --deploy "$(cat /tmp/zig-book-out/Adder.bin)" 0x000000000000000000000000000000000000abcd \
  --gas 3000000 \
  --sender 0x000000000000000000000000000000000000dead
```

デプロイ完了のログを確認してから、ターミナル2でコール側を接続します。

```bash
zig build run -- \
  --listen 9001 \
  --connect 127.0.0.1:9000 \
  --call 0x000000000000000000000000000000000000abcd "$DATA" \
  --gas 100000 \
  --sender 0x000000000000000000000000000000000000dead
```

ターミナル2でチェイン同期完了、コントラクト検出、u256の結果`5`の順に確認します。

### macOSで2コンテナを接続する

2つのコンテナを同じDockerネットワークへ参加させます。先にネットワークを作成します。

```bash
docker network create zig-book-net
```

ターミナル1でデプロイ側を起動します。

```bash
docker run --rm -it \
  --name zig-book-deploy \
  --network zig-book-net \
  -v "$PWD/.zig-book-out:/contract:ro" \
  zig-blockchain-book:0.14.0 \
  sh -ec 'exec zig build run -- \
    --listen 9000 \
    --deploy "$(cat /contract/Adder.bin)" 0x000000000000000000000000000000000000abcd \
    --gas 3000000 \
    --sender 0x000000000000000000000000000000000000dead'
```

`コントラクトデプロイブロックを作成しました`のログを確認してから、ターミナル2でコール側を起動します。`zig-book-deploy`はDocker内DNSで解決されます。

```bash
docker run --rm -it \
  --name zig-book-call \
  --network zig-book-net \
  -e DATA="$DATA" \
  zig-blockchain-book:0.14.0 \
  sh -ec 'exec zig build run -- \
    --listen 9001 \
    --connect zig-book-deploy:9000 \
    --call 0x000000000000000000000000000000000000abcd "$DATA" \
    --gas 100000 \
    --sender 0x000000000000000000000000000000000000dead'
```

両方を`Ctrl+C`で停止した後、ネットワークを削除します。

```bash
docker network rm zig-book-net
rm -rf .zig-book-out
```

## 失敗ケースを確認する

```text
対象パス:   src/utils.zig、src/evm.zig、src/blockchain.zig
開始地点:   ch12-sec07-two-node
今回の変更: 不正HEX、未デプロイアドレス、REVERTを成功値へ置き換えず、型付きエラーで停止する
テスト:     zig test src/evm.zig --test-filter REVERT
実行:       zig build run -- --evm xyz
期待結果:   不正入力は拒否され、未検出コードやREVERTからブロック・コントラクト状態を作らない
```

### 16進文字列が不正

```bash
zig build run -- --evm xyz
```

`hexToBytes`が不正な文字を拒否します。入力を無視して実行してはいけません。

### 未デプロイのアドレスを呼ぶ

デプロイ済みブロックを持たないノードで`--call`を実行すると、同期後もコントラクトを見つけられません。`getContractCode`による検索を省略して空コードを実行するのではなく、`ContractNotFound`として扱います。

### REVERT

EVMの`REVERT`テストは、失敗を成功値として扱わず、戻りデータとエラー情報を確認します。

```bash
zig test src/evm.zig --test-filter REVERT
```

## 章チェックポイントを確定する

最後にリポジトリルートから、静的ゲートと実通信ゲートを同じ読者作業コピーへ続けて実行します。

```bash
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT/.zig-book-work/chapter12"
zig fmt --check .
zig build test --summary all
zig build

cd "$ROOT"
sh .zig-book-work/chapter12/scripts/acceptance.sh \
  .zig-book-work/chapter12
```

途中の失敗を`|| true`で無視せず、`EVM_ACCEPTANCE PASS`まで終了コード0で到達した場合だけ第12章の実装完了です。ここで検査した対象は`references/EVMchapter/`ではなく、本文の手順で作った`.zig-book-work/chapter12/`です。

リポジトリの保守時は、次の追加ゲートで第11章と第12章を開始地点から再構築します。通常モードはpatch適用結果、章スナップショット、format、build、全テストの一致を検査し、環境変数を付けたモードは再構築した第12章へ同じ1ノード・2ノード受け入れ確認も行います。

```bash
cd "$ROOT"
sh scripts/rebuild-book-code.sh
BOOK_REBUILD_ACCEPTANCE=1 sh scripts/rebuild-book-code.sh
```

この保守用ゲートは、完全差分にCLI、parser、P2P、deploy、callの接着コードが欠けた場合や、patchとスナップショットがずれた場合を検出します。読者の作業コピーに対する前の2ゲートを省略するためのものではありません。

## この章で実装していないもの

- 署名検証、nonce、残高、手数料市場。
- 累積workによるフォーク選択とファイナリティ。
- コントラクト呼び出しをまたぐ`SSTORE`状態の永続化。
- Ethereumと同じ命令別ガス表、CALL、CREATE、LOG、SHA3などの全命令。
- 悪意あるピアを想定したメッセージ認証とDoS対策。

本章はhash、PoW、index、親hash、チェイン内重複を検証し、無効ブロックを状態更新や再伝播より前に拒否します。ただし、署名がない`sender`は本人性を証明しません。`nonce`はアカウントnonceではありません。本章で扱うのは、PoW探索用のブロックnonceだけです。この境界を明示することで、動いた学習用コードと、本番のEthereumクライアントが解く問題を混同せずに済みます。

## まとめ

本章では、Solidityのcreation bytecodeを実行し、runtime codeをブロックへ保存し、ABI calldataで呼び出すところまでをP2Pノードへ統合しました。本文のコード片は`references/book-patches/chapter12.patch`の完全差分と節ごとに対応し、読者の作業コピーで全テスト、1ノード、2ノードを実行します。章末見本は`references/EVMchapter/`、発展中の完成形はリポジトリ直下の`src/`です。次章では、ここまでのEVM、P2P、PoWのテストを1つの品質ゲートへまとめます。
