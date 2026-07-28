---
title: "付録C クラウド競技の用語集"
free: true
---

本書で使う用語を、クラウド競技を作る人の視点で整理します。一般的な定義だけではなく、TenkaCloudで何に使うかも併記します。

## 競技と学習設計

### GameDay

障害や予期しない状況を再現し、システムとチームの対応力を確認する実践型の演習です。本書ではAWS公式の固有イベント名を指すのではなく、同種のクラウド運用演習を表す一般的な言葉として使います。

### クラウド競技

参加者ごとに用意したクラウド環境で、調査、修正、復旧、維持などを行い、その結果を得点へ変える演習です。本書全体の中心概念です。

### Challenge

自分のペースで解く問題形式です。TenkaCloudでは、flagや回答を提出して得点する問題が代表例です。個人学習やオンボーディングに向きます。

### Battle

複数チームが同時に参加する問題形式です。サービスの正常性を継続的に確認し、正常な時間を得点に変えられます。障害注入を組み合わせると、復旧と維持を競えます。

### CTF

Capture The Flagの略です。問題を解いてflagを取得し、得点を競います。クラウド競技では、設定ミスやログからflagを発見する形式として利用できます。

### ハンズオン

説明された手順を実行し、技術の操作方法を学ぶ形式です。クラウド競技では手順を全て示さず、参加者自身に観察と判断を行わせます。

### 学習目標

競技終了後に、参加者が自力でできるようになってほしい行動です。「AWSを理解する」ではなく、「HTTP障害から対象サービスを特定し、復旧できる」のように観察可能な形で書きます。

### 評価基準

学習目標を達成したか判断する条件です。HTTP status、flag、metricなどの機械判定と、振り返りで確認する思考過程を分けます。

### 初見者テスト

問題の内部実装を知らない人に解いてもらう試験です。作者には見えない導線の欠落、説明不足、想定外解法を発見します。

### 完走率

参加者のうち、制限時間内にゴールへ到達できた割合です。難易度、ヒント、想定時間の改善に使います。

### 正規解法

問題作者が主に想定した解法です。正規解法だけを唯一の正解にせず、学習目標を満たす正当な別解も評価します。

### 想定外解法

作者が事前に考えていなかった方法です。採点の迂回や安全境界の破壊なら修正します。異なるが正当な復旧方法なら、別解として認めます。

### 競技外の詰まり

ログイン、環境構築、対象画面への移動など、学習目標と関係のない場所で進めなくなる状態です。運営の支援やオンボーディングで減らします。

## 問題と採点

### flag

Challengeで提出する答えです。`TC{...}`のような形式を使えます。固定値にせず、デプロイごとに変わり、実際の操作をしないと取得できない値にします。

### discovered flag

問題環境を観察または操作して初めて得られるflagです。公開情報から推測できるflagや、Gitに書かれた固定flagは該当しません。

### canonical answer

採点側が正答判定に使う基準値です。TenkaCloudのflag採点では、CloudFormation Outputを通じて採点側へ渡せます。参加者へ直接見せない権限設計が必要です。

### endpoint

採点対象となる接続先です。Web URL、API URLなどを指します。TenkaCloudではslotとして宣言し、チームごとの実URLを登録できます。

### slot

問題側とParticipant Portal、採点側を接続する論理名です。`frontend`や`api`のような名前を付けます。

### probe

endpointへHTTP requestなどを送り、正常性を確認する処理です。TenkaCloudのBattleでは、一定間隔でprobeを実行して得点を更新します。

### polling

一定間隔で状態を確認することです。1回の成功だけでなく、正常状態を維持している時間を採点できます。

### health check

サービスが利用可能か確認する検査です。HTTP statusだけではなく、response bodyや内部依存先まで含める場合があります。

### `flag`

TenkaCloudの採点kindの一つです。参加者の提出値とcanonical answerを比較します。

### `uptime-flat`

複数endpointを個別に採点するkindです。frontendだけ復旧した場合にも、部分的な成功を点数へ反映できます。

### `uptime-multi`

複数endpointが全て正常なときだけ得点するkindです。システム全体が揃わないと利用者価値が生まれない問題に向きます。

### `phased-polling`

時間経過によって採点条件を切り替えるkindです。前半と後半で必要な正常条件を変え、段階的に難しくできます。

### `attack-detection`

攻撃や不正操作の検知数などを採点するkindです。単に攻撃を防ぐだけではなく、検知と対応を学習目標にできます。

### 部分点

全ての正常条件を満たしていなくても、達成した条件に応じて与える得点です。初学者へ進捗の手応えを返せます。

### failure penalty

