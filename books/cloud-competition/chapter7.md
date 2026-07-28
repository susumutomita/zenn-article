---
title: "flagと自動採点を実装する"
free: true
---

Challengeの最小採点は、参加者が提出した値とCloudFormation Outputを比較する`flag`方式です。

ただし、flagは何にでも付ければよいわけではありません。Cloud Rescue本体の成功条件は「サービスが正常であり続けること」なので、後半ではendpoint監視を使います。本章ではその前に、デプロイ、AWS操作、提出、加点の経路を確認する小さなChallengeを作ります。

## 固定flagが弱い理由

次のようなflagは避けます。

```text
TC{cloud-rescue}
```

リポジトリ、記事、過去の参加者から答えを知れば、AWS環境を触らずに得点できるためです。

TenkaCloudChallengeの`hello-world`では、デプロイごとのランダム値を`FlagSeed`として注入し、SSM Parameterへ保存します。参加者は実際にParameter Storeを読む必要があります。

## cfnParametersからランダム値を受け取る

`metadata.json`へ次を追加します。

```json
{
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

`__RANDOM_PASSWORD__`は、デプロイ経路が実値へ置き換えるための予約値です。作者が生成した固定passwordをGitへ置くのではありません。

`template.yaml`では、対応するParameterを宣言します。

```yaml
Parameters:
  FlagSeed:
    Type: String
    NoEcho: true
    MinLength: 8
    MaxLength: 64
    AllowedPattern: "^[A-Za-z0-9]+$"
```

## 参加者が操作して初めて見つかる場所へ置く

最小例では、SSM Parameterを作ります。

```yaml
Resources:
  RescueFlagParameter:
    Type: AWS::SSM::Parameter
    Properties:
      Name: !Sub "/${NamePrefix}/rescue-flag"
      Type: String
      Value: !Sub "TC{${FlagSeed}}"
      Tier: Standard
```

参加者roleには、この問題のpathだけを読む権限を与えます。

```yaml
- Sid: ReadOwnRescueFlag
  Effect: Allow
  Action:
    - ssm:GetParameter
    - ssm:GetParameters
    - ssm:GetParametersByPath
  Resource: !Sub "arn:aws:ssm:*:*:parameter/${NamePrefix}/*"
```

参加者は次のように値を取得します。

```bash
aws ssm get-parameter \
  --name "/<NamePrefix>/rescue-flag" \
  --query Parameter.Value \
  --output text
```

この問題の学習目標がParameter Storeの利用であれば、これで十分です。一方、サービス復旧を学ばせたい問題で、最初からParameterを読めるようにすると、復旧せずにflagだけ取れます。

そのため、本書では役割を分けます。

- `cloud-rescue-onboarding`: flag提出までの経路を確認する小問題
- `cloud-rescue-battle`: endpointの正常状態を継続採点する本番問題

採点方式を学習目標に合わせることが重要です。

## canonical answerをOutputへ出す

採点engineが参照する値をCloudFormation Outputへ出します。

```yaml
Outputs:
  RescueFlagValue:
    Description: Canonical answer used by the scoring engine.
    Value: !GetAtt RescueFlagParameter.Value
```

参加者へ`cloudformation:DescribeStacks`を広く許可すると、このOutputから直接答えを見られる可能性があります。Outputは採点側から参照し、参加者は意図したAWSサービスからflagを発見する権限設計にします。

## scoring.kindをflagにする

`metadata.json`へ採点を追加します。

```json
{
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "RescueFlagValue",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": [
      {
        "id": "hint-1",
        "content": "Stack OutputのParameter名を確認し、SSM Parameter Storeの実値を読みます。",
        "penalty": 20
      },
      {
        "id": "hint-2",
        "content": "AWS CLIでは `aws ssm get-parameter --name <parameter-name> --query Parameter.Value --output text` を使えます。",
        "penalty": 30
      }
    ]
  }
}
```

`flagOutputKey`は、`template.yaml`のOutput名と完全に一致させます。

## 答えが漏れる経路を確認する

実装後は、正規解法が動くことだけでなく、意図しない取得経路も確認します。

- `NamePrefix`からflagを推測できないか
- Gitに実値が残っていないか
- Participant PortalのHTMLやJavaScriptに答えが含まれないか
- 参加者roleでCloudFormation Outputを直接読めないか
- 他チームのParameterを一覧またはpath指定で読めないか
- エラーログにflagが出ないか

ランダムであることと、秘密であることは同じではありません。権限、表示、ログを含む経路全体を確認します。

## 提出テスト

実AWSへデプロイしたら、参加者roleで次を行います。

1. flagを取得する
2. 正しいflagを提出して加点される
3. 同じflagを再提出したときの挙動を確認する
4. 誤答時のペナルティを確認する
5. 別チームのflagが通らないことを確認する
6. stackを再デプロイし、flagが変わることを確認する

この小問題が通れば、TenkaCloudのデプロイから採点までの基本経路を独立して確認できます。

次章では、正解を直接教えずに完走率を上げるヒントと解説を設計します。
