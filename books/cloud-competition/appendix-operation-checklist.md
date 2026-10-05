---
title: "付録A｜開催チェックリスト"
free: true
---

## 問題作成

- [ ] 参加者に持ち帰ってほしい学びを行動で書いた
- [ ] 最初の一手を決めた
- [ ] 勝利条件を機械で判定できる
- [ ] 参加者のAWS権限を必要な範囲へ絞った
- [ ] 参加者がtop-level AWSリソースを手作業で残さない
- [ ] 日本語と英語の表示内容が対応している
- [ ] READMEと実装の点数、Output、ヒントが一致している
- [ ] `make agent-gate`が成功した

## TenkaCloud

- [ ] LPの「自分のTenkaCloudを立てる」を最後まで実行した
- [ ] `tenkacloud-cloud`（既存環境では`tenkacloud-lite`）の作成が完了している
- [ ] `tenkacloud-cloud-problem-deploy`（既存環境では`tenkacloud-lite-problem-deploy`）の作成が完了している
- [ ] Application Admin Consoleへサインインできる
- [ ] Participant Portalが開く
- [ ] 本番用の`ProblemsRepoRef`を確認済みのtagかcommit SHAへ固定した

## チーム

- [ ] 各チームのAWSアカウントへ`competitor-bootstrap.yaml`をデプロイした
- [ ] Role ARNをApplication Admin Consoleへ登録した
- [ ] TenkaCloud側と競技者側の`ExternalId`が一致している
- [ ] テストチーム1つで問題デプロイが成功した
- [ ] 各チームのログイン鍵を安全に保管した

## Hello World Challenge

- [ ] 問題文と最初の一手が表示される
- [ ] `ParameterConsoleUrl`が開く
- [ ] CLIからSSM Parameterを読める
- [ ] `TC{...}`の正答で加点される
- [ ] 誤答減点が動く
- [ ] 2つのヒントが順に表示される

## Hello World Battle

- [ ] AWS Systems Managerのセッション機能でEC2へ接続できる
- [ ] `Ec2HostHint`が表示される
- [ ] frontendとapiのURLを登録できる
- [ ] 登録前は採点されない
- [ ] 登録後に2つのendpointが正常になる
- [ ] `frontend-down`でnginxが停止する
- [ ] `systemctl start nginx`で復旧する
- [ ] revertで自動復旧する

## ローカル問題

- [ ] `runtime.entry`が実在するCompose fileを指している
- [ ] 攻略対象と`/verify`を別のportで提供している
- [ ] 公開portを`127.0.0.1`へbindしている
- [ ] flagを実行ごとの`FLAG_SEED`から生成している
- [ ] 不正解時に`/verify`が答えを漏らさない
- [ ] `make local`が表示した主催者キーでログインし、イベント、チーム、`sqli-demo`を準備して開始できる
- [ ] 参加者URLとチームキーでログインし、「起動・再開」でDocker環境を起動できる
- [ ] Participant Portalから正答と誤答を確認した
- [ ] `make down`で停止した（データは残る。消去は`make local-clear`、主催者キーの再発行は`make local-reset`）

## 当日

- [ ] 全チームがParticipant Portalへログインした
- [ ] 全チームの問題stackが作成完了している
- [ ] Challengeの提出を1チーム以上で確認した
- [ ] Battleの初回採点を全チームで確認した
- [ ] 障害は全チームの準備完了後に実行した
- [ ] 終了時刻と順位確定時刻を共有した

## 撤収

- [ ] 順位と必要な記録を保存した
- [ ] 各チームの問題stackを削除した
- [ ] CodeBuildで`ACTION=destroy-all`を実行した
- [ ] `tenkacloud-cloud`（既存環境では`tenkacloud-lite`）が残っていない
- [ ] `tenkacloud-cloud-problem-deploy`（既存環境では`tenkacloud-lite-problem-deploy`）が残っていない
- [ ] launcher stack（LPの手順では`tenkacloud-lite-launcher`）を削除した
- [ ] EC2、DynamoDB、S3、logが残っていない。Tursoを選んだ場合は、そのDBに競技データが残っていない
- [ ] 非公開のsource archiveと、残したS3 bucketを削除した。残す場合は、保存期限と費用を確認する担当者を決めた
- [ ] CDKToolkit、共有asset、競技者用Roleを残すか削除するかを、それぞれの管理者と決めた
- [ ] 次回直す問題文、ヒント、運営手順を記録した
