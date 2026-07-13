---
title: "テストでEVMとP2P統合を固める"
free: true
---

第12章までで、簡易EVMをブロックチェインとP2P通信へ接続しました。
機能を追加しただけでは、どこかを直したときに別の機能を壊すおそれがあります。
そこで本章では、完成形に含まれるテストを実行し、実装の境界を1つずつ確認します。

本章の目的は、大きな実装をもう一度書き写すことではありません。
テストコードを仕様書として読み、正常系と失敗系の両方を再現することです。

## 本章で確認すること

本章では、次の順番で確認します。

1. `EVMu256`の演算と桁上がり
2. EVMスタックのLIFO動作と境界エラー
3. EVMメモリの拡張と32バイトの読み書き
4. オペコードの正常終了
5. `REVERT`と不正ジャンプの失敗契約
6. ブロック中継の重複抑止
7. ピア未接続時のEVMトランザクションキュー
8. EVMトランザクションのJSON往復変換
9. 通常トランザクション、ブロック追加、PoW
10. Docker上での全体テスト

確認対象は、[`BlockChain`リポジトリ](https://github.com/susumutomita/BlockChain)直下の完成形です。
本章で示すテストは、次の実ファイルに置かれています。

| 対象 | テストがあるファイル |
| --- | --- |
| EVMの値、スタック、メモリ | `src/evm_types.zig` |
| オペコードとEVMエラー | `src/evm.zig` |
| ブロック中継、EVMトランザクションの送信待ち、JSON変換 | `src/p2p.zig` |
| 通常トランザクション、ブロック、PoW | `src/main.zig`、`src/blockchain.zig` |
| テスト全体の組み立て | `build.zig` |

本文には、確認に必要な短い部分だけを掲載します。
テストの正本は、上記の実ファイルです。

## Zig 0.14.0のDockerイメージを準備する

以降のコマンドは、`BlockChain`リポジトリのルートで実行します。
Dockerを使うことで、ホストOSにZigを直接インストールせずに検証できます。

### 対象ファイル

- `Dockerfile`
- `build.zig`

### 確認するコード

`Dockerfile`は、ビルド引数`ZIG_VERSION`でZigのバージョンを受け取ります。
本書では、テスト環境をZig 0.14.0へ固定します。

### テストコマンド

```bash
docker build \
  --build-arg ZIG_VERSION=0.14.0 \
  -t zig-blockchain-book .
```

### 期待する結果

イメージ`zig-blockchain-book`のビルドが終了コード0で完了します。
以降は、このイメージに含まれる完成形のソースをテストします。

## `EVMu256`の演算を確認する

EVMの値は256ビットです。
この実装では、上位128ビットを`hi`、下位128ビットを`lo`に保持します。

### 対象ファイル

- `src/evm_types.zig`

### 確認するコード

テストは、通常の加減算と乗算、下位128ビットからの桁上がり、256ビット全体のラップを確認します。

```zig
const max_u128 = EVMu256{ .hi = 0, .lo = std.math.maxInt(u128) };
const one = EVMu256.fromU64(1);
const overflow_sum = max_u128.add(one);
try std.testing.expect(overflow_sum.hi == 1);
try std.testing.expect(overflow_sum.lo == 0);

const max_u256 = EVMu256{
    .hi = std.math.maxInt(u128),
    .lo = std.math.maxInt(u128),
};
try std.testing.expect(max_u256.add(one).eql(EVMu256.zero()));
try std.testing.expect(EVMu256.zero().sub(one).eql(max_u256));

const crosses_half = (EVMu256{
    .hi = 0,
    .lo = @as(u128, 1) << 127,
}).mul(EVMu256.fromU64(2));
try std.testing.expect(crosses_half.eql(.{ .hi = 1, .lo = 0 }));
```

最初のケースでは桁が`hi`へ移ります。`max_u256 + 1`と`0 - 1`はEVMの規則どおりmod 2^256でラップします。乗算も128ビット境界を越える結果を保持します。

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm_types.zig --test-filter "EVMu256 operations"
```

### 期待する結果

`EVMu256 operations`が`OK`になり、選択したテストがすべて成功します。

このテストで、通常値、128ビット境界、256ビット境界を固定します。
簡易実装の256ビット乗算全体を保証するものではありません。

## スタックのLIFO動作と境界エラーを確認する

EVMスタックは、後から積んだ値を先に取り出すLIFO構造です。
この実装では、最大要素数を1024に固定しています。

### 対象ファイル

- `src/evm_types.zig`

### 確認するコード

テストは、`10`、`20`の順に値を積みます。
取り出す順番は`20`、`10`です。
空のスタックと満杯のスタックでは、対応するエラーを期待します。

```zig
try std.testing.expectError(error.StackUnderflow, stack.pop());

for (0..1024) |i| {
    try stack.push(EVMu256.fromU64(@intCast(i)));
}
try std.testing.expectError(
    error.StackOverflow,
    stack.push(EVMu256.fromU64(1025)),
);
```

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm_types.zig --test-filter "EvmStack operations"
```

### 期待する結果

`EvmStack operations`が`OK`になります。
`StackUnderflow`と`StackOverflow`は、テストが期待している正常な検証結果です。

## メモリの拡張と32バイトの往復を確認する

EVMメモリは、必要な位置へアクセスしたときに拡張されます。
`store32`と`load32`は、256ビット値を32バイトとして読み書きします。

### 対象ファイル

- `src/evm_types.zig`

### 確認するコード

テストは、最初に64バイトまで拡張します。
次に値`42`を書き込み、同じ値を読み戻します。
オフセット100からの読み込みでは、必要な大きさまで再び拡張されることも確認します。

```zig
try memory.ensureSize(64);
try std.testing.expectEqual(@as(usize, 64), memory.data.items.len);

const value = EVMu256.fromU64(42);
try memory.store32(0, value);
const loaded_value = try memory.load32(0);
try std.testing.expect(loaded_value.hi == value.hi);
try std.testing.expect(loaded_value.lo == value.lo);

_ = try memory.load32(100);
try std.testing.expect(memory.data.items.len >= 132);
```

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm_types.zig --test-filter "EvmMemory operations"
```

### 期待する結果

`EvmMemory operations`が`OK`になります。
書き込んだ256ビット値を読み戻せて、後方の読み込みに応じてメモリが拡張されます。

## オペコードの正常系を確認する

オペコードのテストは、バイトコードを`execute`へ渡し、戻り値を検証します。
ここでは、加算から`RETURN`までの最小経路を確認します。

### 対象ファイル

- `src/evm.zig`
- `src/evm_types.zig`

### 確認するコード

次のバイトコードは、`5 + 3`を計算します。
結果をメモリの先頭へ保存し、32バイトを返します。

```zig
const bytecode = [_]u8{
    0x60, 0x05,
    0x60, 0x03,
    0x01,
    0x60, 0x00,
    0x52,
    0x60, 0x20,
    0x60, 0x00,
    0xf3,
};
```

テストは返された32バイトを`EVMu256`として読み、下位値が`8`であることを確認します。

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm.zig --test-filter "Simple EVM execution"
```

### 期待する結果

`Simple EVM execution`が`OK`になります。
同じファイルには、乗算、ストレージ、比較、シフト、ジャンプ、`CODECOPY`のテストもあります。

256ビットシフトは、128ビットずつの`hi`/`lo`境界で誤りやすいため、0、1、63、64、127、128、224、255、256ビットをまとめて確認します。

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm.zig --test-filter "EVM 256-bit shift boundaries"
```

このテストが`OK`になれば、`SHL`、`SHR`、`SAR`の境界と、ABIセレクタ抽出に使う`SHR 224`を同じ実装で扱えています。

## `REVERT`と不正ジャンプを確認する

失敗系では、「失敗したこと」そのものが期待結果です。
テストが`error.Revert`や`InvalidJump`を受け取れれば、失敗契約を守れています。

### 対象ファイル

- `src/evm.zig`
- `build.zig`

### 確認するコード

`REVERT`のテストは、オフセット0から32バイトをリバートデータとして指定します。

```zig
const bytecode = [_]u8{
    0x60, 0x20,
    0x60, 0x00,
    0xFD,
};

const calldata = [_]u8{};
const result = execute(allocator, &bytecode, &calldata, 100000);
try std.testing.expectError(EVMError.Revert, result);
```

`REVERT`を`RETURN`と同じ成功として扱ってはいけません。
このテストは、`execute`が`EVMError.Revert`を返すことを確認します。
ストレージの巻き戻しやガスの精密な扱いまでは検証していません。

不正ジャンプのテストは、`JUMPDEST`ではない位置へ移動しようとします。
`executeWithErrorInfo`の結果は`success == false`となります。
さらに、`error_type`が`InvalidJump`であることも確認します。

```zig
const bytecode = [_]u8{
    0x60, 0x01,
    0x56,
};

const calldata = [_]u8{};
const bytecode_slice = bytecode[0..];
const calldata_slice = calldata[0..];
const result = executeWithErrorInfo(
    allocator,
    bytecode_slice,
    calldata_slice,
    100000,
);
try std.testing.expect(!result.success);
try std.testing.expect(result.error_type.? == EVMError.InvalidJump);
```

### テストコマンド

`REVERT`だけを確認する場合は、テスト名で絞り込みます。
実装は診断情報をデバッグログへ記録し、テストは返されたエラー値を検証します。

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm.zig --test-filter "EVM REVERT operation"
```

不正ジャンプは、次のコマンドで確認します。

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/evm.zig --test-filter "EVM execution with error info"
```

### 期待する結果

`EVM REVERT operation`が`OK`になり、コマンドは終了コード0で完了します。
これはリバートが発生しなかったという意味ではありません。
期待した`EVMError.Revert`を取得できたという意味です。

不正ジャンプのテストも`OK`になり、エラー種別と失敗位置が保持されます。

## ブロック中継の重複を防ぐ

接続直後には、送信側の待機ブロック配信と受信側の全チェイン同期が重複し得ます。
同じハッシュのブロックを2回保持せず、受信済みブロックを再送キューへ戻さないことをテストします。

### 対象ファイル

- `src/blockchain.zig`
- `src/p2p.zig`

`addBlock`は保存済みハッシュを先に確認します。

```zig
for (chain_store.items) |existing_block| {
    if (std.mem.eql(u8, &existing_block.hash, &new_block.hash)) {
        return .duplicate;
    }
}
```

`broadcastBlock`は、ローカル生成ブロックだけを待機キューへ入れます。`from_peer`があるブロックは受信済みなので、送信先がなくても再キューしません。

```zig
if (from_peer == null and (available_peers == 0 or !sent)) {
    pending_blocks.append(blk) catch return;
}
```

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/blockchain.zig --test-filter "重複追加しない"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig --test-filter "relayed block is not queued"
```

両方が`OK`になれば、全チェイン同期とリアルタイム中継が重なってもチェイン高が水増しされません。

## ピア未接続時のEVMトランザクションを確認する

EVMトランザクションを送る時点でピアがいない場合、データを失ってはいけません。
実装は、シリアライズ済みのペイロードを`pending_evm_txs`へ保存します。

### 対象ファイル

- `src/p2p.zig`
- `src/parser.zig`
- `src/types.zig`

### 確認するコード

テストはピア一覧と保留キューを空にしてから、EVMトランザクションを送ります。
送信後はピア数が0のままで、保留件数だけが1になります。

```zig
try broadcastEvmTransaction(tx1);
try std.testing.expectEqual(@as(usize, 0), peer_list.items.len);
try std.testing.expectEqual(@as(usize, 1), pending_evm_txs.items.len);

const expected_payload_tx1 = try parser.serializeTransaction(allocator, tx1);
defer allocator.free(expected_payload_tx1);
try std.testing.expect(std.mem.eql(
    u8,
    expected_payload_tx1,
    pending_evm_txs.items[0],
));
```

その後、実ソケットの代わりにモックライターへ送ります。
テストは`EVM_TX:`プレフィックスと改行を含む送信内容を比較し、キューが空になることを確認します。

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig --test-filter "EVM transaction queuing and flushing"
```

### 期待する結果

ピアがいないことを示す警告の後、`EVM transaction queuing and flushing`が`OK`になります。
このテストはモックライターを使うため、実ネットワークには接続しません。

## EVMトランザクションのJSON往復変換を確認する

送信側と受信側でJSONの解釈が違うと、トランザクションを実行できません。
そこで、シリアライズした値を再びパースし、元の値と比較します。

### 対象ファイル

- `src/p2p.zig`
- `src/parser.zig`
- `src/types.zig`

### 確認するコード

比較するのは、送信者、受信者、金額、トランザクション種別、ガス上限、ガス価格です。
`evm_data`はJSON化するときに16進化され、パース時に元のバイト列へ戻ります。

```zig
try std.testing.expectEqualStrings(tx2.sender, parsed_tx.sender);
try std.testing.expectEqualStrings(tx2.receiver, parsed_tx.receiver);
try std.testing.expectEqual(tx2.amount, parsed_tx.amount);
try std.testing.expectEqual(tx2.tx_type, parsed_tx.tx_type);
try std.testing.expectEqual(tx2.gas_limit, parsed_tx.gas_limit);
try std.testing.expectEqual(tx2.gas_price, parsed_tx.gas_price);

if (tx2.evm_data) |original_data| {
    try std.testing.expect(parsed_tx.evm_data != null);
    if (parsed_tx.evm_data) |parsed_data| {
        try std.testing.expect(std.mem.eql(u8, original_data, parsed_data));
    }
} else {
    try std.testing.expect(parsed_tx.evm_data == null);
}
```

このテストは、`tx_type`の数値をそのまま保てることを確認します。
デプロイやコールの意味を判定するテストではありません。

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig \
  --test-filter "EVM transaction JSON format consistency"
```

### 期待する結果

`EVM transaction JSON format consistency (serialize/parse)`が`OK`になります。
特に、`evm_data`が16進文字列のまま残らず、元のバイト列へ戻ることが重要です。

## EVMブロックの改ざんと不正チェインを拒否する

EVM統合後は、送金額だけでなくcreation code、gas、トランザクションID、デプロイ済みruntime codeもブロックhashの対象です。さらに、正しいPoWを持つだけではチェインへ追加せず、indexと`prev_hash`が現在の先端へ連続することを先に検証します。

ここで`invalid longer chain`が検証するのは、候補チェインを一括適用する`syncChain`補助関数の失敗時atomicityです。現在のP2P実通信はこの関数を呼ばず、`GET_CHAIN`で受け取った`BLOCK:`を現在のtipへ順次追加します。そのため、このテストをネットワーク上のフォーク自動解決の実装とは扱いません。

### 対象ファイル

- `src/blockchain.zig`
- `src/p2p.zig`

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/blockchain.zig \
  --test-filter "EVM payload and deployed runtime tampering"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/blockchain.zig \
  --test-filter "addBlock rejects wrong index and link"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/blockchain.zig \
  --test-filter "invalid longer chain leaves local chain"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig \
  --test-filter "Solidity deployment block fits in one P2P frame"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig \
  --test-filter "invalid received block is neither added nor relayed"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/p2p.zig \
  --test-filter "locally mined block owns input"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/parser.zig \
  --test-filter "block parser rejects out-of-range and floating consensus numbers"

docker run --rm --entrypoint zig zig-blockchain-book \
  test src/parser.zig \
  --test-filter "transaction parser rejects floating integer fields"
```

### 期待する結果

8つの対象テストがそれぞれ1件以上実行され、すべて`OK`になります。これらは次を固定します。

- creation codeまたはruntime codeを1バイト変えると、保存済みhashと再計算hashが一致しない。
- indexまたは親hashが違うブロックを拒否し、含まれていたコントラクトを状態へ保存しない。
- 長いだけの不正チェインを拒否し、ローカルチェインとコントラクト状態を変更しない。
- creation codeとruntime codeをJSON化したフレームが4 KiBを超え、明示した64 KiB上限内には収まる。
- 受信後にhash不一致となったブロックは、チェインへ追加せず、再伝播キューにも入れない。
- 次の標準入力で作業バッファが再利用されても、採掘済みブロックの`data`とPoWは変わらない。
- `u32`を超えるindexと、整数フィールドへ渡された小数を`InvalidFormat`として拒否する。

このテスト群はトランザクション署名を検証するものではありません。内容のコミットメントと送信者の認証は別の境界です。

## 通常トランザクションとPoWを確認する

EVMを追加した後も、元からあるブロックチェインの基本機能を守る必要があります。
`src/main.zig`には、通常トランザクションとPoWの回帰テストがあります。

### 対象ファイル

- `src/main.zig`
- `src/types.zig`
- `src/blockchain.zig`

### 確認するコード

4つのテストが、次の契約を確認します。

- トランザクションの送信者、受信者、金額を初期化できる
- ブロックのトランザクション配列へ1件追加できる
- トランザクションの金額を変更するとブロックハッシュが変わる
- 難易度1で採掘したハッシュの先頭1バイトが`0`

PoWテストの最後のアサーションは次のとおりです。

```zig
block.hash = blockchain.calculateHash(&block);
blockchain.mineBlock(&block, 1);
try std.testing.expectEqual(@as(u8, 0), block.hash[0]);
```

ナンスやハッシュ全体は採掘条件から決まります。
このテストでは特定のナンスを固定せず、難易度条件だけを検証します。

### テストコマンド

```bash
docker run --rm --entrypoint zig zig-blockchain-book \
  test src/main.zig
```

### 期待する結果

次のテストがすべて`OK`になります。

- `トランザクションの初期化テスト`
- `ブロックにトランザクションを追加`
- `トランザクションの変更でブロックハッシュが変わる`
- `マイニングが先頭1バイト0のハッシュを生成できる`

## Dockerで完成形の全テストを実行する

最後に、ファイル単体ではなく完成形全体をテストします。
この手順が、本章の完了条件です。

### 対象ファイル

- `Dockerfile`
- `build.zig`
- `src/*.zig`

### 確認するコード

`build.zig`は、`src`内の13モジュールを個別のテストルートとして登録します。
これにより、`evm_types.zig`、`evm.zig`、`p2p.zig`、`main.zig`などのテストをまとめて実行します。

### テストコマンド

ソースを変更した場合は、最初にイメージを作り直します。

```bash
docker build \
  --build-arg ZIG_VERSION=0.14.0 \
  -t zig-blockchain-book .

docker run --rm zig-blockchain-book \
  zig build test --summary all
```

### 期待する結果

現在の完成形では、`27/27 steps succeeded; 154/154 tests passed`と表示されます。
`154`は13個のテストルートで実行された件数の合計です。Zigではimport先のテストも各テストルートから実行されるため、一意な`test`宣言数とは一致しません。
コマンドは終了コード0で完了します。
`REVERT`のような失敗系テストも、期待したエラーを検証できれば成功です。

テストが失敗した場合は、最初に失敗したファイル単体のコマンドへ戻ります。
値、オペコード、P2P、ブロックチェインのどの境界で壊れたかを切り分けられます。

## まとめ

本章では、新しい実装を重ねる代わりに、完成形のテストを仕様として読みました。

- `EVMu256`では、値の演算と桁上がりを確認した
- スタックでは、LIFOと上下限のエラーを確認した
- メモリでは、動的拡張と32バイトの往復を確認した
- オペコードでは、正常な`RETURN`と失敗する`REVERT`を区別した
- P2Pでは、未送信キューとJSONの往復変換を確認した
- 通常トランザクションとPoWが、EVM追加後も動くことを確認した
- 最後に、Zig 0.14.0のDocker環境で全体テストを実行した

テストを通すだけでなく、各テストが何を保証し、何を保証しないかを読むことが重要です。
この境界が分かれば、次に機能を追加するときも、壊れた場所を小さく切り分けられます。
