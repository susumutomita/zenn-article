---
title: "本書の進め方とコードの対応"
free: true
---

この本では、説明を読んだ直後にコードを変更し、テストし、実際に動かします。最初から完成版を写すのではなく、小さな変更によってブロックチェインが育っていく過程を確認してください。

本章では、本文とサンプルコードの対応、各節での作業手順、検証方法をまとめます。以降で示すパスは、特記がない限りコードリポジトリのルートからの相対パスです。

## 正式なコードリポジトリ

本書のコードは、GitHubの [susumutomita/BlockChain](https://github.com/susumutomita/BlockChain) で管理しています。本書の原稿は別リポジトリの [books/zig-blockchain](https://github.com/susumutomita/zenn-article/tree/main/books/zig-blockchain) にありますが、実行するコードの基準は `BlockChain` リポジトリです。

まず、コードを取得します。

```bash
git clone https://github.com/susumutomita/BlockChain.git
cd BlockChain
git switch main
```

本書が基準にしているZigのバージョンは `0.14.0` です。リポジトリの `Dockerfile` とCIもこのバージョンを使用します。異なるZigでは、標準ライブラリやビルドAPIの違いによって、そのままコンパイルできない場合があります。

取得後は、まず完成版のテストを実行してください。

```bash
docker build --build-arg ZIG_VERSION=0.14.0 -t zig-blockchain-book .
docker run --rm zig-blockchain-book zig build test
```

テストが通れば、本文とコードを照合する準備は完了です。

## 1つの節を進める6つの手順

実装を含む節は、原則として次の6項目を一組として読み進めます。

1. **対象パス**
   変更するファイルを、リポジトリルートからの相対パスで確認します。たとえば `src/blockchain.zig` や `references/chapter3/step2/src/main.zig` です。
2. **開始地点**
   その節の変更前に相当するチェックポイントを確認します。本文の途中から始める場合も、先に開始地点がテストを通ることを確かめます。
3. **今回の変更**
   本文のコード例と、その章の完全差分を対応させます。第11章と第12章には、`references/book-patches/chapter11.patch`と`chapter12.patch`があります。説明用のコード片だけから、不足部分を推測する必要はありません。
4. **テスト**
   変更した関数や型に近いテストを実行します。成功ケースだけでなく、不正な入力や改ざんを拒否するケースも確認します。
5. **実行**
   `zig build run` または本文で指定したDocker／複数ノード用コマンドを実行します。
6. **期待する結果**
   ログの形、ブロックの連結、先頭ゼロの個数、エラーの種類など、その節で成立すべき条件を確認します。タイムスタンプ、nonce、ハッシュ値、ポート番号を含むログの値は、実行ごとに変わる場合があります。本文と一字一句同じ値ではなく、節で説明した条件を満たすかを見てください。

各節では、次の形でコードと確認方法を対応させます。

```text
対象パス:   references/chapter3/step2/src/main.zig
開始地点:   ch03-sec01-block-struct
今回の変更: SHA-256によるハッシュ計算を追加
テスト:     zig build test
実行:       zig build run
期待結果:   32バイトのハッシュが16進数で表示される
```

## チェックポイントの名前

本文中の論理チェックポイントは、次の形式で表します。

```text
chNN-secNN-short-name
```

- `NN` は2桁の章番号と節番号です。
- `short-name` は、その節で完成する機能を小文字の英単語とハイフンで表します。
- 例は `ch03-sec02-hash`、`ch04-sec02-mine-block`、`ch08-sec03-relay-block` です。
- ある節の「開始地点」は、原則として直前のチェックポイントです。

現在の `references/` は、執筆途中から存在する `chapter3/step1` のような名前も含みます。これらを本文の論理名へ読み替えるため、次節の対応表を使います。将来Gitタグを追加する場合は `book/ch04-sec02-mine-block` のように、論理名へ `book/` を付けます。ただし、現時点ですべての節にGitタグがあるわけではありません。対応表で「未提供」とした地点は、存在するものとして `git checkout` しないでください。

## 章とコードスナップショットの対応

`references/` の各スナップショットは、原則としてそれぞれのディレクトリ内で `build.zig` を使う自己完結したプロジェクトです。第10章には独立したEVM実行エンジン、第11章にはブロックチェインへ統合したEVM、第12章にはCLIとP2Pまで統合したEVMのスナップショットがあります。節とファイル、テストの対応は、後述の「EVM編の節とコードの対応」で固定します。

第7章、第8章、第10章は、Zennの1ファイルあたり50,000文字という上限に収めるため、それぞれ前半と後半の2ファイルに分かれています。前後半は同じ章の連続した作業であり、作業ディレクトリと章末スナップショットは共通です。

| 本書 | 主な実装 | 対応するコード | 状態 |
| --- | --- | --- | --- |
| 第2章 | Zig、Docker、ビルド環境 | [`references/chapter2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter2) | 章スナップショット |
| 第3章 | ブロック、ハッシュ、トランザクション | [`references/chapter3/step1/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step1) → [`step2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step2) → [`step3/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step3) | 節スナップショット |
| 第4章 | nonce、PoW、マイニング、テスト | [`references/chapter3/step4/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step4) → [`step4-2/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step4-2) → [`step5/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter3/step5) | 節スナップショット。ディレクトリ番号と本書の章番号が異なる |
| 第5章 | モジュール分割したブロックチェイン | [`references/chapter5/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter5) | 章スナップショット |
| 第6章 | P2P通信と2ノード接続 | [`references/chapter6/step1/nodeA/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step1/nodeA)、[`nodeB/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step1/nodeB)、[`step2/nodeA/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter6/step2/nodeA) | 節スナップショット。step2は同じ実行ファイルをlisten/connectの2モードで使うため、nodeB別スナップショットは不要 |
| 第7章（前半・後半） | ノード間のブロック共有 | [`references/chapter7/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter7) | 前後半で共通の章スナップショット |
| 第8章（前半・後半） | 複数ピア、再伝播、チェイン同期 | [`references/chapter8/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter8) | 前後半で共通の章スナップショット |
| 第9章 | EVM導入、256ビット値 | [`references/chapter9/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter9) | `EVMu256`だけを動かす章スナップショット |
| 第10章（前半・後半） | スタック、メモリ、ストレージ、オペコード | [`references/chapter10/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter10) | 前後半を通して`EVM result: 5 + 3 = 8`まで動かす章スナップショット |
| 第11章 | Solidity実行とブロックチェイン統合 | [`references/chapter11/`](https://github.com/susumutomita/BlockChain/tree/main/references/chapter11) | 章専用スナップショット。第12章のCLI、`EVM_TX`、64 KiBフレームはまだ含まない |
| 第12章 | CLI、P2P、EVMトランザクション | [`references/EVMchapter/`](https://github.com/susumutomita/BlockChain/tree/main/references/EVMchapter) | 第11章スナップショットへ第12章の完全差分を適用した章スナップショット |
| 第13章 | EVM、P2P、PoWのテスト | [`references/EVMchapter/`](https://github.com/susumutomita/BlockChain/tree/main/references/EVMchapter)、[`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) | 完成版の各モジュールに同居するテストを実行 |
| 第14章 | 完成ノードの受け入れ確認 | [`contract/`](https://github.com/susumutomita/BlockChain/tree/main/contract)、[`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) | ルート完成版を使う統合シナリオ |
| 第15章 | PoSの設計案 | なし | **未提供**。学習用の設計案であり、現在のルート `src/` に未統合 |
| 第16章 | zkEVM、最適化、今後の発展 | なし | **未提供**。概念と発展課題を扱う章 |

`references/chapter4/step1` から `step3` までにもPoWに近いコードがあります。現在の本文の第4章と対応させる際は、上表の `references/chapter3/step4`、`step4-2`、`step5` を使います。似たディレクトリ名だけで判断せず、本文で指定した開始地点を確認してください。

また、`references/books/` は過去の原稿を保存したディレクトリです。現在公開している本文の基準ではありません。

## EVM編の節とコードの対応

第9章と第10章は独立した章スナップショットで段階的に実装します。第11章は`references/chapter11/`、第12章は`references/EVMchapter/`がそれぞれの終了地点です。本文のコード片は要点を説明し、章別patchはその章で必要なimport、CLI引数解析、補助関数、JSON、P2P処理、テストまで含む適用可能な完全差分です。

| 章・節 | 対象ファイル | 節終了時の確認 |
| --- | --- | --- |
| 第9章 256ビット値 | `references/chapter9/src/evm_types.zig` | `zig build test`と`zig build run` |
| 第10章 スタック | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmStack"` |
| 第10章 メモリ | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmMemory"` |
| 第10章 ストレージ | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmStorage"` |
| 第10章 実行コンテキスト | `references/chapter10/src/evm_types.zig` | `zig test src/evm_types.zig --test-filter "EvmContext"` |
| 第10章 実行ループとオペコード | `references/chapter10/src/evm.zig` | `zig test src/evm.zig`と`zig build run` |
| 第11章 Solidityコントラクト | `references/chapter11/contract/SimpleAdder.sol` | `solc --bin --abi`で`Adder.bin`と`Adder.abi`を生成 |
| 第11章 ABI calldata | `references/chapter11/src/evm.zig` | `zig test src/evm.zig --test-filter "ABI calldata"` |
| 第11章 詳細エラー | `references/chapter11/src/evm.zig` | `zig test src/evm.zig --test-filter "EVM execution with error info"` |
| 第11章 デプロイブロック | `references/chapter11/src/blockchain.zig` | 読者の作業コピーで`zig build test --summary all` |
| 第12章 deploy/call CLI | `references/EVMchapter/src/main.zig` | 1ノードのデプロイとコール |
| 第12章 JSON変換 | `references/EVMchapter/src/parser.zig` | `zig test src/p2p.zig --test-filter JSON` |
| 第12章 EVM_TXと同期 | `references/EVMchapter/src/p2p.zig` | `zig test src/p2p.zig`と2ノード確認 |

macOS 26で単体の`zig test`がリンクエラーになる場合は、検証スクリプトを使います。

```bash
sh scripts/verify-book-code.sh references/chapter10
sh scripts/verify-book-code.sh references/chapter11
sh scripts/verify-book-code.sh references/EVMchapter
```

このスクリプトはDocker内で章末の全テストを実行します。

### 第11章と第12章の完全差分

第11章は第8章のP2Pコードと第10章のEVMコードを開始地点にし、`references/book-patches/chapter11.patch`を適用します。第12章は完成した第11章を開始地点にし、`references/book-patches/chapter12.patch`を適用します。各章の具体的な作業コピー作成コマンドは本文に掲載します。

patchを適用した後に合否を判定する対象は、`references/`の見本ではなく読者自身の`.zig-book-work/chapter11/`または`chapter12/`です。`zig fmt --check .`、`zig build test --summary all`、`zig build`をその作業コピー内で実行してください。第12章では、さらに同じ作業コピーを引数に渡し、1ノードと2ノードの受け入れ結果を確かめます。

リポジトリ側では、次のゲートが開始地点から両patchを適用し直し、再構築した内容が章スナップショットと一致することを検査します。

```bash
sh scripts/rebuild-book-code.sh
BOOK_REBUILD_ACCEPTANCE=1 sh scripts/rebuild-book-code.sh
```

前者は再構築、format、build、全テストを確認します。後者は第12章の実TCP受け入れ確認まで実行します。この保守用ゲートはpatchと見本のドリフトを検出するためのもので、読者の作業コピーをテストする章末ゲートの代わりではありません。

## 本に対応するコードと完成版コードの違い

用途の違う2種類のコードを混同しないことが重要です。

### `references/` は学習用スナップショット

`references/` には、章や節を読み終えた時点のコードがあります。まだ導入していない機能を見ずに実装できるため、本文どおりに手を動かすときはこちらを使います。

前の節との差を確認するには、たとえば次のように比較します。

```bash
git diff --no-index \
  references/chapter3/step1/src/main.zig \
  references/chapter3/step2/src/main.zig
```

`git diff --no-index` は差があると終了コード `1` を返します。これは比較に失敗したという意味ではありません。

### ルートの `src/` は進化する完成版

ルートの [`src/`](https://github.com/susumutomita/BlockChain/tree/main/src) は、ブロックチェイン、P2P、EVM、CLIを統合した完成版です。不具合修正や改善によって、本文執筆時より先へ進むことがあります。

完成後の設計を確認したいときはルートを参照し、本文の途中を再現したいときは `references/` を参照してください。ルートのコードを途中の節へそのままコピーすると、本文でまだ説明していない型や関数まで入る場合があります。

第13章と第14章は新しい機能を追加する章ではなく、完成コードをテストして受け入れる章です。そのため、EVM完成版またはルートを参照します。第15章のPoSはルートへ統合されていないため、ルートのコードを「第15章の完成例」とは扱いません。

## スナップショットを検証する

最初に作成したDockerイメージには、ルートと `references/` が含まれています。`-w` で対象スナップショットを選ぶと、同じZig 0.14.0環境でテストと実行ができます。

```bash
# 第3章ステップ2をテスト
docker run --rm \
  -w /app/references/chapter3/step2 \
  zig-blockchain-book zig build test

# 第3章ステップ2を実行
docker run --rm \
  -w /app/references/chapter3/step2 \
  zig-blockchain-book zig build run

# 第5章をテスト
docker run --rm \
  -w /app/references/chapter5 \
  zig-blockchain-book zig build test

# 第11章終了時点だけをテスト
docker run --rm \
  -w /app/references/chapter11 \
  zig-blockchain-book zig build test

# EVM完成版をテスト
docker run --rm \
  -w /app/references/EVMchapter \
  zig-blockchain-book zig build test
```

Dockerを使わず、対応するZig 0.14.0が利用できる環境では、対象ディレクトリへ移動して同じコマンドを実行できます。

```bash
cd references/chapter5
zig fmt --check .
zig build test
zig build run
```

ルートの基本検証は次の3つです。

```bash
cd "$(git rev-parse --show-toplevel)"
zig fmt --check .
zig build test
zig build
```

ノードを1つ起動する場合は、ルートで次を実行します。

```bash
zig build run -- --listen 9000
```

P2PやEVMの章では、複数のターミナル、`docker compose`、Solidityコンパイラの `solc` などが追加で必要です。その場合は各章に記載したコマンドを優先してください。

Composeの確認を終えたら、同じチェックポイントのディレクトリで必ず次を実行してから次章へ進みます。初期のスナップショットは学習しやすいように`node1`〜`node3`という固定コンテナ名を使うため、残したまま別のチェックポイントを起動すると名前が衝突します。

```bash
docker compose down --remove-orphans
```

## macOS 26ではDockerを使う

macOS 26系では、Zig 0.14.0が参照するlibSystemのスタブとの組み合わせにより、ネイティブの `zig build` や `zig test` がリンク時に失敗する場合があります。本書のコードが原因とは限らないため、macOS 26では前述のDocker手順を標準とします。

`Dockerfile`は、Dockerが渡す`TARGETARCH`に応じて`amd64`と`arm64`のZig配布物を選びます。Apple Siliconでもエミュレーションを強制せず、Zig 0.14.0のLinux環境で再現できます。

単一ファイルだけをネイティブで確認したい場合は、Apple SiliconのmacOSで次のようにデプロイメントターゲットを完全指定できます。

```bash
zig test src/blockchain.zig -target aarch64-macos.15.0.0
```

ただし、`zig build` はビルドランナー自体のリンクが必要です。章全体、複数ファイル、P2P、EVMの確認ではDockerを使用してください。

## 実行結果を読むときの注意

この実装は学習用です。実運用のブロックチェインやEthereumノードとの互換性を目的としていません。各章では理解する対象を明確にします。そのため、対応する仕様の一部だけを実装します。

実行結果は、次の順番で確認すると原因を切り分けやすくなります。

1. ビルドとテストが成功したか。
2. プロセスが指定したポートで待ち受けたか。
3. ブロックの `prev_hash` が直前のブロックの `hash` と一致したか。
4. PoWのハッシュが、その章で定義した難易度を満たしたか。
5. 不正なブロックや命令を、想定したエラーとして拒否したか。
6. P2Pでは、送信元だけでなく受信側のログにも反映されたか。
7. EVMでは、停止理由、戻り値、ストレージ更新が期待どおりか。

値が異なるときは、いきなり完成版へ置き換えず、直前のチェックポイントへ戻ります。6つの手順を1つずつ確認すれば、どの変更から期待結果とずれたかを特定できます。
