---
title: "付録A 競技設計テンプレート"
free: true
---

この付録は、新しいクラウド競技を企画するときにコピーして使うテンプレートです。

問題作者が頭の中だけで設計すると、学習目標、採点、権限、削除のどれかが後回しになります。コードを書く前にテンプレートを埋め、実装中と初見者テスト後に更新してください。

## 競技概要

```markdown
# <競技名>

## 一文で説明する
<誰が、どの状況で、何を達成する競技か>

## category
Challenge / Battle

## 想定対象者
- <役割>
- <経験>
- <前提知識>

## 想定時間
- 初見者: <分>
- 経験者: <分>
- イベント全体: <分>

## 難易度
1〜5

## 使用するAWSリージョン
<region>
```

「一文で説明する」は、技術要素の列挙ではなく参加者の行動を書きます。

悪い例です。

> EC2、SSM、CloudWatchを使う問題。

良い例です。

> 顧客向けWebが停止した状況で、SSMから対象ホストへ入り、サービス状態とログを調査して復旧する。

## 学習目標

```markdown
## 学習目標

### 状況
<参加者が観測する症状>

### 行動
<参加者が自力で行う操作と判断>

### 成功の判定
<外から機械判定できる結果>

### 振り返りで確認すること
- <最初の仮説>
- <仮説を変えた証拠>
- <復旧後の確認>
- <実運用での再発防止>
```

学習目標は「理解する」ではなく、観察できる行動で書きます。

## ストーリー

```markdown
## ストーリー

### 参加者の役割
<当番SRE、Platform Engineer、Security Engineerなど>

### 発生したこと
<障害、設定ミス、攻撃、移行要求など>

### 放置した場合の影響
<顧客影響、公開延期、監査不合格など>

### ゴール
<参加者が達成すべき正常状態>

### 制約
- 新しいトップレベルリソースを作らない
- 他チームの環境を操作しない
- 採点基盤を直接変更しない
```

長い世界設定より、行動の意味が伝わることを優先します。

## 初期状態と正常状態

```markdown
## 初期状態

| 対象 | 初期状態 | 参加者に見える症状 |
| --- | --- | --- |
| <resource> | <broken state> | <observable symptom> |

## 正常状態

| 判定対象 | 正常条件 | 採点方法 |
| --- | --- | --- |
| <endpoint / flag / metric> | <expected state> | <scoring kind> |
```

最初に正常状態を実装して確認し、その後に壊れた状態を追加します。

## 想定解法と別解

```markdown
## 想定解法

1. <最初の観察>
2. <接続>
3. <証拠の確認>
4. <修正>
5. <内側から確認>
6. <外側から確認>
7. <採点復帰を確認>

## 許容する別解
- <同じ学習目標を満たす別の方法>

## 禁止する解法
- <安全性を壊す方法>
- <削除不能なresourceを作る方法>
- <採点を迂回する方法>
```

作者の想定と違うだけの解法を禁止しません。学習目標、安全性、再現性で判断します。

## ヒント

```markdown
## ヒント

### Hint 1: 入口
内容: <接続先または観察場所>
ペナルティ: <points>

### Hint 2: 調査
内容: <対象service、log、APIなど>
ペナルティ: <points>

### Hint 3: 復旧
内容: <正解に近い操作>
ペナルティ: <points>
```

ヒントは答えを分割して隠すのではなく、探索空間を段階的に狭めます。

## AWSリソース

```markdown
## AWSリソース

| resource | 個数 / team | 用途 | 費用要因 | 削除方法 |
| --- | ---: | --- | --- | --- |
| <service> | <count> | <purpose> | <billing dimension> | CloudFormation |

## 利用しない高額resource
- NAT Gateway
- <problem-specific exclusions>
```

チーム数と開催時間を掛けて費用を見積もります。

## IAMとaccount境界

