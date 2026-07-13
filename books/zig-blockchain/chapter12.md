---
title: "EVMコントラクトをP2Pノードへ統合する"
free: true
---

第11章までで、EVMの実行とSolidityの関数呼び出しを確認しました。本章では、その実行結果をブロックへ記録し、別ノードへ同期します。章末では`Adder.add(2, 3)`を1ノードと2ノードの両方で実行します。

> **対応コード:** この章の完成コードは`BlockChain/references/EVMchapter/`です。発展を続けている`BlockChain/src/`とは分けてあります。まず完成コードで結果を再現し、その後に本文の順序で自分のコードへ差分を入れてください。

## この章の到達点

- `--deploy`からcreation bytecodeを実行し、返されたruntime codeを保存する。
- デプロイトランザクションとruntime codeをブロックへ含める。
- `--call`からABI calldataを渡し、32バイトの戻り値を得る。
- 採掘済みデプロイブロックの同期と`EVM_TX`によって、別ノードでもコントラクトを参照する。
- 成功ケースだけでなく、入力不正とコントラクト未検出も確認する。

本書のEVMとP2Pは学習用のサブセットです。Ethereumとの完全な互換性や、信頼できないネットワークでの安全性は提供しません。

## チェックポイントをビルドする

対象ディレクトリは`references/EVMchapter/`です。リポジトリ直下で次を実行します。

```bash
git clone https://github.com/susumutomita/BlockChain.git
cd BlockChain
sh scripts/verify-book-code.sh references/EVMchapter
```

最後に`PASS references/EVMchapter`と表示されれば、章末コードのビルドとテストは成功です。macOSでは検証スクリプトがDockerを使います。LinuxでZig 0.14.0を利用できる場合は、次のコマンドでも同じテストを実行できます。

```bash
cd references/EVMchapter
zig build test
```

## デプロイ用トランザクションを作る

### 対象ファイル

`src/main.zig`の`deployContract`を編集します。節終了時の完成ファイルは`references/EVMchapter/src/main.zig`です。

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

CLIを含むテストは`src/main.zig`からコンパイルされます。全テストを実行し、引数の型や`Transaction`のフィールドが完成コードと一致していることを確認します。

```bash
zig build test
```

## runtime codeを保存してブロックへ入れる

### 対象ファイル

`src/blockchain.zig`の`processEvmTransaction`と`processEvmTransactionWithErrorDetails`を編集します。節終了時の完成ファイルは`references/EVMchapter/src/blockchain.zig`です。

### 実装

デプロイではcreation bytecodeを実行します。戻り値は、以後のコールで実行するruntime codeです。

```zig
const calldata = "";
const result = try @import("evm.zig").execute(
    allocator,
    evm_data,
    calldata,
    tx.gas_limit,
);
try contract_storage.put(tx.receiver, result);
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
    const last_block = if (chain_store.items.len > 0)
        chain_store.items[chain_store.items.len - 1]
    else
        try createTestGenesisBlock(allocator);

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
    addBlock(new_block);
    @import("p2p.zig").broadcastBlock(new_block, null);
}
```

コントラクトの保存先は、プロセス内の`contract_storage`と、同期用の`Block.contracts`の2箇所です。後者がないと、新しく接続したノードがデプロイ済みコードを復元できません。

## ABI calldataでコントラクトを呼ぶ

### 対象ファイル

`src/main.zig`の`callContract`と、`src/blockchain.zig`のコール分岐を編集します。

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
const contract_code = contract_storage.get(tx.receiver) orelse {
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

### 対象ファイル

`src/parser.zig`の`serializeTransaction`と`parseTransactionJson`を編集します。続けて`src/p2p.zig`の`broadcastEvmTransaction`とメッセージ処理を編集します。

### 送信

現行CLIでは、`broadcastEvmTransaction`をコールトランザクションの伝播に使います。メッセージは1行を1フレームとし、JSONの前に`EVM_TX:`を付けます。接続済みピアがなければ、JSONを`pending_evm_txs`へ保存します。

```zig
const payload = try parser.serializeTransaction(allocator, tx);
defer allocator.free(payload);

var sent = false;
for (peer_list.items) |peer| {
    sendEvmTx(peer.stream.writer(), peer.address, payload) catch continue;
    sent = true;
}

if (!sent) {
    try pending_evm_txs.append(try allocator.dupe(u8, payload));
}
```

### 受信

受信側は接頭辞を除去し、JSONを`Transaction`へ戻してから実行します。

```zig
const payload = msg["EVM_TX:".len..];
var evm_tx = try parser.parseTransactionJson(payload);
const result = try blockchain.processEvmTransaction(&evm_tx);
try blockchain.logEvmResult(&evm_tx, result);
```

### テスト

`src/p2p.zig`には、ローカル生成ブロックを1回だけキューへ入れるテストがあります。
さらに、中継済みブロックの再キュー抑止、EVMトランザクションのキューイング、JSONの往復も確認します。

```bash
zig test src/p2p.zig
```

成功時は4件のテストが通ります。Docker検証では章末の`zig build test`から同じテストを実行します。

## 1ノードでデプロイからコールまで動かす

### Solidityをコンパイルする

リポジトリ直下へ戻り、`Adder`のcreation bytecodeを生成します。Linuxで`solc` 0.8.24をインストールしている場合は次を実行します。

```bash
mkdir -p /tmp/zig-book-out
solc --bin contract/SimpleAdder.sol -o /tmp/zig-book-out --overwrite
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
  --bin SimpleAdder.sol -o /out --overwrite

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

### 16進文字列が不正

```bash
zig build run -- --evm xyz
```

`hexToBytes`が不正な文字を拒否します。入力を無視して実行してはいけません。

### 未デプロイのアドレスを呼ぶ

デプロイ済みブロックを持たないノードで`--call`を実行すると、同期後もコントラクトを見つけられません。`contract_storage.get`を省略して空コードを実行するのではなく、`ContractNotFound`として扱います。

### REVERT

EVMの`REVERT`テストは、失敗を成功値として扱わず、戻りデータとエラー情報を確認します。

```bash
zig test src/evm.zig --test-filter REVERT
```

## この章で実装していないもの

- 署名検証、nonce、残高、手数料市場。
- ブロックの高さと直前ハッシュを含む完全なチェイン検証。
- コントラクト呼び出しをまたぐ`SSTORE`状態の永続化。
- Ethereumと同じ命令別ガス表、CALL、CREATE、LOG、SHA3などの全命令。
- 悪意あるピアを想定したメッセージ認証とDoS対策。

この境界を明示することで、動いた学習用コードと、本番のEthereumクライアントが解く問題を混同せずに済みます。

## まとめ

本章では、Solidityのcreation bytecodeを実行し、runtime codeをブロックへ保存し、ABI calldataで呼び出すところまでをP2Pノードへ統合しました。各節の完成コードは`references/EVMchapter/`、発展中の完成形はリポジトリ直下の`src/`にあります。次章では、ここまでのEVM、P2P、PoWのテストを1つの品質ゲートへまとめます。
