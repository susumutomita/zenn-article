---
title: "hello-worldのAWS環境を作る"
free: true
---

`template.yaml`は、1チームのAWSアカウントへデプロイするCloudFormation templateです。`hello-world`では、SSM Parameterを1つと、参加者がそのParameterを読むためのIAM Roleを作ります。

完成形は[template.yaml](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/challenges/hello-world/template.yaml)で確認できます。

## template.yamlの構造

CloudFormation templateは、次の4つの部分で読みます。

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: >
  TenkaCloud hello-world Challenge.

Parameters:
  # TenkaCloudがデプロイ時に渡す値

Resources:
  # チームのAWSアカウントへ作るもの

Outputs:
  # 採点とParticipant Portalが使う値
```

`Parameters`は入力、`Resources`は作成物、`Outputs`はTenkaCloudへ返す値です。

## TenkaCloudから受け取る値

`hello-world`は4つのParameterを受け取ります。

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

  FlagSeed:
    Type: String
    NoEcho: true
    MinLength: 8
    MaxLength: 64
    AllowedPattern: "^[A-Za-z0-9]+$"
```

`NamePrefix`は、チームごとのリソース名を衝突させないための接頭辞です。

`TenkaCloudAccountId`と`ExternalId`は、TenkaCloudが参加者用Roleを引き受けるために使います。`ExternalId`を必須にすることで、意図しない第三者からのRole引受けを防ぎます。

`FlagSeed`は、デプロイごとにTenkaCloudが生成するランダム値です。後の章で`metadata.json`から`__RANDOM_PASSWORD__`を渡します。

## 参加者用IAM Role

論理IDは`ParticipantViewerRole`にします。TenkaCloudは、このRoleのARNをOutputから受け取って参加者をAWSへ案内します。

Roleには2種類の権限が必要です。

1. TenkaCloudのAWSアカウントから、正しい`ExternalId`付きで引き受けられる信頼ポリシー
2. 参加者が自分のSSM Parameterだけを読める権限

信頼ポリシーは次の形です。

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
    MaxSessionDuration: 3600
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess
```

`SignInLocalDevelopmentAccess`は、TenkaCloudが案内する一時的なAWSサインイン経路に必要です。問題ごとの判断で削除しません。

CloudShellを開くための許可も、カタログ共通の必須項目です。

```yaml
Policies:
  - PolicyName: ProblemSpecific
    PolicyDocument:
      Version: "2012-10-17"
      Statement:
        - Sid: OpenCloudShellSession
          Effect: Allow
          Action:
            - cloudshell:CreateEnvironment
            - cloudshell:CreateSession
            - cloudshell:GetEnvironmentStatus
            - cloudshell:StartEnvironment
            - cloudshell:StopEnvironment
            - cloudshell:DeleteEnvironment
            - cloudshell:PutCredentials
          Resource: "*"
```

SSMの読み取り権限は、自分の`NamePrefix`配下へ絞ります。

```yaml
- Sid: ReadOwnSsmParameters
  Effect: Allow
  Action:
    - ssm:GetParameter
    - ssm:GetParameters
    - ssm:GetParametersByPath
  Resource: !Sub "arn:aws:ssm:*:*:parameter/${NamePrefix}/*"
```

AWS ConsoleのParameter詳細画面は、表示時に`ssm:DescribeParameters`も呼び出します。このAPIはリソースARNで絞れないため、専用の読み取りStatementとして追加します。TenkaCloudでは1チームごとにAWSアカウントを分ける前提です。

```yaml
- Sid: DescribeOwnParameters
  Effect: Allow
  Action: ssm:DescribeParameters
  Resource: "*"
```

## SSM Parameterへflagを保存する

```yaml
HelloParameter:
  Type: AWS::SSM::Parameter
  Properties:
    Name: !Sub "/${NamePrefix}/hello"
    Type: String
    Value: !Sub "TC{${FlagSeed}}"
    Description: !Sub "TenkaCloud hello-world flag parameter (${NamePrefix})."
    Tier: Standard
```

参加者が読む値は`TC{...}`形式です。中身は`FlagSeed`なので、`NamePrefix`から推測できません。

## TenkaCloudへ返すOutput

```yaml
Outputs:
  ParameterName:
    Value: !Ref HelloParameter

  ParameterValue:
    Value: !GetAtt HelloParameter.Value

  ParameterConsoleUrl:
    Value: !Sub "https://${AWS::Region}.console.aws.amazon.com/systems-manager/parameters/${NamePrefix}/hello/description?region=${AWS::Region}&tab=Table"

  NamePrefix:
    Value: !Ref NamePrefix

  ParticipantViewerRoleArn:
    Value: !GetAtt ParticipantViewerRole.Arn
```

各Outputの利用者は異なります。

| Output | 利用者 | 用途 |
| --- | --- | --- |
| `ParameterName` | 参加者、運営 | 作成されたParameter名 |
| `ParameterValue` | 採点エンジン | 正解値 |
| `ParameterConsoleUrl` | 参加者 | AWS Consoleの詳細画面 |
| `NamePrefix` | TenkaCloud | チーム固有の接頭辞 |
| `ParticipantViewerRoleArn` | TenkaCloud | 参加者をAWSへ案内するRole |

参加者にはCloudFormation Outputを直接読む権限を与えないため、`ParameterValue`から答えを見ることはできません。次章では、このOutputを`metadata.json`のflag採点へ接続します。
