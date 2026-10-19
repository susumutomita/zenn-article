---
title: "TenkaCloudとTailscaleで、離れた場所から競技に参加する"
emoji: "🏯"
type: "tech"
topics: ["tenkacloud", "tailscale", "security", "network"]
published: false
---

## 何ができるのか

[TenkaCloud](https://github.com/susumutomita/TenkaCloud)は、問題を選び、大会とチームを作り、参加者の操作や得点を管理する競技用のソフトウェアです。主催者が用意した1台を、離れた場所の参加者がブラウザから使う構成を考えます。インターネット全体に参加画面を公開せず、Tailscaleを使って、招待した人からの接続を受け付けます。

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
4. 参加者の端末一覧に、主催者の伝えた開催端末を確認できるか確認します。共有は受諾した本人向けです。参加者側のtailnetにいる全員が自動的に使えるわけではありません。

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

## 通信は、どの順番で届くのか

次はnative問題を使うときの構成です。実際のIPは載せず、開催端末のTailscale IPを「開催IP」と表します。

```mermaid
flowchart LR
  P["参加端末のブラウザ"]
  T["Tailscaleの端末間暗号化<br/>アクセス制御"]
  U["開催IP:5175<br/>参加者画面とAPI"]
  K["チームキーの確認<br/>大会とチームの範囲で処理"]
  N["native問題と得点"]
  H["開催端末のブラウザ"]
  A["127.0.0.1:5174<br/>主催者画面とAPI"]
  P --> T --> U --> K --> N
  H --> A
```

APIは、画面の操作をプログラムへ伝える窓口です。Tailscaleは通信を開催端末へ運びます。届いた後、TenkaCloudがチームキーや大会の状態を確認します。

[Tailscale公式の経路説明](https://tailscale.com/docs/concepts/traffic-routing-through-tailscale)には “The traffic that bounces through our relay servers is encrypted” とあります。「中継サーバーを通る通信も暗号化される」という意味です。直接接続と中継のどちらでも、端末間の暗号化を使います。

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

### 演習gatewayは、参加画面とは別の入口になる

Docker問題では、参加者画面と実際の演習用Webアプリが別のポートを使う場合があります。[gateway-ports.ts](https://github.com/susumutomita/TenkaCloud/blob/d1c77b00f5b7eefc99021741a78ae23ecd9031ab/scripts/local-host/gateway-ports.ts#L1-L25)のデフォルト範囲は5200–5239です。したがって、**すべての問題が5175だけで動くとは言えません。**

```mermaid
sequenceDiagram
  participant B as 参加者ブラウザ
  participant P as 参加者API 5175
  participant G as 演習gateway
  participant C as 自チームの演習環境
  B->>P: チームキーで認証して演習を開く
  P-->>B: 演習へ入るための短命なURL
  B->>G: URLで接続する
  G->>G: ticketとチームの権限を確認
  G->>C: 許可された通信を渡す
  C-->>B: gateway経由で演習画面を返す
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