正常性を失ったときの減点です。強すぎると参加者が途中で諦めるため、競技時間と復旧時間から調整します。

### hint penalty

ヒントを開いたときの減点です。罰ではなく、自力で進むか学習を優先するかを選ぶ仕組みとして使います。

### 理論最大点

全ての採点周期で完全に正常だった場合の得点です。polling周期、endpoint数、競技時間から計算し、逆転可能性を設計します。

## 障害注入

### disruption

競技中に運営側から発生させる障害や状態変更です。サービス停止、設定削除、データ改変などを安全な範囲で実行します。

### fault injection

意図的に障害を起こすことです。障害の対象、症状、復旧方法、安全網を事前に設計します。

### trigger

disruptionを開始する条件です。手動実行、デプロイ後、一定得点到達、フェーズ移行などがあります。

### revert

disruptionによる変更を元へ戻す処理です。参加者が復旧できない場合でも競技が永続的に詰まらないための安全網です。

### 冪等性

同じ操作を複数回実行しても、結果が壊れたり重複したりしない性質です。disruptionとrevertでは特に重要です。

### レッドチーム

障害や攻撃を発生させる側です。TenkaCloudでは運営者がdisruptionを実行する役割として扱えます。

### 防御側

障害を観察し、原因を特定して復旧する参加者です。単にサービスを再起動するだけでなく、監視と再発対応まで含みます。

### フェーズ

競技を時間または到達状態で区切った段階です。各フェーズで採点条件や障害の種類を変えられます。

## TenkaCloudの構成

### TenkaCloud

イベント、チーム、問題デプロイ、Participant Portal、採点、ヒント、障害注入を提供するOSSプラットフォームです。

### TenkaCloudChallenge

TenkaCloudで利用する公開問題のカタログです。問題ごとに独立したディレクトリを持ちます。

### 問題プラグイン

問題をプラットフォーム本体へ埋め込まず、metadataとCloudFormationなどの資産で追加する設計です。新しい問題の追加によってTenkaCloud本体を変更しないことを目指します。

### `metadata.json`

問題の表示、学習目標、採点、endpoint、ヒント、disruption、Portal slotなどを宣言するファイルです。

### `template.yaml`

チームのAWS accountへデプロイするCloudFormation templateです。競技開始状態と参加者用roleもここで作ります。

### `SCHEMA.json`

`metadata.json`の許可された構造を定義するJSON Schemaです。本文の例より、利用時点のこのファイルを正とします。

### `portal/`

問題固有のParticipant Portal componentを置く任意ディレクトリです。汎用UIで足りる問題には追加しません。

### `services/`

問題固有のLambda、container、補助scriptなどを置く任意ディレクトリです。

### Problem Pack

公開カタログへmergeせず、特定tenantで利用する問題bundleです。社内限定問題、顧客固有問題、公開前の試験運用に向きます。

### Lite mode

単一tenant、単一イベント向けのTenkaCloud構成です。小規模な社内イベントや個人検証に向きます。

### SaaS mode

複数tenantを扱うTenkaCloud構成です。常設運用や複数組織での利用を想定します。

### Always-On mode

イベントがない期間のAWS側常時稼働を抑え、イベント期間だけruntimeを起動する構成です。

### launcher stack

TenkaCloudをデプロイまたは削除するCodeBuild projectを作るCloudFormation stackです。launcher自体はTenkaCloud本体ではなく、起動口です。

### `destroy`

TenkaCloud stackを削除する操作です。一部の履歴を保持する運用で使う場合があります。

### `destroy-all`

保持対象を含めてイベント環境を完全撤去する操作です。利用するlauncherが対応したversionであることを確認します。

## AWSと権限

### AWS account

AWS resourceと権限、請求の境界です。TenkaCloudではチームごとに専用accountを用意すると、影響範囲を分離しやすくなります。

### operator account

TenkaCloud本体を動かすAWS accountです。競技チームのaccountへroleをAssumeRoleし、問題stackをデプロイします。

### competitor account

参加チームの問題stackを配置するAWS accountです。事前にbootstrap roleを作ります。

### AssumeRole

あるAWS identityが、別のIAM roleの一時権限を取得する仕組みです。TenkaCloudからcompetitor accountへのデプロイや、参加者のConsole federationに利用します。

### ExternalId

別accountのroleをAssumeRoleするときに追加で照合する値です。Confused Deputy問題への対策として利用します。Git、問題文、公開ログへ出しません。

### trust policy

誰がIAM roleをAssumeRoleできるかを定義するpolicyです。PrincipalだけでなくExternalId条件も確認します。

### permission policy

roleを取得した後に、どのAWS APIを実行できるかを定義するpolicyです。問題を解くための最小範囲にします。

