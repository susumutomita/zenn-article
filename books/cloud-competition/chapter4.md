---
title: "問題を置く場所と作成手順を知る"
free: true
---

ここから、前章で設計した競技をTenkaCloudChallengeへ実装します。コードを書く前に、問題をどこへ置き、どのファイルが何を担当するのかを確認します。

## リポジトリを準備する

```bash
git clone https://github.com/susumutomita/TenkaCloudChallenge.git
cd TenkaCloudChallenge
make install
```

`make install`は、このリポジトリが定めた依存関係の導入コマンドです。

問題を編集する前に、リポジトリ直下の`AGENT.md`を読みます。

```bash
less AGENT.md
```

`AGENT.md`には、問題作者の守る契約が書かれています。次の項目は、見た目の好みではなくTenkaCloudとの接続条件です。

- `metadata.json`が`SCHEMA.json`に一致する
- `metadata.json`から参照するCloudFormation Outputが存在する
- `ParticipantViewerRole`へ必須の認証権限を付ける
- EC2関連リソースへ`TenkaCloud:NamePrefix`タグを付ける
- Challengeの点数とヒント減点を規定へ合わせる
- Battleでは、参加者の操作前から自動加点しない

## 1問のディレクトリ

Challengeは`challenges/`、Battleは`battles/`へ置きます。

```text
challenges/hello-world/
├── metadata.json
├── template.yaml
├── README.md
├── README.ja.md
└── diagram.svg

battles/hello-world-battle/
├── metadata.json
├── template.yaml
├── README.md
├── README.ja.md
└── diagram.svg
```

各ファイルの役割は次のとおりです。

| ファイル | 役割 |
| --- | --- |
| `metadata.json` | カタログ表示、問題文、採点、ヒント、endpoint、障害 |
| `template.yaml` | チームのAWSアカウントへ作るCloudFormation stack |
| `README.md` | 問題作者と利用者向けの英語説明 |
| `README.ja.md` | READMEの日本語版 |
| `diagram.svg` | Participant Portalへ表示する構成図 |

AWS問題に必要なのは`metadata.json`、`template.yaml`、2つのREADMEです。`diagram.svg`は、複数リソースの関係をParticipant Portalで見せるために追加します。

## Claude Codeで新しい問題を作る

TenkaCloudChallengeには、Claude Code用の`new-problem`スキルがあります。

人間向けの使い方は、次のファイルにあります。

```text
.claude/skills/new-problem/README.md
```

Claude Codeが読む作成手順は、次のファイルです。

```text
.claude/skills/new-problem/SKILL.md
```

Challengeを作る場合は、Claude Codeで次のように入力します。

```text
/new-problem challenge
```

Battleを作る場合は、次のように入力します。

```text
/new-problem battle
```

引数を省略すると、ChallengeかBattleかを聞かれます。その後、slug、題材、難易度、想定時間、採点方式を答えます。

このスキルは、新しい題材から問題を作るときに使います。カテゴリを選んだ後も、題材、参加者に持ち帰ってほしいこと、ストーリー、採点方式を自分で決める必要があります。スキルは競技の内容を代わりに決めるものではなく、決めた内容をリポジトリの形式へ変換する補助です。

## Claude Codeを使わない場合

手動で新しい問題を作る場合は、近い完成例を複製します。

```bash
cp -R challenges/hello-world challenges/<新しいslug>
cp -R battles/hello-world-battle battles/<新しいslug>
```

その後、`id`、表示文、AWSリソース、採点、Output、READMEを自分の題材へ変更します。ChallengeとBattleを同時に作る必要はありません。学習目標に合う形式を1つ選び、1問を1つのPull Requestで追加します。

本書では、前章までに決めた設計から`hello-world`と`hello-world-battle`を一から組み立てます。完成後に別の題材へ発展させるとき、ここで説明したスキルとstarterを使います。

次章では、`hello-world`の参加者体験をAWS上に作るため、`template.yaml`を書きます。
