---
title: "問題を動かす場所を区別する"
free: true
---

TenkaCloudは、特定のクラウドだけに固定しないマルチクラウド対応を想定した設計です。ただし、利用できる機能と検証状況はクラウドごとに異なります。

AWS以外では、次のクラウドをβ版としてサポートしています。

- [Microsoft Azure](https://azure.microsoft.com/ja-jp)
- [Google Cloud](https://cloud.google.com/?hl=ja)
- [さくらのクラウド](https://cloud.sakura.ad.jp/)

β版では、利用できるサービスと検証済みの操作がクラウドごとに異なります。本書では、クラウド上で動かす問題の題材をAWSに絞ります。

最初に、手元のDockerでローカル問題を作ります。その後、AWS上にデプロイする問題を作ります。

ここで区別したいのは、問題形式と実行場所です。

- ChallengeとBattleは、何をどのタイミングで採点するかを表す
- ローカルとクラウドは、参加者が操作する環境をどこへ作るかを表す

本書で最初に作る`sqli-demo`は、Dockerで動くローカルChallengeです。2問目の`hello-world`はAWS Challenge、3問目の`hello-world-battle`はAWS Battleです。

| 作る順番 | 問題 | 実行場所 | 問題形式 |
| --- | --- | --- | --- |
| 1 | `sqli-demo` | 手元のDocker | Challenge |
| 2 | `hello-world` | チーム用AWSアカウント | Challenge |
| 3 | `hello-world-battle` | チーム用AWSアカウント | Battle |

## ローカルモード

ローカルモードでは、TenkaCloudのParticipant Portal、採点API、問題環境を1台のPCで動かします。AWSアカウントとAWS認証情報は使いません。

主な用途は、一人で基礎知識を身につけるための反復練習です。イベントやチームを準備せずに問題を開けます。アプリケーションを調べ、答えを提出すると、採点結果を確認できます。

同じ問題を最初からやり直せるため、講義を読んだ後のドリルに向いています。苦手な操作の復習にも使えます。

本書で扱うローカルモードの操作対象は、Dockerコンテナ内で動くアプリケーションです。`local/docker-compose.yml`から、Webアプリケーションと採点用`/verify`を手元に起動します。

ローカルモードは、`template.yaml`をCloudFormationへ送信しません。クラウドへ実リソースをデプロイしないため、実際のIAM、VPC、EC2、クロスアカウント接続は練習できません。AWS上のリソースを調査、設定、復旧する問題は、チーム用AWSアカウントへデプロイするAWS問題として作ります。

### 無料で始められる

TenkaCloudと公開問題はOSSとして利用できます。ローカルモードではAWSリソースを作らないため、AWS利用料も発生しません。AWSアカウント、クレジットカード、チーム、イベントを準備せず、Dockerを動かせるPCから始められます。

### アプリケーションだけでも練習できることは多い

クラウド運用で判断が必要になる対象は、IAMやVPCだけではありません。アプリケーション層にも、次のような題材があります。

- 入力値の扱いとSQL Injection
- 認証と権限確認の不備
- 公開してはいけないファイルや設定
- APIから参照できるデータの範囲
- ログや画面に漏れた秘密情報
- サービスの状態確認と再起動

ローカル問題では、実際に動くアプリケーションを観察します。問題のある状態を見つけ、必要な操作を選び、採点で結果を確認できます。

この流れは、「観察する」「判断する」「操作する」「結果を確認する」の4段階です。クラウドへデプロイしなくても身につけられます。

問題環境は、TenkaCloudChallengeの`local/docker-compose.yml`から起動します。

```text
make local PROBLEM=<問題ID>
  → Participant Portalを起動
  → ローカル採点APIを起動
  → Docker Composeで問題環境を起動
  → 参加者の提出を問題コンテナの/verifyへ渡す
```

ローカル問題は、次のファイルを持ちます。

```text
challenges/<問題ID>/
├── metadata.json
├── README.md
├── README.ja.md
└── local/
    ├── Dockerfile
    ├── docker-compose.yml
    └── app/
```

`metadata.json`には、参加者へ見せる問題文、Docker Composeの入口、攻略対象のURL、採点を受け付ける`/verify`のURLを定義します。

ローカル問題では、問題文の確認からアプリケーションの操作、答えの提出までをAWSなしで試せます。最後に採点結果も確認できます。そのため、本書ではローカル問題を最初に作ります。

## 本書で使うAWS問題

TenkaCloud全体がAWS専用という意味ではありません。本書では、実装するChallengeとBattleのクラウド環境としてAWSを使います。

本書のAWS問題では、`template.yaml`からチーム用AWSアカウントへCloudFormation stackを作ります。参加者は、問題専用の一時的な権限でAWS ConsoleまたはCLIを使います。

```text
Application Admin Console
  → チームを選ぶ
  → 問題をチーム用AWSへデプロイ
  → Participant PortalからAWSへ移動
  → AWS環境を調査または復旧
  → 結果を採点
```

複数チームへAWS問題を配るときは、TenkaCloud Liteを運営者のAWSアカウントへデプロイします。TenkaCloud Liteは、Application Admin Console、Participant Portal、採点、問題デプロイの処理をAWS上で動かす構成です。

TenkaCloud LiteをAWSへ作る手順は、ランディングページの問題として公開しています。

[TenkaCloud Liteのデプロイ問題を開く](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0KZZ3DR0PW9M4Q7XV2C5D)

本書では、先に問題そのものを作ります。TenkaCloud Liteのデプロイと複数チームへの配布は、ローカルChallenge、AWS Challenge、AWS Battleが完成した後に扱います。

## 最初はローカルChallengeに集中する

ローカルChallengeを作っている間は、CloudFormation、IAM Role、継続採点、レッドチームを考えません。

最初に決めるのは、次の5点だけです。

1. 参加者に何を持ち帰ってほしいか
2. 参加者をどんな状況へ置くか
3. 最初に何を試してほしいか
4. 何をもって成功とするか
5. 問題環境をどう安全に終了するか

次章では、この5点から参加者に良い体験を届ける問題を考えます。
