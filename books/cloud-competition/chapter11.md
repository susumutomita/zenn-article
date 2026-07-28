---
title: "hello-world-battleの採点と障害を書く"
free: true
---

`hello-world-battle/metadata.json`へ、2つのendpoint、継続採点、nginx停止の障害を定義します。完成形は[metadata.json](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/battles/hello-world-battle/metadata.json)で確認できます。

## 基本情報

```json
{
  "$schema": "../../SCHEMA.json",
  "id": "hello-world-battle",
  "name": "Hello World Battle (Sample)",
  "category": "Battle",
  "status": "ready",
  "visibility": "public",
  "onboardingOrder": 1,
  "difficulty": 1,
  "estimatedDuration": "30 分",
  "tags": ["sample", "battle", "uptime", "ec2", "nginx"],
  "cfnTemplate": "template.yaml",
  "cfnParameters": {}
}
```

`onboardingOrder`は、入門Battleの表示順に使います。

`instructions`には、参加者が最初に行う3段階を書きます。

1. `SsmStartSessionCommand`でEC2へ接続する
2. `Ec2HostHint`を使って2つのURLを登録する
3. サービスが停止したら再起動する

## endpointを定義する

```json
{
  "endpoints": [
    {
      "slot": "frontend",
      "default": {
        "from": "cfn-output",
        "key": "FrontendUrl"
      },
      "overridable": true,
      "label": "Frontend (nginx)",
      "description": "Ec2HostHintのDNS名でhttp://<host>を登録します。"
    },
    {
      "slot": "api",
      "default": {
        "from": "cfn-output",
        "key": "ApiUrl"
      },
      "overridable": true,
      "label": "API (python http.server)",
      "description": "Ec2HostHintのDNS名でhttp://<host>:8080を登録します。"
    }
  ]
}
```

`slot`は、採点定義から参照する識別子です。

`default.key`は、`template.yaml`のOutput名と一致させます。Outputの値は空ですが、参照先自体は必要です。

`overridable`を`true`にすると、参加者がParticipant PortalからURLを登録できます。

## 1分ごとの採点を定義する

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
    "failurePenalty": -100
  }
}
```

採点側の`slot`は、前節の`endpoints[].slot`と一致させます。

APIの登録URLへ`/healthz`を含めません。登録するのは`http://<host>:8080`で、採点エンジンが`path`の`/healthz`を追加します。

## レッドチーム機能を定義する

TenkaCloudでは、運営者がBattle中に実行する障害を`disruptions`へ定義します。Application Admin Consoleのレッドチーム機能は、この定義を読み、運営者が選んだチームへ障害を実行します。

`hello-world-battle`のレッドチームには、nginxを停止する`frontend-down`を1つだけ用意します。

```json
{
  "disruptions": [
    {
      "id": "frontend-down",
      "name": "frontend停止",
      "eventDetailType": "OutageDisruptionFired",
      "defaultAfterMinutes": 10,
      "operatorEditable": ["afterMinutes"],
      "publicHint": true,
      "description": "運営が対象チームのnginxを停止します。参加者はSSM Session Managerから起動します。",
      "action": {
        "kind": "ssm-run-command",
        "targetRef": "InstanceId",
        "documentName": "AWS-RunShellScript",
        "paramTemplate": {
          "commands": ["systemctl stop nginx || true"]
        },
        "revert": {
          "afterSeconds": 600,
          "documentName": "AWS-RunShellScript",
          "paramTemplate": {
            "commands": ["systemctl start nginx || true"]
          }
        }
      }
    }
  ]
}
```

`targetRef`の`InstanceId`は、`template.yaml`のOutputです。TenkaCloudは対象チームのstackからEC2 instance IDを取得するため、別チームのEC2へ誤って実行しません。

`action`が実際の障害を起こし、`revert`が自動復旧を予約します。説明文だけを書いてもnginxは停止しません。

同じ障害へ採点上の追加ペナルティを重ねません。nginxが停止すればfrontendのprobeが失敗し、`failurePenalty`が適用されます。障害自体にも減点を設定すると、同じ出来事を二重に減点します。

## 参加者から見える情報

`shortDescription`と`instructions`には、URL登録と復旧という目的を書きます。正確な点数や内部の実行方式は、運営者向けの`description`へ書きます。

この問題では`publicHint`を`true`にしているため、障害の存在を参加者へ知らせます。予告なしの仕掛けにしたい問題では`false`を検討しますが、最初のBattleでは復旧体験を分かりやすくすることを優先します。

## READMEと構成図

BattleのREADMEには、次を明記します。

- AWSへの接続方法
- Participant Portalへ登録する2つのURL
- 採点が始まる条件
- 障害発生時の復旧コマンド
- 作成されるAWSリソース
- コストと削除方法

完成形は[README.ja.md](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/battles/hello-world-battle/README.ja.md)で確認できます。

これで、3問目のAWS Battleが完成しました。ローカルChallenge、AWS Challenge、AWS Battleを順番に作り終えたため、次章からは作成したAWS問題を複数チームへ届ける運営側の作業へ進みます。
