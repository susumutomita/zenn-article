---
title: "ローカル問題のDocker環境と採点APIを作る"
free: true
---

前章で決めた参加者体験を、Docker ComposeとNode.jsの小さなアプリへ変換します。

この問題では、1つのコンテナ内で2つのHTTP serverを動かします。

- port 8080: 参加者が攻略するログイン画面
- port 8081: TenkaCloudが提出内容を判定する`/verify`

ホスト側では、どちらも`127.0.0.1`だけへ公開します。

## Dockerfileを作る

`local/Dockerfile`では、Node.jsのimageへ`app/`をコピーし、一般ユーザーで起動します。

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app
COPY app/ ./
USER node

EXPOSE 8080 8081

CMD ["node", "--experimental-sqlite", "server.mjs"]
```

この問題はNode.js内蔵のSQLiteを使うため、別のdatabase containerは必要ありません。

## Docker Composeで外部公開を制限する

`local/docker-compose.yml`を作ります。

```yaml
services:
  sqli-demo:
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      FLAG_SEED: "${FLAG_SEED:-local-dev-seed}"
    ports:
      - "127.0.0.1:18080:8080"
      - "127.0.0.1:18081:8081"
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: "2s"
      timeout: "3s"
      retries: 20
    restart: "no"
```

意図的に脆弱な教材を`0.0.0.0:18080`へ公開してはいけません。ホスト側のbind先を`127.0.0.1`に固定し、同じPCの外からアクセスできないようにします。

TenkaCloudは、起動時にランダムな`FLAG_SEED`を生成して環境変数へ渡します。Compose fileの`local-dev-seed`は、TenkaCloudを介さずComposeだけを確認するときのデフォルト値です。

## 実行ごとのflagを作る

`local/app/server.mjs`では、`FLAG_SEED`からflagと管理者パスワードを導出します。

```js
import { createHash } from "node:crypto";

const flagSeed = process.env.FLAG_SEED ?? "local-dev-seed";
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

const flag = `TC{sqli_${sha256(`flag:${flagSeed}`).slice(0, 20)}}`;
const adminPassword = sha256(`pw:${flagSeed}`);
```

flagをソースコードへ固定しないため、リポジトリを読んでも実行中の答えは分かりません。問題を起動するたびに値が変わります。

## 攻略対象のログイン画面を作る

SQLiteへ`admin`と`guest`を登録し、ログイン処理を用意します。

教材では、入力をSQL文へ直接連結する実装を意図的に置きます。

```js
function authenticate(username, password) {
  const sql =
    `SELECT username, role FROM users ` +
    `WHERE username = '${username}' AND password = '${password}'`;

  try {
    return db.prepare(sql).get();
  } catch {
    return undefined;
  }
}
```

これは本番コードの例ではありません。参加者が入力処理の危険性を発見するための、ループバック限定の教材です。

ログインに成功し、取得したrowのroleが`admin`ならflagを返します。

```js
if (row && row.role === "admin") {
  return send(
    response,
    200,
    "application/json",
    JSON.stringify({
      ok: true,
      flag,
    }),
  );
}
```

## /verifyを作る

2つ目のHTTP serverは、`POST /verify`だけを受け付けます。

```js
const verify = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/verify") {
    return send(
      response,
      404,
      "application/json",
      JSON.stringify({ error: "not_found" }),
    );
  }

  const raw = await readBody(request);
  let submission = "";

  try {
    submission = String(JSON.parse(raw).submission ?? "");
  } catch {
    submission = "";
  }

  const correct = submission.trim() === flag;
  return send(
    response,
    200,
    "application/json",
    JSON.stringify({
      correct,
      message: correct
        ? "Flag accepted."
        : "That is not the flag for this challenge.",
    }),
  );
});
```

不正解時に、期待したflagや比較結果の詳細を返してはいけません。参加者が推測に使えない結果だけを返します。

## 完成した問題をParticipant Portalで動かす

問題を作成するリポジトリと、参加者が問題を解く画面を動かすリポジトリは別です。

| リポジトリ | この章での役割 |
| --- | --- |
| TenkaCloudChallenge | `sqli-demo`の問題文、Docker環境、採点方法を作成して検証する |
| TenkaCloud | Participant Portal、ローカル採点API、問題コンテナを起動する |

ここまで編集してきたTenkaCloudChallengeで、問題カタログの完了条件を実行します。

```bash
make agent-gate
```

Git、Make、Bun 1.3.11、Docker EngineとComposeを用意します。次に、TenkaCloudChallengeとは別のディレクトリへTenkaCloudを取得します。

```bash
cd ..
git clone https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make install
make local
```

`make local`は、`catalog-sources.json`のURLと`ref`から起動前に問題カタログを取得します。デフォルトはTenkaCloudChallengeの`main`です。取得にはネットワーク接続が必要で、失敗すると起動を中止します。`problems/`は取得内容から生成するbuild用のビューで、Git submoduleではありません。保存済みのイベントは、取得時の不変snapshotを使い続けます。

自分の作問用branchを試す場合は、TenkaCloud側の`catalog-sources.json`のURLと`ref`を、そのリポジトリとbranchへ変更します。`make deploy`も同じ選択を使います。設定と取得処理は、[catalog-sources.json](https://github.com/susumutomita/TenkaCloud/blob/main/catalog-sources.json)と[downloaded-catalog.ts](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/problem-pack/downloaded-catalog.ts)で確認できます。

本書で作った`sqli-demo`の完成形は、すでにTenkaCloudChallengeの`main`へ公開されています。TenkaCloud側で作問用branchを作る必要はありません。

`make local`を実行すると、主催者用と参加者用の画面が起動します。対話できるターミナルで起動すると、主催者キーが一度だけ表示されます。表示された主催者用のURLを開き、このキーでログインします。

デフォルトの主催者URLは`http://127.0.0.1:5174`、参加者URLは`http://127.0.0.1:5175`です。この2つは、TenkaCloudを動かしたPCから開きます。参加者が別の端末を使う場合は、信頼できる隔離ネットワーク上で、hostに割り当て済みのIPv4を指定します。

