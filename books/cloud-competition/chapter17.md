---
title: "自分の題材で新しい問題を作る"
free: true
---

本書では、Dockerで動くローカルChallenge、AWS Challenge、AWS Battleを順番に一から作りました。最後に、自分の題材をTenkaCloudChallengeへ追加する手順を整理します。

## コマンドを実行する前に決める

AIコーディングエージェントは、競技の内容を自動で決めるものではありません。最初に、次の5点を自分の言葉で書きます。

```text
参加者に持ち帰ってほしいこと:

参加者の役割と現在の状況:

最初に取ってほしい行動:

成功を判定できる条件:

AWSとローカルのどちらで動かすか:
```

たとえば、期限切れ証明書の復旧を題材にするなら、「証明書を知る」では不十分です。

```text
参加者に持ち帰ってほしいこと:
  接続失敗を観測し、証明書の期限を確認し、
  新しい証明書へ切り替えた後にHTTPSの正常応答を確認できる
```

この文章から、必要な環境、最初の手がかり、採点条件を決めます。

## 問題作成契約を開く

TenkaCloudChallengeのルートにある`AGENTS.md`が、人間とAIに共通する問題作成契約です。専用スキルや専用コマンドがなくても、リポジトリを開いたAIコーディングエージェントはこのファイルと近い既存問題から作り方を判断できます。

```bash
less AGENTS.md
```

AIへ依頼する場合も、通常の言葉で形式と題材を伝えます。

```text
AGENTS.mdに従って、新しいAWS Challengeを作ってください。
参加者体験と成功条件は次のとおりです: ...
```

作り始める前に、次の内容を確定します。

1. 問題形式
2. 採点方式
3. 問題IDに使うslug
4. 問題の題材
5. 難易度
6. 想定時間

題材を聞かれたら、前節で書いた参加者体験とストーリーを渡します。「S3の問題を作って」のようなサービス名だけでは、何を学ぶ競技か決まりません。

## ローカルChallengeを作る

AWSを使わない問題は、Challengeを選び、採点方式として`verify`または`multi-verify`を指定します。

- `verify`: 1つの提出を`/verify`で判定する
- `multi-verify`: 複数のcheckpointを個別に判定する

1つのflagを提出する問題なら、`challenges/sqli-demo`がstarterです。複数のcheckpointを持つ問題なら、`challenges/wp-exposed-backup`をstarterとして使います。

ローカル問題では、次の内容を自分の題材へ置き換えます。

1. `runtime.entry`が指すCompose file
2. Participant Portalに表示する`challengeEndpoints`
3. 採点を受ける`verifyUrl`
4. `local/Dockerfile`と問題アプリ
5. `/verify`の判定処理
6. loopbackだけへbindするport
7. 実行ごとに変わる秘密値

攻撃対象と採点APIを同じ画面へ公開しません。`/verify`はloopbackに限定し、不正解時に答えを返さないようにします。

## AWS Challengeを作る

値の発見や、一度の修正完了を採点したい場合はChallengeを選びます。採点方式は`flag`です。

`challenges/hello-world`をstarterとして新しいディレクトリを作ります。starterには、参加者用IAM Role、必須のCloudShell権限、リソース名のprefix、flag採点の接続が含まれます。

生成後に、次の内容を自分の題材へ置き換えます。

1. `metadata.json`の問題文、学習目標、ヒント
2. `template.yaml`の問題固有リソース
3. 参加者が操作した結果として発見できるflag
4. `ParticipantViewerRole`の問題固有権限
5. 日本語と英語のREADME
6. コストと削除方法

flagは固定文字列にしません。問題をデプロイするたびに変わり、参加者が意図した操作をしたときだけ発見できる値にします。

## AWS Battleを作る

サービスの状態を競技中に繰り返し採点したい場合はBattleを選びます。

次の採点方式から、競技の判定方法に合うものを選びます。

| 採点方式 | 用途 |
| --- | --- |
| `uptime-flat` | 登録済みのendpointがすべて正常なら加点する |
| `uptime-multi` | 宣言したすべてのendpointを確認し、未登録のものも失敗として扱う |
| `phased-polling` | 時間帯によって採点条件を変える |
| `attack-detection` | 検知数などの統計を得点へ変える |

