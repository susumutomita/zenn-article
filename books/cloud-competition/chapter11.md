---
title: "フェーズと妨害イベントを入れる"
free: true
---

継続採点だけでもBattleは成立します。しかし、最初の障害を一度直した後に何も起きないと、後半は監視画面を眺める時間になります。

そこで、時間経過や得点条件に応じて状況を変えます。ただし、妨害を増やす目的は参加者を困らせることではありません。再観察、再診断、再復旧のリズムを作ることです。

## まず手動の障害注入を一つ作る

Cloud Rescueでは、nginxを停止する障害から始めます。`metadata.json`の`disruptions`へ宣言します。

```json
{
  "disruptions": [
    {
      "id": "frontend-down",
      "name": "frontend停止",
      "eventDetailType": "OutageDisruptionFired",
      "defaultAfterMinutes": 10,
      "operatorEditable": [
        "afterMinutes"
      ],
      "publicHint": true,
      "description": "対象チームのEC2でnginxを停止する。参加者はSSMで接続し、原因を確認して復旧する。一定時間後に自動復旧する。",
      "action": {
        "kind": "ssm-run-command",
        "targetRef": "InstanceId",
        "documentName": "AWS-RunShellScript",
        "parameters": {
          "commands": [
            "sudo systemctl stop nginx"
          ]
        },
        "revert": {
          "afterSeconds": 600,
          "parameters": {
            "commands": [
              "sudo systemctl start nginx"
            ]
          }
        }
      }
    }
  ]
}
```

利用時点の正確なfieldは、`SCHEMA.json`と`battles/hello-world-battle/metadata.json`を基準にします。上記の意図は次です。

- 変更対象は対象チームのEC2だけ
- 操作はSSM Run Commandで監査可能
- 参加者が観測できる障害を起こす
- 10分後に自動復旧する
- 同じ問題を再試行できる

## revertは必須の安全網

手動復旧できるからといって、revertを省略しません。

参加者がSSM接続に失敗する、運営が対象を間違える、イベント終了処理が遅れるといった状況でも、障害が永続化しないようにします。

revertは正解を代行する機能ではありません。競技が詰むことを防ぐ安全網です。自動復旧までの時間は、参加者が自力で対応できる時間より長く設定します。

## よい妨害の条件

妨害を追加するときは、次を満たすか確認します。

1. 学習目標と関係がある
2. 症状を観測できる
3. 原因を証拠から絞れる
4. 参加者権限で復旧できる
5. 対象チーム外へ影響しない
6. 自動revertできる
7. 再実行しても破壊的に累積しない

ランダムに設定を壊すだけでは、クラウド運用の学習になりません。

## 段階的に難しくする

Cloud Rescueの進行例です。

| 時間 | 状況 | 学ばせること |
| --- | --- | --- |
| 0〜15分 | endpoint登録と初期確認 | 環境把握、監視対象の理解 |
| 15〜30分 | nginx停止 | SSM接続、systemd、復旧 |
| 30〜45分 | API停止 | 複数サービスの切り分け |
| 45〜60分 | 再発 | 監視、runbook、再確認 |

最初から全障害を入れず、基本操作を体験した後に追加します。

## phased-pollingを使う場面

`phased-polling`は、時間によって採点条件や対象を変えるBattleに向きます。

たとえば、前半はfrontendだけ、後半はfrontendとAPIの両方を要求できます。

```text
Phase 0: frontendが200なら加点
Phase 1: frontendとAPIが200なら加点
Phase 2: 全endpoint正常に加え、追加の運用条件を要求
```

実装では、metadataの`phases`を`afterMinutes`順に宣言します。正確な構造は、現在の`SCHEMA.json`と`microservice-migration-battle`、`stackstack`を参照してください。

採点条件が切り替わるフェーズでは、問題文または公開hintで変更時刻と新しい条件を予告します。予告がない変化は、参加者から採点障害に見えるためです。

## triggerを選ぶ

妨害のtriggerには、問題設計に応じて次を使います。

- `after-deploy`: デプロイ後に一度だけ起こす
- `team-score-above`: チームが一定得点に到達した時点で起こす
- `phase-entered`: フェーズへ入ったときに起こす
- operator手動: 会場の進行を見ながら発火する

初心者向け初回イベントでは、operator手動が扱いやすい方法です。全チームの準備を確認してから同時に障害を入れられます。

## 公平性を保つ

チームごとに発火時刻が大きく違うと、得点比較が難しくなります。

- 全チーム一斉発火
- デプロイ完了から同じ経過時間で発火
- 到達得点に応じて個別発火

どの公平性を採用するかを先に決めます。初回のCloud Rescueでは、全チーム一斉の手動発火を採用します。

## 運営画面に必要な情報

妨害実行時には、少なくとも次を記録します。

- event ID
- team ID
- disruption ID
- 実行時刻
- 対象resource
- 実行結果
- revert予定時刻
- revert結果

「何かを壊したが、どのチームへ何をしたか分からない」状態を作らないことが、競技運営の基本です。

## Cloud Rescueの最小構成

初版では、機能を絞ります。

- 採点: `uptime-flat`
- endpoint: frontend、API
- 妨害: nginx停止の1種類
- 発火: operator手動
- revert: 10分後にnginx起動
- 専用UI: なし

この最小版を実機で確認してから、API停止、フェーズ、攻撃検知を追加します。

次章では、汎用Participant Portalで足りない場合にだけ、問題固有のUIを追加します。
