---
title: "metadata.jsonで問題を説明する"
free: true
---

`template.yaml`はAWS環境を作ります。`metadata.json`は、その環境をTenkaCloud上の問題として成立させます。

本章の正本は`challenges/cloud-rescue/metadata.json`です。カタログ表示、学習目標、CloudFormation parameter、採点、ヒント、英訳を1つの宣言へまとめます。

## 現在はdraftにする

Cloud Rescueは実装済みですが、実AWSの通し検証は終わっていません。そのため、公開準備中の状態は`draft`です。

```json
{
  "id": "cloud-rescue",
  "name": "Cloud Rescue",
  "category": "Challenge",
  "status": "draft",
  "visibility": "public",
  "difficulty": 2,
  "estimatedDuration": "30 分"
}
```

CIが成功しただけで`ready`へ変更しません。実AWSでデプロイ、解答、採点、削除を確認した後に変更します。

## 症状とゴールを書く

問題文は、原因ではなく観測できる症状を示します。

```markdown
## 症状
- frontendは応答しない
- APIの`/healthz`はHTTP 200を返す

## ゴール
既存のEC2を作り直さず、停止serviceを調査して復旧する。
復旧後に`http://localhost:8080/recovery`からflagを取得する。
```

「nginxを起動する」と最初から書くと、調査する余地がなくなります。

## 学習目標を行動で書く

Cloud Rescueの`learningGoals`は次です。

```json
{
  "learningGoals": [
    "frontendとAPIの症状差から原因範囲を絞る",
    "SSM Session ManagerでSSHなしにEC2へ接続する",
    "systemctlとjournalctlで停止serviceを特定して復旧する",
    "復旧後に外形状態を再確認してflagを取得する"
  ]
}
```

AWS service名の一覧ではなく、参加者が行う判断と操作を記述します。

## CloudFormationへrandom valueを渡す

```json
{
  "cfnTemplate": "template.yaml",
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

`FlagSeed`はデプロイごとに変わります。template側のparameter名と一致させます。

## 日本語と英語を同じ意味にする

トップレベルを日本語、`i18n.en`を英語として管理します。

```json
{
  "i18n": {
    "en": {
      "name": "Cloud Rescue",
      "shortDescription": "The frontend is down while the API still responds.",
      "learningGoals": [
        "Use symptom differences to narrow the incident scope",
        "Connect through SSM Session Manager without SSH"
      ]
    }
  }
}
```

直訳より、状況、ゴール、制約が一致していることを優先します。READMEも`README.md`と`README.ja.md`を用意します。

## Simulatorのcapabilityを宣言する

Cloud RescueはAWS問題ですが、TenkaCloudSimulatorとの互換性も宣言します。

```json
{
  "simulationOverlay": {
    "schemaVersion": "1",
    "entry": "simulation.json"
  }
}
```

Simulator固有の分岐を問題IDで作らず、必要なcapabilityを契約として記述します。

## schemaと生成物を検証する

```bash
bun run scripts/validate-problems.ts
bun run reindex
make agent-gate
```

`reindex`は`index.json`と`cost-report.json`を更新します。生成物を手作業で編集しません。

次章では、復旧を完了条件へ結び付けるflag採点を実装します。
