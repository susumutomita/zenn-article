---
title: "TenkaCloudSimulator 開発日記：ChatGPTのDotで開発ファクトリーを作る"
emoji: "🏭"
type: "tech"
topics: ["chatgpt", "aiエージェント", "githubactions", "tlaplus", "aws"]
published: true
---

# ChatGPTのDotで開発を回す

この記事は2026年11月時点の開発記録です。TenkaCloudSimulatorの実装を、ChatGPTのDotとサブエージェントで進めています。今回は、Issueを渡してから実装、レビュー、マージまで回すために、実際に入れた設定と、途中でやめた設定を紹介します。

## なぜファクトリー化するのか

きっかけは[AWSがエミュレーターを作った記事](https://www.aboutamazon.com/news/aws/how-autonomous-ai-agents-built-aws-emulator)です。テストを書く、実際のAWSとの差を見つける、Issueを直す、と工程ごとにエージェントを分けています。[開発チームの記事](https://builder.aws.com/content/3MLGDWXY8MA3cdDNL2o1P9yjyP4/teach-an-agent-to-fish-and-it-will-maintain-your-code-for-a-lifetime)では、11月19日までに17,000件を超えるIssueを修正したと紹介されています。

TenkaCloudSimulatorでも、VPCひとつでSDK、コンソール、保存データ、テストまで見る必要があります。これを各サービスでやると、普段使っているコーディング環境ではトークン枠がすぐに尽きます。AWSのやり方を見て、この数を回すにはトークンを気にせず試せる環境が必要だと考えました。AWSの予算や使用量は分かりませんが、僕の使い方では、Dotは今のところ上限で作業が止まっていません。

トークンのほかに、僕が戻るまで作業が進まないことも問題でした。テストが終わるたびに「次はレビュー」「通ったらマージ」と言いに行くのでは、並列で実装しても待ち時間が残ります。そこで、担当の終了を次の作業の起点にしました。

# 指示書と引き継ぎを用意する

## AGENTS.mdに完了条件を書く

まず、毎回読み直すルールを`AGENTS.md`に置きます。繰り返し伝えていたのは、次の3点です。

1. Issueを単位に担当を分ける。同じ変更を複数の担当に直させない。

2. 変更した箇所をテストし、別担当が同じコミットをレビューする。必須CIが通ったら、サービスごとにマージする。

3. 親Issueは、元の完了条件が`main`で確認できるまで閉じない。コンソールが対象なら画面まで、実SQLが対象なら実際にSQLが通るところまで見る。

この指示を読むのはDotとサブエージェントです。人間が読みやすい文章にする必要はないので、Dotに「意図が落ちず、AI同士で効率よく伝えられる形式は何か」と聞きました。僕からはベクトル値でもよいのではと提案しましたが、今回は短いキーと値で条件を分けて書けるYAMLになりました。

[PR #519](https://github.com/susumutomita/TenkaCloudSimulator/pull/519)で`AGENTS.md`を全文書き直しました。5,889バイトから4,945バイトになり、行数は32行から47行に増えています。バイト数は小さくなりましたが、トークン数や指示の守られ方はまだ比較していません。

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

`make e2e`は、実バイナリを起動して、SDK・コンソール・APIリファレンスをまとめて確認するテストです。小さな変更でもこの一式を待つとマージまでの時間が延びるため、[通常PRのCIでは実行しないように変更し](https://github.com/susumutomita/TenkaCloudSimulator/pull/480)、[指示書からも一律の必須条件を外しました](https://github.com/susumutomita/TenkaCloudSimulator/pull/520)。テスト自体は削除せず、[タグを付けたときと手動実行で回します](https://github.com/susumutomita/TenkaCloudSimulator/blob/95bf82abb24e70d9c53d6f7b59f1f640944601d1/.github/workflows/ci.yml#L296-L323)。

一方、機能の完了条件に実動作があるなら、その経路だけは最後まで通します。たとえば[EC2コンソールのPR #553](https://github.com/susumutomita/TenkaCloudSimulator/pull/553)では、画面からテンプレートを検証できるところまでをマージしました。実際にインスタンスを起動する[#57](https://github.com/susumutomita/TenkaCloudSimulator/issues/57)は別で、プレビューが通っても閉じません。EC2からRDSへの接続も同じです。APIが応答するだけでは足りず、起動したゲストから`psql`で接続し、SQLの結果が返るところまで確認します。

# コードと参考リンク

まだ試行錯誤中です。次は、あらためて指示しなくても未達の条件から再開できるか、PRを出してからマージするまでの待ち時間がどれくらい変わるかを見ていきます。

- [TenkaCloudSimulatorのソースコード](https://github.com/susumutomita/TenkaCloudSimulator)

- [エージェントの指示書と引き継ぎの変更 #519](https://github.com/susumutomita/TenkaCloudSimulator/pull/519)

- [通常PRのCIとE2Eの変更 #480](https://github.com/susumutomita/TenkaCloudSimulator/pull/480)

- [リリース時のTLCの変更 #481](https://github.com/susumutomita/TenkaCloudSimulator/pull/481)
