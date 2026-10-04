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

- [ ] LPのCloud配置ガイドを最後まで実行した
- [ ] 配置した基盤stackが作成完了している（新規は`tenkacloud-cloud`系、以下の`tenkacloud-lite`系は既存環境の例）
- [ ] 選択layoutの問題配置stackが作成完了している
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
- [ ] `make local`でPortalを起動し、カタログから`sqli-demo`を開始できる
- [ ] Participant Portalから正答と誤答を確認した
- [ ] `make down`で終了した

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
- [ ] 配置した基盤stackが残っていない
- [ ] 選択layoutの問題配置stackが残っていない
- [ ] デプロイに使ったlauncher stackを削除した
- [ ] EC2、DynamoDB、S3、logと、選択したTursoの行の残存を確認した
- [ ] 次回直す問題文、ヒント、運営手順を記録した

## 停止・消去・キー再発行の区別

`make down`は停止操作です。大会、得点、キー、Dockerの書き込みレイヤーとvolumeを保持し、RAMは保持しません。同じデータディレクトリで`make local`を実行し、参加者がStart / resumeで再開します。

`make local-clear`は確認後に競技データと所有するDocker問題データを消去します。`make local-reset`は主催者アクセスを再発行し、大会・参加者データを保持します。対話的な`make local`起動ごとに新しい主催者キーを一度表示し、古い主催者アクセスを失効させます。起動中の`make local-reset`は別の対話端末から同じデータディレクトリへ実行します。非TTY・public/container起動は既存キーを保持し、ログに表示しません。
