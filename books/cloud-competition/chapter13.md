---
title: "TenkaCloudをAWSへデプロイする"
free: true
---

問題が完成したら、TenkaCloudへ読み込ませます。

TenkaCloudの推奨運用は、常設SaaSとして無期限に置くことではなく、**イベント単位で環境を作り、開催し、削除する**形です。競技で使うcommitを固定し、リハーサルと本番で同じ構成を再現します。

## デプロイ前に固定するもの

本番直前に`main`の最新をそのまま使うと、リハーサル後の変更が混ざります。次をtagまたはcommit SHAで固定します。

- TenkaCloud本体のref
- TenkaCloudChallengeまたは自分の問題リポジトリのref
- 利用リージョン
- 管理者メールアドレス
- 容量と費用に関するparameter

公開問題へまだmergeしていない場合は、自分のforkを`ProblemsRepoUrl`として指定します。

## CloudFormation launcherを使う

TenkaCloudリポジトリの`infrastructure/templates/lite-pipeline.yaml`を取得します。

1. AWS ConsoleでCloudFormationのstack作成画面を開く
2. リージョンを`ap-northeast-1`など開催リージョンへ合わせる
3. `lite-pipeline.yaml`をアップロードする
4. stack名を`tenkacloud-lite-launcher`などにする
5. `TenantAdminEmail`へ管理者メールを設定する
6. 独自問題を使う場合はAdvanced parameterで問題リポジトリとrefを指定する
7. IAM resource作成へのacknowledgeを有効にする
8. launcher stackを作成する

CloudFormationの`TemplateURL`は、任意のGitHub raw URLをそのまま受け付けるとは限りません。セルフホストOSSとしてS3へ公式templateを常設配布していない場合は、file uploadを使うのが確実です。

## launcherと本体デプロイを分ける理由

launcher stackを作っただけでは、TenkaCloud本体のデプロイを自動開始しません。CloudFormation Outputの`StartBuildConsoleUrl`からCodeBuild projectを開き、**Start build**を明示的に押します。

この一手を残す理由は次です。

- AWS課金を伴う処理の開始点を明確にする
- `RepoRef`、`ProblemsRepoRef`、容量を直前に確認する
- launcherのstack updateで本体が意図せず再デプロイされるのを防ぐ
- イベント環境を起動する操作を運営者が認識する

自動化できる操作でも、課金や公開を始める境界では意図的な確認を残す価値があります。

## 問題リポジトリを指定する

TenkaCloud本体をforkせず、問題リポジトリだけを差し替えます。

指定する値の例です。

```text
ProblemsRepoUrl=https://github.com/<your-account>/TenkaCloudChallenge.git
ProblemsRepoRef=<rehearsed-tag-or-commit-sha>
```

これにより、プラットフォームは汎用のまま、Cloud Rescueを含む自分のカタログを読み込めます。

社内限定問題を公開Gitへ置けない場合は、後述するProblem Packまたは秘密情報を分離した配布経路を使います。

## buildを監視する

CodeBuildのログを開き、最後まで確認します。成功時には、TenkaCloudのApplication Admin ConsoleとParticipant PortalのURLが表示されます。

確認するポイントです。

- source repositoryとrefが意図した値か
- 問題リポジトリのcloneに成功したか
- CDK synthが成功したか
- CloudFormation deployが成功したか
- 管理画面と参加者画面のURLが出たか
- 初期管理者のログイン経路が使えるか

「build succeeded」だけで終わらず、実際に両方の画面へアクセスします。

## デプロイprofileと費用

TenkaCloudには、AWS-nativeなcontrol data構成と、Tursoを利用するzero-cost profileなどがあります。どのprofileを使うかは、イベントの要件で選びます。

- 企業内でAWSに閉じたい: AWS-native profile
- 個人検証で固定費を抑えたい: zero-cost profileを検討
- 実AWS問題を開催する: どのprofileでも各問題のAWS resource費用は別に発生

「プラットフォーム側が低コスト」であっても、問題がNAT Gateway、RDS、EC2、Load Balancerなどを作れば費用は発生します。問題数、チーム数、開催時間を掛けて見積もります。

## 本番用の確認表

build開始前に、次を確認します。

```markdown
- [ ] TenkaCloudのrefを固定した
- [ ] ProblemsRepoUrlとProblemsRepoRefを固定した
- [ ] リハーサルで同じrefを使った
- [ ] 開催リージョンを確認した
- [ ] 管理者メールを確認した
- [ ] AWS Budgetと通知先を確認した
- [ ] 問題ごとの費用を確認した
- [ ] destroy手順を運営者が確認した
- [ ] 本番終了時刻と削除担当を決めた
```

## デプロイ後のsmoke test

本番参加者を登録する前に、運営用test teamで確認します。

1. Admin Consoleへログインする
2. Cloud Rescueがカタログに表示される
3. test eventを作る
4. test teamのAWS accountを登録する
5. 問題stackをデプロイする
6. Participant Portalへ入る
7. AWS Console federationまたはCLI接続を確認する
8. endpoint登録と採点を確認する
9. 問題stackを削除する

ここまで通ってから本番eventを作ります。

次章では、イベント、チーム、AWSアカウント、問題を設定し、参加者が開始できる状態にします。
