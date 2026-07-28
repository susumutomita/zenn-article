---
title: "metadata.jsonで問題文と採点を定義する"
free: true
---

TenkaCloudChallengeの問題定義は`metadata.json`です。YAMLではありません。このJSONをTenkaCloudが読み、Participant Portalの問題文、CloudFormationへの入力、採点方法、ヒントを組み立てます。

## 最小構成を読む

Cloud Rescueで使う主な項目を1つにまとめると、次の形になります。

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "cloud-rescue",
  "name": "Cloud Rescue",
  "category": "Challenge",
  "status": "draft",
  "visibility": "public",
  "difficulty": 2,
  "estimatedDuration": "30 分",
  "shortDescription": "frontendが応答しない原因を調査して復旧します。",
  "instructions": "症状を比較し、SSMで接続して停止serviceを復旧してください。",
  "description": "systemdとjournalを使う障害対応Challengeです。",
  "tags": ["challenge", "incident-response", "ec2", "nginx"],
  "exposedPorts": [
    { "port": 80, "name": "frontend (nginx)" },
    { "port": 8080, "name": "api (Python)" }
  ],
  "learningGoals": [
    "frontendとAPIの症状差から原因範囲を絞る",
    "SSMでEC2へ接続し、停止serviceを復旧する"
  ],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  },
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "RecoveryFlag",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": []
  }
}
```

`$schema`を指定すると、エディター上でも`SCHEMA.json`に基づく補完と検査を利用できます。

## 問題を識別する項目

| 項目 | 内容 |
| --- | --- |
| `id` | ディレクトリ名と一致するkebab-caseのID |
| `name` | Participant Portalに表示する名前 |
| `category` | `Challenge`または`Battle` |
| `status` | 開発中は`draft`、公開可能なら`ready` |
| `visibility` | 公開カタログなら`public` |
| `difficulty` | 数値で表す難易度 |
| `estimatedDuration` | 参加者向けの想定時間 |

Cloud Rescueのディレクトリが`challenges/cloud-rescue/`なら、`id`も`cloud-rescue`、`category`も`Challenge`にします。

## Participant Portalへ表示する項目

`shortDescription`は一覧表示、`instructions`は参加者が最初に読む手順、`description`は問題の詳しい説明です。

原因そのものは書かず、観測できる症状とゴールを書きます。

```markdown
## 症状
- frontendは応答しない
- APIの`/healthz`はHTTP 200を返す

## ゴール
既存のEC2を作り直さず、停止serviceを調査して復旧する。
```

`learningGoals`にはAWSサービス名を並べず、参加者が実行する判断と操作を書きます。

## template.yamlへ値を渡す

```json
{
  "cfnTemplate": "template.yaml",
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

`cfnTemplate`は同じ問題ディレクトリのCloudFormation templateを指します。`cfnParameters`の各キーは、`template.yaml`の`Parameters`に存在しなければなりません。

`__RANDOM_PASSWORD__`はデプロイ時に生成される値です。固定flagをGitへ保存せず、チームのデプロイごとに異なる`FlagSeed`を渡します。

## CloudFormation Outputを採点へつなぐ

```json
{
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "RecoveryFlag",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": []
  }
}
```

`kind: "flag"`は、参加者が文字列を提出するChallengeです。`flagOutputKey`の`RecoveryFlag`は、`template.yaml`の`Outputs`にある同名のキーを参照します。

この名前が一致しないと、環境を作成できても正解を取得できません。

```text
metadata.json                      template.yaml
cfnTemplate: template.yaml   ───> ファイル
cfnParameters.FlagSeed       ───> Parameters.FlagSeed
flagOutputKey: RecoveryFlag  ───> Outputs.RecoveryFlag
```

## ヒントと英語版を追加する

日本語のヒントは`scoring.hints`へ、英語の表示内容は`i18n.en`へ記述します。

```json
{
  "scoring": {
    "hints": [
      {
        "id": "hint-1",
        "content": "frontendとAPIの応答を比較してください。",
        "penalty": 10
      }
    ]
  },
  "i18n": {
    "en": {
      "name": "Cloud Rescue",
      "shortDescription": "Recover the unavailable frontend."
    }
  }
}
```

`README.md`と`README.ja.md`も用意し、日英でゴールと制約が食い違わないようにします。

## template.yamlとの対応を検証する

TenkaCloudのルートへ戻り、Makefileの検証targetを実行します。

```bash
make validate-problems
```

この検証では、JSON Schemaへの適合、問題IDとディレクトリ名、CloudFormation parameterとOutputへの参照を確認します。成功したら、次章で`RecoveryFlag`をParticipant Portalの提出と得点へ結び付けます。
