---
title: "競技を終了してAWSリソースを削除する"
free: true
---

クラウド競技は、得点を止めただけでは終わりません。問題stack、TenkaCloud Lite、launcherを削除し、課金対象が残っていないことを確認して完了です。

画面に沿って作業する場合は、ランディングページの[TenkaCloud Liteを片付ける](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0M0CLEANUPTENKA0001)を開きます。本章では、何をどの順番で削除するのかを説明します。

## 問題stackを削除する

最初に、各チームへデプロイした`hello-world`と`hello-world-battle`をApplication Admin Consoleから削除します。

削除状態が完了するまで確認します。

`hello-world`のSSM Parameter、`hello-world-battle`のVPC、EC2、IAM RoleはCloudFormationで作成しています。参加者が新しいtop-levelリソースを手作業で作らない設計なので、stack削除で片付けられます。

## TenkaCloud Liteを完全削除する

デプロイに使ったCodeBuild projectを開きます。

`Start build with overrides`を選び、次を指定します。

```text
ACTION=destroy-all
```

`destroy-all`は、Liteのstackだけでなく、保持されたDynamoDB tableと問題デプロイ用logも削除します。

履歴を意図的に残す場合だけ`ACTION=destroy`を使います。`destroy`では保持されたDynamoDB tableが残るため、再デプロイ前と費用確認時に注意が必要です。

古いlauncherを使っている場合は、`destroy-all`を実行する前に最新の`lite-pipeline.yaml`でlauncher stackを更新します。古いbuildspecへ未知の`ACTION`を渡しません。

## launcherを削除する

TenkaCloud Liteの削除が成功したら、CloudFormationから`tenkacloud-lite-launcher` stackを削除します。

これにより、launcherが作成した次のリソースも削除されます。

- CodeBuild project
- CodeBuild用IAM Role
- launcher用log group

## 最後に残存を確認する

次のstackが残っていないことを確認します。

- 各チームの問題stack
- `tenkacloud-lite`
- `tenkacloud-lite-problem-deploy`
- `tenkacloud-lite-launcher`

さらに、EC2 instanceとDynamoDB tableをAWS Consoleで確認します。削除失敗がある場合は、CloudFormation eventとCodeBuild logを確認してから終了します。

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
