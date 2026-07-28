---
title: "復旧に結び付くflag採点を実装する"
free: true
---

Challengeの採点には`flag`方式を使います。ただし、固定文字列を入力するだけでは、serviceを復旧した証拠になりません。

Cloud Rescueでは、デプロイごとのflagを作ります。さらに、nginxが正常になるまでAPIの`/recovery`から返さない構成にします。

## デプロイごとに値を変える

`metadata.json`は、random valueの注入を要求します。

```json
{
  "cfnParameters": {
    "FlagSeed": "__RANDOM_PASSWORD__"
  }
}
```

`template.yaml`は、採点用の値をOutputへ出します。

```yaml
Outputs:
  RecoveryFlag:
    Description: Canonical flag used by the scoring engine.
    Value: !Sub "TC{${FlagSeed}}"
```

TenkaCloudは、このOutputをcanonical answerとして比較します。

## 復旧するまでAPIから返さない

Python APIの`/recovery`は、localhostのnginxへ接続します。

```python
if self.path == "/recovery":
    if self.client_address[0] not in ("127.0.0.1", "::1"):
        return forbidden()

    frontend_ok = probe("http://127.0.0.1/")
    if not frontend_ok:
        return unavailable("frontend-unhealthy")

    return text(RECOVERY_FLAG)
```

実装では標準libraryだけを使います。外部からの`/recovery`呼び出しはHTTP 403です。EC2内から呼び出しても、nginxが停止中ならHTTP 503になります。

参加者は復旧後に次を実行します。

```bash
curl -fsS http://localhost:8080/recovery
```

## scoringを宣言する

```json
{
  "scoring": {
    "kind": "flag",
    "flagOutputKey": "RecoveryFlag",
    "points": 100,
    "wrongAnswerPenalty": 5,
    "hints": [
      {
        "id": "hint-1",
        "content": "frontendとAPIの状態を比較する",
        "penalty": 10
      },
      {
        "id": "hint-2",
        "content": "systemctlとjournalctlで確認する",
        "penalty": 15
      },
      {
        "id": "hint-3",
        "content": "frontendを復旧してrecovery endpointを確認する",
        "penalty": 25
      }
    ]
  }
}
```

`flagOutputKey`は、CloudFormation Outputの`RecoveryFlag`と一致させます。difficulty 2の標準得点に合わせて100点にします。3つのヒント減点は合計50点です。catalogの規則に従い、満点の50%を超えないようにします。

## flagを秘密境界と考えない

参加者は、EC2内でsudoを使えます。したがって、このflagは悪意のあるroot利用者から秘密を守る仕組みではありません。

Challengeの目的は、症状の比較、SSM接続、systemd調査、復旧、確認という流れを作ることです。正常状態を維持できるかは、Battle版の外形監視で評価します。

## 確認する経路

実AWSでは次を確認します。

1. nginx停止中の`/recovery`がHTTP 503になる
2. 外部からの`/recovery`がHTTP 403になる
3. nginx復旧後、localhostからデプロイ固有flagを取得できる
4. 正しいflagで100点を得る
5. 誤答で5点を失う
6. 別teamのflagを提出できない
7. 再デプロイ後にflagが変わる

次章では、答えを直接書かずに完走率を上げるヒントを設計します。
