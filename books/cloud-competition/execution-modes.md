---
title: "ローカル問題とAWS問題を区別する"
free: true
---

TenkaCloudChallengeの問題は、手元のDockerまたはAWSで動かせます。本書では、準備の少ないローカル問題から始め、その後にAWS問題へ進みます。

ここで区別したいのは、問題形式と実行場所です。

- ChallengeとBattleは、何をどのタイミングで採点するかを表す
- ローカルとAWSは、参加者が操作する環境をどこへ作るかを表す

本書で最初に作る`sqli-demo`は、Dockerで動くローカルChallengeです。2問目の`hello-world`はAWS Challenge、3問目の`hello-world-battle`はAWS Battleです。

| 作る順番 | 問題 | 実行場所 | 問題形式 |
| --- | --- | --- | --- |
| 1 | `sqli-demo` | 手元のDocker | Challenge |
| 2 | `hello-world` | チーム用AWSアカウント | Challenge |
| 3 | `hello-world-battle` | チーム用AWSアカウント | Battle |

## ローカルモード

ローカルモードでは、TenkaCloudのParticipant Portal、採点API、問題環境を1台のPCで動かします。AWSアカウントとAWS認証情報は使いません。

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

ローカル問題では、問題文の確認から環境の操作、答えの提出までをAWSなしで試せます。最後に採点結果も確認できます。そのため、本書ではローカル問題を最初に作ります。

## AWS問題

AWS問題では、`template.yaml`からチーム用AWSアカウントへCloudFormation stackを作ります。参加者は、問題専用の一時的な権限でAWS ConsoleまたはCLIを使います。

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
