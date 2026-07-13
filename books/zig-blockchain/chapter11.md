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

この章の完成コードは次の2か所です。

- 章チェックポイント: `references/EVMchapter/`
- 本書の完成形: リポジトリ直下の `src/` と `contract/`

以降のコマンドは、`BlockChain` リポジトリのルートで実行します。

## 1. Solidityコントラクトを用意する

### 対象ファイル

`contract/SimpleAdder.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Adder {
    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }
}
```

コントラクト名は `Adder` です。そのため、`solc -o` が作るファイル名も `Adder.bin` と `Adder.abi` になります。

### コンパイルする

ローカルにsolcを入れず、バージョンを固定したコンテナを使います。生成物は、macOSからも共有しやすいリポジトリ直下の `.zig-book-out/` へ置きます。

```bash
rm -rf .zig-book-out
mkdir .zig-book-out

docker run --rm \
  -v "$PWD:/work" \
  ethereum/solc:0.8.24 \
  --bin --abi /work/contract/SimpleAdder.sol \
  -o /work/.zig-book-out --overwrite

ls .zig-book-out/Adder.bin .zig-book-out/Adder.abi
```

期待する結果は、両ファイルが存在することです。`Adder.bin` はデプロイ時に実行するcreation codeを16進文字列で保持します。creation codeを実行した戻り値がruntime codeです。

## 2. 関数セレクタとcalldataを組み立てる

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

### 対象ファイル

- `src/evm.zig`
- `references/EVMchapter/src/evm.zig`

次のテストは両方のファイルに同じ形で入っています。小さなruntime codeがセレクタを検査し、calldataのオフセット4と36から引数を読み、32バイトの結果を返します。

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

完成形と章チェックポイントをそれぞれテストします。

```bash
docker run --rm zig-blockchain-book \
  zig test src/evm.zig --test-filter "ABI calldata"

docker run --rm \
  -w /app/references/EVMchapter \
  zig-blockchain-book \
  zig test src/evm.zig --test-filter "ABI calldata"
```

どちらも `All 1 tests passed.` になれば成功です。

## 4. 詳細な失敗情報を返す

完成形には通常の `execute` に加えて、エラー種別、失敗したPC、メッセージを返す `executeWithErrorInfo` があります。

### 対象ファイル

`src/evm.zig`

```zig
pub const EvmExecutionResult = struct {
    success: bool,
    data: []const u8,
    error_type: ?EvmError = null,
    error_pc: ?usize = null,
    error_message: ?[]const u8 = null,
};
```

デプロイやコールの入口は、この結果を確認してからコードを保存します。失敗したcreation codeをコントラクトとして残さないためです。

既存の異常系テストだけを実行します。

```bash
docker run --rm zig-blockchain-book \
  zig test src/evm.zig --test-filter "EVM execution with error info"
```

期待する結果は `All 1 tests passed.` です。

## 5. デプロイをブロックへ記録する

### 対象ファイル

- `src/main.zig`
- `src/blockchain.zig`

`--deploy` を受けた `deployContract` は、トランザクションを直接P2Pへ流しません。まずローカルEVMでcreation codeを実行します。

```zig
var tx_copy = tx;
const result = try blockchain.processEvmTransactionWithErrorDetails(&tx_copy);
try blockchain.logEvmResult(&tx_copy, result);
```

実行に成功すると `processEvmTransactionWithErrorDetails` がruntime codeを保存し、`recordContractDeployment` を呼びます。

```zig
if (contract_deployed) {
    try recordContractDeployment(tx, result, allocator);
}
```

`recordContractDeployment` はCLIの一時バッファをそのまま保持せず、sender、receiver、creation codeを複製します。その後にPoWを行い、検証可能な完成済みブロックを伝播します。

```zig
var stored_tx = tx.*;
stored_tx.sender = try allocator.dupe(u8, tx.sender);
stored_tx.receiver = try allocator.dupe(u8, tx.receiver);
stored_tx.evm_data = if (tx.evm_data) |data|
    try allocator.dupe(u8, data)
else
    null;
try new_block.transactions.append(stored_tx);

mineBlock(&new_block, DIFFICULTY);
addBlock(new_block);
@import("p2p.zig").broadcastBlock(new_block, null);
```

コール用の `tx_type = 2` はP2Pへ送りますが、デプロイは「ローカル実行済みのブロック」を同期単位にします。これにより、同じデプロイをローカルと受信側で二重実行する経路を避けます。

## 6. 章チェックポイントを検証する

```bash
docker run --rm \
  -w /app/references/EVMchapter \
  zig-blockchain-book \
  zig build test --summary all
```

すべてのテストが成功すれば、この章のチェックポイントは完了です。実際のcreation codeをデプロイし、別ノードから `add(2, 3)` を呼ぶ統合手順は第12章で行います。

## まとめ

- Solidity ABIは4バイトのセレクタと32バイト単位の引数で構成する
- `CALLDATALOAD` の引数位置はセレクタを含めて4、36となる
- 掲載テストと `src/evm.zig` のテストを同じコードにした
- デプロイはEVM実行後のruntime codeを保存し、PoW済みブロックとして伝播する
- 次章では、このブロックを2ノード間で同期して呼び出す
