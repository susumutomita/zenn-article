---
title: "TenkaCloudの問題開発環境を準備する"
free: true
---

TenkaCloudの問題は、プラットフォーム本体とは別の[TenkaCloudChallenge](https://github.com/susumutomita/TenkaCloudChallenge)で管理します。

この分離は重要です。問題を一つ追加するたびにTenkaCloud本体へ個別ロジックを足すと、問題数に比例してプラットフォームが複雑になります。TenkaCloudでは、問題側が必要な情報を宣言し、プラットフォームは汎用的にデプロイ、表示、採点します。

## 開発環境を取得する

Bun、Git、Dockerを利用します。AWSへデプロイする段階までは、AWS資格情報がなくても問題ファイルの作成と検証ができます。

```bash
git clone https://github.com/susumutomita/TenkaCloudChallenge.git
cd TenkaCloudChallenge
bun install
bun run setup
bun run validate
```

最初の`bun run validate`が成功することを確認してください。既存問題で失敗する状態のまま新しい問題を追加すると、自分の変更が原因か切り分けられません。

## 1問題1ディレクトリ

公開カタログは、次のような構造です。

```text
TenkaCloudChallenge/
├── battles/
│   └── <problem-id>/
│       ├── metadata.json
│       ├── template.yaml
│       ├── README.md
│       ├── README.ja.md
│       ├── portal/
│       └── services/
├── challenges/
│   └── <problem-id>/
│       ├── metadata.json
│       ├── template.yaml
│       ├── README.md
│       └── README.ja.md
├── SCHEMA.json
└── scripts/
```

役割は次のとおりです。

| ファイル | 必須 | 役割 |
| --- | --- | --- |
| `metadata.json` | 必須 | カタログ表示、採点、endpoint、ヒント、妨害などの宣言 |
| `template.yaml` | 必須 | チームのAWSアカウントへデプロイするCloudFormation |
| `README.md` | 必須 | 英語版のストーリー、解法、学習目標 |
| `README.ja.md` | 必須 | 日本語版 |
| `portal/` | 任意 | 問題固有のParticipant Portal UI |
| `services/` | 任意 | Lambdaやコンテナなど、問題固有の実装 |
| `simulation.json` | 任意 | IaCやmetadataだけでは表せないSimulator要件 |

最初から`portal/`や`services/`を作る必要はありません。汎用UIとCloudFormationだけで成立する問題は、その方が保守しやすくなります。

## 動くサンプルを複製する

ゼロから空ファイルを作るのではなく、検証を通る既存サンプルから始めます。

### Challengeの雛形

```bash
bun run new challenges cloud-rescue --from hello-world
```

### Battleの雛形

```bash
bun run new battles cloud-rescue-battle --from hello-world-battle
```

コマンド実行後、次を確認します。

```bash
bun run validate
```

この時点では内容が元サンプルのままでも構いません。まず「新しいディレクトリが作られ、schemaと参照関係の検証を通る」という開始地点を確保します。

## 問題IDを決める

問題IDは小文字のkebab-caseにします。ディレクトリ名と`metadata.json`の`id`を一致させます。

本書では次を使います。

- Challenge: `cloud-rescue`
- Battle: `cloud-rescue-battle`

IDはCloudFormation stack名や内部参照にも使われます。公開後の変更は移行コストが高いため、表示名より慎重に決めます。

## 編集の順序

問題を次の順で編集すると、途中でも壊れた場所を見つけやすくなります。

1. `metadata.json`のID、表示名、説明だけを変更する
2. `bun run validate`を実行する
3. `template.yaml`を正常な状態でデプロイできる構成にする
4. 壊す箇所を一つ追加する
5. 採点を設定する
6. ヒントとREADMEを書く
7. 実AWSでデプロイ、解答、削除を確認する
8. Battle化、妨害、専用UIは最後に追加する

完成形を一度に書くと、CloudFormation、IAM、metadata、採点のどこが原因か分からなくなります。

## ローカルでできることとできないこと

`bun run validate`では、主に次を検査できます。

- `metadata.json`がJSON Schemaに適合するか
- IDとディレクトリ名が一致するか
- endpointやportal slotなどの参照が存在するか
- カタログindexがmetadataと整合するか
- 問題間の学習依存に循環がないか

一方、次は実AWS環境が必要です。

- CloudFormationが対象リージョンで作成できるか
- IAM権限がAWS ConsoleやCLIの実挙動に足りるか
- UserDataが最後まで成功するか
- 採点側から公開endpointへ到達できるか
- stack削除後にリソースが残らないか

ローカル検証に通ったことを、実機確認済みと扱わないようにします。

## 変更ごとの確認

問題作者の基本ループは短く保ちます。

```text
編集
  ↓
bun run validate
  ↓
差分を読む
  ↓
必要なら実AWSへデプロイ
  ↓
参加者として解く
  ↓
削除する
```

次章では、`template.yaml`を読み、競技用のAWS環境を安全に作ります。
