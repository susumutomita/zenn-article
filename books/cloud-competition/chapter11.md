---
title: "フェーズと妨害イベントを入れる"
free: true
---

継続採点だけでもBattleは成立します。Cloud Rescueは、operatorが手動で発火する2種類の障害を追加します。

初版では時間連動のphaseを実装しません。全teamの準備を確認してから、同じ条件で手動発火します。

## frontendを停止する

```json
{
  "id": "frontend-down",
  "name": "frontend停止",
  "eventDetailType": "OutageDisruptionFired",
  "defaultAfterMinutes": 10,
  "operatorEditable": ["afterMinutes"],
  "publicHint": true,
  "action": {
    "kind": "ssm-run-command",
    "targetRef": "InstanceId",
    "documentName": "AWS-RunShellScript",
    "paramTemplate": {
      "commands": [
        "systemctl stop nginx || true"
      ]
    },
    "revert": {
      "afterSeconds": 600,
      "documentName": "AWS-RunShellScript",
      "paramTemplate": {
        "commands": [
"systemctl start nginx || true"
        ]
      }
    }
  }
}
```

frontend probeだけが失敗するため、参加者はAPIが正常なことを手掛かりにできます。

## APIを停止する

2つ目の障害は、`tenkacloud-api`を停止します。

```json
{
  "id": "api-down",
  "name": "API停止",
  "action": {
    "kind": "ssm-run-command",
    "targetRef": "InstanceId",
    "documentName": "AWS-RunShellScript",
    "paramTemplate": {
      "commands": [
        "systemctl stop tenkacloud-api || true"
      ]
    },
    "revert": {
      "afterSeconds": 600,
      "documentName": "AWS-RunShellScript",
      "paramTemplate": {
        "commands": [
"systemctl start tenkacloud-api || true"
        ]
      }
    }
  }
}
```

今度はfrontendが正常なため、同じ調査手順を別serviceへ適用できます。

## revertを必須にする

各障害は、600秒後に自動revertします。participantが接続できない場合や、operatorが進行を中止した場合にも、障害を永続化させません。

revertは正解の代行ではありません。参加者が自力で復旧する時間より長く設定した安全網です。

## operator runbookを分離する

`redteam/README.md`と`redteam/README.ja.md`には、次を記載します。

- endpoint登録と初回得点を確認してから発火する
- `InstanceId`が対象teamのstackに属するか確認する
- 同じ障害のrevert待機中に再発火しない
- team、disruption ID、時刻、結果、revert予定を記録する
- SSM失敗、誤target、想定外の両系停止では追加発火を止める

participant向けREADMEに、未公開の発火予定は書きません。

## 公平性を決める

Cloud Rescueの初回イベントは、全teamの準備完了後に同じ障害を手動発火します。

```text
0〜15分: endpoint登録と正常状態の確認
15〜30分: frontend-down
30〜45分: api-down
45〜60分: どちらかを再発
```

この時刻はrunbook上の進行例です。metadataに自動phaseとして実装した値ではありません。

## phaseは必要になってから追加する

`phased-polling`を使うと、時間によって採点条件を変えられます。たとえば、前半はfrontendだけ、後半はfrontendとAPIの両方を要求できます。

初版では、継続採点、手動disruption、自動revertを先に実証します。phaseを追加する場合は、条件変更を参加者へ予告し、採点障害と誤認されないようにします。

次章では、作成したChallengeとBattleをTenkaCloudへ読み込み、イベントを開催します。
