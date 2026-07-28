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

## TenkaCloudのチェックアウトで動かす

ローカルモードはTenkaCloud本体のParticipant Portalと採点APIを使います。問題カタログは、TenkaCloudリポジトリの`problems/` submoduleとして読み込まれます。

最初にTenkaCloudを準備します。

```bash
git clone https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make local-onboard
```

問題を作るときは、`problems/`の中でTenkaCloudChallengeのbranchを作ります。

```bash
cd problems
git checkout -b feat/my-local-problem
```

本章の構成で問題ファイルを作成したら、問題カタログの完了条件を実行します。

```bash
make install
make agent-gate
```

TenkaCloudのルートへ戻り、問題IDを指定してローカルモードを起動します。

```bash
cd ..
make local PROBLEM=sqli-demo
```

`make local`は、ローカル採点API、Participant Portal、指定した問題コンテナをつなぎます。ブラウザでParticipant Portalを開き、`Web` endpointからログイン画面へ進みます。

確認する流れは次のとおりです。

1. `Web` endpointでログイン画面が開く
2. 攻略に成功すると実行ごとのflagが表示される
3. Participant Portalへflagを提出する
4. 提出内容が`127.0.0.1:18081/verify`へ渡る
5. 正解すると得点が記録される

終了するときは、TenkaCloudのルートで次を実行します。

```bash
make local-down
```

コンテナだけを手作業で停止せず、ローカル採点API、Portalの設定、保存された進捗をTenkaCloudの終了手順で片付けます。

## 実装結果を確認する

本章で作ったファイルは、次の場所で確認できます。

- [metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/metadata.json)
- [Dockerfile](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/Dockerfile)
- [docker-compose.yml](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/docker-compose.yml)
- [server.mjs](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/sqli-demo/local/app/server.mjs)

これで、1問目のローカルChallengeが完成しました。問題文、Docker環境、`/verify`、Participant Portalへの提出を1つの流れとして作れました。

次章からは2問目へ進みます。AWS Challengeの`hello-world`について、参加者の学び、ストーリー、勝利条件、安全境界を新しく設計します。
