---
title: "付録B 開催・検証チェックリスト"
free: true
---

この付録は、問題作成からイベント終了までの確認項目を、実行順にまとめたものです。

チェックを埋めること自体が目的ではありません。失敗した項目には、証拠、原因、再確認方法を残してください。

## 1. 問題企画前

```markdown
- [ ] 対象者と前提知識を定義した
- [ ] 学習目標を観察可能な行動で書いた
- [ ] 一つの問題に一つの主役を置いた
- [ ] 正常条件を外から機械判定できる
- [ ] 想定する誤解を列挙した
- [ ] ChallengeとBattleのどちらが適切か判断した
- [ ] 想定時間と難易度の仮説を置いた
- [ ] 公開可能な題材か、社内限定か判断した
```

## 2. Scaffold直後

```markdown
- [ ] 既存の動作する問題からscaffoldした
- [ ] 問題IDがkebab-caseである
- [ ] ディレクトリ名とmetadataのidが一致する
- [ ] statusがdraftである
- [ ] `bun run validate`が成功する
- [ ] 生成indexを手編集していない
- [ ] 変更前の基準問題を実行できる
```

## 3. metadataレビュー

```markdown
- [ ] nameが学習内容を伝える
- [ ] shortDescriptionがカタログで読める長さである
- [ ] instructionsに状況、ゴール、制約がある
- [ ] descriptionに構成と学習内容がある
- [ ] difficultyが初見者基準である
- [ ] estimatedDurationが実測で更新される予定である
- [ ] learningGoalsが行動として書かれている
- [ ] tagsが検索用途として適切である
- [ ] exposedPortsが実装と一致する
- [ ] i18n.enが日本語版と同じ意味である
- [ ] cfnTemplateの参照が存在する
- [ ] endpoint slotの参照が一致する
- [ ] scoring fieldが現行SCHEMA.jsonに適合する
- [ ] portal slotを使う場合、対応componentが存在する
- [ ] secret、flag、credentialをmetadataへ書いていない
```

## 4. CloudFormationレビュー

```markdown
- [ ] NamePrefixを全resource名へ反映した
- [ ] TenkaCloudAccountIdを固定していない
- [ ] ExternalIdをNoEchoで受け取る
- [ ] AssumeRole trustにExternalId条件がある
- [ ] participant roleは問題に必要な操作だけを許可する
- [ ] 他team resourceの一覧を不要に許可していない
- [ ] IAMのResource:*に理由がある
- [ ] SSHなど不要な管理portを公開していない
- [ ] SSM Session Managerで管理できる
- [ ] 固定passwordや長期credentialがない
- [ ] ランダム値はdeploy経路から注入する
- [ ] Outputに答えやsecretを出していない
- [ ] participant導線に必要なOutputはある
- [ ] UserDataの失敗を観測できる
- [ ] 正常系を先に作成した
- [ ] 壊す箇所は意図した範囲に限定した
- [ ] participantが新しいトップレベルresourceを作らず解ける
- [ ] DeletionPolicy: Retainを使う場合、理由と削除手順がある
- [ ] `aws cloudformation validate-template`を実行した
```

## 5. Flag採点レビュー

```markdown
- [ ] flagはdeployごとに変わる
- [ ] flagをNamePrefixなど公開値から推測できない
- [ ] participantが意図したAWS操作でflagを発見する
- [ ] flagOutputKeyとCloudFormation Output名が一致する
- [ ] participant権限でcanonical Outputを直接読めない
- [ ] 別teamのflagを取得できない
- [ ] frontend bundleやlogにflagがない
- [ ] 正答で意図した点数になる
- [ ] 誤答penaltyが設計どおりである
- [ ] 二重提出の挙動を確認した
- [ ] 再deployでflagが変わる
```

## 6. Uptime採点レビュー

```markdown
- [ ] endpoint defaultまたはoverrideの導線が明確である
- [ ] endpoint未登録時の挙動を決めた
- [ ] pathが実endpointと一致する
- [ ] expectStatusが正常条件と一致する
- [ ] timeoutと失敗時の扱いを確認した
- [ ] uptime-flatとuptime-multiの選択理由がある
- [ ] 正常時の加点を確認した
- [ ] 一部障害時の点数を確認した
- [ ] 全障害時の点数を確認した
- [ ] 復旧後の次pollで採点が戻る
- [ ] polling周期と競技時間から最大点を試算した
- [ ] 初動差だけで勝敗が固定されない
- [ ] failurePenaltyが初心者を脱落させる強さになっていない
```

## 7. Disruptionレビュー

