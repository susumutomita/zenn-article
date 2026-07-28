---
title: "リアルタイム競技の得点設計"
free: true
---

Challengeは、1回の完了を採点します。Battleは、正常状態を維持した時間を採点します。

本章の正本は`battles/cloud-rescue-battle/metadata.json`です。

## Battleもdraftから始める

```json
{
  "id": "cloud-rescue-battle",
  "name": "Cloud Rescue Battle",
  "category": "Battle",
  "status": "draft",
  "difficulty": 2,
  "estimatedDuration": "60 分"
}
```

実AWSで採点と障害注入を確認するまで`ready`へ変更しません。

## URLは参加者が登録する

Battle版のCloudFormation Outputは、`FrontendUrl`と`ApiUrl`を空文字にします。`Ec2HostHint`だけを参加者へ示します。

```yaml
Outputs:
  FrontendUrl:
    Value: ""
  ApiUrl:
    Value: ""
  Ec2HostHint:
    Value: !GetAtt Ec2.PublicDnsName
```

参加者はPortalへ次を登録します。

```text
frontend: http://<Ec2HostHint>
API:      http://<Ec2HostHint>:8080
```

デプロイしただけでは得点しません。監視対象を理解して登録した時点からBattleが始まります。

## endpoint slotを宣言する

```json
{
  "endpoints": [
    {
      "slot": "frontend",
      "default": {
        "from": "cfn-output",
        "key": "FrontendUrl"
      },
      "overridable": true
    },
    {
      "slot": "api",
      "default": {
        "from": "cfn-output",
        "key": "ApiUrl"
      },
      "overridable": true
    }
  ]
}
```

`overridable: true`により、teamごとのURLをPortalへ保存できます。

## uptime-flatで個別に採点する

```json
{
  "scoring": {
    "kind": "uptime-flat",
    "endpoints": [
      {
        "slot": "frontend",
        "path": "/",
        "expectStatus": [200]
      },
      {
        "slot": "api",
        "path": "/healthz",
        "expectStatus": [200]
      }
    ],
    "pointsPerSuccess": 100,
    "failurePenalty": -50
  }
}
```

frontendとAPIを別々に判定するため、部分復旧もscoreへ反映できます。

## 点数を試算する

1分ごとに2 endpointを確認し、各成功が100点なら、60分の理論最大は12,000点です。

```text
2 endpoints × 100 points × 60 rounds = 12,000 points
```

失敗時は、endpointごとの採点規則に従って50点を失います。初学者が序盤の失点だけで諦めないよう、成功点より小さくしています。

## uptime-multiは次の発展

全endpointが正常な場合だけ得点させるなら、`uptime-multi`を検討します。Cloud Rescueの初版は、どちらが壊れたかをscoreから観察できる`uptime-flat`を使います。

Battleの価値は、正解commandの早押しではありません。復旧後も監視し、再発へ対応する運用を得点に変えることです。

次章では、2種類の障害注入と自動revertを実装します。
