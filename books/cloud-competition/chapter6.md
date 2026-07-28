---
title: "metadata.jsonで問題を説明する"
free: true
---

`template.yaml`がAWS環境を作るのに対し、`metadata.json`はその環境をTenkaCloud上の問題として成立させます。

カタログカード、問題詳細、学習目標、採点、endpoint、ヒント、妨害、専用UIの接続先は、原則としてmetadataから宣言します。

## 最小のmetadataを作る

まず採点なしのChallengeとして、表示とデプロイだけを成立させます。`challenges/cloud-rescue/metadata.json`を次の内容にします。

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "cloud-rescue",
  "name": "Cloud Rescue — 停止したWebを復旧せよ",
  "category": "Challenge",
  "status": "draft",
  "visibility": "public",
  "difficulty": 2,
  "estimatedDuration": "30〜45分",
  "shortDescription": "公開直前のWebページが停止した。SSMでサーバーへ接続し、状態とログから原因を特定して復旧する。",
  "instructions": "## 状況\n顧客向けWebページが応答しません。APIは動いているようです。\n\n## ゴール\nfrontend `/` をHTTP 200へ復旧してください。\n\n## 制約\n新しいEC2を作らず、既存の問題環境を修正してください。",
  "description": "EC2上のnginxとPython APIで構成された小さなWeb stackを調査するChallengeです。参加者はSSM Session Managerで接続し、systemdとログからfrontend停止の原因を特定します。",
  "tags": [
    "aws",
    "ec2",
    "ssm",
    "linux",
    "incident-response"
  ],
  "exposedPorts": [
    {
      "port": 80,
      "name": "frontend"
    },
    {
      "port": 8080,
      "name": "api"
    }
  ],
  "learningGoals": [
    "SSM Session ManagerでSSH鍵を使わずEC2へ接続する",
    "systemctlとjournalctlでサービス状態とログを確認する",
    "外形監視の失敗から対象サービスを特定して復旧する"
  ],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {},
  "i18n": {
    "en": {
      "name": "Cloud Rescue — Recover the Stopped Web Service",
      "shortDescription": "The customer-facing web page stopped before release. Connect through SSM, inspect service state and logs, and recover it.",
      "instructions": "## Situation\nThe customer-facing web page is unavailable while the API still appears healthy.\n\n## Goal\nRestore frontend `/` to HTTP 200.\n\n## Constraint\nRepair the existing environment instead of creating a replacement EC2 instance.",
      "description": "A self-paced incident-response challenge using a small EC2 web stack with nginx and a Python API.",
      "learningGoals": [
        "Connect to EC2 through SSM Session Manager without an SSH key",
        "Inspect service state and logs with systemctl and journalctl",
        "Use failed external checks to identify and recover the affected service"
      ]
    }
  }
}
```

この段階では`status`を`draft`にします。実AWSでのデプロイ、解答、採点、削除が終わるまで`ready`へ変更しません。

## 主要フィールド

### id

ディレクトリ名と一致させます。

```text
challenges/cloud-rescue/
metadata.json: "id": "cloud-rescue"
```

IDは内部参照で使うため、表示名ほど頻繁に変更しません。

### category

`Challenge`または`Battle`を指定します。単に時間制限の有無ではなく、採点の性質で選びます。

- `Challenge`: flagや回答による完了型
- `Battle`: endpointの状態などによる継続型

### statusとvisibility

- `draft`: 開発中
- `ready`: 開催に使える
- `deprecated`: 新規利用を推奨しない

`visibility`は公開カタログで扱うか、内部用途として扱うかを示します。秘密の解法や社内構成を含む問題は、公開カタログへ入れずProblem Packで配布する方が安全です。

### difficultyとestimatedDuration

難易度は技術の高度さだけで決めません。

- 観察対象の数
- 事前知識
- 原因候補の広さ
- ヒントなしでの到達可能性
- 操作ミスからの復旧難易度

初見者テストの実測時間を使い、作者の解答時間だけで決めないようにします。

### shortDescription、instructions、description

役割を分けます。

- `shortDescription`: カタログで興味を持たせる
- `instructions`: 競技中に必要な状況、ゴール、制約
- `description`: 背景、構成、学習内容を詳しく説明する

問題文に正解手順を書きすぎないことも重要です。具体的なコマンドはヒントへ分けます。

### learningGoals

第2章で作った行動目標を、そのまま短くします。

「EC2を学ぶ」ではなく、「SSMで接続する」「systemdとログから停止を特定する」のように観察できる形にします。

## 日本語と英語

TenkaCloudChallengeでは、トップレベルを日本語、`i18n.en`を英語として管理します。英語版を機械的な直訳にせず、状況、ゴール、制約が同じ意味になることを確認します。

READMEも英語版`README.md`と日本語版`README.ja.md`を用意します。

## knowledge graphは必要になってから使う

metadataには、学習目標、概念、評価基準、誤解、対象者をnodeとして宣言し、問題間の依存関係を表す仕組みもあります。

ただし、単独問題の初版で無理に追加する必要はありません。まず`learningGoals`とREADMEを正しく書きます。複数問題を体系的なカリキュラムに並べる段階で、`track`、`nodes`、`relations`を追加します。

## 検証する

保存後は必ず実行します。

```bash
bun run validate
```

JSONが正しくても、ID、参照、生成indexが不整合なら検証で失敗します。エラーメッセージを上から1つずつ直し、検証を無効化して通すことはしません。

次章では、Challengeの完了条件として、デプロイごとに変わるflagと自動採点を追加します。