### least privilege

必要な操作だけを許可する考え方です。競技を簡単にするためにAdministratorAccessを渡すと、安全性と学習価値を失います。

### ParticipantViewerRole

問題stackが作る参加者用roleです。名前にViewerとあっても、問題によっては復旧に必要な操作権限を持ちます。名称ではなく実際のpolicyを確認します。

### competitor bootstrap

TenkaCloudがcompetitor accountへ問題stackをデプロイするために、一度だけ作るIAM roleなどの準備です。

### Confused Deputy

権限を持つサービスが、第三者にだまされて意図しない対象へ操作する問題です。account IDとExternalIdの組み合わせで防ぎます。

### AWS Console federation

一時credentialを使い、対象roleの権限でAWS Consoleへ移動する仕組みです。参加者が自分のteam accountへ入る導線に使います。

### session duration

AssumeRoleで取得した一時sessionの有効時間です。競技時間より短すぎず、終了後に不要に長く残らない値へ調整します。

## AWSリソースと運用

### CloudFormation

AWS resourceをtemplateから作成、更新、削除するサービスです。競技環境を繰り返し再現する基盤として使います。

### stack

CloudFormationが一まとまりとして管理するresource群です。問題ごと、チームごとにstackを作ります。

### Output

CloudFormation stackが外部へ公開する値です。instance ID、Console deep link、endpoint候補などの参加者導線に使います。答えやsecretは出しません。

### UserData

EC2の初回起動時に実行するscriptです。アプリの導入と初期状態の作成に使えます。途中失敗を観測できるようにします。

### SSM Session Manager

SSH portと秘密鍵を公開せずにEC2へ接続する仕組みです。Cloud Rescueの管理経路として利用します。

### SSM Run Command

EC2などのmanaged nodeへcommandを実行する仕組みです。TenkaCloudのdisruption実装で利用できます。

### systemd

Linuxのservice管理機構です。`systemctl`と`journalctl`を使い、serviceの状態確認と復旧を行います。

### 外形監視

利用者と同じように外部からサービスへ接続し、正常性を確認する監視です。TenkaCloudのHTTP probeは外形監視として使えます。

### smoke test

デプロイ後に最小限の正常性を確認する試験です。本番前日に、捨てチームのstackで問題ごとに実行します。

### runbook

運営や障害対応の手順書です。誰が、いつ、何を確認し、失敗時にどう判断するかまで記載します。

### teardown

イベント終了後にresourceを削除する作業です。クラウド競技では、開催と同じ重要度で設計します。

### 残存リソース

stack削除後にも残っているAWS resourceです。手作業で作ったresource、Retain指定、削除失敗などで発生します。

### service quota

AWS serviceごとに設定された利用上限です。チーム数分のresourceを同時作成すると上限へ達する場合があります。

### capacity

採点やPortalの負荷を処理するための読書き性能です。イベント開始前に規模へ合わせ、終了後に元へ戻します。

### AWS Budgets

AWS費用や利用量が設定値を超えたときに通知するサービスです。削除漏れを早期に発見する安全網として使います。

### Cost Explorer

AWS利用費をservice、account、期間などで分析する機能です。イベント翌日以降に見積もりと実績を比較します。

## 開発と公開

### scaffold

動作する雛形を複製し、新しい問題の開始地点を作ることです。空ファイルから始めず、schema検証を通る既存問題を使います。

### validator

問題ファイルがschemaや参照関係に適合するか確認する処理です。TenkaCloudChallengeでは`bun run validate`を使います。

### Git ref

branch、tag、commit SHAなど、利用するsource versionを示す値です。本番では検証済みcommitへ固定します。

### provenance

どのrepositoryとcommitから問題やプラットフォームが作られたかという出所情報です。イベント結果と一緒に記録します。

### draft

開発中で、開催可能性を保証していない問題状態です。実AWS、採点、削除、初見者テストが終わるまで維持します。

### ready

開催に利用できることを検証した問題状態です。単にファイルを書き終えた意味ではありません。

### deprecated

新しいイベントでの利用を推奨しない問題状態です。AWS仕様変更、保守終了、より良い後継問題などが理由になります。

### semantic versioning

互換性の影響に応じてversion番号を更新する考え方です。問題の勝利条件やarchitectureを変える場合は、大きなversion変更として扱います。

### Pull Request

変更をreviewしてrepositoryへ取り込む単位です。問題の学習目標、権限、費用、実AWS検証、削除結果を説明します。

### OSS

source codeを利用、変更、再配布できる形で公開するsoftwareです。TenkaCloudと公開問題カタログはOSSとして管理されています。