```markdown
## account境界
- teamごとに専用AWS accountを使う / 共有accountを使う
- operator account ID: 実値を原稿や公開Gitへ書かない

## participantが必要な操作
- <AWS actionまたはinstance内部操作>

## participantに不要な操作
- IAM管理
- Organizations
- Billing
- 他team resourceの一覧

## trust
- AssumeRole principalをTenkaCloud operator accountへ限定
- ExternalIdを必須化
- session durationを競技時間に合わせる
```

role名ではなくpolicyの実効権限を確認します。

## Network境界

```markdown
## 公開endpoint
- <port / path / purpose>

## 管理経路
- SSM Session Manager

## 公開しないもの
- SSH
- 管理API
- flag
- credential

## 採点環境からの到達性
<public endpoint / private connectivity / proxy>
```

## 採点設計

```markdown
## scoring kind
flag / uptime-flat / uptime-multi / phased-polling / attack-detection

## polling周期
<minutes>

## 正常時の点数
<points>

## 失敗時の扱い
<no score / penalty>

## 最大理論点
<計算式>

## 逆転可能性
<妨害回数と復旧時間を含む試算>
```

点数は雰囲気で決めず、競技時間から試算します。

## disruption設計

```markdown
## disruption

### ID
<kebab-case>

### 症状
<参加者に見える変化>

### action
<対象resourceと変更内容>

### trigger
operator手動 / after-deploy / team-score-above / phase-entered

### revert
<何秒後に、何を元へ戻すか>

### 冪等性
<複数回実行時の挙動>

### 監査
<実行結果と対象teamをどこへ記録するか>
```

参加者が原因を観測できず、復旧できない障害は追加しません。

## 削除設計

```markdown
## CloudFormation管理resource
- <list>

## participantが変更するもの
- 既存resourceの設定のみ

## Retainするresource
なし / <理由と削除手順>

## 削除確認
- EC2
- EBS
- EIP
- Load Balancer
- VPC
- SSM
- Logs
- IAM
- problem stack
- TenkaCloud stack
- launcher
```

削除を実装後の作業にせず、問題仕様の一部にします。

## 実機検証記録

```markdown
## 実機検証

- TenkaCloud commit: <SHA>
- Problems commit: <SHA>
- AWS region: <region>
- Date: <YYYY-MM-DD>
- Test account: <用途だけ記載し、公開原稿へaccount IDを載せない>

### Deploy
- Result: <CREATE_COMPLETE / failure>
- Duration: <minutes>

### Participant access
- Console federation: <pass / fail>
- SSM: <pass / fail>

### Initial state
- <observable state>

### Solve
- Result: <pass / fail>
- Duration: <minutes>

### Scoring
- Initial: <result>
- Healthy: <result>
- Failed: <result>
- Recovered: <result>

### Disruption
- Action: <pass / fail>
- Revert: <pass / fail>

### Delete
- Stack: <DELETE_COMPLETE / failure>
- Remaining billable resources: <none / list>
```

## 初見者テスト

```markdown
## 初見者テスト

- 対象者: <前提知識>
- 人数: <count>
- 完走率: <rate>
- 中央所要時間: <minutes>
- Hint 1利用: <count>
- Hint 2利用: <count>
- Hint 3利用: <count>

### 競技外の詰まり
- <login / environment / navigation>

### 学習対象での詰まり
- <technical reasoning>

### 想定外解法
- <method and assessment>

### 改善Issue
- <issue links>
```

問題作者自身の解答時間は、難易度の基準になりません。

## 公開判定

```markdown
## ready判定

- [ ] schema検証が成功する
- [ ] クリーンなAWS環境へデプロイできる
- [ ] participant権限で解ける
- [ ] 採点が全状態で正しい
- [ ] disruptionとrevertが正しい
- [ ] 初見者が完走できる
- [ ] 削除後に課金resourceが残らない
- [ ] READMEの日英が一致する
- [ ] secretと固定flagがGitにない
- [ ] 開催commitを固定できる
```

全てを確認するまでは`status: draft`を維持します。
