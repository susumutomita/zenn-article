---
title: "TenkaCloudでAWS競技を開く"
free: true
---

ここからは、作成したAWS問題を参加者へ届ける運営側の作業です。`hello-world`と`hello-world-battle`をチームへ配り、採点するため、TenkaCloudをAWSへデプロイします。

## クラウド開催とは

TenkaCloudには、ローカル開催とクラウド開催の2つの開催方式があります。ローカル開催は、1台のPCで1つのBunプロセスと永続SQLiteを使います。クラウド開催は、自分のAWSアカウントにLambdaとCognitoで動く基盤を作り、データの保存先をTursoかDynamoDBから選びます。どちらの方式でも、主催者と参加者の画面、チーム管理、採点、問題の配置を使えます。

AWSのサービスを使う問題はクラウド開催で、Docker/Compose問題はローカル開催で動かします。組み込みのCryptography Battleは、どちらの方式でも使えます。

LPの手順で新しく作ると、基盤のstackは`tenkacloud-cloud`と`tenkacloud-cloud-problem-deploy`になります。以前のTenkaCloud Liteで作った環境は、`tenkacloud-lite`と`tenkacloud-lite-problem-deploy`の名前のまま更新します。既存環境があるAWSアカウントに、`tenkacloud-cloud`という名前の別のstackを追加しないでください。

データの保存先は、launcherのparameter`ControlDataBackend`で選びます。デフォルトは`dynamodb`です。`turso`を選ぶ場合は、先にTursoのtokenをSSM parameterへ保存しておきます。`TursoDatabaseUrl`にはDBのURLを、`TursoAuthTokenParameterName`にはそのSSM parameterの名前を指定します。以前のクラウド構成のデータは、新しい構成へ自動では移行されません。

クラウド開催は、TenkaCloud側でまだ統合検証中の候補版です。実際のAWSでのイベント全体のリハーサルと、Battleへの同時アクセスの性能は、検証が残っています。開催前に、本書の問題を使って、参加者のアクセス、採点、撤収までを自分のAWSアカウントでリハーサルしてください。チーム数や配置できるtemplateの制限は、[現行の互換性ガイド](https://github.com/susumutomita/TenkaCloud/blob/main/docs/book-compatibility.md)で確認します。

## デプロイ前に費用と終了方法を確認する

TenkaCloudはOSSですが、実行場所は実際のAWSです。ソフトウェアの利用料とは別に、AWSリソースの利用料が発生します。

競技を開くときは、次の3つを分けて考えます。

| 費用の対象 | 何を動かすか | 費用が増える要因 |
| --- | --- | --- |
| TenkaCloud | 管理画面、参加者画面、認証、採点、データ保存 | 運用期間、アクセス数、保存するデータとlog |
| 問題環境 | 各チームへ配るCloudFormation stack | チーム数、問題数、EC2などの利用時間 |
| デプロイ処理 | launcherが起動するCodeBuild | デプロイと削除の実行時間 |

具体的な金額は、リージョン、問題で使うAWSサービス、チーム数、開催時間によって変わります。開催中はAWS Billingで利用額を確認し、使わない期間は環境を残さない運用にします。

終了時は、次の順番で削除します。

1. 各チームへデプロイした問題stackを削除する
2. CodeBuildで`ACTION=destroy-all`を実行し、TenkaCloud本体と保持データを削除する
3. 削除が完了したことを確認してからlauncher stackを削除する
4. CloudFormation、EC2、DynamoDB、S3、logと、Tursoを選んだ場合はそのDBを確認し、残存リソースがないことを確かめる

launcherは、TenkaCloudを削除する入口です。`destroy-all`が成功する前にlauncherを削除すると、削除をやり直す手順が増えます。

画面に沿って片付ける手順は、ランディングページの[TenkaCloudを片付ける](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0M0CLEANUPTENKA0001)で確認できます。本書でも、競技終了後の章で削除と残存確認を実施します。

## LPのデプロイ問題から始める

TenkaCloudのランディングページには、AWS上へTenkaCloudをデプロイする手順を問題形式で用意しています。

[「自分のTenkaCloudを立てる」を開く](https://www.tenkacloud.com/portal-demo/?demo=1&goto=%2Fproblems%2F01HZX0KZZ3DR0PW9M4Q7XV2C5D)

この問題は、自分のAWSアカウントへTenkaCloudを作るための案内です。前章で作ったDocker問題を動かすローカルモードとは別の入口です。

問題は、次の4段階で構成されています。

1. デプロイ用のCloudFormation launcherを作る
2. CodeBuildからTenkaCloudをデプロイする
3. 競技者用AWSアカウントを接続する
4. 最初のイベントを作る

本章では、作成されるものと操作の意味を説明します。画面上の最新手順と入力値は、LPから開くデプロイ問題を確認してください。

## launcherとTenkaCloudを分けて考える

launcher stackは、`infrastructure/templates/cloud-pipeline.yaml`から作ります。LPの手順では、stack名を`tenkacloud-lite-launcher`にします。名前に「lite」が残っていますが、作られるのはクラウド開催の環境です。

launcherはTenkaCloud本体ではありません。TenkaCloudのソースと問題カタログを取得し、デプロイを実行するCodeBuild projectを作ります。

```mermaid
flowchart LR
    Template["cloud-pipeline.yaml"]
    Launcher["tenkacloud-lite-launcher"]
    Build["CodeBuild"]
    Platform["tenkacloud-cloud"]
    Problem["tenkacloud-cloud-problem-deploy"]

    Template --> Launcher
    Launcher --> Build
    Build --> Platform
    Build --> Problem
```

launcher stackの`StartBuildConsoleUrl`からCodeBuildを開き、`Start build`を実行します。CodeBuildが`tenkacloud-cloud`と`tenkacloud-cloud-problem-deploy`の2つのstackを作ります。

この手動操作によって、課金の発生するデプロイを明示的に開始します。launcherの作成だけでTenkaCloud本体が起動することはありません。

## 独自の問題カタログを指定する

公式のTenkaCloudChallengeを使う場合、デフォルト値のままで構いません。

自分のforkや独自branchにある問題を使う場合は、launcherの`ProblemsRepoUrl`と`ProblemsRepoRef`を設定します。

| Parameter | 内容 |
| --- | --- |
| `ProblemsRepoUrl` | 問題カタログのGit URL |
| `ProblemsRepoRef` | branch、tag、またはcommit SHA |

リハーサル中はbranchを指定できます。本番イベントでは、確認済みのtagまたはcommit SHAへ固定します。開催中に参照先が変わると、チームごとに異なる問題内容を取得する可能性があります。

本書で作った2問は公式カタログに存在するため、独自URLを設定しなくても利用できます。

## デプロイ完了を確認する

CodeBuildの最後に、Application Admin ConsoleとParticipant PortalのURLが表示されます。同じURLは、次のCloudFormation stackのOutputでも確認できます。既存環境では、`tenkacloud-lite`と`tenkacloud-lite-problem-deploy`です。

- `tenkacloud-cloud`
- `tenkacloud-cloud-problem-deploy`

`TenantAdminEmail`へ届いた案内を使い、Application Admin Consoleへサインインします。

次章では、チームのAWSアカウントを接続し、2問をイベントへ登録します。