```markdown
- [ ] 学習目標と関係する障害である
- [ ] 対象teamとresourceを限定する
- [ ] participantが症状を観測できる
- [ ] participant権限で復旧できる
- [ ] actionが冪等である
- [ ] 複数回実行して破壊が累積しない
- [ ] 実行結果を監査できる
- [ ] revertを宣言した
- [ ] revert時刻が競技設計と一致する
- [ ] revert自体の失敗を観測できる
- [ ] 他teamへ影響しない
- [ ] operatorが発火対象を確認できる
- [ ] 公平な発火ルールを決めた
```

## 8. READMEとヒント

```markdown
- [ ] README.mdが英語primaryである
- [ ] README.ja.mdが日本語mirrorである
- [ ] 日英で構成と意味が一致する
- [ ] ストーリーがある
- [ ] 学習目標がある
- [ ] AWS構成が説明されている
- [ ] 初期症状が説明されている
- [ ] 正規解法がある
- [ ] 許容する別解がある
- [ ] 実運用での再発防止がある
- [ ] 削除手順がある
- [ ] Hint 1は入口だけを示す
- [ ] Hint 2は調査範囲を示す
- [ ] Hint 3は完走できる情報を示す
- [ ] 問題文へ正解コマンドを書きすぎていない
- [ ] ヒントpenaltyの目的が明確である
```

## 9. ローカル検証

```markdown
- [ ] `bun install`が成功する
- [ ] `bun run validate`が成功する
- [ ] catalog indexのcheckが成功する
- [ ] JSONとYAMLのsyntaxを確認した
- [ ] 問題固有serviceのtestが成功する
- [ ] Docker problemならクリーンな環境で起動できる
- [ ] secret scanを実行した
- [ ] Git diffに生成物やcredentialがない
```

## 10. 実AWSデプロイ

```markdown
- [ ] 使用commitを固定した
- [ ] regionを固定した
- [ ] クリーンなAWS環境を用意した
- [ ] 問題stackがCREATE_COMPLETEになる
- [ ] deploy時間を記録した
- [ ] UserData完了を確認した
- [ ] EC2がSSM onlineである
- [ ] participant roleをAssumeRoleできる
- [ ] AWS Console federationが正しいaccountへ着地する
- [ ] 必要なdeep linkが開く
- [ ] 不要なAWS serviceへアクセスできない
- [ ] 正常系endpointを確認した
- [ ] 意図した初期障害を確認した
- [ ] CloudFormation Outputが期待どおりである
```

## 11. Participant解答テスト

```markdown
- [ ] 管理者credentialを使わず解いた
- [ ] 問題文だけで開始地点を判断できる
- [ ] participantが対象resourceへ接続できる
- [ ] participantが症状を観測できる
- [ ] participantが原因を証拠から絞れる
- [ ] participantが修正できる
- [ ] instance内部から正常性を確認できる
- [ ] 外部endpointから正常性を確認できる
- [ ] Participant Portalで採点復帰を確認できる
- [ ] 想定外解法を記録した
- [ ] 禁止解法が実際に禁止されている
```

## 12. 削除テスト

```markdown
- [ ] problem stackを削除した
- [ ] DELETE_COMPLETEを確認した
- [ ] EC2が残っていない
- [ ] EBSが残っていない
- [ ] Elastic IPが残っていない
- [ ] Load Balancerとtarget groupが残っていない
- [ ] VPC、subnet、Internet Gatewayが残っていない
- [ ] Security Groupが残っていない
- [ ] SSM ParameterとSecretが残っていない
- [ ] CloudWatch Logsの残存が意図どおりである
- [ ] IAM roleとinstance profileが残っていない
- [ ] participantが手作業で作ったresourceがない
- [ ] 別regionにresourceがない
- [ ] 翌日以降に費用を確認する予定を登録した
```

## 13. 初見者テスト

```markdown
- [ ] 問題実装を知らない人へ依頼した
- [ ] 前提知識を記録した
- [ ] 開始から接続までの時間を記録した
- [ ] 完走時間を記録した
- [ ] 利用hintを記録した
- [ ] 最初の仮説を聞いた
- [ ] 仮説を変えた証拠を聞いた
- [ ] 競技外の詰まりを分離した
- [ ] 問題文の誤解を記録した
- [ ] 想定外解法を評価した
- [ ] difficultyとestimatedDurationを更新した
- [ ] 改善点をIssueにした
```

## 14. Pull Request前

