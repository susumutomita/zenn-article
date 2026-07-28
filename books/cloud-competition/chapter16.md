---
title: "終了、削除、振り返り"
free: true
---

競技終了のアナウンスをした時点では、イベントはまだ終わっていません。

採点を止め、結果を保存し、問題stackとTenkaCloud環境を削除し、残存resourceと費用を確認して初めて完了です。その後、参加者の行動を学習へ変える振り返りを行います。

## 終了時刻を明確にする

競技終了時には、全teamへ同じ内容を伝えます。

```text
競技を終了します。
新しいAWS変更を停止してください。
現在のターミナルとAWS Consoleは閉じず、運営の案内を待ってください。
最終scoreを確定した後、問題環境を削除します。
```

終了直後に参加者がresourceを作り直すと、最終scoreと削除対象が変わります。変更停止の時刻を明示します。

## 結果を保存する

少なくとも次を保存します。

- event名と開催日時
- 利用したTenkaCloud commit
- 利用した問題カタログcommit
- team一覧
- 最終score
- score推移
- hint利用
- disruption履歴
- deploy、採点、platform障害

scoreだけでなく、どの時点で復旧し、再発時にどう対応したかを見られると振り返りに役立ちます。

秘密情報を結果ファイルへ含めないようにします。

## 問題stackを削除する

まず、各team accountの問題stackを削除します。

削除状態を一覧で確認し、`DELETE_COMPLETE`になるまで追跡します。

```bash
aws cloudformation delete-stack --stack-name <problem-stack-name>
aws cloudformation wait stack-delete-complete \
  --stack-name <problem-stack-name>
```

TenkaCloudの管理画面や運営CLIから削除する場合も、最終的にはAWS側でstackが消えたことを確認します。

## TenkaCloud本体をdestroy-allする

launcherのCodeBuild projectから、build overrideで`ACTION=destroy-all`を指定します。

`destroy-all`は、Lite stackだけでなく、保持される可能性があるcontrol dataや問題deploy関連のresourceも含めて削除するための経路です。

古いlauncherが`destroy-all`に対応していない場合、未知のACTIONを通常deployとして扱う可能性があります。利用中のlauncherとtemplateのversionを確認し、必要なら最新templateへ更新してから実行します。

削除ログを最後まで確認します。

- TenkaCloud application stack
- problem deploy stack
- control data
- log group
- artifact bucket
- IAM role
- Lambda
- API、CloudFrontなど利用profile固有resource

## launcher stackを削除する

`destroy-all`が完了した後、`tenkacloud-lite-launcher`などのlauncher stackを削除します。

launcherを残すと、CodeBuild project、IAM role、log groupなどが残ります。次回使えるからという理由で残す場合も、誰が管理し、いつ削除するかを決めます。

本書では、イベントごとに新しいlauncherを作り、終了後に削除する運用を推奨します。

## 残存resourceを確認する

CloudFormationの成功表示だけに頼らず、利用したserviceを確認します。

Cloud Rescueで確認する例です。

```markdown
- [ ] EC2 instanceが残っていない
- [ ] EBS volumeが残っていない
- [ ] Elastic IPが残っていない
- [ ] VPC、subnet、Internet Gatewayが残っていない
- [ ] Security Groupが残っていない
- [ ] SSM Parameterが残っていない
- [ ] CloudWatch Logsが意図した保持方針になっている
- [ ] IAM roleとinstance profileが残っていない
- [ ] CloudFormation stackが残っていない
- [ ] CodeBuild projectとartifactが残っていない
```

参加者が手作業で新規resourceを作っていないかも確認します。

## 費用を確認する

請求データには反映遅延があります。終了直後だけでなく、翌日以降も確認します。

- Cost Explorer
- AWS Budgets
- service別利用量
- team account別の費用
- 想定外regionのresource

費用見積もりと実績の差を記録し、次回の問題数、team数、開催時間へ反映します。

## 振り返りの順序

解説を始める前に、参加者自身の行動を聞きます。

1. 最初に何を観察したか
2. 最初の仮説は何だったか
3. どの証拠で仮説を変えたか
4. 復旧後に何を確認したか
5. 再発時に何を変えたか
6. 実運用なら何を追加するか

作者が正解手順を読み上げるだけでは、参加者の判断が表面化しません。

## Cloud Rescueの解説

問題の正規解法を整理します。

1. frontendが失敗し、APIが正常であることを確認する
2. Stack Outputから対象instanceとSSM接続方法を得る
3. participant権限で`SSM Session Manager`へ接続する
4. `systemctl --failed`で停止serviceを探す
5. `systemctl status nginx`と`journalctl -u nginx`で状態を確認する
6. `nginx -t`で設定自体が壊れていないことを確認する
7. nginxを再起動する
8. instance内部と外部の両方からHTTP 200を確認する
9. Participant Portalのprobeがsuccessへ戻ることを確認する
10. 再発時に同じ観察手順を使う

重要なのは`systemctl restart nginx`という一行ではありません。症状から対象を絞り、証拠を確認し、復旧後に外形監視まで戻る流れです。

## 実運用へつなげる

競技では手動復旧しましたが、実運用では次を検討します。

- systemdのrestart policy
- ALBやRoute 53 health check
- CloudWatch alarm
- ログ集約
- deploy後のsmoke test
- runbook
- 障害時の権限昇格
- 自動復旧の失敗時に人へ通知する仕組み

競技で経験した操作を、現場の予防と検知へ接続します。

## 問題自体を振り返る

作者側では、次を改善します。

- 学習目標と実際の行動が一致したか
- 競技外の詰まりが多くなかったか
- 想定外解法は有害か、正当な別解か
- hintの段階は適切か
- score差が初動だけで決まらなかったか
- disruptionが理不尽でなかったか
- 削除と費用は想定どおりか
- 次回も同じcommitで再現できるか

改善点はIssueにし、問題のversionと変更理由を残します。

次章では、スコア、ヒント利用、復旧時間を分析し、開催結果を次の問題改善へ戻します。
