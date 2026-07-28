---
title: "hello-worldの問題文と採点を書く"
free: true
---

`metadata.json`は、TenkaCloudが問題を表示して採点するための定義です。`template.yaml`にAWS環境を書き、`metadata.json`に参加者へ見せる内容と採点方法を書きます。

完成形は[metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/hello-world/metadata.json)で確認できます。

## metadata.jsonの全体像

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "hello-world",
  "name": "Hello World (Sample)",
  "category": "Challenge",
  "status": "ready",
  "visibility": "public",
  "difficulty": 1,
  "estimatedDuration": "1 分",
  "shortDescription": "...",
  "instructions": "...",
  "description": "...",
  "tags": ["sample", "challenge", "flag", "ssm"],
  "learningGoals": ["..."],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {},
  "i18n": {
    "en": {}
  },
  "scoring": {}
}
```

`$schema`を指定すると、エディタと検証コマンドが入力ミスを見つけやすくなります。

`id`はディレクトリ名と一致させます。`category`は`Challenge`です。公開問題としてTenkaCloudへ表示するため、`status`を`ready`、`visibility`を`public`にします。

## 参加者へ見せる文章

文章には役割があります。

| フィールド | 読む人 | 内容 |
| --- | --- | --- |
| `name` | 参加者 | 問題名 |
| `shortDescription` | 参加者 | 問題カードと詳細画面の導入 |
| `instructions` | 参加者 | 最初の一手とゴール |
| `description` | 問題作者、運営 | 実装、採点、設計上の補足 |
| `learningGoals` | 参加者、運営 | 持ち帰ってほしい学び |

`instructions`はMarkdown文字列です。次の3つを入れます。

```json
{
  "instructions": "## はじめに\n前任のSREが残したメッセージを見つける入門問題です。\n\n## 最初の一手\n- Console: `ParameterConsoleUrl`を開く\n- CLI: `aws ssm get-parameter --name /<NamePrefix>/hello --query Parameter.Value --output text`\n\n## ゴール\nSSM Parameterの値をParticipant Portalへ提出します。"
}
```

問題文は、最初の一手を示しても正解値を見せないようにします。

## CloudFormationへランダム値を渡す

`cfnTemplate`で、この問題が使うtemplateを指定します。

```json
{
  "cfnTemplate": "template.yaml",
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

TenkaCloudは`__RANDOM_PASSWORD__`をデプロイごとのランダム値へ置き換えます。前章の`FlagSeed`へ渡り、SSM Parameterと正解Outputの両方で使われます。

## flag採点を定義する

```json
{
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "ParameterValue",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": [
      {
        "id": "hint-1",
        "content": "OutputsのParameterConsoleUrlを開くか、aws ssm get-parameterを実行します。",
        "penalty": 20
      },
      {
        "id": "hint-2",
        "content": "値はTC{...}形式です。Parameterの実値を最初から最後まで貼り付けます。",
        "penalty": 30
      }
    ]
  }
}
```

`flagOutputKey`は、`template.yaml`の`Outputs.ParameterValue`と一致させます。名前がずれると、TenkaCloudは正解を取得できません。

難易度1のChallengeは100点です。誤答減点は5点、ヒント減点の合計は50点以内にします。この規定はTenkaCloudChallengeの検証で確認されます。

## 日本語と英語を対応させる

トップレベルへ日本語を書き、英語を`i18n.en`へ書きます。

```json
{
  "i18n": {
    "en": {
      "name": "Hello World (Sample)",
      "shortDescription": "Find the message left in an SSM Parameter.",
      "instructions": "## Getting started\nFind the message left by the previous SRE.\n\n## First move\nOpen ParameterConsoleUrl or use aws ssm get-parameter.\n\n## Goal\nSubmit the complete TC{...} value.",
      "description": "Minimal Challenge using one SSM Parameter.",
      "learningGoals": [
        "Read a value from SSM Parameter Store through the AWS Console or CLI",
        "Experience TenkaCloud's deploy, submit, and score flow"
      ],
      "hints": [
        {
          "id": "hint-1",
          "content": "Open ParameterConsoleUrl or use aws ssm get-parameter."
        },
        {
          "id": "hint-2",
          "content": "Submit the complete value from TC{ to }."
        }
      ]
    }
  }
}
```

英語側のヒントIDは、日本語側と同じにします。採点点数と減点値はトップレベルだけに書き、英語側へ重複させません。

次章では、READMEと構成図を仕上げます。
