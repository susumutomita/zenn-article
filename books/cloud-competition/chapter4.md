---
title: "最初のローカル問題を置く場所を作る"
free: true
---

ここから、前章で設計した`sqli-demo`をTenkaCloudChallengeへ実装します。本章ではリポジトリを準備し、ローカル問題に必要なディレクトリを作ります。

## リポジトリを準備する

```bash
git clone https://github.com/susumutomita/TenkaCloudChallenge.git
cd TenkaCloudChallenge
make install
```

`make install`は、このリポジトリが定めた依存関係の導入コマンドです。

問題を編集する前に、リポジトリ直下の`AGENTS.md`を読みます。

```bash
less AGENTS.md
```

`AGENTS.md`には、人間とAIが共通で読む問題作者向けの契約が書かれています。ローカル問題では、特に次を確認します。

- `metadata.json`が`SCHEMA.json`に一致する
- `runtime.entry`が実在するCompose fileを指す
- 攻略対象と採点用`/verify`を分離する
- 公開portをloopbackへ限定する
- 実行ごとの秘密値からflagを作る
- READMEの日本語版と英語版を用意する

## ローカルChallengeのディレクトリ

Challengeは`challenges/`へ置きます。`sqli-demo`には、次のファイルを作ります。

```text
challenges/sqli-demo/
├── metadata.json
├── README.md
├── README.ja.md
└── local/
    ├── Dockerfile
    ├── docker-compose.yml
    └── app/
        └── server.mjs
```

各ファイルの役割は次のとおりです。

| ファイル | 役割 |
| --- | --- |
| `metadata.json` | 問題文、Dockerの起動情報、採点、ヒント |
| `local/docker-compose.yml` | コンテナ、環境変数、port、health check |
| `local/Dockerfile` | 問題アプリのimage |
| `local/app/server.mjs` | 攻略対象のWeb画面と採点用`/verify` |
| `README.md` | 問題作者と利用者向けの英語説明 |
| `README.ja.md` | READMEの日本語版 |

AWS問題で使う`template.yaml`は、まだ作りません。ローカル問題の環境は、DockerfileとCompose fileが担当します。

## 空のディレクトリから始める

本書では、完成済みの`sqli-demo`を複製して説明するのではなく、前章の設計から必要なファイルを順に作ります。

最初に、問題を置くディレクトリを作ります。

```bash
mkdir -p challenges/sqli-demo/local/app
```

次章で`metadata.json`、その次の章でDockerfile、Compose file、`server.mjs`を作ります。READMEは、実装した環境、採点、安全境界が確定してから仕上げます。

完成結果は、次のディレクトリと同じ構成になります。

[sqli-demoの完成形](https://github.com/susumutomita/TenkaCloudChallenge/tree/main/challenges/sqli-demo)

## AIコーディングエージェントを使う場合

専用スキルや専用コマンドは必要ありません。TenkaCloudChallengeのルートをAIコーディングエージェントで開き、`AGENTS.md`を読ませたうえで、通常の言葉で依頼します。

```text
AGENTS.mdの問題作成契約に従って、ローカルChallengeの土台を作ってください。
題材はSQL Injection、採点はverify、問題IDはsqli-demoです。
```

参加者に持ち帰ってほしいこと、最初の一手、成功条件は、前章までに決めた内容を渡します。AIは`AGENTS.md`と近い既存問題を読んでファイルを組み立てますが、競技の内容を代わりに決めるものではありません。本書では、各項目の意味が分かるようにファイルを1つずつ説明します。

次章では、設計したストーリー、勝利条件、安全境界を`metadata.json`へ記述します。