最初のBattleには、`battles/hello-world-battle`をstarterとする`uptime-flat`が分かりやすいです。

Battleでは、次の内容を決めます。

- 参加者が登録するendpoint
- 正常と判定するパスとHTTP status
- URLを登録する前に得点させない方法
- レッドチームが実行する障害
- 参加者が復旧する方法
- 障害を自動で元へ戻すrevert

実際に障害を起こすには、`disruptions[].action`へ実行方法を書きます。説明文だけでは動きません。`action`には必ず`revert`を付けます。

## 手動で作る場合

Claude Codeを使わない場合も、同じstarterから作れます。

```bash
cp -R challenges/hello-world challenges/<新しいslug>
cp -R battles/hello-world-battle battles/<新しいslug>
cp -R challenges/sqli-demo challenges/<新しいローカル問題のslug>
```

どれか1つだけを、作りたい問題形式に合わせて実行します。その後、リポジトリが用意したコマンドで依存関係を導入し、変更後の問題を確認します。

```bash
make install
make agent-gate
```

ファイルを複製した直後に`make agent-gate`を実行しても、自分の問題は完成しません。ディレクトリ名と`id`、参加者向け文章、環境、採点、Output、READMEをすべて自分の設計へ変更した後に実行します。

`make agent-gate`は、全問題の`metadata.json`を`SCHEMA.json`とリポジトリ規約に照らして確認します。カタログindex、知識グラフ、固定料金表の生成は行いません。失敗した場合は、表示された問題ファイルまたは契約違反を直して、もう一度実行します。

AWSの金額はRegion、利用量、購入オプション、アカウントの割引などで変わります。問題側に固定ドル値を持たせず、課金が継続するリソース、削除方法、想定Regionを記録し、開催時にAWSの最新料金で確認します。

## 実行してから公開する

AWS問題は、テスト用AWSアカウントへデプロイし、参加者用Roleで解答、採点、削除まで通します。

ローカル問題は、TenkaCloud本体のルートで起動します。

```bash
make local
```

問題はコマンドの引数では選びません。表示された主催者キーでログインし、イベントとチームを作って問題を選びます。「スケジュール」タブで問題環境を準備し、イベントを開始します。次に、参加者URLとチームキーで参加者としてログインし、「起動・再開」で問題環境を起動します。

Participant Portalから問題を開き、想定した解答で得点し、誤答では得点しないことを確認します。終了時は次を実行します。

```bash
make down
```

最後に、TenkaCloudChallengeのルートで完了条件を実行します。

```bash
make agent-gate
```

公開問題は、1問につき1つのPull Requestにします。Pull Requestには次の内容を書きます。

- 参加者に持ち帰ってほしいこと
- ストーリーと最初の一手
- 成功を判定する条件
- 実行環境と権限境界
- レッドチームの障害とrevert
- コストと削除方法
- 実際に通した操作
- `make agent-gate`の結果

本書で作った3問は、どれも「どのAWSサービスを使うか」から始めていません。参加者にどんな行動を取ってほしいかを決め、ストーリー、環境、採点を後から接続しました。自分の問題を作るときも、この順序を変えないことが最も重要です。

## 問題を公開せずに使う場合

ここまでの流れは、TenkaCloudChallengeへPull Requestを送る前提で説明してきました。社内の脆弱性やインシデント事例を題材にしていて、問題そのものを公開したくない場合は、経路が変わります。

ローカル開催で使うDocker/Compose問題は、公開カタログへpushしなくても使えます。手元のTenkaCloudの`problems/`に問題を置き、`make agent-gate`で検証してから`make local`を起動します。あとは公開問題と同じように、イベントとチームを作り、問題を選んで開始します。

