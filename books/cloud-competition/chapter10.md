---
title: "リアルタイム競技の得点設計"
free: true
---

Challengeでは、一度の回答や復旧で完了できます。Battleでは、正常な状態を維持している時間そのものを得点に変えます。

Cloud RescueをBattleへ変更し、frontendとAPIを継続監視します。

## Battle用の問題を作る

既存のBattleサンプルを複製します。

```bash
bun run new battles cloud-rescue-battle --from hello-world-battle
bun run validate
```

`metadata.json`の基本項目をCloud Rescueへ変更し、`category`を`Battle`にします。

```json
{
  "id": "cloud-rescue-battle",
  "name": "Cloud Rescue Battle — WebとAPIを守れ",
  "category": "Battle",
  "status": "draft",
  "difficulty": 2,
  "estimatedDuration": "60〜90分"
}
```

実際のファイルでは、他の必須フィールドとi18nも残して更新します。

## endpointをslotとして宣言する

TenkaCloudの採点側が、チームごとにどのURLを確認するかをendpointで宣言します。

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
      "description": "EC2の公開DNSを使った `http://<host>` を登録する"
    },
    {
      "slot": "api",
      "default": {
        "from": "cfn-output",
        "key": "ApiUrl"
      },
      "overridable": true,
      "label": "API",
      "description": "EC2の公開DNSを使った `http://<host>:8080` を登録する"
    }
  ]
}
```

`default.from: cfn-output`はCloudFormation Outputから初期値を取ります。`overridable: true`にすると、Participant Portalからチーム固有のURLを登録できます。

複製元の`hello-world-battle`では、Outputを空にし、参加者が自分でURLを登録した時点から採点を始める設計です。デプロイしただけで自動加点されないため、接続と確認の体験を競技へ含められます。

## uptime-flat

`uptime-flat`は、複数endpointを個別に判定します。

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

frontendとAPIを個別に評価したい場合に向きます。部分復旧を点数へ反映できます。

## uptime-multi

`uptime-multi`は、全endpointが正常なときだけ得点させたい場合に使います。

たとえば「frontendだけ直しても顧客機能は復旧していない」と評価するなら、全条件をまとめます。

```json
{
  "scoring": {
    "kind": "uptime-multi",
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
    "pointsAllOk": 100,
    "failurePenalty": -100
  }
}
```

採点kindの正確なフィールドは、利用時点の`SCHEMA.json`と既存問題を基準にしてください。metadataは更新されるため、記憶だけで書かず`bun run validate`を通します。

## 部分点か、全条件か

選択基準は学習目標です。

### uptime-flatが向く場合

- 複数サービスを段階的に復旧させたい
- 途中経過にも意味がある
- 初心者へ手応えを返したい
- どのendpointが失敗しているかを明確にしたい

### uptime-multiが向く場合

- 全サービスが揃わないと利用者価値がない
- 一部だけ直して放置する行動を防ぎたい
- チーム全体の正常性を1つのSLOとして扱いたい

Cloud Rescueの最初のBattleでは`uptime-flat`を使い、frontendとAPIの両方が得点対象であることを見せます。

## 加点と減点を設計する

`pointsPerSuccess`を大きくしすぎると、初動の差だけで逆転不能になります。`failurePenalty`を強くしすぎると、初心者が負の点数を見て諦めます。

先に競技時間を決め、理論上の点数を試算します。

例として、1分ごとに2 endpointを確認し、各成功が100点、競技時間60分なら、完全正常時の最大は12,000点です。

```text
2 endpoints × 100 points × 60 rounds = 12,000 points
```

妨害を何回入れるか、平均復旧時間を何分と想定するかも加えて、逆転可能性を確認します。

## 一度の偶然を得点にしない

公開直後だけHTTP 200を返し、その後落ちるサービスは正常とは言えません。継続pollingにすると、次の能力を競技へ含められます。

- 復旧確認
- 状態の維持
- 再発の検知
- 変更後の監視
- 焦って一時的な修正をしない判断

Battleの価値は、正解コマンドを早押しすることではなく、**正常状態を維持する運用**を得点へ変えられることです。

## endpoint未登録の扱い

Participant PortalへURLを登録するまで0点にするか、CloudFormation Outputから自動登録するかは体験設計です。

- 自動登録: 競技開始を簡単にする
- 手動登録: 自分の環境と監視対象を理解させる

Cloud Rescueでは、最初のBattleとして手動登録を残します。参加者はOutputからDNS名を見つけ、frontendとAPIのURLを登録します。

次章では、時間経過で状況を変えるフェーズと、運営側からの障害注入を追加します。
