---
title: "検証、実機デプロイ、解答テスト"
free: true
---

問題は、ファイルが揃った時点では完成していません。静的検証と実AWS検証を分け、証明できた範囲を明示します。

## 現在の実装PR

Cloud RescueはTenkaCloudChallengeのPR #318で管理しています。

```text
Challenge: challenges/cloud-rescue
Battle:    battles/cloud-rescue-battle
```

実AWSの通し確認が終わるまで、両問題の`status`は`draft`です。

## 第1層はcatalog contract

repositoryの完了条件を実行します。

```bash
make agent-gate
```

このcommandは、次をまとめて検査します。

- metadataのJSON Schema
- problem IDとdirectory名
- CloudFormation Outputへの参照
- templateのASCIIとsecurity checks
- catalog test shards
- `index.json`と`cost-report.json`
- course drift

Simulatorとのcross-repository contractは、専用workflowで検査します。

## 第2層はCloudFormationの静的確認

AWS CLIを使える場合は、templateも検証します。

```bash
aws cloudformation validate-template   --template-body file://challenges/cloud-rescue/template.yaml

aws cloudformation validate-template   --template-body file://battles/cloud-rescue-battle/template.yaml
```

このcommandは、UserDataの成功、IAMの実権限、endpointへの到達性を保証しません。

## 第3層はChallengeの実AWS確認

新しいstackで次を確認します。

```text
CloudFormation: CREATE_COMPLETE
SSM managed node: online
frontend /: failure
API /healthz: HTTP 200
/recovery from outside: HTTP 403
/recovery before recovery: HTTP 503
```

participant roleでSSMへ接続し、状態を調査します。

```bash
systemctl status nginx tenkacloud-api
journalctl -u nginx -u tenkacloud-api --no-pager -n 50
sudo nginx -t
sudo systemctl start nginx
curl -fsS http://127.0.0.1/
curl -fsS http://localhost:8080/recovery
```

取得したflagをPortalへ提出し、得点と誤答penaltyを確認します。

## 第4層はBattleの実AWS確認

`Ec2HostHint`から2つのURLを作り、Portalへ登録します。

```text
frontend slot: http://<host>
API slot:      http://<host>:8080
```

次の採点周期で、両endpointの成功が反映されることを確認します。その後、`frontend-down`と`api-down`を別々に実行します。

各障害で確認する内容は次です。

- 対象teamだけに作用する
- 片方のendpointだけが失敗する
- participantがSSMから復旧できる
- 復旧後に採点へ戻る
- 600秒後のrevertが成功する
- commandとrevertの監査記録が残る

## 第5層は削除

```bash
aws cloudformation delete-stack --stack-name <problem-stack>
aws cloudformation wait stack-delete-complete   --stack-name <problem-stack>
```

EC2、VPC、subnet、Internet Gateway、Security Group、IAM roleが残っていないことを確認します。請求画面とresource explorerでも確認します。

## 第6層は初見者テスト

実装内容を使うべきではない言葉なので修正してください参加者に解いてもらいます。接続時間、ヒント利用、誤った仮説、復旧時間、再発時の短縮を記録します。

CIの成功を実AWSの成功として扱いません。未確認の画面、log、所要時間は空欄のまま残します。

次章では、Battleの継続採点を実装します。
