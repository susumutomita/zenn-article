---
title: "完成した学習用ノードを受け入れ確認する"
free: true
---

ここまでに、ブロック、PoW、P2P、簡易EVM、Solidityコントラクトの実行を組み立てました。本章では新しい機能を足しません。完成版に対して同じ検証をやり直し、「どこまで動き、どこから先は実装していないか」を確定します。

> **対象コード:** `BlockChain`リポジトリ直下の`src/`、`contract/`、`build.zig`です。章の途中状態ではなく、すべてを統合した完成版を使います。

## 受け入れ条件

次の条件をすべて満たした時点を、本書の完成とします。

| 対象 | 受け入れ条件 | 検証場所 |
| --- | --- | --- |
| ブロック | 全トランザクションフィールドとデプロイ済みruntime codeを含むSHA-256ハッシュを計算できる | `src/blockchain.zig`の改ざんテスト |
| PoW | 難易度で指定した先頭ゼロバイトを持つnonceを探索できる | `src/main.zig`のテスト |
| EVMの型 | u256、スタック、メモリ、ストレージの成功・失敗を検証できる | `src/evm_types.zig`のテスト |
| EVM命令 | 算術、メモリ、ジャンプ、RETURN、REVERTなど本書のサブセットを実行できる | `src/evm.zig`のテスト |
| P2P | 無効ブロックを再伝播せず、4 KiB超のデプロイブロックを同期できる | `src/p2p.zig`のテストと2ノード受け入れ確認 |
| Solidity | `Adder.add`のcreation bytecodeをデプロイし、ABI calldataで呼べる | 第12章の実行手順 |
| 教材コード | 提供済みの章・節チェックポイントをすべてビルドできる | `scripts/verify-book-code.sh` |

この表にないEthereum互換性やネットワークの安全性は、受け入れ条件へ含めません。

## 提供済みの全チェックポイントを検証する

リポジトリ直下で検証スクリプトを実行します。

```bash
sh scripts/verify-book-code.sh
```

スクリプトは、完成版と`references/`配下の自己完結したプロジェクトを順にビルドし、`test`ステップがある場合はテストも実行します。macOSではDocker、Zig 0.14.0を利用できるLinuxではローカルのZigを使います。

各ディレクトリの最後に`PASS`が並び、終了コードが`0`なら成功です。途中で失敗した場合、最初に表示されたディレクトリが問題のチェックポイントです。

特定の章だけを再確認できます。

```bash
sh scripts/verify-book-code.sh references/chapter3/step2
sh scripts/verify-book-code.sh references/chapter8
sh scripts/verify-book-code.sh references/EVMchapter
```

## 参照コードと完成版の実通信を検証する

ユニットテストだけでは、TCPフレーム、プロセス起動順、チェイン同期、Solidityコンパイラとの組み合わせを確認できません。第12章の受け入れスクリプトを、章の参照コードとリポジトリ直下の完成版の両方へ実行します。

```bash
sh references/EVMchapter/scripts/acceptance.sh
sh references/EVMchapter/scripts/acceptance.sh .
```

第1コマンドは`references/EVMchapter/`を対象にします。第2コマンドは引数の`.`をプロジェクトルートとして扱い、`src/`の完成版を対象にします。両方で次の3行が表示され、終了コード0になることが合格条件です。

```text
ONE_NODE_EVM PASS: add(2,3)=5
TWO_NODE_EVM PASS: deployment synchronized and add(2,3)=5 on both nodes
EVM_ACCEPTANCE PASS
```

このゲートはdigest固定のsolc 0.8.24で、Berlin向けcreation codeを生成します。デプロイブロックが64 KiBのP2P上限内に収まり、同期先がruntime codeを復元し、両ノードで`add(2,3)=5`になることを実際に確認します。

## 決定的なEVMスモークテスト

ネットワークや実時刻を使わず、`5 + 3 = 8`だけを計算します。対象は`src/evm.zig`の実行ループです。

```bash
zig build run -- --evm 600560030160005260206000f3 --gas 100000
```

バイトコードを分解すると次の処理になります。

```text
PUSH1 0x05
PUSH1 0x03
ADD
PUSH1 0x00
MSTORE
PUSH1 0x20
PUSH1 0x00
RETURN
```

期待する結果は32バイトの整数`8`です。16進表示では末尾が`08`、u256表示では`8`になります。

macOSでは、リポジトリ直下のDockerfileからZig 0.14.0の実行イメージを作り、同じスモークテストを実行します。

```bash
docker build -t zig-blockchain-book:0.14.0 .
docker run --rm zig-blockchain-book:0.14.0 \
  zig build run -- --evm 600560030160005260206000f3 --gas 100000
```

この確認が失敗した場合は、P2PやSolidityへ進まず、次のテストを個別に実行します。

```bash
zig test src/evm_types.zig
zig test src/evm.zig --test-filter "Simple EVM execution"
```

## 失敗を成功として扱わない

完成確認では、正常な戻り値だけでなく停止理由も区別します。

### スタック不足

空のスタックに対する`POP`や、引数が足りない算術命令は`StackUnderflow`です。0を補って実行を続けてはいけません。

### 不正なジャンプ

