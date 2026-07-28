---
title: "ヒントと解説で学習体験を作る"
free: true
---

難しい問題がよい問題とは限りません。何も分からないまま時間切れになると、測れるのは事前知識の差だけです。

Cloud Rescueは、3段階のヒントを`metadata.json`へ持ちます。英語版も同じIDで対応させます。

## Hint 1は症状を比較させる

```text
frontendとAPIの /healthz を比較してください。
同じhost上でAPIが正常なら、network全体だけを疑い続ける必要はありません。
```

最初のヒントは、原因を教えません。観測済みの情報を比較し、調査範囲を狭めさせます。penaltyは10点です。

## Hint 2は証拠の場所を示す

```text
SSMで接続後、systemctl status nginx tenkacloud-api と
journalctl で状態と証拠を確認します。
```

service名と調査手段を示します。復旧commandはまだ書きません。penaltyは20点です。

## Hint 3は完走を優先する

```text
停止しているfrontend serviceを復旧します。
localhostで正常性を確認してから /recovery へアクセスします。
```

最終ヒントでは、復旧からflag取得までの方向を示します。penaltyは30点です。

## 問題文、ヒント、READMEを分ける

問題文は、状況、ゴール、制約だけを示します。ヒントは探索範囲を段階的に狭めます。READMEは、終了後に調査の順序と設計意図を整理する資料です。

| 文書 | 役割 | 原因を明かす時期 |
| --- | --- | --- |
| `metadata.instructions` | 競技中の状況とゴール | 明かさない |
| `scoring.hints` | 詰まりを解消する | 段階的に示す |
| `README.ja.md` | 学習内容と再利用方法 | 終了後に説明する |

## READMEで扱う内容

Cloud RescueのREADMEには、次を記載します。

- frontendとAPIの症状差
- SSMセッションマネージャーの接続経路
- systemdとjournalの確認
- `/recovery`の条件
- flagはsudo利用者への秘密境界ではないこと
- Battle版で継続状態を評価する理由
- CloudFormationでの削除方法

日本語版と英語版で、学習目標と制約をずらしません。

## 初見者テストで記録する

解答できたかだけでなく、次を記録します。

- 最初に比較したendpoint
- AWS環境へ接続するまでの時間
- 開いたヒントと時刻
- 最初の仮説
- 仮説を変えた証拠
- 復旧後に確認した対象
- 問題文で誤解した表現

ヒント利用は失敗ではありません。教材の説明が不足した場所を示すデータとして使います。

次章では、CIと実AWSの検証範囲を分けます。