```bash
make local LOCAL_ARGS="--lan 100.96.12.34 --unsafe-lan"
```

`100.96.12.34`は説明用なので、実際のhostのIPへ置き換えてください。Tailscaleの`100.64.0.0/10`内のIPv4も指定できます。主催者はhost上の`http://127.0.0.1:5174`を使い、参加者へは`http://100.96.12.34:5175`と、そのチームのキーを渡します。主催者キーは渡しません。参加者の端末で`127.0.0.1`を開いても、hostには接続できません。

この指定はHTTPで待ち受けます。上のLAN起動では、Dockerを使わないnative問題（例: Crypto Battle）を利用できます。DockerやCompose問題の開始・再開・復旧は、専用の隔離モードがないと`network_isolation_required`で拒否します。MacやDocker Desktopはこのモードに未対応です。本章の`sqli-demo`は、まず同じPCのloopbackで実行してください。loopback演習には、専用guardによる隔離の保証はありません。

別端末からDocker問題を使うには、対応するnative Linuxで`--competition-network`を指定します。LANやVPNの経路と重ならないpoolを`--docker-network-pool`で明示します。Docker 28.4.xとrootfulのローカルdaemonが必要です。firewallやnsenterの権限なども確認します。[guardの前提](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/linux-network-guard.ts)を確認してください。LANの待受指定だけでfirewallやVPNの設定を自動変更することはありません。

非隔離のDocker unitが保存されている場合は、停止状態でもLAN hostの起動をlistener開始前に拒否します。既存のjobやunitを自動停止・移行することはありません。主催者と保守時間を決め、元のloopback hostで必要なデータを保存して対象環境を停止・削除してから、隔離環境を新規作成します。稼働中のhostをそのまま更新・再起動しないでください。

この制約は演習コンテナの境界です。Tailscale接続だけで参加者の端末全体の通信や端末間アクセスを制限することはありません。HTTPS構成、VMからの実通信、多人数での競技開催は、この手順で検証済みとは扱いません。

