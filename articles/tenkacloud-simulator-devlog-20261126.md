---
title: "TenkaCloudSimulator 開発日記：ChatGPTのDotで開発が自律的に続く仕組みをつくる"
emoji: "🏭"
type: "tech"
topics: ["chatgpt", "aiエージェント", "githubactions", "tlaplus", "aws"]
published: true
---

# ChatGPTのDotで開発が自律的に続く仕組みをつくる

この記事は2026年11月時点の開発記録です。TenkaCloudSimulatorの実装を、ChatGPTのDotとサブエージェントで進めています。今回は、Issueを渡してから実装、レビュー、マージまで回すために、実際に入れた設定と、途中でやめた設定を紹介します。

## AWS公式エミュレーターがあっても自作する理由

AWSのAPIを使うアプリが手元で動くかを確認するだけなら、対応済みの機能は[AWS公式エミュレーター](https://docs.aws.amazon.com/emulator/latest/userguide/)をそのまま使えば十分です。公式は追加料金なしで使えます。一方、実クラウドでチームごとに環境を用意すれば利用料がかかり、[商用エミュレーターにも有料プラン](https://docs.localstack.cloud/aws/licensing/)があります。費用を抑えつつ、参加者がAWS・Azure・Google Cloudなどを1つのGUIで操作し、主催者がTenkaCloudから問題を配布・採点できる環境を作りたかったのです。公式エミュレーター自体にはGUIがありません。

APIの応答が返ることと、そこでプログラムが動くことも別です。たとえば[AWS公式の`RunInstances`の実装](https://github.com/aws/aws-emulator/blob/bf205090aef11dede75ce528b7b57e0b8feca92b/services/service-com-amazonaws-ec2-amazonec2/src/ops/run_instances.rs)ではインスタンスの情報と状態遷移を確認できますが、実際にOSを起動して中でコマンドを動かせることまでは確認できませんでした。TenkaCloudでは、EC2ゲストの中で障害を直して採点する問題を扱いたいので、[対象を絞ったQEMUによる実行経路](https://github.com/susumutomita/TenkaCloud/blob/5e360d563e03e23ea431470559399dfc33ff2cca/README.md#local-aws-simulator-explicit-opt-in)を用意しています。

方針は、**すでに動くものは使い、演習に必要なのに動かない部分だけ作る**ことです。すでに[公式のVPC実装を参考にSDKの回帰テストを追加](https://github.com/susumutomita/TenkaCloudSimulator/pull/487)し、TenkaCloud本体はローカルの自作Simulatorに接続できます。同じ演習内で公式と自作へAPIを自動で振り分けるところまでは、今回確認していません。

2026年11月26日時点で、[AWS公式リポジトリの未解決Issue](https://github.com/aws/aws-emulator/issues?q=is%3Aissue%20is%3Aopen)は618件ありました。これは未対応APIの数ではありませんが、実装はまだ動いています。[AWSもエージェントで継続的に改善](https://aws.amazon.com/blogs/aws/test-your-applications-against-aws-locally-with-aws-emulator/)しています。今は自作が必要でも、公式で対応できる機能が増えれば、その部分は公式に任せます。自作側ではGUIや演習の体験に時間を使います。

## ブラウザだけで競技を動かす

次に試したいのは、ブラウザ内のLinuxと、WebAssembly（WASM）で動くシミュレーターを組み合わせる構成です。Linuxの端末からシミュレーターのAPIを呼び、問題の状態は[ブラウザ内のSQLite](https://sqlite.org/wasm/doc/trunk/persistence.md)に保存します。対応できる問題からこの形に移せれば、参加者の端末が実行を担います。運営側は問題を配信するだけで、参加者が増えるたびに人数分のクラウド環境を立てずに済みます。

クラウドのアカウントやクレジットカードを用意できない人も、ブラウザからクラウドの操作を練習できます。たとえば、権限を変えて操作が拒否されるか、自分の環境で試せます。構成変更後の動作も確認できます。本番クラウドと同じ安全性を保証するためではなく、実環境へ持ち込む前に仮説や手順を確かめる場として使う想定です。

まずはブラウザ内で完結する問題が対象です。実クラウドとの接続が必要な問題や、順位に使う採点をブラウザだけで信頼できるかは別の課題です。ブラウザ内での実行と保存は、これから検証します。

## なぜ開発が自律的に続く仕組みをつくるのか

開発の回し方で参考にしたのは[AWSがエミュレーターを作った記事](https://www.aboutamazon.com/news/aws/how-autonomous-ai-agents-built-aws-emulator)です。テストを書く、実際のAWSとの差を見つける、Issueを直す、と工程ごとにエージェントを分けています。[開発チームの記事](https://builder.aws.com/content/3MLGDWXY8MA3cdDNL2o1P9yjyP4/teach-an-agent-to-fish-and-it-will-maintain-your-code-for-a-lifetime)では、11月19日までに17,000件を超えるIssueを修正したと紹介されています。

TenkaCloudSimulatorでも、VPCひとつでSDK、コンソール、保存データ、テストまで見る必要があります。これを各サービスでやると、普段使っているコーディング環境ではトークン枠がすぐに尽きます。AWSのやり方を見て、この数を回すにはトークンを気にせず試せる環境が必要だと考えました。AWSの予算や使用量は不明です。今回の開発では、Dotがトークン上限に達して作業が止まったことはまだありません。

トークンのほかに、次の指示を出すまで作業が止まることも問題でした。テストが終わるたびに「次はレビュー」「通ったらマージ」と言いに行くのでは、並列で実装しても待ち時間が残ります。そこで、担当の終了を次の作業の起点にしました。

# 指示書と引き継ぎを用意する

## AGENTS.mdに完了条件を書く

まず、毎回読み直すルールを`AGENTS.md`に置きます。繰り返し伝えていたのは、次の3点です。

1. Issueを単位に担当を分ける。同じ変更を複数の担当に直させない。

2. 変更した箇所をテストし、別担当が同じコミットをレビューする。必須CIが通ったら、サービスごとにマージする。

3. 親Issueは、元の完了条件が`main`で確認できるまで閉じない。コンソールが対象なら画面まで、実SQLが対象なら実際にSQLが通るところまで見る。

この指示を読むのはDotとサブエージェントです。人間が読みやすい文章にする必要はないので、Dotに「意図が落ちず、AI同士で効率よく伝えられる形式は何か」と聞きました。ベクトル値も候補にしましたが、今回は短いキーと値で条件を分けて書けるYAMLになりました。

[PR #519](https://github.com/susumutomita/TenkaCloudSimulator/pull/519)で`AGENTS.md`を全文書き直し、5,889バイトから4,945バイトになりました。その後、[PR #520](https://github.com/susumutomita/TenkaCloudSimulator/pull/520)で一律のE2E条件を外し、47行から44行（4,845バイト）に減りました。バイト数は計測しましたが、トークン数や指示の守られ方はまだ比較していません。

[現行の`AGENTS.md`](https://github.com/susumutomita/TenkaCloudSimulator/blob/4a57253c86438a3f0000ac5ec57f39474d2c55c6/AGENTS.md)から、YAML部分をそのまま載せます。

```yaml
start:
  reconcile: [current main, code, tests, open/closed issues and PRs, live ownership]
  handoff_transport: agent-to-agent only; no routine human handoff or review; ask the owner only for missing scope or authorization
  handoff_required: [issue, base_sha, scoped_operations, owned_paths, acceptance_checks]
  public_contract_change_requires: [README.md, docs/design/0001-go-standalone.md]
  parallel_rules: docs/contributing/parallel-development.md
  parallel: independent worktrees; one active writer per shared file; fill available authorized capacity without duplicates or resource overcommit
  continue: consume results and start the next executable stage immediately; block only the affected work, record cause and resume condition, then advance other work
  progress_excludes: [polling, assignment alone, status reports]
  integrity: preserve history and unrelated changes; inspect uncertain outcomes before safe retry; never bypass access restrictions or read/write .env, credentials, or secret files/directories
  authorization: PR, push, merge, release, deploy, and cloud operations and external agent access or transfer each require existing scoped approval
architecture:
  artifact: standalone Go binary; embedded console, Scalar, SQLite, and pinned CPython/WASI; no host Python/Node/Docker, external DB, or real cloud runtime dependency
  core: provider-neutral storage and policy primitives; no provider dispatch or exercise IDs
  providers: concurrent, distinct protocols, models, namespaces, authorization, and UI; do not inherit AWS semantics
  aws: own IAM actions/ARNs and protocol/state; native and legacy ownership/mutation remain atomic; reject cross-adoption; own function state and restricted execution-role SDK bridge
  state: shared actual HTTP API and SQLite state across console/Scalar/SDK; preserve atomicity, foreign keys, and input bounds
  unsupported: reject unsupported operations and policy fields; no fake success or runtime claims for catalog metadata, stubs, mocks, or placeholder UI
  perimeter: numeric loopback and local token auth by default; no outbound cloud calls; distinct authenticated and selected exercise identities; participants cannot select admin
  tenant: one process, SQLite database, and token authority per team
  guest: deny host FS/env/process/network; maintain pinned runtime rights/provenance and negative containment tests; only trusted providers supply bounded capabilities and read-only modules; guests never select authority
  inference: only opt-in numeric-loopback Ollama or explicitly selected absolute-path Apple helper; no backend/cloud/synthetic fallback or prompt/response storage or logging
  bedrock: AWS owns wire shapes, bedrock:InvokeModel evaluation, and operator model mapping
  boundary: TenkaCloudChallenge owns questions/scenarios/scoring/required capabilities; TenkaCloud owns platform integration; no problem-specific simulator logic
done:
  define_before_edit: official spec + issue -> operations, inputs, observable state, errors, cleanup, applicable entry points; evidence in existing issue, PR, or tests
  environment: actual simulator built from one candidate SHA; approved isolated hosted runner; no owner's Mac or live cloud
  verification: test changed operations and affected contracts with focused automated checks; verify real behavior when it is the issue's deliverable
  optional_e2e: no blanket merge gate for make e2e, browser, Scalar Send, or Terraform; run only if specifically requested or needed to demonstrate a claimed behavior; do not claim skipped coverage
  checks:
    always: make before-commit
    model: TLA_JAR=... make formal
    finder_fixer: docs/contributing/software-factory.md; register independent acceptance before claim; run make test on clean exact HEAD and include acceptance report in independent review
    invalid_evidence: [required check failed or not run, required test skipped or missing, failed cleanup, stale SHA, altered log, weakened regression]
  claims: cross-build != cross-platform execution; bounded model checking != implementation proof; optional skills/role prompts != gates
  worker_receipt: [candidate_sha, operations, compatibility, commands_and_evidence, passed_failed_not_run_not_applicable_with_reason, blockers, next_step]
  merge: integration owner verifies independent agent review of exact SHA + required CI, then normal authorized merge per service or agreed scope
  after_merge: verify remote merge and main; repeat impacted checks if tested source changed; only then report done; no service-wide claims from partial coverage
```

## Dotの定期実行の指示もYAMLにする

リポジトリの指示書とは別に、Dotが定期実行で読む指示も見直しました。長い文章に確認事項や例外が繰り返し出てきたので、再開時に確認すること、どの作業を優先するか、何を満たせばマージしてよいかをYAMLの別々の項目に分けました。途中で止まった場合も、次の実行では未完了の工程から再開するようにしています。

## 次の担当が使う記録を残す

作業記録は、Dotの非公開ノートに残します。リポジトリの`AGENTS.md`には各担当が守るルールを書き、Issueごとの進捗や次にやることはノートに書きます。たとえば、セキュリティグループのSDK対応だけがマージされた時点なら、次のように残します。

```yaml
issue: 56
verified:
  pr: 542
  on_main: DescribeSecurityGroups
  evidence: [native_query_contract, required_ci]
unmet:
  - 選択したVPCのセキュリティグループを表示する
  - ネットワーク設定をコンソールで変更する
next: 選択したVPCの範囲で既存APIを呼び、許可と拒否を確認する
```

定期実行が始まると、DotはまずGitHubで`main`とIssueの現在地を確認し、非公開ノートの記録と照合します。次の担当には、未完了の項目と再開に必要なコミット・テスト結果を渡します。別の変更が先にマージされていれば、古い候補の合格を使い回さず、新しい候補で必要なテストをやり直します。

# Dotから実装を再開する

担当が終わったら、結果と未達の条件を受け取って、その場で次の作業に進めます。問題があれば止まった工程だけに再開条件を残し、別のIssueへ移ります。15分ごとの起動も設定していますが、これは引き継ぎが止まったときのためです。次の15分まで作業を待つ必要はありません。

## VPCで動作を確認する

[PR #542](https://github.com/susumutomita/TenkaCloudSimulator/pull/542)では、AWS SDKからセキュリティグループを取得できるようにしました。ただ、この時点ではコンソールには何も表示されません。そこで次の担当を画面側に回し、[PR #544](https://github.com/susumutomita/TenkaCloudSimulator/pull/544)で保存済みのセキュリティグループを表示しました。その後、[PR #546](https://github.com/susumutomita/TenkaCloudSimulator/pull/546)でルートテーブルの読み取りを追加し、[PR #549](https://github.com/susumutomita/TenkaCloudSimulator/pull/549)でコンソールにも表示しました。

ここまでの変更はマージされています。[VPCのIssue #56](https://github.com/susumutomita/TenkaCloudSimulator/issues/56)はGitHub上で完了扱いです。ただ、#549で確認したのはルートテーブルの表示までです。ルートの編集や、設定どおりに通信が通るかどうかは、このPRでは検証していません。

# 状態遷移をTLA+で検証する

VPC Aを表示している間に読み取りが走り、応答が来る前にVPC Bへ切り替えたとします。Aの応答が遅れて来ても、Bの画面には出せません。並行して処理が走ると、普通に操作しただけではこの順番に当たらないことがあります。

そこで、選択中のVPC、保留中の要求、応答の到着を[小さなTLA+モデル](https://github.com/susumutomita/TenkaCloudSimulator/blob/49ecb555d405d31d868fc3d73139b0b0a42e4b75/formal/EC2SecurityGroupConsoleEpoch.tla)にしています。TLCでモデル内の順序を調べ、古い応答をあえて採用するように変えると、検査が失敗することも確認しました。モデルで調べた条件は、実装のテストでも確認します。

モデルを変更したら、ローカルでTLCを実行します。`TLA_JAR`には手元の`tla2tools.jar`のパスを設定してください。

```sh
TLA_JAR=/path/to/tla2tools.jar make formal
```

# ハマったポイントと回避策

## 15分ごとに起こしても、前の続きから始まらない

最初は、途中で止まったらDotを起こせばよいと思っていました。実際には、前のテスト結果や会話で足した条件を引き継げず、同じ調査を繰り返すことがありました。「SDKだけで終わらず、コンソールまで」と何度も言ったのはこのためです。会話で条件を変えたら指示書にもその場で反映し、作業の区切りでは結果と次の工程を記録するようにしました。

## PRを更新するたびにCIで1時間待つ

[変更前の記録](https://github.com/susumutomita/TenkaCloudSimulator/pull/480)では、必須CIで`make before-commit cross-check`に約16分、`make e2e`に約15分、`make formal`に約28分かかっていました。別の形式検証ジョブも約45分で、TLCは重複して回っていました。

そこで、[全件のTLCをリリース時と手動実行に移し](https://github.com/susumutomita/TenkaCloudSimulator/pull/481)、リリース時は10分割しました。通常PRでは、変更したファイルをどのモデルで検証するかの対応をチェックします。モデル変更時のローカルの実行も残しています。

## E2Eを通常PRの必須条件から外す

`make e2e`は、実バイナリを起動して、SDK・コンソール・APIリファレンスをまとめて確認するテストです。小さな変更でもこの一式を待つと次のPRに進めないため、[通常PRのCIでは実行しないように変更し](https://github.com/susumutomita/TenkaCloudSimulator/pull/480)、[指示書からも一律の必須条件を外しました](https://github.com/susumutomita/TenkaCloudSimulator/pull/520)。テスト自体は削除せず、[タグを付けたときと手動実行で回します](https://github.com/susumutomita/TenkaCloudSimulator/blob/95bf82abb24e70d9c53d6f7b59f1f640944601d1/.github/workflows/ci.yml#L296-L323)。

一方、機能の完了条件に実動作があるなら、その経路だけは最後まで通します。たとえば[EC2コンソールのPR #553](https://github.com/susumutomita/TenkaCloudSimulator/pull/553)では、画面からテンプレートを検証できるところまでをマージしました。実際にインスタンスを起動する[#57](https://github.com/susumutomita/TenkaCloudSimulator/issues/57)は別で、プレビューが通っても閉じません。EC2からRDSへの接続も同じです。APIが応答するだけでは足りず、起動したゲストから`psql`で接続し、SQLの結果が返るところまで確認します。

# コードと参考リンク

まだ試行錯誤中です。次は、あらためて指示しなくても未達の条件から再開できるか、PRを出してからマージするまでの待ち時間がどれくらい変わるかを見ていきます。

- [TenkaCloudSimulatorのソースコード](https://github.com/susumutomita/TenkaCloudSimulator)

- [エージェントの指示書と引き継ぎの変更 #519](https://github.com/susumutomita/TenkaCloudSimulator/pull/519)

- [通常PRのCIとE2Eの変更 #480](https://github.com/susumutomita/TenkaCloudSimulator/pull/480)

- [リリース時のTLCの変更 #481](https://github.com/susumutomita/TenkaCloudSimulator/pull/481)
