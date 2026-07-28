---
title: "リハーサルして開催する"
free: true
---

本番前に、運営者が参加者役になって2問を最後まで通します。画面が開くことだけではなく、参加者の操作、採点、障害、復旧、削除まで確認します。

## Hello World Challengeを通す

Participant Portalへテストチームのログイン鍵で入ります。

`hello-world`を開き、`ParameterConsoleUrl`からSSM Parameterを表示します。CLIを使う場合は、問題画面に示されたParameter名を指定します。

```bash
aws ssm get-parameter \
  --name /<NamePrefix>/hello \
  --query Parameter.Value \
  --output text
```

表示された`TC{...}`をParticipant Portalへ提出します。

確認する点は次のとおりです。

- 問題文と最初の一手が表示される
- 自分のチームのAWSへ移動できる
- SSM Parameterを読める
- 他チームのリソースを操作できない
- 正答時に100点が記録される
- 誤答とヒントの減点が定義どおりである

## Hello World Battleを通す

`hello-world-battle`を開きます。

最初に`SsmStartSessionCommand`でEC2へ接続します。

```bash
aws ssm start-session --target <InstanceId>
```

次に、`Ec2HostHint`を使ってParticipant PortalへURLを登録します。

```text
frontend: http://<Ec2HostHint>
api:      http://<Ec2HostHint>:8080
```

採点が始まり、2つのendpointが正常と表示されることを確認します。

## レッドチームの障害と復旧を通す

運営者はApplication Admin Consoleのレッドチーム機能を開き、対象としてテストチームを選びます。問題に定義した`frontend-down`を実行します。

nginxが停止し、次の採点周期でfrontendが失敗することを確認します。

参加者役はAWS Systems Managerのセッション機能で接続し、nginxを起動します。

```bash
sudo systemctl start nginx
sudo systemctl status nginx
```

次の採点周期でfrontendが正常へ戻ることを確認します。

次に、自動復旧も確認します。もう一度障害を実行し、手動復旧せずに10分待ちます。予約されたrevertがnginxを起動し、採点が戻ることを確認します。

これで、レッドチームの対象選択、障害実行、参加者による手動復旧、TenkaCloudによる自動復旧までを一度通せます。

## 本番当日の順番

当日は、次の順で進めます。

1. TenkaCloud Liteの2 stackが正常であることを確認する
2. Application Admin ConsoleとParticipant Portalを開く
3. 全チームの問題stackが作成済みであることを確認する
4. Participant PortalのURLとログイン鍵を配る
5. `hello-world`で参加者の接続と提出を確認する
6. `hello-world-battle`でendpoint登録を確認する
7. 全チームの採点開始後に障害を実行する
8. 終了時刻で順位を確定する
9. 問題stackとTenkaCloud Liteを削除する

問題の説明を始める前に、参加者全員がParticipant Portalへ入れたことを確認します。Battleの障害は、全チームのURL登録と初回採点が終わってから実行します。

次章では、イベントを安全に終了し、AWSリソースを削除します。
