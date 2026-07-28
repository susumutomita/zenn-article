---
title: "壊れたAWS環境をCloudFormationで作る"
free: true
---

競技環境は、正常なシステムを作ってから意図的に壊します。最初から壊れたテンプレートを書くと、作者自身も「意図した障害」と「単なる構築失敗」を区別できません。

本書では`battles/hello-world-battle`を基準にします。このサンプルは、VPC、公開subnet、EC2、nginx、Python API、SSM接続を含む最小のWeb stackです。

```bash
bun run new battles cloud-rescue-battle --from hello-world-battle
```

## template.yamlが受け取る3つの共通値

TenkaCloudからデプロイされる問題templateでは、少なくとも次の値を扱います。

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

`NamePrefix`は、同じAWSアカウントやリージョンで複数チームのリソース名が衝突しないように使います。`TenkaCloudAccountId`と`ExternalId`は、TenkaCloud側から参加者用roleをAssumeRoleするために使います。

これらを作者が固定値にしないでください。デプロイ経路が注入します。

## ParticipantViewerRoleを問題単位に絞る

参加者へ管理者権限を渡すのは簡単ですが、競技の安全境界がなくなります。参加者roleには、問題を解くための操作だけを許可します。

Cloud Rescueでは、次の操作が必要です。

- 対象EC2の情報を見る
- SSM Session Managerで接続する
- 自分の問題に必要なログを読む
- 必要なサービスを起動・停止する

信頼ポリシーは、TenkaCloud operator accountとExternalIdを条件にします。

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
```

実際の権限ポリシーは、複製元の`hello-world-battle/template.yaml`を基準にします。AWS Consoleが内部で呼ぶlist系APIはresource単位に絞れない場合があります。単に`AccessDenied`が出たから`Resource: "*"`を増やすのではなく、専用アカウント境界と実際のConsole呼び出しを確認して判断します。

## 正常系を先に確認する

Cloud Rescueの正常状態は次です。

- EC2が起動している
- SSM Agentが接続可能
- nginxが80番ポートで`/`を返す
- Python APIが8080番ポートで`/healthz`を返す
- Security Groupが必要な通信だけを許可する

まず、複製元を変更せずにデプロイし、正常系を確認します。

```bash
curl -fsS "http://<EC2_PUBLIC_DNS>/"
curl -fsS "http://<EC2_PUBLIC_DNS>:8080/healthz"
```

両方が成功する状態を基準にします。

## 壊す場所は一つにする

最初のChallengeでは、nginxを停止した状態から開始します。ネットワーク、IAM、EC2起動自体は正常に保ちます。

UserDataの最後に、競技開始状態を作る処理を置く方法があります。

```bash
systemctl enable nginx
systemctl start nginx
systemctl enable tenkacloud-api
systemctl start tenkacloud-api

# Cloud Rescueの開始状態: frontendだけ停止
systemctl stop nginx
```

ただし、UserDataが途中で失敗して停止したのか、意図的に停止したのかを区別できるようにします。たとえばセットアップ完了をログへ残します。

```bash
echo "cloud-rescue setup completed" | systemd-cat -t cloud-rescue-setup
systemctl stop nginx
```

参加者が観察できる状態は次のようになります。

- EC2はrunning
- SSM接続は成功する
- APIは正常
- frontendだけ接続に失敗する
- `systemctl status nginx`でinactiveを確認できる

原因空間が狭く、最初の問題として扱いやすい構成です。

## Outputは参加者の導線になる

CloudFormation Outputsは、単なるデバッグ情報ではなく、参加者を対象リソースへ導くUIの一部です。

```yaml
Outputs:
  InstanceId:
    Value: !Ref AppInstance

  Ec2HostHint:
    Value: !GetAtt AppInstance.PublicDnsName

  SsmStartSessionCommand:
    Value: !Sub "aws ssm start-session --target ${AppInstance}"

  ParticipantViewerRoleArn:
    Value: !GetAtt ParticipantViewerRole.Arn
```

答えそのものは出しません。接続対象やConsole deep linkのように、迷いを減らす情報だけを出します。

## participantが新しいリソースを作らなくてよい設計

問題を解く操作は、既存リソースの変更に限定します。

- nginxを再起動する
- systemd unitを確認する
- ログを読む
- 必要なら既存設定を修正する

新しいEC2、Load Balancer、Elastic IPを作らせると、stack削除で回収できない可能性があります。「作る問題」より「直す問題」の方が、イベント終了後の安全性を管理しやすくなります。

## Secretsをtemplateへ埋め込まない

固定flag、固定password、長期credentialをGitへ置きません。Challengeでflagが必要な場合は、デプロイ時にランダム値を注入し、参加者が意図した操作をしたときだけ取得できる場所へ保存します。

次章では、作成したAWS環境を`metadata.json`からカタログ、採点、ポータルへ接続します。
