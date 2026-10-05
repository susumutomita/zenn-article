---
title: "競技を終了してAWSリソースを削除する"
free: true
---

クラウド競技は、得点を止めただけでは終わりません。問題stack、TenkaCloud、launcherを削除し、課金対象が残っていないことを確認して完了です。

画面に沿って作業する場合は、ランディングページの[TenkaCloudを片付ける](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0M0CLEANUPTENKA0001)を開きます。本章では、何をどの順番で削除するのかを説明します。

## 問題stackを削除する

最初に、各チームへデプロイした`hello-world`と`hello-world-battle`をApplication Admin Consoleから削除します。

削除状態が完了するまで確認します。

`hello-world`のSSM Parameter、`hello-world-battle`のVPC、EC2、IAM RoleはCloudFormationで作成しています。参加者が新しいtop-levelリソースを手作業で作らない設計なので、stack削除で片付けられます。

## TenkaCloudの基盤と競技データを削除する

デプロイに使ったCodeBuild projectを開きます。

`Start build with overrides`を選び、次を指定します。

```text
ACTION=destroy-all
```

`destroy-all`は、TenkaCloudの基盤stackと、そのstackが所有する保持データを削除します。S3 bucketの中身、DynamoDB table、logが対象です。Tursoを選んだ場合は、そのDBの競技データも削除します。このとき使うTursoのDBとSSM parameterは、配置済みのstackから読み取ります。新しいtokenは保存しません。

各チームの問題stackは、前の手順で削除が完了していることを確認してから実行します。

`ACTION=destroy`も、デフォルトではstackが所有するDynamoDB tableとそのデータを削除します。DynamoDB tableが残るのは、配置時にlauncherの`RetainDataTables`を`true`にした場合だけです。この設定はデプロイ時にtemplateへ書き込まれるため、削除の直前に変えても効きません。履歴を残すために`destroy`を選ぶ場合は、先に配置済みの設定を確認し、バックアップを取ります。`destroy`は、Tursoの競技データを削除しません。

古いlauncherを使っている場合は、`destroy-all`を実行する前に、そのlauncherのbuildspecが受け付ける`ACTION`と、削除するstackを確認します。現行のtemplateは`infrastructure/templates/cloud-pipeline.yaml`です。launcher stackは、名前を変えずにこのtemplateで更新します。古いbuildspecが受け付けない`ACTION`は渡さないでください。

## launcherを削除する

TenkaCloudの削除が成功したら、デプロイに使ったlauncher stackをCloudFormationから削除します。LPの手順どおりに作った場合、stack名は`tenkacloud-lite-launcher`です。

これにより、launcherが作成した次のリソースも削除されます。

- CodeBuild project
- CodeBuild用IAM Role
- launcher用log group

## 最後に残存を確認する

次のstackが残っていないことを確認します。

- 各チームの問題stack
- `tenkacloud-cloud`（既存環境では`tenkacloud-lite`）
- `tenkacloud-cloud-problem-deploy`（既存環境では`tenkacloud-lite-problem-deploy`）
- launcher stack（LPの手順では`tenkacloud-lite-launcher`）

さらに、EC2 instance、DynamoDB table、S3 bucket、logを確認します。Retain policyを持つS3 bucketは、`destroy-all`で中身が消えても、bucket自体は残ります。デプロイ用のsource bucketは、`destroy`と`destroy-all`のどちらを実行しても残ります。source bucketには、非公開Problem Packを含むsource archiveが入っている場合があります。

イベント専用のbucketは、所有者とバックアップを確認してから、全versionとdelete markerを含めて中身を消し、bucketを削除します。次のイベントのために残す場合は、保存期限と、費用を確認する担当者を記録します。

CDKToolkit、共有のasset、競技者bootstrapで作ったRoleは、TenkaCloudの削除対象に含まれません。他のstackやイベントが使っていないかを確認し、残すか削除するかを、それぞれの管理者と決めます。Tursoを選んだ場合は、そのDBに競技データが残っていないかも確認します。削除に失敗したものがあれば、CloudFormation eventとCodeBuild logを確認してから作業を終えます。

## 振り返りを残す

削除後に、参加者体験を振り返ります。

- 最初の一手は伝わったか
- どの場所で参加者が止まったか
- ヒントを開く順番は適切だったか
- 採点の変化から成功と失敗を理解できたか
- 障害の開始時刻と復旧時間は適切だったか
- 運営者が迷った画面や手順はどこか

点数だけを見ず、参加者が実際に取った行動と質問を記録します。次回は問題文、ヒント、構成図、運営手順へ反映します。

次章では、本書で作ったローカルChallenge、AWS Challenge、AWS Battleを土台に、自分の問題を作る方法を整理します。
