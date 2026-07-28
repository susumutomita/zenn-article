---
title: "壊れたAWS環境をCloudFormationで作る"
free: true
---

競技環境は、正常なシステムを作ってから意図的に壊します。最初から壊れたtemplateを書くと、構築失敗と競技用の障害を区別できません。

本章の正本は`challenges/cloud-rescue/template.yaml`です。EC2、nginx、Python API、SSM接続経路を作ります。セットアップの成功を確認した後、nginxだけを停止します。

## 最小サンプルから始める

Cloud Rescueは、既存の`hello-world-battle`を複製して作りました。

```bash
bun run new challenges cloud-rescue --from hello-world-battle
```

複製直後は、両serviceが正常に動く状態を保ちます。ID、説明、採点を一度に変更せず、差分ごとに検証します。

## 共通parameterを受け取る

TenkaCloudからデプロイするtemplateは、少なくとも次を受け取ります。

```yaml
Parameters:
  NamePrefix:
    Type: String
    MinLength: 5
    MaxLength: 80
    AllowedPattern: "^tc-[a-z0-9]+(-[a-z0-9]+)+$"

  TenkaCloudAccountId:
    Type: String
    AllowedPattern: "^[0-9]{12}$"

  ExternalId:
    Type: String
    NoEcho: true
    MinLength: 16
```

`NamePrefix`は、teamごとのresource名を分離します。`TenkaCloudAccountId`と`ExternalId`は、参加者用roleの信頼条件に使います。作者が固定値を入れず、デプロイ経路から注入します。

## Challenge固有のflag seed

Challengeは、デプロイごとに異なる値も受け取ります。

```yaml
FlagSeed:
  Type: String
  NoEcho: true
  MinLength: 8
  MaxLength: 64
  AllowedPattern: "^[A-Za-z0-9]+$"
```

`metadata.json`の`__RANDOM_PASSWORD__`を、デプロイ処理が実値へ置き換えます。Gitには固定flagを置きません。

## participant roleを問題へ限定する

`ParticipantViewerRole`は、TenkaCloud側のaccountだけを信頼します。さらに、`ExternalId`を必須にします。

```yaml
AssumeRolePolicyDocument:
  Version: "2012-10-17"
  Statement:
    - Effect: Allow
      Principal:
        AWS: !Sub "arn:aws:iam::${TenkaCloudAccountId}:root"
      Action: sts:AssumeRole
      Condition:
        StringEquals:
sts:ExternalId: !Ref ExternalId
```

参加者は、自分のEC2を確認してSSMセッションを開始できます。SSHの22番portは公開しません。serviceの操作は、接続後のOS上で行います。

## 正常系を作ってから止める

UserDataは、nginxとAPIを構築します。nginxを一度起動し、localhostからHTTP 200を確認します。その後に初期障害を注入します。

```bash
systemctl enable --now nginx
curl -fsS http://127.0.0.1/ >/dev/null
echo "frontend verified before incident injection"   | systemd-cat -t cloud-rescue-setup

systemctl stop nginx
echo "initial incident injected: nginx stopped"   | systemd-cat -t cloud-rescue-setup
```

この順序により、参加者は「セットアップが失敗した」のではなく、「正常だったserviceが停止した」と判断できます。

## APIは正常なまま残す

Python APIは8080番portで動きます。

```text
GET /healthz   -> HTTP 200
GET /recovery  -> nginxが未復旧ならHTTP 503
```

frontendだけを止めるため、network全体の障害ではないと切り分けられます。

## Outputを導線として使う

Challenge版は、次のOutputを持ちます。

```yaml
Outputs:
  FrontendUrl:
    Value: !Sub "http://${Ec2.PublicDnsName}"
  ApiUrl:
    Value: !Sub "http://${Ec2.PublicDnsName}:8080"
  InstanceId:
    Value: !Ref Ec2
  SsmStartSessionCommand:
    Value: !Sub "aws ssm start-session --target ${Ec2}"
  RecoveryFlag:
    Value: !Sub "TC{${FlagSeed}}"
```

`FrontendUrl`と`ApiUrl`は症状の比較に使います。`SsmStartSessionCommand`は接続の摩擦を減らします。`RecoveryFlag`は採点engineが参照する正解です。

## 削除できる構成にする

参加者には、新しいEC2やElastic IPを作らせません。既存serviceの状態だけを修正させます。CloudFormation stackを削除すれば、EC2、VPC、subnet、Internet Gateway、Security Group、IAM roleを回収できます。

次章では、この環境を`metadata.json`からTenkaCloudへ接続します。
