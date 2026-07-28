---
title: "ストーリー、勝利条件、安全境界を決める"
free: true
---

学びを決めたら、参加者が置かれる状況、勝利条件、触れてよい範囲を決めます。この3つが問題の仕様になります。

## ストーリーは最初の行動へつなげる

ストーリーは長い設定資料ではありません。参加者が「なぜ、このAWSリソースを調べるのか」を理解するために使います。

`hello-world`では、入社初日のSREが、前任者の残したSSM Parameterを調べます。引き継ぎには「SSMのhelloを見て」とだけ書かれています。この状況から、SSM Parameter Storeを開く行動へ自然につながります。

`hello-world-battle`では、入社2日目に小さなWeb stackを引き継ぎます。frontendとAPIを監視へ登録し、運営から障害が入ったら復旧します。これにより、URL登録とSSM接続の理由が分かります。

良いストーリーには、次の3点があります。

- 参加者の役割
- 現在起きていること
- 最初に確認する対象

## 勝利条件は機械で判定できる形にする

「調査できた」「復旧できた」だけでは、採点できません。外から観測できる条件へ変えます。

`hello-world`の勝利条件は、SSM Parameterの実値と提出値が一致することです。

`hello-world-battle`の勝利条件は、登録したfrontendの`/`とAPIの`/healthz`がHTTP 200を返すことです。Battleでは一度だけ判定せず、1分ごとに繰り返します。

| 問題 | 勝利条件 | TenkaCloudの採点方式 |
| --- | --- | --- |
| `hello-world` | 提出値がCloudFormation Outputの正解と一致 | `flag` |
| `hello-world-battle` | 2つのendpointがHTTP 200 | `uptime-flat` |

## 安全境界を先に決める

競技では参加者へAWS権限を渡します。問題を面白くするために広い権限を与えるのではなく、中心行動に必要な範囲へ絞ります。

`hello-world`で必要なのは、自分のprefix配下にあるSSM Parameterの読み取りです。他チームのParameterを書き換える権限は不要です。

`hello-world-battle`で必要なのは、自分のEC2を確認し、AWS Systems Managerのセッション機能で接続する権限です。SSHの公開や秘密鍵の配布は行いません。

次の境界を設計メモへ書きます。

- 参加者が操作できるAWSアカウント
- 操作できるリソース
- 読み取り、変更、削除のどこまで許可するか
- 外部公開するportとCIDR
- 運営が実行できる障害
- 障害の自動復旧時間
- 競技終了時の削除方法

## 2問の仕様を確定する

`hello-world`は次の仕様にします。

```text
参加者:
  AWS ConsoleまたはCLIでSSM Parameterを読む

勝利条件:
  TC{...}形式の値をParticipant Portalへ提出する

安全境界:
  自分のNamePrefix配下のSSM Parameterだけを読める

削除:
  CloudFormation stackを削除する
```

`hello-world-battle`は次の仕様にします。

```text
参加者:
  frontendとAPIのURLを登録する
  SSM Session ManagerでEC2へ接続する
  停止したnginxを起動する

勝利条件:
  frontendの/とAPIの/healthzがHTTP 200を返す

安全境界:
  チームのEC2だけへ接続できる
  公開portは80と8080

障害:
  運営がnginxを停止する
  10分後に自動でnginxを起動する

削除:
  CloudFormation stackを削除する
```

この仕様を、次章以降で`template.yaml`と`metadata.json`へ変換します。
