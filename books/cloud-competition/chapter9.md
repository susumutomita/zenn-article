---
title: "make agent-gateで問題を確認する"
free: true
---

問題ファイルをそろえたら、TenkaCloudChallengeリポジトリの定める方法で品質を確認します。

```bash
make agent-gate
```

依存関係をまだ導入していない場合は、先に次を実行します。

```bash
make install
make agent-gate
```

`make agent-gate`は、個別の検証コマンドを利用者が組み合わせるためのものではありません。リポジトリが問題作成の完了条件として定めた入口です。

## 確認される内容

主に次の内容が確認されます。

- `metadata.json`が`SCHEMA.json`に一致する
- 参照したCloudFormation Outputが存在する
- 必須の参加者用IAM権限がある
- EC2関連リソースへ必要なタグがある
- CloudFormation templateに危険な記述がない
- READMEの必須ファイルがある
- Challengeの点数とヒント減点が規定どおりである
- `index.json`とcost reportに差分がない

## hello-worldで確認したい接続

`hello-world`では、特に次の3点を確認します。

1. `scoring.flagOutputKey`の`ParameterValue`が`template.yaml`のOutputにある
2. `FlagSeed`が`cfnParameters`とCloudFormation Parameterの両方にある
3. `ParticipantViewerRole`が自分のSSM Parameterを読める

検証が失敗した場合は、エラーメッセージが示すファイルと項目を直します。検証を無効化したり、対象ファイルを除外したりしません。

## Pull Requestへ載せる情報

新しい問題を公開する場合は、1問につき1つのPull Requestにします。本文へ次の内容を書きます。

- 参加者に持ち帰ってほしい学び
- 参加者の最初の一手と勝利条件
- 作成するAWSリソース
- 採点方式
- コストと削除方法
- `make agent-gate`の結果

`hello-world`はこれで完成です。次章から、継続採点と障害注入を持つ`hello-world-battle`を作ります。