初回はbuildを省略しません。同じコードと選択カタログでbuild済みの場合だけ、`LOCAL_ARGS`へ`--no-build`を追加できます。buildがない場合やカタログが一致しない場合は起動を拒否するため、次の起動でこの指定を外してbuildします。

HTTPの応答は、次のコマンドで確認できます。別端末の例のIPは実際のhostのIPへ置き換えます。

```bash
# host上で実行
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://127.0.0.1:5174/
# 参加者の端末で実行
curl --fail --silent --output /dev/null --write-out '%{http_code}\n' http://100.96.12.34:5175/
```

どちらも`200`を確認してから、ブラウザでログイン画面を開きます。応答がない場合は、起動ログのURL、指定IPがhostにあること、端末間の既存の接続経路を確認します。HTTPの応答だけでは、ログイン、採点、Docker問題への接続は確認できません。

待受アドレスの実装は[options.ts](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/options.ts)、[server.ts](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/server.ts)、[LANのengine構成](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/application.ts)、[Dockerの拒否条件](https://github.com/susumutomita/TenkaCloud/blob/main/scripts/local-host/docker-engine.ts)で確認できます。TenkaCloudのルートで次を実行すると、待受とoriginの制約、隔離なしのLAN演習の拒否、取得失敗、snapshotとbuildの整合性の回帰テストを確認できます。実機のネットワーク隔離を証明するテストではありません。

```bash
make catalog-download catalog-prepare
bun test scripts/local-host/tests/public-mode.test.ts scripts/local-host/tests/catalog-startup.test.ts scripts/local-host/tests/lan-isolation.test.ts
```

以降の`sqli-demo`は、デフォルトの`make local`で起動したloopback hostを使います。参加者URLは`http://127.0.0.1:5175`です。LAN hostが起動中なら、停止・再開を主催者と調整してから切り替えてください。

主催者としてイベントとチームを作り、`sqli-demo`を選びます。「スケジュール」タブで問題環境を準備し、イベントを開始します。次に、参加者URLとチームキーで参加者としてログインし、「起動・再開」で問題環境を起動します。`Web` endpointからログイン画面へ進みます。

確認する流れは次のとおりです。

1. `Web` endpointでログイン画面が開く
2. 攻略に成功すると実行ごとのflagが表示される
3. Participant Portalへflagを提出する
4. 提出内容がそのチームの問題環境の`/verify`へ渡る
5. 正解すると得点が記録される

終了するときは、TenkaCloudのルートで次を実行します。

```bash
make down
```

コンテナだけを手作業で停止せず、`make down`を使います。`make down`は、主催者画面、参加者画面、採点処理と、TenkaCloudが起動したDocker環境を停止します。イベント、得点、キー、コンテナの書き込み領域、volumeは残ります。プロセスのメモリーの内容は残りません。再開するときは、同じデータディレクトリで`make local`を実行し、参加者が「起動・再開」を押します。

データの消去と主催者キーの再発行には、`make down`とは別のコマンドを使います。

- `make local-clear`は、確認のあとで、イベントの履歴とTenkaCloudが作ったDocker問題のデータを削除します。主催者キーと設定は残ります。先に`make down`で停止してから実行します。
- `make local-reset`は、主催者キーを再発行し、古いキーとログインを無効にします。イベント、得点、参加者のキー、問題のデータは残ります。起動中に実行する場合は、別の対話できるターミナルから、同じデータディレクトリを指定して実行します。

対話できるターミナルで`make local`を起動したときも、毎回新しい主催者キーが発行され、古いキーは無効になります。対話できない環境や、公開用・コンテナ用の設定で起動した場合は、既存のキーを使い続け、キーをログに出しません。

## 実装結果を確認する

本章で作ったファイルは、次の場所で確認できます。

- [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/metadata.json)
- [Dockerfile](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/Dockerfile)
- [docker-compose.yml](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/docker-compose.yml)
- [server.mjs](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/app/server.mjs)

これで、1問目のローカルChallengeが完成しました。問題文、Docker環境、`/verify`、Participant Portalへの提出を1つの流れとして作れました。

次章からは2問目へ進みます。AWS Challengeの`hello-world`について、参加者の学び、ストーリー、勝利条件、安全境界を新しく設計します。
