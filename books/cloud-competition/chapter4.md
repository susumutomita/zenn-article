---
title: "Part 3｜Claude Codeで独自のChallengeを作り始める"
free: true
---

ここからは、読者自身の題材をTenkaCloudのChallengeへ変えます。本書ではCloud Rescueを例に進めますが、同じ手順で独自の問題を追加できます。

TenkaCloudChallengeには、新しい問題の作成を案内するClaude Code用の[`new-problem`スキル](https://github.com/susumutomita/TenkaCloudChallenge/tree/main/.claude/skills/new-problem)があります。このスキルは、既存の問題を雛形として選び、必要なファイルを作り、検証とPull Requestまで案内します。

ただし、題材や学習目標まで自動で決めてくれる魔法のコマンドではありません。参加者に何を持ち帰ってもらうかは、作問者が先に決めます。Claude Codeには、その設計をTenkaCloudChallengeの形式へ正しく落とす役割を任せます。

## 開発環境を準備する

TenkaCloudChallengeは、TenkaCloudの`problems/`ディレクトリにGit submoduleとして組み込まれています。本書では、TenkaCloudをsubmodule付きで取得します。

```bash
git clone --recurse-submodules https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make install
make validate-problems
```

ここには、役割の異なる2つのGitリポジトリがあります。

- **TenkaCloudのルート**では、`make validate-problems`で統合を確認し、TenkaCloud本体を起動します。
- **`problems/`**では、問題カタログを編集します。このディレクトリ自体がTenkaCloudChallengeリポジトリです。

新しい問題のファイルは`problems/`へ追加します。TenkaCloud本体のコードを変更する必要はありません。公開問題として送るPull Requestの宛先も、TenkaCloudではなくTenkaCloudChallengeです。

## Claude Codeを起動する前に決める

`new-problem`スキルは、作問者へ次の内容を質問します。Claude Codeを起動する前に、前章までの設計を短くまとめておきます。

| 項目 | 決める内容 |
| --- | --- |
| category | 個人演習のChallengeか、リアルタイム対戦のBattleか |
| slug | 問題ID。小文字の英数字とハイフンで付ける |
| scoring | flag、verify、uptime-flatなど、成功を確認する方法 |
| concept | 参加者に持ち帰ってもらう経験と、扱う障害や課題 |
| difficulty | 1から5までの難易度 |
| estimatedDuration | 参加者が完走するまでの想定時間 |

Cloud Rescueなら、次のように整理できます。

```text
category: Challenge
slug: cloud-rescue
scoring: flag
concept: 症状とログから停止したサービスを特定し、既存環境を復旧する
difficulty: 2
estimatedDuration: 30分
```

サービス名だけを書くのではなく、参加者にどんな判断と操作を経験してほしいかを書きます。この入力が曖昧なままだと、Claude Codeが形式を整えても、学習目的の弱い問題になります。

## `new-problem`スキルを読み込む

作問スキルは`problems/.claude/skills/`にあるため、`problems/`へ移動してからClaude Codeを起動します。

```bash
cd problems
claude
```

Claude Codeのプロンプトで`/skills`を開き、`new-problem`が表示されることを確認します。表示されない場合は、TenkaCloudのルートではなく`problems/`でClaude Codeを起動したか確認してください。

Claude Codeは、プロジェクトの`.claude/skills/<skill-name>/SKILL.md`をスキルとして読み込みます。`new-problem`を実行するときだけ、作問手順、必須IAM、tag、採点、検証に関する指示が会話へ読み込まれます。

## 対話形式でChallengeを作る

個人で進めるChallengeを作る場合は、次を入力します。

```text
/new-problem challenge
```

リアルタイム対戦のBattleなら、次を使います。

```text
/new-problem battle
```

どちらにするか相談しながら決めたい場合は、引数を付けません。

```text
/new-problem
```

Challengeでは`flag`採点が初期候補です。AWSを使わないDocker形式の問題なら、`verify`または`multi-verify`を選べます。Battleでは、`uptime-flat`、`uptime-multi`、`phased-polling`、`attack-detection`から競技の動きに合う方式を選びます。

Cloud Rescueを作る対話では、次の順で回答します。

1. slugに`cloud-rescue`を指定する
2. scoringに`flag`を指定する
3. conceptに、参加者へ持ち帰ってもらう経験を書く
4. difficultyに`2`を指定する
5. estimatedDurationに`30分`を指定する

Claude Codeへ全てを一度に任せる必要はありません。ファイルを編集する前に、次の確認を依頼できます。

```text
作成前に、選ぶstarter、参加者に提示する症状、想定する解答の流れ、
採点方法、作成予定のAWSリソースを説明してください。
私が確認してからファイルを編集してください。
```

この確認により、題材と異なる雛形を選んでいないか、参加者が手作業で課金リソースを新規作成する設計になっていないかを、実装前に止められます。

## スキルが行う6つの作業

`new-problem`スキルは、TenkaCloudChallengeの`AGENT.md`を読んだうえで、次の順に作業します。

1. ChallengeまたはBattleと採点方式を確認する
2. 目的に近い既存問題をstarterとして選ぶ
3. 新しい問題ディレクトリを作り、`metadata.json`を編集する
4. `template.yaml`と日英のREADMEを編集する
5. TenkaCloudChallengeを検証する
6. 1問題だけを含むbranchとPull Requestを作る

Challengeの`flag`採点では、`challenges/hello-world`が基本のstarterです。ローカルの単一判定なら`challenges/sqli-demo`、複数判定なら`challenges/wp-exposed-backup`が候補になります。Battleでは、採点方式に応じて`hello-world-battle`などから始めます。

雛形を使う理由は、ファイルを楽に増やすためだけではありません。参加者用roleの基本権限、CloudShellの操作、リソースをチームへ限定するtagなど、問題を安全に動かすための共通部分を引き継ぐためです。

## 作成されるファイルを確認する

CloudFormationを使うChallengeの基本構成は次のとおりです。

```text
problems/challenges/cloud-rescue/
├── metadata.json
├── template.yaml
├── README.md
└── README.ja.md
```

各ファイルには、異なる役割があります。

| ファイル | 役割 |
| --- | --- |
| `template.yaml` | チームのAWSアカウントへ作るリソースを定義する |
| `metadata.json` | 問題文、学習目標、template、採点、ヒントをTenkaCloudへ伝える |
| `README.md` | 問題作者と運営者が読む英語ドキュメント |
| `README.ja.md` | `README.md`と同じ内容の日本語ドキュメント |

`template.yaml`だけでは、AWS環境は作れても競技にはなりません。反対に、`metadata.json`だけでは参加者が操作する環境を作れません。2つのファイルを次の参照で接続します。

```text
metadata.json
├── cfnTemplate ──────────> template.yaml
├── cfnParametersのキー ─> template.yamlのParameters
└── scoring.flagOutputKey -> template.yamlのOutputs
```

Cloud Rescueでは、`metadata.json`の`FlagSeed`をCloudFormationへ渡します。採点時には、CloudFormationの`RecoveryFlag`を正解として読み取ります。

## 生成結果をそのまま採用しない

Claude Codeが作業を終えたら、少なくとも次を確認します。

- `metadata.json`の`id`とディレクトリ名が一致している
- starterの問題名や`TODO`が残っていない
- `learningGoals`が、参加者に持ち帰ってもらう学びと一致している
- `instructions`に、参加者が始めるための具体的な一手とゴールがある
- 問題文やヒントが答えを先に明かしていない
- `scoring`が参照するparameter、endpoint、Outputが実在する
- 全てのAWSリソースをCloudFormationで削除できる
- 参加者が手作業でトップレベルの課金リソースを作らない
- `ParticipantViewerRole`の共通権限と必要なtagが残っている
- `README.md`と`README.ja.md`の内容が対応している

starterの文字列が残っていないかは、TenkaCloudのルートから検索できます。

```bash
rg -n "TODO|hello-world|Hello World" problems/challenges/cloud-rescue
```

見つかった文字列を機械的に消すのではなく、新しい問題の設計へ置き換えます。

## TenkaCloud側から最終確認する

Claude Codeを終了し、TenkaCloudのルートへ戻って検証します。

```bash
cd ..
make validate-problems
```

`new-problem`スキルは、TenkaCloudChallenge側で問題を検証します。最後に`make validate-problems`を実行します。これにより、TenkaCloudがsubmoduleとして読み込む状態でも、schema、日英README、templateとの参照関係を確認できます。

失敗した場合は、表示されたファイル名と項目をClaude Codeへ渡して修正させます。検証を無効化したり、対象ファイルを除外したりして通してはいけません。

## Claude Codeを使わずに雛形を作る

Claude Codeを使わない場合も、同じ問題作成コマンドを利用できます。TenkaCloudのルートから実行します。

```bash
cd problems
bun run new challenges cloud-rescue --from hello-world
cd ..
make validate-problems
```

`bun run new`は問題ディレクトリを複製し、`id`を書き換え、カタログのindexと費用情報を再生成します。ただし、問題の中身までは作りません。`metadata.json`、`template.yaml`、日英READMEは読者自身で編集します。

公開できる問題はTenkaCloudChallengeへPull Requestを送ります。社内限定の題材は公開カタログへ送らず、privateな問題リポジトリまたはProblem Packとして管理します。

次章では、Claude Codeが作成した`template.yaml`を読み、AWS環境の定義を問題の設計へ合わせていきます。
