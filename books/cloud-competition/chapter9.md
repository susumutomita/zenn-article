---
title: "検証、実機デプロイ、解答テスト"
free: true
---

問題は、ファイルが揃った時点では完成していません。

完成の基準は、別のAWS環境へデプロイし、参加者権限で解き、採点され、最後に削除できることです。本章では、検証を層に分けて行います。

## 第1層: カタログ検証

まずTenkaCloudChallengeの検証を通します。

```bash
bun run validate
```

主に次を確認します。

- JSON Schemaへの適合
- 問題IDとディレクトリ名の一致
- `cfnTemplate`の参照先
- endpoint slotと採点設定の整合
- portal slotの参照
- i18n構造
- 生成indexの差分

エラーを無視して`status: ready`へ変更しないでください。

## 第2層: CloudFormationの静的確認

AWS CLIを使える環境では、template自体を検証します。

```bash
aws cloudformation validate-template \
  --template-body file://battles/cloud-rescue-battle/template.yaml
```

これは構文と一部の構造を確認しますが、リソース作成権限、UserData、IAMの実挙動までは保証しません。

次も目視します。

- 全リソースに`NamePrefix`が反映されているか
- 固定のaccount ID、region、秘密値がないか
- `ExternalId`が信頼条件に入っているか
- 参加者roleが広すぎないか
- `DeletionPolicy: Retain`が意図せず入っていないか
- 公開portが必要最小限か
- Outputに答えや秘密値を出していないか

## 第3層: 正常系デプロイ

問題を壊す前に、複製元の正常構成でデプロイします。

確認項目は次です。

- CloudFormation stackが`CREATE_COMPLETE`になる
- EC2がSSM managed nodeとして見える
- SSM Session Managerで接続できる
- frontendとAPIがHTTP 200を返す
- ParticipantViewerRoleで必要な画面とCLIだけが使える
- 不要なAWSサービスへアクセスできない

UserDataの完了前にアプリへ接続すると、一時的な失敗を障害と誤認します。セットアップ完了ログやCloudFormation signalなど、準備完了を判定できる仕組みを持たせます。

## 第4層: 競技開始状態を確認する

意図した障害を追加した版をデプロイします。

Cloud Rescueでは、次を確認します。

```bash
curl -fsS "http://<host>/"
# 失敗すること

curl -fsS "http://<host>:8080/healthz"
# 成功すること
```

SSM接続後は、参加者が見る証拠を確認します。

```bash
systemctl status nginx
systemctl status tenkacloud-api
journalctl -u nginx --no-pager -n 50
```

原因が問題文だけで分かるのではなく、AWS環境を観察すると分かる状態になっていることが重要です。

## 第5層: 参加者として解く

管理者credentialのまま解答テストをすると、権限不足を見逃します。Participant Portalから発行される参加者経路、または同等のParticipantViewerRoleで操作します。

解答手順の例です。

```bash
aws ssm start-session --target <instance-id>
```

接続後に調査します。

```bash
systemctl --failed
systemctl status nginx
journalctl -u nginx --no-pager -n 50
sudo nginx -t
sudo systemctl restart nginx
curl -fsS http://127.0.0.1/
```

最後に外部から確認します。

```bash
curl -fsS "http://<host>/"
curl -fsS "http://<host>:8080/healthz"
```

作者の手元で一度成功しただけでは足りません。新しいstackで複数回実行し、偶然動いた状態を除きます。

## 第6層: 採点テスト

Challengeでは、次を確認します。

- 正しいflagで一度だけ意図した得点になる
- 誤答ペナルティが設定どおり
- 別チームのflagが通らない
- 再デプロイでflagが変わる

Battleでは、次を確認します。

- endpoint未登録時に意図せず加点されない
- 正常時に加点される
- 一方だけ停止した場合の点数が設計どおり
- 復旧後に自動で採点へ戻る
- failure penaltyが過剰に累積しない

## 第7層: 削除テスト

stackを削除し、残存リソースを確認します。

```bash
aws cloudformation delete-stack --stack-name <problem-stack>
aws cloudformation wait stack-delete-complete --stack-name <problem-stack>
```

その後、少なくとも次を確認します。

- EC2が残っていない
- Elastic IPが残っていない
- Load Balancer、target groupが残っていない
- CloudWatch Logsの保持方針が意図どおり
- SSM ParameterやSecretが残っていない
- 手作業で作ったリソースがない

削除に失敗する問題は、イベントで繰り返し使えません。

## Codespacesでできる範囲

TenkaCloudのローカルモードやCodespacesでは、Dockerで完結するcloud-independent drillを動かせます。一方、実AWSリソースを作る問題は、Codespacesだけで実機確認できません。

- UIやローカル採点の確認: Codespacesで可能
- AWS templateの構文確認: credentialがあれば一部可能
- IAM、SSM、EC2、公開endpointの実挙動: 実AWSが必要

この境界をREADMEと本書で明記します。

## 初見者テスト

最後に、問題の実装を知らない人へ解いてもらいます。

作者は次を説明せずに観察します。

- どこから始めるか
- 接続まで何分かかるか
- 何を原因だと考えるか
- ヒントをいつ開くか
- 復旧後に両endpointを確認するか

問題の難易度は、作者の意図ではなく参加者の行動で決まります。

Challengeとしての導線が確認できたら、次章で継続採点するBattleへ発展させます。
