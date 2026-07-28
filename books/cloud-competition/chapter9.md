---
title: "作ったChallengeをAWSで解いてみる"
free: true
---

`metadata.json`と`template.yaml`を書いたら、Cloud RescueをAWSへ作成し、問題文どおりに復旧できるか確認します。この章では、CloudFormationを直接使ってChallenge単体を試します。TenkaCloudからの配布と採点は、イベントを作る章で確認します。

## 1. 問題ファイルを検証する

TenkaCloudのルートで実行します。

```bash
make validate-problems
```

エラーが出た場合は、AWSへ進む前に`metadata.json`と`template.yaml`の参照を直します。

## 2. テスト用stackを作る

作成先のAWS accountとリージョンを確認します。`AllowedCidr`には、検証端末のパブリックIPアドレスを`/32`で指定します。

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
EXTERNAL_ID=$(openssl rand -hex 16)
FLAG_SEED=$(openssl rand -hex 16)

aws cloudformation deploy \
  --stack-name tc-cloud-rescue-test \
  --template-file problems/challenges/cloud-rescue/template.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    NamePrefix=tc-cloud-rescue-test \
    AllowedCidr=<your-public-ip>/32 \
    TenkaCloudAccountId="$ACCOUNT_ID" \
    ExternalId="$EXTERNAL_ID" \
    FlagSeed="$FLAG_SEED"
```

CloudFormation stackが`CREATE_COMPLETE`になれば、templateからAWS環境を作成できています。

## 3. 最初の症状を確認する

CloudFormationのOutputsから、`FrontendUrl`、`ApiUrl`、`InstanceId`を取得します。

```bash
aws cloudformation describe-stacks \
  --stack-name tc-cloud-rescue-test \
  --query 'Stacks[0].Outputs'
```

開始時点の期待値は次のとおりです。

| 確認先 | 期待する結果 |
| --- | --- |
| `FrontendUrl` | nginxが停止しているため接続に失敗する |
| `ApiUrl/healthz` | HTTP 200を返す |
| EC2 | SSM managed nodeとしてonlineになる |

frontendとAPIが両方失敗する場合は、nginx以外の構築処理やnetworkを確認します。

## 4. 参加者と同じ手順で復旧する

`InstanceId`を使ってEC2へ接続します。

```bash
aws ssm start-session --target <instance-id>
```

状態とlogを確認します。

```bash
systemctl status nginx tenkacloud-api
journalctl -u nginx -u tenkacloud-api --no-pager -n 50
sudo nginx -t
```

nginxが停止していることを確認したら、復旧します。

```bash
sudo systemctl start nginx
curl -fsS http://127.0.0.1/
curl -fsS http://localhost:8080/recovery
```

最後のコマンドが`TC{...}`を返し、外部の`FrontendUrl`もHTTP 200になれば、問題文から復旧までを完走できています。

## 5. stackを削除する

確認後は同じ日に削除します。

```bash
aws cloudformation delete-stack \
  --stack-name tc-cloud-rescue-test

aws cloudformation wait stack-delete-complete \
  --stack-name tc-cloud-rescue-test
```

EC2、VPC、Security Group、IAM roleが残っていないこともAWS Consoleで確認します。

ここまででChallenge単体を解けることを確認しました。次章では、同じ題材を継続採点するBattleへ発展させます。