`JUMP`と`JUMPI`の宛先は、有効な`JUMPDEST`でなければ`InvalidJump`です。バイト列の途中へ自由にジャンプさせてはいけません。

### REVERT

`REVERT`はEVMを異常終了させる命令ですが、テストの観点では「期待した`Revert`エラーを返せた」ことが成功条件です。

```bash
zig test src/evm.zig --test-filter "EVM REVERT operation"
```

### 未知のオペコード

本書で実装していない命令は`InvalidOpcode`として停止します。Ethereumが定義するすべての命令を、この簡易EVMが実行できるわけではありません。

## Solidityの受け入れ確認

第12章で作った`DATA`を使い、`Adder.add(2, 3)`をもう一度実行します。

Linuxで`solc` 0.8.24をインストールしている場合は次を実行します。受け入れ確認済みの命令構成を固定するため、ターゲットはBerlinへ固定します。

```bash
mkdir -p /tmp/zig-book-out
solc --bin --evm-version berlin \
  contract/SimpleAdder.sol -o /tmp/zig-book-out --overwrite
SEL=$(solc --hashes contract/SimpleAdder.sol | awk '/add\(uint256,uint256\)/{print $1}' | sed 's/://')
A=$(printf "%064x" 2)
B=$(printf "%064x" 3)
DATA="0x${SEL}${A}${B}"
```

macOSでは`solc`もDockerで実行します。

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

1ノードでデプロイとコールを続けて実行します。

```bash
zig build run -- \
  --listen 9000 \
  --deploy "$(cat /tmp/zig-book-out/Adder.bin)" 0x000000000000000000000000000000000000abcd \
  --call 0x000000000000000000000000000000000000abcd "$DATA" \
  --gas 3000000 \
  --sender 0x000000000000000000000000000000000000dead
```

次の4点をログで確認します。

1. creation bytecodeの実行が成功する。
2. runtime codeが`contract_storage`へ保存される。
3. デプロイブロックがPoW条件を満たして追加される。
4. コール結果の32バイト値が`5`になる。

確認後は`Ctrl+C`でノードを終了します。

macOSでは、第12章で作った実行イメージへbytecodeと`DATA`を渡します。

```bash
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

結果を確認したら`Ctrl+C`で停止し、生成物を削除します。

```bash
rm -rf .zig-book-out
```

## コードと本文のドリフトを防ぐ

本文のコードを変更したときは、対応する`references/`またはルート`src/`も変更し、次の順で確認します。

```bash
zig fmt --check .
sh scripts/verify-book-code.sh
```

原稿リポジトリでは、MarkdownとZennの構文も検証します。

```bash
pnpm lint
pnpm exec zenn list:books
```

本文へ新しいCLI、ファイル名、期待結果を書く場合、実コードに同じ名前が存在するかを確認してください。擬似コードを掲載する場合は、実行可能なコードと誤認されないよう「設計案」と明示し、本編の完成手順には混ぜません。

## 完成版の限界

本書で完成するのは、仕組みを観察するための学習用ノードです。次の性質は持ちません。

- `addBlock`はhash、PoW、index、親hashを検証しますが、累積workによるフォーク選択や決定的な全状態遷移は実装しない。
- `syncChain`補助関数は候補チェインのhash、PoW、決定的genesis、index、親hash、重複を一括置換の前に検証し、候補の選択基準は長さだけである。ただしこれはユニットテスト用の境界で、P2P実通信からは未接続。`GET_CHAIN`は`BLOCK:`を順次`addBlock`し、空ノードまたは同じprefixを持つ遅れたノードの追従だけを保証する。分岐済みチェインの自動置換、累積workによるフォーク選択、ファイナリティは持たない。
- ブロックハッシュは現在の全トランザクションフィールドとデプロイ済みruntime codeを確約しますが、残高、アカウントnonce、EVMストレージのstate rootは持たない。
- EVMでは、命令別ガス、永続ストレージ、外部コール、ログ、暗号プリコンパイルが完全ではない。
- トランザクション署名、アカウント残高、アカウントnonce（ブロックのPoW nonceとは別）、手数料市場は実装していない。
- P2Pフレームは64 KiBへ制限しますが、ピア認証、帯域制御、タイムアウト、永続DB、クラッシュ復旧は実装していない。

ブロックhashとPoWは、受信した内容が採掘済みhashから変わっていないことを検出します。署名がないため、`sender`を書いた本人が秘密鍵の所有者であることは証明しません。hashだけでは、攻撃者が別内容を新しいブロックとして採掘する行為を防げません。署名、送信者導出、アカウントnonce、リプレイ拒否は[BlockChain Issue #197](https://github.com/susumutomita/BlockChain/issues/197)で次版の実装と本文を対にして追跡します。

この境界を保ったまま、ブロック生成、PoW、伝播、同期、バイトコード実行、コントラクトのデプロイとコールを1つのプログラムで追えることが、本書の到達点です。

## まとめ

完成版の受け入れ確認では、ユニットテスト、章チェックポイント、決定的なEVMスモークテスト、Solidityのデプロイとコールを順に実行しました。失敗ケースと実装範囲も固定したので、「動いたこと」と「本番利用できること」を混同せず、ここから先の改良へ進めます。
