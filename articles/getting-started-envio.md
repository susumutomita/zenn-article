---

title: "Envioを触ってみた"
emoji: "😸"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Envio]
published: false
---

## この記事は

[Envio](https://envio.dev/)のチュートリアルを実践してみた経験を共有します。

## [Envio](https://envio.dev/)とは

ブロックチェイン上のデータをインデックス化するサービスで、大量のデータを効率的に検索・アクセスできます。[インデックスサービスの概念については、この記事で](https://gaiax-blockchain.com/the-graph)説明されていますが、要するにブロックチェインの目次を作成してくれるサービスです。ブロックチェインのデータは公開されていますが、時系列で記録されておらず、インデックス化されていません。そのため、特定のキーワードやパラメータに基づいてデータを取得するのが困難です。インデックス化サービスを利用することで、データアクセスが格段に容易になります。

[Envio](https://envio.dev/)は、[Ponder](https://ponder.sh/)や[theGraph](https://thegraph.com/)と比べて高速であるとされています。

![Envioのスクリーンショット](https://github.com/susumutomita/zenn-article/assets/11481781/baf215ed-8f94-4778-a302-a1c75856977f)

## チュートリアルを実践してみた

以下は、[Getting Started](https://docs.envio.dev/docs/getting-started)の指示に沿って行ったステップです。

### インストール

```shell
npm i -g envio
```

### インストール確認

```shell
envio --help
```

### 初期化

```shell
envio init
```

ここでは、既存のスマートコントラクトを取り込むか、ERC20またはGreeterのテンプレートから選択します。

### ERC20とは

ERC20は、イーサリアムブロックチェイン上でトークンを作成・発行するための標準規約です。トークンの転送、残高の取得、供給量の確認などの機能を標準化し、トークン間の相互運用性を保証します。ERC20トークンは、仮想通貨や資産の代表、投票権など、多岐にわたる用途で利用されています。

### Greeterとは

Greeterは、ブロックチェイン上で動作する単純なスマートコントラクトの例です。「Hello, World」というメッセージを出力することで、スマートコントラクトの基本やブロックチェインプログラミングの入門として機能します。

今回はGreeterを選択してみます。名前の設定、プロジェクトのディレクトリ選択、イベントハンドラーの言語を選択します。

#### インデクサーの起動

```shell
envio dev
```

Dockerが起動し、インデックス化されたデータ用のデータベースを作成します。`config.yaml`ファイルで指定された契約からインデックスを開始します。

#### インデックス化された結果の表示

ローカルの[Hasuraサーバー](https://hasura.io/learn/ja/graphql/intro-graphql/graphql-server/)(GraphQL APIを提供するオープンソースのエンジンです)で結果を表示します。

```shell
open http://localhost:8080
```

次のような画面が出てきます。
![images/getting-started-envio/enviostart.png](https://github.com/susumutomita/zenn-article/assets/11481781/e1723209-fd19-4478-96ec-4c36d3c56cc1)
