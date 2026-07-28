---
title: "自分の題材で新しい問題を作る"
free: true
---

本書では、AWSのChallenge、AWSのBattle、Dockerで動くローカルChallengeを一から作りました。最後に、自分の題材をTenkaCloudChallengeへ追加する手順を整理します。

## コマンドを実行する前に決める

Claude Codeの問題作成スキルは、競技の内容を自動で考えるものではありません。最初に、次の5点を自分の言葉で書きます。

```text
参加者に持ち帰ってほしいこと:

参加者の役割と現在の状況:

最初に取ってほしい行動:

成功を判定できる条件:

AWSとローカルのどちらで動かすか:
```

たとえば、期限切れ証明書の復旧を題材にするなら、「証明書を知る」では不十分です。

```text
参加者に持ち帰ってほしいこと:
  接続失敗を観測し、証明書の期限を確認し、
  新しい証明書へ切り替えた後にHTTPSの正常応答を確認できる
```

この文章から、必要な環境、最初の手がかり、採点条件を決めます。

## new-problemスキルを開く

TenkaCloudChallengeには、Claude Code用の`new-problem`スキルがあります。

- [人間向けの使い方](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/README.md)
- [Claude Codeが読む作問手順](https://github.com/susumutomita/TenkaCloudChallenge/blob/main/.claude/skills/new-problem/SKILL.md)

TenkaCloudChallengeのルートをClaude Codeで開き、作りたい形式を指定します。

```text
/new-problem challenge
```

または、Battleを作る場合は次のように入力します。

```text
/new-problem battle
```

形式をまだ決めていない場合は、引数を省略できます。

```text
/new-problem
```

スキルは、順番に次の内容を確認します。

1. 問題形式
2. 採点方式
3. 問題IDに使うslug
4. 問題の題材
5. 難易度
6. 想定時間

題材を聞かれたら、前節で書いた参加者体験とストーリーを渡します。「S3の問題を作って」のようなサービス名だけでは、何を学ぶ競技か決まりません。

## AWS Challengeを作る

値の発見や、一度の修正完了を採点したい場合はChallengeを選びます。採点方式は`flag`です。

スキルは、`challenges/hello-world`をstarterとして新しいディレクトリを作ります。starterには、参加者用IAM Role、必須のCloudShell権限、リソース名のprefix、flag採点の接続が含まれます。

生成後に、次の内容を自分の題材へ置き換えます。

1. `metadata.json`の問題文、学習目標、ヒント
2. `template.yaml`の問題固有リソース
3. 参加者が操作した結果として発見できるflag
4. `ParticipantViewerRole`の問題固有権限
5. 日本語と英語のREADME
6. コストと削除方法

flagは固定文字列にしません。問題をデプロイするたびに変わり、参加者が意図した操作をしたときだけ発見できる値にします。

## AWS Battleを作る

サービスの状態を競技中に繰り返し採点したい場合はBattleを選びます。

スキルは、次の採点方式を確認します。

| 採点方式 | 用途 |
| --- | --- |
| `uptime-flat` | 複数endpointを個別に採点する |
| `uptime-multi` | すべて正常な場合だけ得点する |
| `phased-polling` | 時間帯によって採点条件を変える |
| `attack-detection` | 検知数などの統計を得点へ変える |

最初のBattleには、`battles/hello-world-battle`をstarterとする`uptime-flat`が分かりやすいです。

Battleでは、次の内容を決めます。

- 参加者が登録するendpoint
- 正常と判定するパスとHTTP status
- URLを登録する前に得点させない方法
- レッドチームが実行する障害
- 参加者が復旧する方法
- 障害を自動で元へ戻すrevert

実際に障害を起こすには、`disruptions[].action`へ実行方法を書きます。説明文だけでは動きません。`action`には必ず`revert`を付けます。

## ローカルChallengeを作る

AWSを使わない問題は、Challengeを選び、採点方式として`verify`または`multi-verify`を指定します。

- `verify`: 1つの提出を`/verify`で判定する
- `multi-verify`: 複数のcheckpointを個別に判定する

1つのflagを提出する問題なら、`challenges/sqli-demo`がstarterです。複数のcheckpointを持つ問題なら、`challenges/wp-exposed-backup`をstarterとして使います。

ローカル問題では、次の内容を自分の題材へ置き換えます。

1. `runtime.entry`が指すCompose file
2. Participant Portalに表示する`challengeEndpoints`
3. 採点を受ける`verifyUrl`
4. `local/Dockerfile`と問題アプリ
5. `/verify`の判定処理
6. loopbackだけへbindするport
7. 実行ごとに変わる秘密値

攻撃対象と採点APIを同じ画面へ公開しません。`/verify`はloopbackに限定し、不正解時に答えを返さないようにします。

## 手動で作る場合

Claude Codeを使わない場合も、同じstarterから作れます。

```bash
cp -R challenges/hello-world challenges/<新しいslug>
cp -R battles/hello-world-battle battles/<新しいslug>
cp -R challenges/sqli-demo challenges/<新しいローカル問題のslug>
```

どれか1つだけを、作りたい問題形式に合わせて実行します。その後、リポジトリが用意したコマンドで依存関係を導入し、変更後の問題を確認します。

```bash
make install
make agent-gate
```

ファイルを複製した直後に`make agent-gate`を実行しても、自分の問題は完成しません。ディレクトリ名と`id`、参加者向け文章、環境、採点、Output、READMEをすべて自分の設計へ変更した後に実行します。

## 実行してから公開する

AWS問題は、テスト用AWSアカウントへデプロイし、参加者用Roleで解答、採点、削除まで通します。

ローカル問題は、TenkaCloud本体のルートで起動します。

```bash
make local PROBLEM=<新しいslug>
```

Participant Portalから問題を開き、想定した解答で得点し、誤答では得点しないことを確認します。終了時は次を実行します。

```bash
make local-down
```

最後に、TenkaCloudChallengeのルートで完了条件を実行します。

```bash
make agent-gate
```

公開問題は、1問につき1つのPull Requestにします。Pull Requestには次の内容を書きます。

- 参加者に持ち帰ってほしいこと
- ストーリーと最初の一手
- 成功を判定する条件
- 実行環境と権限境界
- レッドチームの障害とrevert
- コストと削除方法
- 実際に通した操作
- `make agent-gate`の結果

本書で作った3問は、どれも「どのAWSサービスを使うか」から始めていません。参加者にどんな行動を取ってほしいかを決め、ストーリー、環境、採点を後から接続しました。自分の問題を作るときも、この順序を変えないことが最も重要です。