**AWS Challenge・Battleを公開せずに配る場合**は、TenkaCloudChallengeへPull Requestを送る代わりに、[Problem Packs](https://github.com/susumutomita/TenkaCloud) CLIを使います。Problem Packは、社内向けの問題や、イベント後に公開する予定の問題を、公開カタログとは別に管理する仕組みです。TenkaCloudリポジトリのルートで、次の順に実行します。

```bash
make pack-init ARGS="./my-pack --runtime aws/cloudformation"
# 生成されたmanifestと問題のファイルを編集する
make pack-validate ARGS="./my-pack"
make pack-install ARGS="./my-pack"
make pack-list
```

`pack install`には、ローカルのディレクトリのほかにGitのURLも指定できます。ただし、Pack CLIはGitの取得に認証情報を使いません。非公開のGitリポジトリにある問題は、自分の権限で手元へcloneしてから、そのディレクトリをinstallします。

installしただけでは、問題は有効になりません。manifestのIDとversionを`<id@version>`に入れて、次のコマンドで有効化します。`make pack-activate`というtargetはありません。

```sh
bun run pack activate <id@version> --tenant local
```

`--tenant local`の`local`は、クラウド開催がカタログを読み込むときに使う固定の名前です。ローカル開催を指定する値ではありません。

activateは`.tenkacloud/pack-store`の内容を書き換えるだけで、AWSは操作しません。`.tenkacloud/`はGitで管理しないため、Packを有効化した手元のリポジトリから`make deploy`を実行してクラウド開催を更新します。このとき、storeが非公開のsource archiveに含まれ、有効化した問題とその素材が読み込まれます。すでに作ったイベントのカタログは変わらないため、更新後に新しいイベントを作って問題を選びます。開催前に、問題のruntimeと採点方式がクラウド開催で動くことを確かめ、解答、採点、撤収までをリハーサルしてください。

ローカル開催は、Packからイベントのカタログへ問題を読み込みません。公開せずに使うDocker/Compose問題は、前に書いたとおり手元の`problems/`に置きます。

公開前の問題でも、そのままイベントを開催できます。イベント後に公開する場合は、社内情報や解答の扱いを確認したうえで、作成者が公開先と時期を決めます。TenkaCloudには自動で公開する機能はありません。

launcherの`ProblemsRepoUrl`（第21章）は、非公開リポジトリの代わりに使えません。launcherは認証情報を使わずにGitでカタログを取得するため、private repoを指定するとすぐに失敗します。「自分のforkを指定できる」のは、そのforkも公開リポジトリである場合です。

## 読み終えたあとの進み方

本書は読み終えたところが終点ではありません。次の順番で進むと、読んだ内容が自分の環境の中で動く状態になります。

1. **試す** — [デモポータル](https://tenkacloud.com/portal-demo/?demo=1)で参加者の画面を触ります。[GitHub Codespaces](https://codespaces.new/susumutomita/TenkaCloud)ではブラウザから開発環境を開けますが、Codespaces上で問題を解く経路はTenkaCloud側でまだ検証中です。
2. **動かす** — [TenkaCloud](https://github.com/susumutomita/TenkaCloud)をクローンし、`make local`でローカル問題を起動します。本書の第3章から第4章がこの段階に対応します。
3. **作る** — [TenkaCloudChallenge](https://github.com/susumutomita/TenkaCloudChallenge)へ自分の問題を1問足します。既存の問題ディレクトリが、そのままテンプレートとして読めます。完了条件は`make agent-gate`です。
4. **開く** — TenkaCloudをAWSへデプロイし、チームを登録してイベントを開催します。第10章以降がこの段階です。

公式サイトは[日本語](https://www.tenkacloud.com/?lang=ja)と[英語](https://www.tenkacloud.com/?lang=en)があり、役割別のマニュアルもそこから辿れます。

作った問題を公開する義務はありませんが、公開すると他の主催者がそのまま使えます。逆に、自分が問題を作る前に[問題カタログ](https://github.com/susumutomita/TenkaCloudChallenge)を眺めておくと、すでにある問題と重ならない題材を選べます。

うまく動かないところや、本書の説明で足りなかったところは、[GitHub Discussions](https://github.com/susumutomita/TenkaCloud/discussions)へ書いてもらえると、本書とプラットフォームの両方の改善につながります。
