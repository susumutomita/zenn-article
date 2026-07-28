---
title: "リハーサルと当日運営"
free: true
---

クラウド競技は、問題が動くだけでは開催できません。参加者のログイン、AWS account、採点、障害注入、アナウンス、終了処理までを一つの流れとして確認します。

本番前に、少なくとも一度は全工程のリハーサルを行います。

## 役割を分ける

小規模イベントでも、役割を明示します。

| 役割 | 主な責任 |
| --- | --- |
| 進行 | 開始、終了、ルール説明、全体アナウンス |
| Platform operator | TenkaCloud、event、team、deploy、採点の監視 |
| Problem operator | 問題固有の障害、ヒント、解法の判断 |
| AWS safety | 費用、account、権限、残存resourceの確認 |
| Participant support | ログインや接続など競技外の詰まりを支援 |

一人で複数役を兼ねても構いませんが、判断の観点は分けます。

## 3種類のリハーサル

### 技術リハーサル

作者とoperatorが、デプロイから削除まで確認します。

- 問題stackの作成
- participant権限での接続
- endpoint登録
- 採点
- 障害注入
- 手動復旧
- 自動revert
- stack削除

### 初見者リハーサル

問題の実装を知らない人が解きます。作者は正解を説明せず、詰まりと時間を記録します。

### 運営リハーサル

本番と同じ時刻表で、アナウンス、障害発火、ヒント公開、終了処理を行います。

技術的に動く問題でも、全チームへの障害発火に10分かかる、誰がヒントを出すか決まっていない、といった運営上の問題が見つかります。

## 当日のrunbook

Cloud Rescueを90分で開催する例です。

```markdown
# Cloud Rescue 当日runbook

## T-60分
- operator login確認
- event、team、problemの状態確認
- AWS Budget、請求通知確認
- test teamでsmoke test

## T-20分
- 参加者受付
- Participant Portal login確認
- AWS Console federation確認
- SSM利用環境確認

## T-5分
- ルール説明
- 禁止事項と費用注意
- support窓口を案内

## T+0分
- 競技開始
- endpoint登録を案内
- score polling開始を確認

## T+15分
- 全teamの採点開始を確認
- 競技外の接続問題を支援

## T+25分
- frontend-downを全teamへ発火
- disruption結果とrevert予定を確認

## T+45分
- 必要なら全体hint 1を公開

## T+60分
- API側の追加障害または再発イベント

## T+85分
- 5分前アナウンス
- 最終score確認

## T+90分
- 競技終了
- 採点停止
- 結果保存
- 振り返り開始

## 終了後
- problem stack削除
- TenkaCloud destroy-all
- launcher stack削除
- 残存resourceと費用確認
```

## 競技外の詰まりを区別する

次は学習対象ではなく、運営で支援してよい問題です。

- Participant Portalへログインできない
- 間違ったAWS accountへ入っている
- AWS CLIが未導入
- browser sessionが管理者権限のまま
- SSM pluginやCloudShellの利用方法が分からない
- endpoint登録欄の場所が分からない

一方、次は問題の学習対象なので、すぐ正解を教えません。

- どのサービスが停止しているか
- どのログを見るか
- どの復旧方法を選ぶか
- 一度直した後に何を監視するか

support担当がこの境界を理解していないと、チームごとに支援量が変わり公平性を損ないます。

## 採点停止への対応

採点側の障害と参加者環境の障害を切り分けます。

確認順序の例です。

1. 一つのteamだけか、全teamか
2. endpoint登録値は正しいか
3. operator環境からendpointへ到達できるか
4. probe実行ログはあるか
5. score更新処理は成功しているか
6. 問題stackは正常か

全teamの採点が止まった場合は、競技時計を止める、該当時間を無得点にする、後で一律補正するなどのルールを事前に決めます。

## デプロイ失敗への対応

一部teamだけstack作成に失敗した場合、原因を記録して再実行します。

- service quota
- regionで利用できないinstance type
- IAM trust不整合
- account ID誤り
- UserData失敗
- resource名衝突

競技開始後まで解決しない場合は、代替accountやtest team環境を用意するか、開始時刻を調整します。現場で新しい構成を即興追加すると、後片付けと公平性が崩れます。

## ヒント公開の判断

個別hintと全体hintを使い分けます。

- 一人だけ詰まる: portalの段階hintを案内
- 半数以上が同じ入口で止まる: 問題文または全体アナウンスの不足
- 全teamが同じ場所で止まる: 実装不具合の可能性を疑う

「難しくしたいから黙る」のではなく、学習目標に関係しない詰まりは早めに解消します。

## スコアボードの扱い

スコアは盛り上げる道具ですが、学習そのものではありません。

- 上位teamだけを称賛しない
- 復旧速度、調査方法、再発防止など複数の観点を振り返る
- 誤操作や失敗を公開処刑にしない
- 同点時のルールを事前に決める

特に社内研修では、scoreを人事評価へ直結させると情報共有が減り、学習より防御的行動が増える可能性があります。目的に応じて扱います。

## 記録するもの

イベント後の改善に使うため、次を保存します。

- teamごとのdeploy開始・完了時刻
- endpoint登録時刻
- score推移
- disruption発火とrevert
- hint利用状況
- support問い合わせ
- 採点やplatformの障害
- 参加者の振り返り

秘密値、credential、不要な個人情報を記録しないようにします。

次章では、競技終了後の削除と振り返りを、イベントの一部として実施します。
