---

title: "Envioでブロックチェインデータをインデックス化してみた"
emoji: "😸"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Envio,Web3]
published: true
---

[Envio](https://envio.dev/)のチュートリアルを実践してみた経験を共有します。

## [Envio](https://envio.dev/)とは

Envioは、ブロックチェイン上のデータをインデックス化して効率的に検索・アクセス可能にするサービスです。ブロックチェインのデータは公開されていますが、時系列に記録されず、検索しにくい状態で存在します。インデックス化サービスを利用することで、特定のキーワードやパラメータに基づいたデータアクセスが容易になります。[インデックスサービスの概念については、この記事で](https://gaiax-blockchain.com/the-graph)説明されていますが、要するにブロックチェインの目次を作成してくれるサービスです。ブロックチェインのデータは公開されていますが、時系列で記録されておらず、インデックス化されていません。そのため、特定のキーワードやパラメータに基づいてデータを取得するのが困難です。インデックス化サービスを利用することで、データアクセスが格段に容易になります。

なお、[Envio](https://envio.dev/)は、[Ponder](https://ponder.sh/)や[theGraph](https://thegraph.com/)と比べて高速であるとされています。

![Envioのスクリーンショット](https://github.com/susumutomita/zenn-article/assets/11481781/baf215ed-8f94-4778-a302-a1c75856977f)

## チュートリアルを実践してみた

Envioの公式ドキュメント[Getting Started](https://docs.envio.dev/docs/getting-started)に沿って、Envioの基本的な使い方を試してみました。以下はそのステップごとの紹介です。

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

![images/getting-started-envio/enviostart.png](https://github.com/susumutomita/zenn-article/assets/11481781/89bcdc2b-92c9-4a8e-9472-d408d0c151d2)

#### インデックス化された結果の表示

ローカルの[Hasuraサーバー](https://hasura.io/learn/ja/graphql/intro-graphql/graphql-server/)(GraphQL APIを提供するオープンソースのエンジンです)で結果を表示します。

```shell
open http://localhost:8080
```

次のような画面が出てきます。
![images/getting-started-envio/enviostart.png](https://github.com/susumutomita/zenn-article/assets/11481781/e1723209-fd19-4478-96ec-4c36d3c56cc1)

>The hasura admin-secret / password is testing and the tables can be viewed in the data tab or queried from the playground

と[ドキュメント](https://docs.envio.dev/docs/greeter-tutorial)に記載があるのでadmin-secretに`testing`と入力すると管理画面が開きます。

![images/getting-started-envio/adminimage.png](https://github.com/susumutomita/zenn-article/assets/11481781/502bc7fd-ca3e-4ae0-9133-a474e89cf37b)

GraphQLに次のようなクエリを入力して実行ボタンをクリックすると結果を取得できます。

![images/getting-started-envio/query.png](https://github.com/susumutomita/zenn-article/assets/11481781/30f4b01c-e746-4ae2-98f3-eebe8d6411d9
)

```shell
query MyQuery {
  User {
    greetings
  }
}
```

```shll
{
  "data": {
    "User": [
      {
        "greetings": [
          "gm EthGlobal Paris",
          "gm EthGlobal Paris"
        ]
      },
      {
        "greetings": [
          "hello sers",
          "gm!",
          "hello fam!"
        ]
      },
      {
        "greetings": [
          "gm",
          "gm",
          "gm (https://polygonscan.com/address/0x9D02A17dE4E68545d3a58D3a20BbBE0399E05c9c#writeContract#F2)",
          "hello world"
        ]
      },
      {
        "greetings": [
          "Hello"
        ]
      },
      {
        "greetings": [
          "Greetings from ct1aic.eth",
          "Thanks for the NFT #0"
        ]
      },
      {
        "greetings": [
          "GG"
        ]
      },
      {
        "greetings": [
          " "
        ]
      },
      {
        "greetings": [
          "Welcome to envio"
        ]
      },
      {
        "greetings": [
          "\"hello\""
        ]
      },
      {
        "greetings": [
          "Testing Envio!Envio is a real-time indexer built specifically for EVM-compatible blockchains, providing developers with a seamless and efficient indexing solution. Designed to optimize the user experience, Envio offers automatic code generation and flexible language support. Indexers on Envio can be written in JavaScript, TypeScript or ReScript.",
          "Testing Envio!Envio is a real-time indexer built specifically for EVM-compatible blockchains providing developers with a seamless and efficient indexing solution. Designed to optimize the user experience Envio offers automatic code generation and flexible language support. Indexers on Envio can be written in JavaScript TypeScript or ReScript."
        ]
      },
      {
        "greetings": [
          "Roadiooooh",
          "Rick Stack",
          "Tee House",
          "Ada Lovelace",
          "Readings Baye"
        ]
      },
      {
        "greetings": [
          "This is a greeting from Noah."
        ]
      },
      {
        "greetings": [
          "gm brymes"
        ]
      },
      {
        "greetings": [
          "Hello Envio",
          "Gm, 1234"
        ]
      },
      {
        "greetings": [
          "gm",
          "gn",
          "gm paris",
          "gm Linea",
          "assah dude",
          "envio actions 👀",
          "envio actions 👀, whats that 🤔",
          "Hello notifications",
          "envio actions are going to be a game changer",
          "its all hosted for testing"
        ]
      },
      {
        "greetings": [
          "gm!",
          "gm ser",
          "envio is super faaaast"
        ]
      },
      {
        "greetings": [
          "ottie"
        ]
      }
    ]
  }
}
```

## ホスティングしてみる

Envioの[Deploy the indexer onto the hosted service](https://docs.envio.dev/docs/greeter-tutorial#deploy-the-indexer-onto-the-hosted-service)に従い、デプロイプロセスを経てインデクサーをホスティングサービスにデプロイしました。GitHubアカウントでログイン後、インデクサーを追加するためのUIが提供されており、簡単にデプロイが完了します。デプロイ後は、エンドポイントにクエリを送信して、実際の動作を確認できます。

まず[Deploy the indexer onto the hosted service](https://docs.envio.dev/docs/greeter-tutorial#deploy-the-indexer-onto-the-hosted-service)の説明にしたがい[hosted service](https://envio.dev/app/login)の画面を開きます。

![images/getting-started-envio/hosting.png](https://github.com/susumutomita/zenn-article/assets/11481781/9026aa6d-ac43-4178-8920-ed14a203de15)

GitHubアカウントを使ってログインすると次の画面が出てきます。`Add new indexer +`をクリックします。
![images/getting-started-envio/login.png](https://github.com/susumutomita/zenn-article/assets/11481781/96828575-6510-493f-af9c-ec7adb1eab19)

どのリポジトリを使用するのか選択できるのでenvioのチュートリアルで使っているリポジトリを選択します。
その後パラメータを指定する画面が出てくるので、適宜入力します。今回はGit release branchだけmainにしました。
![images/getting-started-envio/connect.png](https://github.com/susumutomita/zenn-article/assets/11481781/0479779a-cd0c-407b-b79c-28e1d5bb0c99)

指示にしたがいmainブランチへコードをプッシュするとデプロイが始まります。

![images/getting-started-envio/deploy.png](https://github.com/susumutomita/zenn-article/assets/11481781/f7ec7493-c3f0-44d0-96ac-fc5e8aa83670)

`Open`をクリックするとステータスが出てきます。インデクサーのデプロイが完了するまで待ちます。
![images/getting-started-envio/deploywait.png](https://github.com/susumutomita/zenn-article/assets/11481781/96c727f8-1980-4858-9f25-fb64128b0584)

Deployが終わるとクエリを送信するエンドポイントの情報がでてきます。
![images/getting-started-envio/deployend.png](https://github.com/susumutomita/zenn-article/assets/11481781/9e77ae4d-a020-4a86-81cb-288c981896b9)

実際にクエリを送信してみると結果が返ってきます。
![images/getting-started-envio/query.png](https://github.com/susumutomita/zenn-article/assets/11481781/597b03da-1fb3-4760-81d5-5a3bceebcd0d)

### クエリをコードから送信

コードからもクエリを送信してみると結果が返ってきます。

```sample.py
import requests
import json

# GraphQLエンドポイントURL適切に置き換える
url = "https://indexer.bigdevenergy.link/XXXXX/v1/graphql"

# 送信するGraphQLクエリ
query = """
query MyQuery {
  User {
    greetings
  }
}
"""

# GraphQLエンドポイントに対するリクエストヘッダー
headers = {
    "Content-Type": "application/json",
}

# リクエストデータ
data = {"query": query}

# POSTリクエストを送信してレスポンスを取得
response = requests.post(url, json=data, headers=headers)

# レスポンスデータを整形して表示
# json.dumps()の第二引数にindentを指定することで整形できる
# sort_keys=Trueはキーをアルファベット順にソートするオプション
formatted_response = json.dumps(response.json(), indent=4, sort_keys=True)
print(formatted_response)

```

### 実行結果

```shell
❯ python3 sample.py
{
    "data": {
        "User": [
            {
                "greetings": [
                    "gm EthGlobal Paris",
                    "gm EthGlobal Paris"
                ]
            },
            {
                "greetings": [
                    "hello sers",
                    "gm!",
                    "hello fam!"
                ]
            },
            {
                "greetings": [
                    "gm",
                    "gm",
                    "gm (https://polygonscan.com/address/0x9D02A17dE4E68545d3a58D3a20BbBE0399E05c9c#writeContract#F2)",
                    "hello world"
                ]
            },
            {
                "greetings": [
                    "Hello"
                ]
            },
            {
                "greetings": [
                    "Greetings from ct1aic.eth",
                    "Thanks for the NFT #0"
                ]
            },
            {
                "greetings": [
                    "GG"
                ]
            },
            {
                "greetings": [
                    " "
                ]
            },
            {
                "greetings": [
                    "Welcome to envio"
                ]
            },
            {
                "greetings": [
                    "\"hello\""
                ]
            },
            {
                "greetings": [
                    "Testing Envio!Envio is a real-time indexer built specifically for EVM-compatible blockchains, providing developers with a seamless and efficient indexing solution. Designed to optimize the user experience, Envio offers automatic code generation and flexible language support. Indexers on Envio can be written in JavaScript, TypeScript or ReScript.",
                    "Testing Envio!Envio is a real-time indexer built specifically for EVM-compatible blockchains providing developers with a seamless and efficient indexing solution. Designed to optimize the user experience Envio offers automatic code generation and flexible language support. Indexers on Envio can be written in JavaScript TypeScript or ReScript."
                ]
            },
            {
                "greetings": [
                    "Roadiooooh",
                    "Rick Stack",
                    "Tee House",
                    "Ada Lovelace",
                    "Readings Baye"
                ]
            },
            {
                "greetings": [
                    "This is a greeting from Noah."
                ]
            },
            {
                "greetings": [
                    "gm brymes"
                ]
            },
            {
                "greetings": [
                    "Hello Envio",
                    "Gm, 1234"
                ]
            },
            {
                "greetings": [
                    "gm",
                    "gn",
                    "gm paris",
                    "gm Linea",
                    "assah dude",
                    "envio actions \ud83d\udc40",
                    "envio actions \ud83d\udc40, whats that \ud83e\udd14",
                    "Hello notifications",
                    "envio actions are going to be a game changer",
                    "its all hosted for testing"
                ]
            },
            {
                "greetings": [
                    "gm!",
                    "gm ser",
                    "envio is super faaaast"
                ]
            },
            {
                "greetings": [
                    "ottie"
                ]
            }
        ]
    }
}
```

## 最後に

Envioを使用してみた経験を通じて、ブロックチェインデータのインデックス化が簡単に行えることを理解しました。これは開発者にとって大きなメリットをもたらします。今後もEnvioを使い続け、さらに深い機能を探求していきたいです。Envioに興味のある方は、是非このチュートリアルを試してみてください。