```markdown
- [ ] 1問題1PRである
- [ ] AGENT.mdとcontribution guideを確認した
- [ ] statusをreadyにする根拠がある
- [ ] 学習目標をPRへ記載した
- [ ] AWS構成と費用要因をPRへ記載した
- [ ] participant権限をPRへ記載した
- [ ] disruptionとrevertをPRへ記載した
- [ ] 実AWSの検証regionを記載した
- [ ] deploy、solve、score、deleteの結果を記載した
- [ ] screenshotやlogにsecretがない
- [ ] READMEの日英差分を確認した
- [ ] CIが成功した
```

## 15. TenkaCloudデプロイ前

```markdown
- [ ] TenkaCloud本体refを固定した
- [ ] ProblemsRepoUrlを確認した
- [ ] ProblemsRepoRefを固定した
- [ ] リハーサルと本番で同じrefを使う
- [ ] TenantAdminEmailを確認した
- [ ] regionを確認した
- [ ] capacity parameterを確認した
- [ ] AWS Budgetを設定した
- [ ] 請求通知先を確認した
- [ ] destroy-all対応launcherである
- [ ] 削除担当を決めた
```

## 16. Event設定

```markdown
- [ ] event名と日時を確認した
- [ ] timezoneを参加者へ明示した
- [ ] 問題順序を確認した
- [ ] team名と参加者を確認した
- [ ] team account IDを二人で確認した
- [ ] trust roleを確認した
- [ ] ExternalIdを安全に登録した
- [ ] 全teamの問題stackがCREATE_COMPLETEである
- [ ] 全teamのSSM接続を確認した
- [ ] endpoint登録を確認した
- [ ] 正常時のscoreを確認した
- [ ] disruption targetを解決できる
- [ ] revert予定を確認した
```

## 17. 当日開始前

```markdown
- [ ] 進行担当がいる
- [ ] platform operatorがいる
- [ ] problem operatorがいる
- [ ] AWS safety担当がいる
- [ ] participant support担当がいる
- [ ] 連絡経路を参加者へ案内した
- [ ] login支援の手順がある
- [ ] 競技外の支援範囲を共有した
- [ ] score障害時のルールを共有した
- [ ] deploy失敗時の代替手順がある
- [ ] disruption発火時刻を確認した
- [ ] 全体hintの公開条件を確認した
- [ ] 終了と削除の時刻を確認した
```

## 18. 競技中

```markdown
- [ ] 全teamの採点開始を確認した
- [ ] 接続問題と技術問題を区別した
- [ ] support内容を記録した
- [ ] disruptionの対象teamを確認した
- [ ] disruption実行結果を確認した
- [ ] revert予定を確認した
- [ ] score更新を監視した
- [ ] platform障害の影響範囲を確認した
- [ ] 全体アナウンスを同時に行った
- [ ] ルール変更を即興で行っていない
```

## 19. 競技終了

```markdown
- [ ] 全teamへ変更停止を案内した
- [ ] 採点を停止した
- [ ] 最終scoreを保存した
- [ ] score推移を保存した
- [ ] hint利用を保存した
- [ ] disruption履歴を保存した
- [ ] platform障害を記録した
- [ ] secretやcredentialを記録していない
- [ ] 参加者の振り返りを実施した
```

## 20. 環境削除

```markdown
- [ ] 全teamのproblem stackを削除した
- [ ] 全problem stackのDELETE_COMPLETEを確認した
- [ ] CodeBuildでACTION=destroy-allを実行した
- [ ] destroy logを最後まで確認した
- [ ] launcher stackを削除した
- [ ] CodeBuild projectが残っていない
- [ ] artifact bucketが残っていない
- [ ] control dataが意図どおり削除された
- [ ] IAM roleとlog groupが残っていない
- [ ] 全team accountの残存resourceを確認した
- [ ] 別regionも確認した
```

## 21. 開催後

```markdown
- [ ] 翌日以降にCost Explorerを確認した
- [ ] team account別の費用を確認した
- [ ] 見積もりとの差を記録した
- [ ] 難易度と時間を更新した
- [ ] hintを改善した
- [ ] 運営runbookを改善した
- [ ] 問題versionを更新した
- [ ] 次回使用commitを決めた
- [ ] 改善Issueを作成した
- [ ] 公開カタログまたはProblem Packへ反映した
```

## 証拠を残す

各チェックには、可能な範囲で証拠を紐付けます。

```text
Check: Participant roleでSSM接続できる
Result: PASS
Evidence: test log 2026-xx-xx / CloudTrail event / sanitized screenshot
Commit: <SHA>
Region: <region>
Notes: AWS ConsoleはDescribeInstances権限も必要だった
```

account ID、credential、ExternalId、flagなどは、証拠を共有する前に削除してください。
