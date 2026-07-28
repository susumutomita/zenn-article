---
title: "template.yamlでAWS環境を定義する"
free: true
---

`template.yaml`は、各チームのAWSアカウントへ作る環境を定義するCloudFormation templateです。Cloud Rescueでは、VPC、EC2、nginx、Python API、参加者がSSMで接続するためのIAM roleを作ります。

## template.yamlの全体構造

CloudFormation templateは、次の4つの部分から読めます。

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: Cloud Rescue Challenge

Parameters:
  # TenkaCloudやmetadata.jsonから受け取る値

Resources:
  # AWSへ作成するVPC、EC2、IAM roleなど

Outputs:
  # TenkaCloudや参加者へ返すURL、ID、flagなど
```

`Parameters`は外部から受け取る値、`Resources`は作るAWSリソース、`Outputs`は作成後に返す値です。まずこの対応を決めてから、個々のリソースを書きます。

## TenkaCloudから受け取るparameter

Cloud Rescueは、競技運営に必要な共通値を受け取ります。

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

| parameter | 用途 |
| --- | --- |
| `NamePrefix` | チームごとのリソース名を分ける |
| `TenkaCloudAccountId` | 参加者用roleを引き受けるTenkaCloud側のAWS accountを限定する |
| `ExternalId` | 別イベントや第三者からの意図しない`AssumeRole`を防ぐ |

これらの値をtemplateへ固定してはいけません。TenkaCloudのデプロイ処理が、イベントとチームに対応する値を渡します。

Challengeのflagには、問題固有のparameterも追加します。

```yaml
  FlagSeed:
    Type: String
    NoEcho: true
    MinLength: 8
    MaxLength: 64
    AllowedPattern: "^[A-Za-z0-9]+$"
```

次章で、`metadata.json`から`FlagSeed`へデプロイごとのランダム値を渡します。

## Resourcesに環境を書く

Cloud Rescueの主なリソースは次のとおりです。

| logical ID | AWSリソース | 役割 |
| --- | --- | --- |
| `Vpc`、`PublicSubnet`、`Igw`、`Rt` | VPCと経路 | EC2へ外部からHTTPで到達できるようにする |
| `Sg` | Security Group | 80番と8080番だけを許可する |
| `Ec2` | EC2 instance | nginxとPython APIを動かす |
| `InstanceRole` | IAM role | EC2をSSM managed nodeとして登録する |
| `ParticipantViewerRole` | IAM role | 参加者に自チームのEC2へのSSM接続を許可する |

リソース名には`NamePrefix`を使います。

```yaml
Resources:
  Vpc:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.99.0.0/16
      Tags:
        - Key: Name
          Value: !Sub "${NamePrefix}-vpc"
```

同じAWS accountとリージョンへ複数チーム分を作っても、名前が衝突しないようにします。

## 参加者の権限を問題へ限定する

`ParticipantViewerRole`はTenkaCloudのAWS accountだけを信頼し、`ExternalId`の一致も要求します。

```yaml
  ParticipantViewerRole:
    Type: AWS::IAM::Role
    Properties:
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

実際のtemplateでは、SSM接続先をこの問題のEC2へ限定します。SSHの22番portは公開しません。

## 正常な環境を作ってから壊す

UserDataでは、nginxとAPIを起動して正常性を確認します。その後、競技の開始状態を作るためにnginxだけを停止します。

```bash
systemctl enable --now nginx
curl -fsS http://127.0.0.1/ >/dev/null
echo "frontend verified before incident injection" \
  | systemd-cat -t cloud-rescue-setup

systemctl stop nginx
echo "initial incident injected: nginx stopped" \
  | systemd-cat -t cloud-rescue-setup
```

最初から起動に失敗する設定を書くと、構築不良と競技用の障害を区別できません。「正常に動いた後で停止した」という証拠をlogへ残します。

## Outputsをmetadata.jsonと参加者へ渡す

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

`FrontendUrl`と`ApiUrl`は参加者が症状を比較するために使います。`SsmStartSessionCommand`はEC2への接続方法です。`RecoveryFlag`は、次章で`metadata.json`の採点設定から参照します。

CloudFormationで環境を作る方法と、TenkaCloud上で問題として見せる方法は別です。次章では`metadata.json`の形式を確認し、このtemplateを問題文と採点へ接続します。
