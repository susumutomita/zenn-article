---
title: "Part 5｜作った競技を複数チームで動かす"
free: true
---

ここまでで、Cloud RescueのChallenge版とBattle版を問題ファイルとして作りました。しかし、問題ファイルをGitHubへ置くだけでは、複数チームは遊べません。

ここからはTenkaCloudをAWSへデプロイし、問題カタログを読み込ませます。その後、イベントとチームを登録して、各チームのAWSアカウントへCloud Rescueを配布します。競技が終わったら、問題環境とTenkaCloudを削除します。

この章ではTenkaCloud本体を用意します。次章でイベント、チーム、問題を設定します。

## デプロイ前にrefを固定する

本番直前に`main`の最新を使うと、リハーサル後の変更が混ざります。次をtagまたはcommit SHAで固定します。

- TenkaCloudの`RepoRef`
- 問題catalogの`ProblemsRepoRef`
- `RepoUrl`と`ProblemsRepoUrl`
- 開催region
- `TenantAdminEmail`
- control data backend
- DynamoDB capacity
- teardownの担当者

`ProblemsRepoRef`には、リハーサルで検証したTenkaCloudChallengeのcommit SHAを指定します。`main`や作業branchを指定すると、リハーサル後の更新まで本番へ入る可能性があります。

## Lite launcherを使う

TenkaCloud repositoryの`infrastructure/templates/lite-pipeline.yaml`を使います。

1. AWS ConsoleでCloudFormationのstack作成画面を開く
2. 開催regionを選ぶ
3. `lite-pipeline.yaml`をfile uploadする
4. stack名を`tenkacloud-lite-launcher`などにする
5. `TenantAdminEmail`を入力する
6. repository URLとrefを確認する
7. control data backendとcapacityを確認する
8. IAM resource作成をacknowledgeする
9. launcher stackを作成する

launcherは、TenkaCloud本体を直接作りません。CodeBuild projectと実行roleを作ります。

## build開始を明示する

CloudFormation Outputの`StartBuildConsoleUrl`からCodeBuild projectを開き、**Start build**を押します。

明示的な開始操作を残す理由は次です。

- AWS課金を始める時点を明確にする
- repository refを直前に確認する
- capacityを確認する
- launcher更新だけで本体を再デプロイしない
- operatorがイベント環境の起動を認識する

自動化できる操作でも、課金と公開の境界には確認を残します。

## launcherの主要parameter

現在のtemplateは、次のparameterを持ちます。

| parameter | 役割 |
| --- | --- |
| `Environment` | development、staging、productionを選ぶ |
| `Action` | deploy、destroy、destroy-allを選ぶ |
| `TenantAdminEmail` | 初期Tenant Adminの招待先 |
| `RepoUrl` / `RepoRef` | TenkaCloud本体の取得元 |
| `ProblemsRepoUrl` / `ProblemsRepoRef` | 問題catalogの取得元 |
| `DeployExternalId` | team accountへAssumeRoleする際の値 |
| `ControlDataBackend` | dynamodbまたはturso |
| `DynamoReadCapacity` | DynamoDBとGSIのread capacity |
| `DynamoWriteCapacity` | DynamoDBとGSIのwrite capacity |

`ControlDataBackend=turso`では、TenkaCloud用のDynamoDB tableを合成しません。TursoのURLとtokenを格納したSSM parameterが別途必要です。

`ControlDataBackend=dynamodb`では、capacityを小さくすると固定費を抑えられます。一方、実イベントではthrottlingを避けるため、参加team数と採点頻度からcapacityを見積もります。

## 独自catalogを指定する

TenkaCloud本体をforkせず、問題repositoryだけを差し替えられます。

```text
ProblemsRepoUrl=https://github.com/<your-account>/TenkaCloudChallenge.git
ProblemsRepoRef=<rehearsed-commit-sha>
```

開発中はbranchを指定できますが、本番では途中で内容が変わらないcommit SHAを使います。

社内限定問題をpublic Gitへ置けない場合は、Problem Packまたはprivateな配布経路を使います。秘密値をpublic metadataへ入れません。

## CodeBuildを監視する

build logで次を確認します。

- platform repositoryとref
- problem repositoryとref
- Bunのversion
- CDK synth
- CloudFormation deploy
- Application Admin ConsoleのURL
- Participant PortalのURL
- Tenant Admin招待

「build succeeded」だけで終わらず、両画面へ実際にアクセスします。

## 費用を分けて考える

費用は3種類に分けます。

1. launcherとCodeBuildの一時費用
2. TenkaCloud control planeの継続費用
3. team accountへ作る問題resourceの費用

control planeを低コストにしても、問題側がEC2、NAT Gateway、RDS、Load Balancerを作れば費用は増えます。問題数、team数、開催時間を掛けて見積もります。

最新の内訳は`docs/running-costs.md`とlauncher templateを確認します。固定額を本文だけで判断しません。

## build前チェック

```markdown
- [ ] RepoRefを固定した
- [ ] ProblemsRepoRefを固定した
- [ ] リハーサルと同じrefを使う
- [ ] 開催regionを確認した
- [ ] TenantAdminEmailを確認した
- [ ] ControlDataBackendを確認した
- [ ] DynamoDB capacityを確認した
- [ ] AWS Budgetと通知先を確認した
- [ ] 問題ごとの費用を確認した
- [ ] Action=destroy-allの手順を確認した
- [ ] 終了時刻と削除担当を決めた
```

## デプロイ後のsmoke test

本番参加者を登録する前に、operator用test teamで確認します。

1. Admin Consoleへログインする
2. Cloud Rescueがcatalogに表示される
3. test eventを作る
4. test teamのAWS accountを登録する
5. ChallengeとBattleをデプロイする
6. Participant Portalへ入る
7. AWS Console federationとSSM接続を確認する
8. endpoint登録と採点を確認する
9. 問題stackを削除する
10. `Action=destroy-all`でcontrol planeを撤去できることを確認する

実AWSでこのsmoke testを通してから、本番eventを作ります。

次章では、event、team、AWS account、問題を設定します。
