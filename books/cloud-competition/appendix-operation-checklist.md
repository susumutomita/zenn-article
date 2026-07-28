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

## TenkaCloud Lite

- [ ] LPの`deploy-tenkacloud-lite`を最後まで実行した
- [ ] `tenkacloud-lite`が作成完了している
- [ ] `tenkacloud-lite-problem-deploy`が作成完了している
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
- [ ] `tenkacloud-lite`が残っていない
- [ ] `tenkacloud-lite-problem-deploy`が残っていない
- [ ] `tenkacloud-lite-launcher`を削除した
- [ ] EC2 instanceとDynamoDB tableの残存を確認した
- [ ] 次回直す問題文、ヒント、運営手順を記録した
