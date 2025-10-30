---
title: Chapter 11 — Deploy/Call と P2P 同期（EVM_TX/contract配布）
---

この章では、CLIからのデプロイ/コール、P2Pブロードキャスト、チェイン同期後の保留コール実行までを「差分」で読み解きます。どのファイルのどこが担っているか、該当箇所をピンポイントに示します。

### 到達目標
- `--deploy` でcreation bytecodeを実行→runtime codeを保存→ブロック配布
- `--call` でABIデータを送り、ローカルor同期後に実行される
- 2ノード構成でも動作（`--connect` で同期）

1) CLI（src/main.zig）
フラグの受け取り（抜粋）
```zig
///   実行ファイル --deploy <バイトコードHEX> <コントラクトアドレス> [--gas] [--sender]
///   実行ファイル --call <コントラクトアドレス> <入力データHEX> [--gas] [--sender]
```
デプロイ処理（要点）
```zig
fn deployContract(alloc, bytecode_hex, contract_address, gas_limit, sender) !void {
    const bytecode = try utils.hexToBytes(alloc, bytecode_hex);
    const tx = types.Transaction{ .sender=sender, .receiver=contract_address,
        .amount=0, .tx_type=1, .evm_data=bytecode, .gas_limit=gas_limit, .gas_price=10 };
    try p2p.broadcastEvmTransaction(tx);
    var tx_copy = tx;
    const result = blockchain.processEvmTransactionWithErrorDetails(&tx_copy) ...;
    try blockchain.logEvmResult(&tx_copy, result);
}
```
コール処理（要点）
```zig
fn callContract(alloc, contract_address, input_hex, gas_limit, sender) !void {
    const input = try utils.hexToBytes(alloc, input_hex);
    const tx = types.Transaction{ .sender=sender, .receiver=contract_address,
        .amount=0, .tx_type=2, .evm_data=input, .gas_limit=gas_limit, .gas_price=10 };
    try p2p.broadcastEvmTransaction(tx);
    if (blockchain.contract_storage.get(contract_address)) |_| {
        var tx_copy = tx;
        const result = blockchain.processEvmTransactionWithErrorDetails(&tx_copy) ...;
        try blockchain.logEvmResult(&tx_copy, result);
    } else {
        // 同期後に p2p 側で実行される
    }
}
```

2) P2P（src/p2p.zig）
EVM_TXの送信とキューイング（抜粋）
```zig
pub fn broadcastEvmTransaction(tx: types.Transaction) !void {
    const payload = try parser.serializeTransaction(allocator, tx);
    var sent = false;
    for (peer_list.items) |peer| { sendEvmTx(peer, payload) catch continue; sent = true; }
    if (!sent) { try pending_evm_txs.append(try allocator.dupe(u8, payload)); }
}
```
受信処理と実行（抜粋）
```zig
if (std.mem.startsWith(u8, msg, "EVM_TX:")) {
    var evm_tx = parser.parseTransactionJson(payload) catch return;
    const result = blockchain.processEvmTransaction(&evm_tx) catch return;
    blockchain.logEvmResult(&evm_tx, result) catch {};
}
```
同期完了時の保留コール実行（要点）
```zig
// CHAIN_SYNC_COMPLETE 受信後
if (main.global_call_pending) {
    // contract_storage を確認し、見つかれば tx を組み立てて実行
    var tx = types.Transaction{ .sender=main.global_sender_address, .receiver=main.global_contract_address,
        .amount=0, .tx_type=2, .evm_data=main.global_evm_input, .gas_limit=main.global_gas_limit, .gas_price=10 };
    const result = blockchain.processEvmTransaction(&tx) ...;
    blockchain.logEvmResult(&tx, result) catch {};
    main.global_call_pending = false;
}
```

3) ブロックチェイン（src/blockchain.zig）
デプロイ → runtime code保存と配布（抜粋）
```zig
if (tx.tx_type == 1) { // Deploy
    const result = evm.execute(allocator, evm_data, calldata, tx.gas_limit) ...; // runtime code
    contract_storage.put(tx.receiver, result) catch {};
    var new_block = createBlock("Contract Deployment", last_block);
    try new_block.transactions.append(tx.*);
    var contracts = std.StringHashMap([]const u8).init(allocator);
    try contracts.put(tx.receiver, result);
    new_block.contracts = contracts;
    mineBlock(&new_block, DIFFICULTY);
    addBlock(new_block);
    @import("p2p.zig").broadcastBlock(new_block, null);
}
```
コール（抜粋）
```zig
if (tx.tx_type == 2) {
    const code = contract_storage.get(tx.receiver) orelse return error.ContractNotFound;
    result = try @import("evm.zig").execute(allocator, code, evm_data, tx.gas_limit);
}
```

4) 2ノードでの確認（手順）
- ターミナル1（デプロイ側）
```bash
zig build run -- --listen 9000 \
  --deploy $(cat /tmp/out/Adder.bin) 0x000000000000000000000000000000000000abcd \
  --gas 3000000 --sender 0x000000000000000000000000000000000000dead
```
- ターミナル2（接続＋コール側）
```bash
SEL=$(solc --hashes references/chapter9/contract/SimpleAdder.sol | awk '/mul\(uint256,uint256\)/{print $1}' | sed 's/://')
A=$(printf "%064x" 6); B=$(printf "%064x" 7); DATA=0x${SEL}${A}${B}
zig build run -- --listen 9001 --connect 127.0.0.1:9000 \
  --call 0x000000000000000000000000000000000000abcd "$DATA" --gas 100000 \
  --sender 0x000000000000000000000000000000000000dead
```

### まとめ
- デプロイはruntime codeの保存と、contracts付きブロックの配布までを一連で扱う
- コールはローカルor同期後に実行され、結果は32バイトで返る
- EVMコアとABIディスパッチが整っていれば、四則演算を含む典型的な関数は問題なく動く
