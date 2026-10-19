---
title: "TenkaCloudとTailscaleで、離れた場所から競技に参加する"
emoji: "🏯"
type: "tech"
topics: ["tenkacloud", "tailscale", "security", "network"]
published: true
---

## 何ができるのか

[TenkaCloud](https://github.com/susumutomita/TenkaCloud)は、クラウドやセキュリティの課題に、実際に手を動かして取り組む競技プラットフォームです。参加者は演習環境で問題を解き、回答を送って得点を競います。主催者は問題を選び、大会やチーム、演習環境、得点を管理します。

離れた場所から参加してもらうには、画面への接続に加えて、操作できる範囲を決める必要があります。参加者には自分の問題を操作してもらいたい一方、主催者の管理画面や他チームの非公開環境へはアクセスさせたくありません。

この記事では、主催者が用意した1台へTailscale経由で接続し、離れた参加者に演習を提供する方法を説明します。接続方法に加え、接続後に許される操作とチームごとの環境をどう分けるか、実装と制限を確認します。通信の保護、操作の権限、演習環境の分離は、それぞれの役割と限界を分けて考えます。

[Tailscale](https://tailscale.com/docs/how-to/quickstart)は、許可した端末同士を暗号化した通信でつなぐサービスです。VPNは、離れた端末の間に仮想的な通信経路を作る仕組みです。tailnetは、Tailscaleで利用者と端末をまとめるプライベートなネットワークを指します。

前半で準備から終了までの手順を示し、後半で「何を、どの仕組みが守るか」をコードから追います。最初はDockerを使わない問題、たとえばCrypto Battleを対象にします。Dockerは、演習用のプログラムをコンテナという実行環境で動かす仕組みです。Docker問題を別端末から利用するには追加条件があります。

:::message

この記事は、2026年10月19日に公式資料とTenkaCloudのmain、[d1c77b00f5b7eefc99021741a78ae23ecd9031ab](https://github.com/susumutomita/TenkaCloud/tree/d1c77b00f5b7eefc99021741a78ae23ecd9031ab)を確認した、開催準備のための説明です。TenkaCloudの[ガイド](https://tenkacloud.com/docs/getting-started/#tailscale-first-connection)はPreviewです。今回、Tailscale共有を通したTenkaCloudの実機リハーサル、スマホ操作、多人数開催、Dockerの実通信は行っていません。以下の成功条件は、実測結果ではなく開催前に確認する項目です。

:::

Tailscaleの暗号化やMacの受信処理の基礎は、既存の[MulmoTerminalにTailscale経由でアクセスする方法](https://zenn.dev/susumutomita/articles/tailscale-mulmoterminal-network)につなぎます。そちらの実機確認はMacからMacへのMulmoTerminal接続です。TenkaCloudやスマホの動作確認として読み替えないでください。

ソースコードは、ソフトウェアの動作を記述した文章です。mainは開発の中心となるbranch（変更を進める系列）、commitは記録した変更の版を指します。長い英数字は、その版を特定する番号です。

## 開催までの手順

### 1. 主催者が、使う問題と開催端末を決める

開催用のソフトウェアを動かす端末を「開催端末」、ブラウザで問題を解く端末を「参加端末」と呼びます。会社の端末やサービスを共有するときは、所有者・管理者が認めた専用の開催端末を使います。

| 使いたいもの | 開催端末の条件 | 参加者に必要な接続先 |
| --- | --- | --- |
| Dockerを使わないnative問題 | MacまたはLinux。ここではこの構成から始める | TCP 5175 |
| Docker / Compose問題 | 対応するnative Linuxと専用隔離モードが必要 | TCP 5175と、使用する演習gatewayのTCPポート |

native問題は、ここではDockerの演習コンテナを使わずに実行する問題です。TCPは、Web画面などのデータを順序どおりに届ける通信方式です。ポートは、同じ端末上のどのサービスへ届けるかを区別する番号です。

**MacでTailscaleを使えることと、MacでDocker演習を隔離できることは別です。**

現行の隔離モードはnative Linux上のrootful Docker Engine 28.4.xに限られます。rootfulは、Dockerの管理プログラムが管理者権限で動く方式です。MacのDocker Desktop、rootless方式、別端末のDockerを使うremote方式は対象外です。詳しい拒否条件は後半で確認します。

### 2. 主催者と参加者が、Tailscaleのログイン先をそろえる

両方の端末へ[公式手順](https://tailscale.com/docs/how-to/quickstart)でTailscaleを入れます。Macは[macOS用手順](https://tailscale.com/docs/install/mac)、スマホなら使うOSの手順に従います。OSがVPN構成の許可を求めたら、公式手順に沿って進めます。

ここで、次のどちらを使うか決めます。**tailnetへの参加、端末1台の共有、アクセス制御のグループ追加は別の操作です。**

#### A. 開催用の同じtailnetへ参加する

1. 主催者が、参加者を開催用tailnetへ招待します。[利用者招待の公式案内](https://tailscale.com/docs/manage-users)から、利用する認証方法に合う手順を選びます。自分の2台で先に試すなら、同じアカウントで登録できます。他人とログイン情報を共用しません。
2. 参加者は招待を受け、決めたアカウントでログインします。ブラウザとTailscaleアプリで、選択中のアカウント・tailnetが一致するか確認します。
3. 利用者承認や端末承認が有効なら、管理者の承認を待ちます。Machinesの`Needs approval`は、グループ追加では解消しません。[端末管理の公式手順](https://tailscale.com/docs/features/access-control/device-management/how-to/set-up)も確認します。
4. 管理者は端末一覧で開催端末と参加端末を照合します。参加者が管理画面を開けない役割なら、管理者が確認します。

#### B. 参加者自身のtailnetへ、開催端末だけを共有する

外部の参加者へ開催端末1台を共有する方法です。[共有の公式仕様](https://tailscale.com/docs/features/sharing)は範囲を “only the shared machine” と説明しています。「共有された端末だけ」という意味です。主催者のtailnet全体へ加入する手順ではありません。

1. 共有を作る主催者と、受け取る参加者は、それぞれのtailnetでOwner/Admin/IT adminのいずれかの権限が必要です。権限がなければ、それぞれの管理者に確認します。
2. 主催者はMachinesで開催端末を選び、`Share` → `Copy invite link` → `Copy share link`から、参加者ごとの単発リンクを作ります。`Reusable link`は有効にしません。招待リンクは本人にだけ渡します。
3. 参加者は招待を開き、ブラウザで受け取るアカウント・tailnetを確認して承認します。Tailscaleアプリでも、その共有を受けたアカウント・tailnetを選び、`Connected`を確認します。
4. 参加者は端末一覧から、主催者の伝えた開催端末を探します。共有は受諾した本人向けです。参加者側のtailnetにいる全員が自動的に使えるわけではありません。

共有を承認しても、ポートの許可は次の手順で確認します。共有時のIP競合で、受信側に別のIPを割り当てる場合があります。その場合は本記事のIP指定の手順を止め、両側の管理者と経路を確認します。

### 3. 管理者が、参加者グループと接続許可を確認する

アクセス制御は「誰が、どの端末の、どのポートへつなげるか」を決める設定です。TailscaleではgrantsやACLを使います。ここでは通信の許可にgrantsを使います。[公式のgrants説明](https://tailscale.com/docs/features/access-control/grants)は “deny-by-default” と表現しています。必要な通信を明示して許可する考え方です。ただし、実際のtailnetに広い許可が残っていないかは別途確認します。

Aの同じtailnet方式では、管理者が`group:event-participants`のような参加者グループを用意し、承認した本人の識別子を追加します。[公式のグループ仕様](https://tailscale.com/docs/reference/syntax/policy-file#groups)を確認し、policyファイルの`groups`、またはUsers → 対象者の`…` → `Edit group membership`で操作します。グループ編集の権限も必要です。これは端末登録やTenkaCloudのチーム作成ではありません。

以下は、**同じtailnetでnative問題を試す場合の設定例**です。既存policyを丸ごと置き換えるものではありません。管理者が他の許可との関係を確認し、設定の検査・テストを通してから適用します。メールアドレスとIPは架空の値です。IPは開催端末自身のものへ置き換えます。

```json
{
  "groups": {
    "group:event-participants": ["student@example.com"]
  },
  "hosts": {
    "event-host": "100.96.12.34"
  },
  "grants": [
    {
      "src": ["group:event-participants"],
      "dst": ["event-host"],
      "ip": ["tcp:5175"]
    }
  ]
}
```

`src`は接続する人、`dst`は接続先、`ip`は許可する通信方式とポートです。`hosts`はpolicy内で使うIPの別名で、ブラウザで開くDNS名を登録する設定ではありません。ログイン方法によって利用者識別子が異なるため、メールアドレスと決めつけず、管理画面と[公式の利用者表記](https://tailscale.com/docs/reference/syntax/policy-file#users)を照合します。

Bの端末共有方式は、[公式の共有とアクセス制御の例](https://tailscale.com/docs/features/sharing#sharing-and-access-control-policies)に沿って、開催側では受諾した外部利用者を`src`に指定します。参加側のグループが開催側へ引き継がれる前提にはしません。参加側のpolicyも接続を妨げていないか確認します。

許可する範囲は次のとおりです。

- native問題だけなら、開催端末のTCP 5175。
- Dockerの演習gatewayを使う場合だけ、設定した`--gateway-ports`のTCP範囲も対象にする。デフォルトは5200–5239。gatewayは、参加者の通信を演習環境へ渡す入口です。
- 管理画面の5174、SSHなどの不要なサービス、コンテナ内部へ直接つながるポートは参加者に許可しない。

**狭い許可を追加しても、既存の広い許可は打ち消されません。** 全員・全ポートを許可するルールなどを含め、有効なpolicy全体で判断します。管理者は許可した参加者の5175、使用するgatewayへの接続と、5174・不要なサービス・許可していない利用者の不許可をpolicyテストで確認します。会社のpolicyを本記事の例だけで変更しないでください。

### 4. 主催者が、開催端末自身のIPで起動する

[TenkaCloudの導入ガイド](https://tenkacloud.com/docs/getting-started/#local-start)に従い、Git、Make、Bun 1.3.11を用意します。Gitはコードの版を管理する道具、Makeは決められた作業を呼び出す道具です。Bunは、このプロジェクトのプログラムを実行するために使います。以下は新しい開催用ディレクトリでの例です。稼働中の大会を途中で更新・再起動する手順ではありません。

```sh
git clone https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
# 本文で確認したコードに固定する
git checkout --detach d1c77b00f5b7eefc99021741a78ae23ecd9031ab
make install
```

開催端末でTailscaleを有効にし、アプリの端末情報、またはCLIの`tailscale ip -4`と`tailscale status`で、自分のTailscale IPv4を確認します。CLIは文字で命令を入力する操作方法です。Macで`tailscale`が見つからない場合は、アプリの表示と公式の導入手順を使って確認します。

次の`100.96.12.34`は、TenkaCloudのガイドと同じ**説明用の値**です。実際には開催端末自身のIPへ置き換えます。参加者自身のIPや、共有先でだけ別に見えているIPを指定しません。VMを開催端末にするなら、そのVM自身に割り当てられたIPを使います。

```sh
make local LOCAL_ARGS="--lan 100.96.12.34 --unsafe-lan"
```

このコマンドは、Tailscaleの導入、招待、アクセス制御、OSの通信許可を設定しません。`--unsafe-lan`はHTTPでの待ち受けに明示的に同意する指定です。HTTPはWebの通信方式、TLSは通信を暗号化する仕組みです。この指定だけでVPNやTLSが有効になることはありません。

初回はbuildを省略しません。buildはソースコードから実行用のファイルを作る処理です。起動ログに表示されたURLを確認します。デフォルトのポートなら、主催者は**開催端末上で**`http://127.0.0.1:5174`を開きます。127.0.0.1は、その操作をしている端末自身を指すアドレスです。

対話ターミナルでの起動時に表示される主催者キーを非公開で保管し、主催者のログインに使います。起動し直すと以前の主催者キーとログインは失効します。主催者キーを参加者へ配りません。管理画面を参加者用に転送・proxyしないでください。proxyは、別のサービスへ通信を中継する仕組みです。

### 5. 大会とチームを作り、接続を確認してから開始する

主催者はHost Consoleで大会とチームを作り、使うnative問題を選んで環境を準備します。画面の流れは[公式ガイド](https://tenkacloud.com/docs/getting-started/)に従います。各チームには、そのチームのキーだけを渡します。

参加者へ渡すのは、起動ログの参加者URL、チームキー、接続先の開催端末名です。例は`http://100.96.12.34:5175/`です。参加端末で127.0.0.1を開くと、開催端末へは届きません。このLAN構成はIPに基づくHost/Originを検査するため、URLを勝手にMagicDNS名へ置き換えません。MagicDNSは端末を名前で探すTailscaleの機能です。

参加者はTailscaleが接続中で、招待を受けたアカウント・tailnetになっていることを再確認してから、URLを開きます。PCでは、承認済みの開催端末だけを次のように確認できます。ここでもIPを置き換えます。

```sh
EVENT_HOST_IP=100.96.12.34
curl --fail "http://${EVENT_HOST_IP}:5175/healthz"
nc -vz -w 3 "$EVENT_HOST_IP" 5175
nc -vz -w 3 "$EVENT_HOST_IP" 5174
```

確認するのは、healthの`status`が`ok`で`role`が`participant`、5175へ接続でき、5174へ接続できないことです。`curl`はHTTPの応答、`nc`はポートへの接続を調べるコマンドです。スマホならブラウザで同じ`/healthz`を開く確認方法がありますが、今回その動作は未検証です。

5174への接続失敗だけでは、Tailscaleの制御が正しい証明にはなりません。アプリが外向けに待ち受けていないだけでも失敗します。管理者のpolicyテストと組み合わせます。healthが開くことも、チームキー認証や採点まで動く証明にはなりません。

参加者はチームキーでログインし、チーム名を確認します。全員のログインを確認してから主催者が大会を開始し、選んだ問題の操作と得点を確認します。Docker問題を使う場合は追加の隔離条件を満たしたうえで、実際に画面から発行された自チームのgateway URLまで確認します。5200–5239の全ポートが常時応答する仕組みではありません。

### 6. 終了し、招待による接続権も片づける

End Eventで採点を止め、必要な結果を保存します。環境の停止・削除は大会終了とは別です。データを残す場合は画面のStop (keep data)など、[停止と再開の公式手順](https://tenkacloud.com/docs/getting-started/)に従います。`make down`は管理対象のローカル環境を停止してデータを保持します。独自の`--data`で起動した場合、停止時も同じ値が必要です。Teardownや`local-clear`は削除を伴うため、対象と保存要否を先に確認します。

端末共有方式なら、主催者が開催端末のShare画面から対象者と未使用招待の`Revoke invite`を実行し、失効を確認します。同じtailnet方式なら、開催用グループの所属や臨時許可を管理者が片づけます。ほかの用途でも使う利用者や端末を、まとめて削除しません。

開催端末を停止しただけでは、共有を取り消したことにはなりません。共有・許可の設定画面で失効を確認し、再接続できないことは補助確認にします。

次の図は、[ローカル停止・再開の設計図](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/diagrams/local-play-sequence.mmd)を基に、安全確認の区切りを足したものです。採点終了、実行環境の停止・削除、ネットワーク上の招待失効は、別々に確認します。

```mermaid
flowchart LR
  A["開催前<br/>問題と版・開催端末を選ぶ"] --> B["招待と承認<br/>アカウント・tailnetを照合"]
  B --> C["接続と権限を確認<br/>5175・自チームの演習は許可<br/>5174・不要な接続は不許可"]
  C --> D["競技開始<br/>操作と採点を確認"]
  D --> E["End Event<br/>採点を止め結果を保存"]
  E --> F["環境を停止または削除<br/>保存要否と対象を確認"]
  F --> G["共有・臨時許可を失効<br/>設定画面でも確認"]
  G --> H["残したデータと資源を確認<br/>停止だけで削除済みとしない"]
```

## なぜ、接続方法だけでなく競技用の境界を作るのか

### 出発点は「個人練習を共有」ではなく「別端末でチーム競技」

[Issue #3226](https://github.com/susumutomita/TenkaCloud/issues/3226)には、主催者のPCで大会を運営し、参加者が別端末のブラウザから自分のチームへログインする要求があります。原文の要点は「リクエストで渡された`teamId`を信用せず」です。参加者が送るチーム名を書き換えて、他チームの回答や環境へ触れないことを求めています。

同Issueには、主催者とチームの資格情報の分離、チーム別の演習環境、サーバー側の締切判定、二重加点の防止、再起動後の保存も要求されています。これは当時の要件の記録です。当時の「既存個人練習モードを維持する」という方針まで、現在の製品構成として断定するものではありません。現在の責任分担は[設計資料](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/README.md)と実装で確認します。

Tailscale対応には、さらに具体的な障害がありました。[PR #3419](https://github.com/susumutomita/TenkaCloud/pull/3419)は “accepted only RFC 1918 addresses” と説明しています。以前の`--lan`は一般的なprivate IPv4だけを受け付け、Tailscaleの共有アドレス範囲を拒否していました。このPRで100.64.0.0/10を受け付ける条件を追加しました。管理画面のloopback限定やHost/Origin検査を外して解決したわけではありません。

[Issue #3424](https://github.com/susumutomita/TenkaCloud/issues/3424)では、起動オプションだけでなく、接続・キー取得・配布の手順を文書化する要求が出ています。一方、[Issue #3422](https://github.com/susumutomita/TenkaCloud/issues/3422)にあるMagicDNS名対応は、確認版の`options.ts`にはありません。IssueがClosedでも、そこに書かれた案を実装済みとは扱いません。このため前半はIPを照合する手順です。

ここまでの資料と現在のコードから、本記事が扱う要求を整理します。これは作者の個人的な動機や開催体験を推測した説明ではありません。

```mermaid
flowchart LR
  R1["離れた端末から<br/>参加画面へ届かせたい"] --> D1["Tailscaleと開催IPへのbind<br/>公開するポートを限定"]
  R2["参加者へ管理権限を<br/>渡したくない"] --> D2["管理5174はloopback<br/>主催者キーとチームキーを分離"]
  R3["他チームの環境や<br/>得点を操作させたくない"] --> D3["認証結果からチームを選ぶ<br/>演習の所有関係を確認"]
  R4["演習から開催端末や<br/>LANへ出てほしくない"] --> D4["対応Linuxでコンテナ通信を制限<br/>条件を満たさなければ拒否"]
```

図の4つは、1つのVPN設定でまとめて満たせる要求ではありません。参加画面へ届くことと、その先で許される操作を分けて設計します。

### 攻撃を学ぶ競技では、VPNの参加者も無条件には信頼しない

信頼境界は、入力や操作をそのまま信用せず、確認してから通す境目です。脅威は、守りたいものを損なう操作や事故を指します。悪意だけでなく、URLやキーの取り違え、誤った環境の停止も含めて考えます。

現在の[論理構成図](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/diagrams/logical.mmd)と[ローカル構成図](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/diagrams/local-components.mmd)は、主催者認証、チーム認証、競技処理、保存先、実行環境を分けています。次はその責任分担を、本記事の接続方法に合わせて描き直した図です。別の箱でも、すべてが別マシンや別プロセスとは限りません。

```mermaid
flowchart TB
  P["参加者と参加端末<br/>送られる値を無条件には信用しない"]
  O["主催者<br/>開催端末とデータを管理"]
  subgraph H["開催端末：主催者の管理下"]
    PA["参加者API<br/>チーム認証と操作範囲の確認"]
    AA["管理API<br/>主催者認証"]
    C["競技処理<br/>大会時刻・所有関係・採点"]
    DB["非公開のSQLiteとキー<br/>同じBunプロセスが利用"]
    N["native問題<br/>Bun内で実行"]
    PA --> C
    AA --> C
    C --> DB
    C --> N
  end
  subgraph R["Docker問題を使う場合：対応Linuxが必要"]
    G["チームを確認する演習gateway"]
    E["演習コンテナ<br/>脆弱性を持つ教材も含む"]
    G --> E
  end
  P -->|"Tailscale経由・チームキー"| PA
  O -->|"loopback・主催者キー"| AA
  P -->|"認可された演習接続"| G
  C -->|"所有する環境を管理・検証"| E
```

順位表のように競技のルールで見せる情報と、チーム固有の秘密・回答・実行環境は区別します。ここで信頼するのは、開催端末を管理する主催者と、採用したコード・問題集です。参加者が開催端末、ソースコード、DBを自由に変更できれば、採点や秘密も変更・閲覧できてしまいます。native問題もBun内で動くため、問題コードがOSから隔離される図ではありません。

| 守りたいもの | 競技で考える失敗・脅威 | 現在の対策と残る境界 |
| --- | --- | --- |
| 主催者の管理操作 | 参加者が大会を停止したりキーを取得したりする | 管理ポートと認証を分離。参加者向けに管理画面を中継すれば、この構成の前提を失う |
| 他チームの非公開データと環境 | チームIDの書き換え、別チームの環境への接続 | 認証したチームから対象を選び、演習の所有関係を検査。漏れたチームキーの持ち主までは識別しない |
| 主催者の家庭・社内LAN | 演習からNASや別PCへ到達する | 演習コンテナ側には対応Linuxのguardが必要。参加端末全体のLAN通信は管理しない |
| 得点と公平性 | 二重送信、締切後の加点、他人の回答利用 | サーバーで採点状態を管理。ただし相談・別回線・端末外での行為を検出する仕組みではない |
| 秘密と運用費用 | キーやAWS権限の流出、環境の消し忘れ | 非公開の保存と配布、明示した終了・削除が必要。VPNは保存先や課金を管理しない |

## 通信は、どの順番で届くのか

次は開催端末をMacにしてnative問題を使うときの構成です。Mac上に、Linux専用のDocker隔離機能まで存在する図ではありません。実際のIPは載せず、開催端末のTailscale IPを「開催IP」と表します。

```mermaid
flowchart LR
  subgraph PC["参加端末"]
    B["ブラウザ<br/>HTTP"]
    PT["Tailscale"]
    B -->|"開催IP:5175宛て"| PT
  end
  subgraph WAN["インターネット上"]
    W["端末間で暗号化した通信<br/>直接または中継"]
  end
  subgraph MAC["開催用Mac：native問題の例"]
    MT["Tailscale<br/>復号する"]
    API["開催IP:5175<br/>参加者画面とAPI・HTTP"]
    N["Bunの競技処理とnative問題<br/>SQLiteへ保存"]
    OB["主催者のブラウザ"]
    AD["127.0.0.1:5174<br/>管理画面とAPI"]
    MT -->|"復号後のHTTP"| API
    API --> N
    OB -->|"端末内のHTTP"| AD
    AD --> N
  end
  PT --> W --> MT
```

APIは、画面の操作をプログラムへ伝える窓口です。Tailscaleは通信を開催端末へ運びます。届いた後、TenkaCloudがチームキーや大会の状態を確認します。

[Tailscale公式の経路説明](https://tailscale.com/docs/concepts/traffic-routing-through-tailscale)には “The traffic that bounces through our relay servers is encrypted” とあります。「中継サーバーを通る通信も暗号化される」という意味です。直接接続と中継のどちらでも、端末間の暗号化を使います。

図の暗号化区間はTailscaleの端末間です。ブラウザと各端末のTailscaleの間、開催端末で復号した後のアプリとの間まで、別途TLSを使う構成を示しているわけではありません。

ただしURLはHTTPのままです。ブラウザから見たHTTPSに変わるわけではありません。開催端末では通信内容が復号され、アプリが読み取ります。保存データ、ログ、参加端末の画面やブラウザをTailscaleが一括して守るわけではありません。

## コードで、守る場所を確かめる

以下のTenkaCloudコードへのリンクは、すべて冒頭のcommitへ固定しています。用語の説明だけで済ませず、どの条件で受け付け、どこで拒否するかを確認します。

### 待ち受けるIPを1つ選び、管理画面を分ける

待ち受け、またはbindは、プログラムが端末のどのIP・ポートで接続を受けるかを決める処理です。[options.tsのlistenAddress](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/options.ts#L253-L273)は、指定がなければ127.0.0.1を返します。`--lan`には具体的なprivate IPv4と、Tailscaleでも使う100.64.0.0/10の範囲を認めます。後者はCGNAT用の共有アドレス範囲で、「100で始まるIPなら全部よい」という条件ではありません。

拒否メッセージの一部は “not 0.0.0.0” です。0.0.0.0は、待ち受け先を特定のIPv4に絞らない指定です。本記事のLANモードでは受け付けません。さらに、HTTPを使うことに同意する`--unsafe-lan`がなければ止めます。なお、引数の形式検査と、そのIPが本当に開催端末に割り当てられていることは別です。自分のIPの照合が必要な理由です。

[server.tsの2つの起動処理](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/server.ts#L238-L257)では、参加者側に`settings.hostname`、LANモードの主催者側に127.0.0.1を渡します。このように端末内で完結する接続をloopbackと呼びます。つまり参加者の入口だけを開催IPへ出し、管理の入口を端末内に残します。public originを使う別モードには異なる分岐があるので、「TenkaCloudは常に管理画面をloopbackへ限定する」と一般化はできません。

### 接続先と、ブラウザの操作元を確認する

[http.tsのvalidOrigin](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/http.ts#L67-L77)は、Hostと、存在する場合のOriginを確認します。

```ts
if (request.headers.host !== host)
  throw new HostError(403, `Untrusted Host header. Expected ${host}.`);
if (request.headers.origin && request.headers.origin !== origin)
  throw new HostError(403, "Cross-origin requests are not allowed.");
```

Hostはリクエストの接続先名・ポート、Originはブラウザの操作元ページの通信方式・ホスト・ポートです。たとえばIPで起動したのに名前へ置き換えると、期待した値に合わず拒否される場合があります。別サイトからの操作も検査します。

これは本人認証ではありません。ブラウザ以外のプログラムはヘッダーを自分で指定できます。URLが正しいこと、接続権があること、チームキーが正しいことは別々に確認します。

### 参加者用APIとチームの範囲を分ける

[http.tsのassertRoleRoute](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/http.ts#L330-L346)は、参加者側では`/portal/`以外を拒否し、主催者側では参加者用ルートを拒否します。ルートとは、APIのURLのパスに対応する処理です。参加者側のポートに管理APIのURLを送れば管理できる、という作りにはしていません。

続いて[store.tsのauthenticateTeam](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/store.ts#L314-L329)がチームキーを確認します。

```ts
const row = this.statement("SELECT body FROM host_teams WHERE login_hash=?")
  .get(digest(key));
```

キーからハッシュという照合用の値を求め、対応するチームを探します。見つからなければ401で拒否します。この列がハッシュであることから、保存データのすべてが暗号化されているとは言えません。

[hosting-domain.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/hosting-domain.ts#L2085-L2111)では、認証できたチームの`eventId`と`teamId`で大会・演習環境を選びます。Tailscaleの利用者とTenkaCloudのチームは自動で同じものにはなりません。チームキーを持つ人はそのチームとして操作できるため、キーの配布範囲も守る必要があります。

チームを選ぶだけでなく、得点の確定もサーバーが担当します。次は[採点の設計図](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/diagrams/participant-scoring.mmd)を、ローカル開催向けに描き直したものです。

```mermaid
sequenceDiagram
  participant A as チームAのブラウザ
  participant H as TenkaCloudのAPI
  participant V as 対象問題の検証処理
  participant D as SQLite
  A->>H: チームキー・問題ID・回答を送る
  H->>H: キーから大会とチームAを決める
  Note over A,H: 本文のteamId・eventId指定は拒否
  H->>H: 大会時刻と対象問題への権限を確認
  H->>V: 所有する対象で回答を検証
  V-->>H: 検証結果またはエラー
  H->>H: 締切などの状態を再確認
  H->>D: 得点・進捗・再送用の記録を保存
  H-->>A: 確定した結果を返す
```

[hosting-domain.tsの提出処理](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/hosting-domain.ts#L2432-L2465)は、本文の`teamId`や`eventId`を拒否します。同ファイルの[加点確定処理](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/hosting-domain.ts#L2518-L2550)には、締切の再確認と、得点・進捗・再送用の記録をまとめて保存する処理があります。再送用の記録は、同じ操作の再試行を区別するためのものです。

これが必要なのは、参加者のブラウザ表示や通信到着時刻だけを採点の根拠にできないためです。ただし、これは対応する採点処理の設計とコードの説明で、あらゆる問題形式の公平性や不正検出を保証するものではありません。

### 演習gatewayは、参加画面とは別の入口になる

Docker問題では、参加者画面と実際の演習用Webアプリが別のポートを使う場合があります。[gateway-ports.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/gateway-ports.ts#L1-L25)のデフォルト範囲は5200–5239です。したがって、**すべての問題が5175だけで動くとは言えません。**

```mermaid
sequenceDiagram
  participant A as チームAのブラウザ
  participant P as 参加者API 5175
  participant G as Aの演習gateway
  participant C as Aの演習環境
  participant B as チームBのブラウザ
  A->>P: Aのチームキーで演習を開く
  P->>P: 認証結果からAの演習と権限を確認
  P-->>A: 短命な入場URL
  A->>G: ticketで入場する
  G->>G: ticketを確認して消費・セッションを作る
  A->>G: セッションを使って演習を操作
  G->>C: 認可された通信を渡す
  C-->>G: 演習の応答
  G-->>A: 演習画面
  B->>G: Aの有効なセッションなしで接続
  G-->>B: 認証を拒否
  Note over A,B: Aのキーや入場URLが漏れた場合は別の脅威
```

[gateways.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/gateways.ts)には、チームの権限を確認し、一度だけ使うticketからブラウザのセッションを作る処理があります。ticketは演習への入場券に当たる秘密の値です。URL全体を記事・スクリーンショット・チャットへ貼り付けません。すべての演習runtimeが同じgateway実装を使うという意味ではなく、ここではWeb演習用の入口を説明しています。

[PR #3448](https://github.com/susumutomita/TenkaCloud/pull/3448)は2026年10月19日にマージ済みです。確認commitの[ChallengeAccessLink.tsx](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/apps/participant-portal/src/components/ChallengeAccessLink.tsx)は、対象の入場リンクをクリックした時点で、認証したチームの情報を再取得して新しいURLを開きます。古い表示の入場券を使い続けないための処理です。この実装があることと、今回その通信を実機で確かめたことは分けて扱います。

## Docker演習の隔離と、VPNの限界

LANモードの[application.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/application.ts#L90-L113)は、loopback以外で公開すると演習にネットワーク隔離を要求します。[docker-engine.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/docker-engine.ts#L274-L302)には、隔離なしのDocker演習を`network_isolation_required`で拒否する処理があります。

隔離モードには`--competition-network`と、LAN・VPNの経路と重ならない`--docker-network-pool`の指定が必要です。ネットワークプールは、演習用に割り当てるIPの範囲です。範囲やOSのfirewall設定は環境ごとに確認する必要があるため、Mac向けの起動例へオプションだけ足して解決したことにはしません。

[linux-network-guard.tsの事前検査](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/linux-network-guard.ts#L393-L455)は、Dockerの実行環境やバージョン、ローカルdaemon、同じネットワーク名前空間などを調べます。名前空間は、OSが通信環境などを分ける仕組みです。コードの原文は “native, rootful Linux Docker Engine 28.4.x only” です。nsenterは、指定した名前空間の中で処理を実行するLinuxの道具です。firewallやnsenterを扱う権限など、これ以外の条件もあります。バージョンだけ合わせれば十分ではありません。

firewallは、通してよい通信を選ぶ仕組みです。このguardが扱うのは演習コンテナ側の境界です。参加者本人のPC全体を監視・制限する仕組みではありません。また、保存済みの非隔離Docker環境は、停止中でもLAN host起動の拒否理由になる場合があります。拒否を回避するためにデータを消さず、主催者が保存・停止・移行を計画します。

| 守る場所 | 担当するもの | それだけでは保証しないこと |
| --- | --- | --- |
| 端末間の通信と到達範囲 | Tailscale、grants / ACL | チームごとの権限、参加端末の安全性 |
| 接続先とブラウザの操作元 | bind、Host / Origin検査 | 利用者本人であること |
| 大会・チームの操作 | TenkaCloudのチームキーとAPI | 漏れたキーの悪用防止 |
| 演習コンテナの通信境界 | 対応Linuxの隔離モード | 参加者PC全体の外部通信の禁止 |

「VPNを使ったから全部安全」とは言えません。参加端末間の不要な接続を防ぎたいならTailscaleのpolicyで別途確認し、端末自体の不正利用や別回線での通信まで防げるとは扱いません。脆弱性を学ぶ演習は、許可された自チームの対象だけに行います。

次の図は、[local-network.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/local-network.ts)の所有関係に基づく通信計画と、[guardの通信規則](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/linux-network-guard.ts#L125-L310)を整理したものです。許可経路を持つ競技もあるため、他チームとの通信をすべて一律に禁止する図ではありません。

```mermaid
flowchart TB
  M["Mac / Docker Desktop<br/>rootless / remote Docker"] --> X["この隔離モードは未対応<br/>別端末向けDocker演習を拒否"]
  L["対応native Linux<br/>rootful Docker 28.4.xと必要権限"] --> G
  subgraph ISO["guardが扱う演習コンテナの通信"]
    G["起動前検査・通信規則・状態の照合"] --> C["所有する演習コンテナ"]
    C -->|"演習内で許可された通信"| DB["同じ環境のDBなど"]
    C -->|"明示した公開先だけ"| PUB["同じ大会の公開演習endpoint"]
    C -->|"問題集の宣言と主催者承認が必要"| NET["指定した外部IP・ポート"]
    C -.-> DENY["通常は通さない<br/>開催OS・家庭LAN<br/>他チームの非公開環境<br/>未承認の外部宛先"]
  end
  PC["参加者自身のPCやスマホ全体"] --> OUT["このguardの制御対象外<br/>別回線や端末上の操作も対象外"]
```

endpointは、通信を受け付ける宛先です。外部への例外は自由なURL入力ではなく、[internet-grants.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/internet-grants.ts)で、固定した問題定義の要求から主催者が選んで承認する構成です。開催OSやLANの経路との衝突も検査します。許可の追加は攻撃できる範囲も変えるため、教材に必要な宛先だけを扱います。

リポジトリの[限定された実行検証の記録](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/assets/local-network-bounded-rehearsal.json)は、入れ子のDocker実験環境で、合成したホスト・別環境への通信制限などを報告しています。同じ記録は、実LAN・VPN・ブラウザ表示・VMからの脱出を確認したとは主張していません。この記録を今回のTailscale開催の実測として扱わない理由です。

### 教材のコード、秘密、資源の上限も確認する

ネットワークを制限しても、危険な教材を無条件に動かしてよいことにはなりません。[過去のIssue #3097](https://github.com/susumutomita/TenkaCloud/issues/3097)は、Dockerの管理用socketを扱えることを大きな信頼境界として挙げています。socketはプログラム同士の接続口です。Dockerの管理口を自由に使えれば、単なる演習コンテナの権限を越える操作につながります。同Issueにあるbroker化やrootless化の案を、現在すべて導入済みとは読みません。

確認版は[docker-catalog.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/docker-catalog.ts#L65-L79)から[Composeの設定検査](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/container/compose-policy.ts)を呼びます。特権コンテナ、ホストの名前空間、絶対パスのマウントなどを拒否します。マウントは、別の場所のファイルや接続口をコンテナから使えるようにする設定です。それでも、許可された教材のコード自体が無害であることや、OS・Dockerの未知の欠陥まで防ぐことは証明できません。

秘密の保存にも別の確認があります。[files.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/files.ts#L22-L86)は、専用データディレクトリを所有者だけが使える状態にし、共有された既存ディレクトリは拒否します。これはディスクの暗号化とは違います。バックアップも含め、DBやキーを参加者へ渡しません。教材には実際の秘密鍵、AWSのキー、個人ファイルを混ぜず、チームキー・共有招待・ticket入りURLを公開しません。

[container-budget.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/container-budget.ts)には、コンテナのメモリなどの設定や起動数の上限があります。これは無制限の資源消費を避けるための処理で、開催端末全体が落ちない保証や、多人数に耐える性能測定ではありません。使う問題と人数に合わせたリハーサルが必要です。

### AWS問題へ広げる場合は、別の権限と費用の確認が要る

本記事の`make local`はAWS問題を動かす手順ではありません。[options.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/options.ts#L85-L89)も、AWS問題の実行先としてクラウド開催を要求します。Tailscaleで画面へ接続できても、AWSの権限分離は完成しません。

クラウド側の[設計資料](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/docs/architecture/README.md#storage-and-cloud-boundary)は、第三者の参加時には開催基盤と演習用のAWSアカウントを分けるよう求めています。リージョンはAWSの利用地域、IAMはAWSの操作権限を管理する仕組みです。同じアカウントで地域だけを分けても、IAMなどの共通資源は分かれません。資料には権限監査の未解決事項もあり、すべての問題が最小権限であるとは認定されていません。

[participant-aws-access.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/participant-aws-access.ts#L54-L120)には、チームと演習のアカウント・ロールを照合し、一時的な資格情報を取得する処理があります。ロールは操作権限をまとめた役割です。ただし、新しい資格情報を発行しないことと、発行済みの資格情報を即時に無効とすることは別です。大会終了だけで、発行済み権限がすべて失効するとは扱いません。[AWS公式の一時資格情報の説明](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_disable-perms.html)も、期限や権限変更・失効の操作を別に扱っています。

費用の確認も残ります。設計資料では、`make down`はAWSの演習stackを削除しません。stackは、まとめて管理するクラウド資源の集まりです。クラウドを使う場合は演習のTeardownと基盤の削除を分け、保持するデータや残る保存先も確認します。資源が残れば費用も残り得ます。利用予定と予算の確認には[AWS Budgetsの公式説明](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)も参照し、終了ボタンを押したことだけで後始末を完了したと判断しません。

## 再現するときに固定するもの

TenkaCloud本体のcommitだけを固定しても、問題集まで同じとは限りません。[catalog-sources.json](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/catalog-sources.json)のデフォルトはTenkaCloudChallengeのmainです。`make local`と`make deploy`は、設定した取得元のbranchなら取得時点の最新版を解決します。取得・検証に失敗すると起動やbuildを中止します。`make deploy`はクラウド配置の別手順で、この記事では実行しません。

取得処理の[downloaded-catalog.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/problem-pack/downloaded-catalog.ts)と、大会側の[docker-catalog.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/docker-catalog.ts)を合わせると、保存済み大会が取得時のsnapshotを使い続ける構成を確認できます。snapshotは、その時点の内容を固定して保存したものです。取得元のbranchが進んでも、既存大会の問題がそのまま自動更新されるわけではありません。

リハーサルでは本体commit、取得元の設定、解決された問題集のrevisionとsnapshotを記録します。接続、ログイン、問題操作、採点、終了、共有失効を通して確認し、実際に確認した端末・問題・条件だけを結果として残します。

## つながらないときに確認する場所

| 症状 | 次に確認すること |
| --- | --- |
| 開催端末が一覧にない | ブラウザとアプリのアカウント・tailnet、招待受諾、利用者・端末承認 |
| 端末は見えるが5175が開かない | 有効なgrants / ACL、開催IPの照合、待ち受け、OSの通信許可 |
| `Untrusted Host`などで拒否される | 起動ログどおりのIP・ポートか。名前への置き換えや共有時の別IPがないか |
| 画面は開くがログインできない | 対象大会・チームのキーか。主催者キーを使っていないか |
| Docker問題だけ開始できない | `network_isolation_required`などの診断、開催端末が隔離条件を満たすか |
| 参加画面は動くが演習が開かない | 使用中gatewayのURLとポート、許可、演習状態、ブラウザのポップアップ制限 |

開催IPが変わったときは、稼働中の大会をその場で変更せず、保守時間を決めます。同じデータ設定で停止・再起動し、新しい参加者URLを配り直して確認します。[IP変更時の公式手順](https://tenkacloud.com/docs/getting-started/#changed-host-ip)に沿って進め、IPが変わったことを理由に大会データを削除しません。

接続手順の出発点は、[TenkaCloudのTailscale初回接続ガイド](https://tenkacloud.com/docs/getting-started/#tailscale-first-connection)です。公開ガイドは更新されるため、この記事の判断根拠を読み直すときは、[同じcommitのガイド原稿](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/landing/docs/getting-started/index.html)も参照してください。
