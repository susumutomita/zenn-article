---
title: "実装と検証の現在地"
free: true
---

Cloud Rescueは説明用の架空コードではありません。TenkaCloudChallengeにChallenge版とBattle版を実装しています。

- [Challenge実装](https://github.com/susumutomita/TenkaCloudChallenge/tree/feat/cloud-rescue-book/challenges/cloud-rescue)
- [Battle実装](https://github.com/susumutomita/TenkaCloudChallenge/tree/feat/cloud-rescue-book/battles/cloud-rescue-battle)
- [実装PR #318](https://github.com/susumutomita/TenkaCloudChallenge/pull/318)

PRをmainへmergeした後は、上のbranchを`main`へ読み替えてください。

## Challenge

初期状態ではPython APIは正常ですが、nginxは停止しています。参加者はSSM Session Managerで接続し、systemdとjournalを確認してnginxを復旧します。`/recovery`はlocalhostのnginxがHTTP 200を返すまでHTTP 503を返し、正常化するとデプロイごとのflagを返します。

## Battle

frontendの`/`とAPIの`/healthz`を継続採点します。`frontend-down`はnginxを、`api-down`は`tenkacloud-api`を停止します。どちらも600秒後に自動revertします。障害のtargeting規律と中止条件は`redteam/README.md`へ分離しています。

## CIで証明する範囲

metadata、CloudFormation参照、security checks、catalog test、index、cost report、course drift、Simulator compatibilityを機械検証します。

## 公開前に実AWSで記録すること

```text
TenkaCloud commit:
TenkaCloudChallenge commit:
AWS region:
Challenge deploy:
participant SSM接続:
初期状態 frontend/API:
復旧後 frontend/API:
flag採点:
Battle継続採点:
frontend disruption/revert:
API disruption/revert:
stack削除:
残存課金resource:
初見者の所要時間:
```

空欄を推測で埋めず、実AWSで確認した値だけを画面、log、所要時間とともに反映します。
