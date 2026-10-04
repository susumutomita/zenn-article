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

## TenkaCloudを完全削除する

デプロイに使ったCodeBuild projectを開きます。

`Start build with overrides`を選び、次を指定します。

```text
ACTION=destroy-all
```

`make destroy`は基盤とデフォルトの所有データを削除し、外部Tursoの行は保持します。`make destroy-all`は対象を確認して保持データと選択したTursoの行も消去します。destroy-allは配置済みstackから検証したTursoのDBと既存SSM parameterを使い、新しいtoken保存は行いません。問題環境は先に大会のTeardownで撤収してください。source bucketなど別途残る課金対象も確認します。

`ACTION=destroy`でも、デフォルトではstackが所有するDynamoDB tableとデータを削除します。配置時に`RetainDataTables=true`を選んだ場合など、配置済みtemplateにRetain policyがあるときだけ保持されます。削除直前にlauncherの設定値を変えても配置済みpolicyは変わりません。履歴を残す目的でdestroyを選ぶ前に、配置済みpolicyとバックアップを確認します。通常のdestroyは外部Tursoの行を保持します。

古いlauncherを使っている場合は、`destroy-all`の実行前に対応するActionと配置先の互換性を確認します。現行templateは`infrastructure/templates/cloud-pipeline.yaml`です。既存の物理名を維持してlauncher stackを更新します。古いbuildspecへ未知の`ACTION`を渡しません。

## launcherを削除する

TenkaCloudの削除が成功したら、デプロイに使ったlauncher stackをCloudFormationから削除します。既存環境の`tenkacloud-lite-launcher`などの物理名は変更せず、実際に配置したstackを確認します。

これにより、launcherが作成した次のリソースも削除されます。

- CodeBuild project
- CodeBuild用IAM Role
- launcher用log group

## 最後に残存を確認する

以下は既存環境の物理名の例です。新規環境では`tenkacloud-cloud`系になるため、配置時のstack名と削除planを照合して残存を確認します。

- 各チームの問題stack
- `tenkacloud-lite`
- `tenkacloud-lite-problem-deploy`
- `tenkacloud-lite-launcher`

さらに、EC2 instance、DynamoDB table、S3の保持bucketとsource bucket、log、CDKToolkitと共有assetを確認します。destroy-allでもRetain policyのbucket本体や共有bootstrapは残ります。Tursoを選んだ場合は対象DBの行も確認します。削除失敗がある場合は、CloudFormation eventとCodeBuild logを確認してから終了します。

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
