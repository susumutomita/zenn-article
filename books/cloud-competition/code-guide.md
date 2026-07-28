---
title: "本書の進め方と実装の対応"
free: true
---

本書は、TenkaCloudの機能一覧を読む本ではありません。問題を設計し、実装し、検証し、イベントとして開催し、最後に削除するところまでを一つの制作工程として扱います。

本文には設定例やコマンド例を載せますが、利用時点の実装と食い違わないように、**実行するコードの基準はGitHubリポジトリ側**とします。本章では、原稿と実装の対応、各章の作業、検証済みと未検証の境界を明示します。

## 正式なリポジトリ

本書では、次の3リポジトリを使います。

| リポジトリ | 基準にする内容 |
| --- | --- |
| [susumutomita/TenkaCloud](https://github.com/susumutomita/TenkaCloud) | イベント、チーム、問題デプロイ、採点、Participant Portal、障害注入、Problem Pack |
| [susumutomita/TenkaCloudChallenge](https://github.com/susumutomita/TenkaCloudChallenge) | 問題の`metadata.json`、`template.yaml`、README、専用UI、検証schema |
| [susumutomita/zenn-article](https://github.com/susumutomita/zenn-article) | 本書の原稿 |

本文よりリポジトリの実装が新しい場合は、`SCHEMA.json`、既存問題、CLIの`--help`、リポジトリ内ドキュメントを優先してください。本文側も実装変更に合わせて更新します。

## 本書の通し題材

本書では、**Cloud Rescue — 障害中のWeb APIを復旧せよ**を通し題材として設計します。

開始地点は、TenkaCloudChallengeに存在する次の問題です。

- Challengeの基準: `challenges/hello-world`
- Battleの基準: `battles/hello-world-battle`

`hello-world`は、デプロイごとに変わる値をSSM Parameterから発見し、flagとして提出する最小Challengeです。

`hello-world-battle`は、EC2上のnginxとPython APIを対象に、frontendとAPIのendpointを継続監視する最小Battleです。SSM Session Managerで接続し、停止したサービスを復旧する体験と、運営側の障害注入を含みます。

本書のCloud Rescueは、これらを無関係な新規実装へ置き換えるのではなく、既存サンプルを複製し、学習目標、ストーリー、採点、ヒント、障害を段階的に変更する題材です。

## 現在の検証状態

この初稿を書いた時点では、次を確認しています。

- TenkaCloudとTenkaCloudChallengeの現在の公開構成
- `hello-world`のflag採点構造
- `hello-world-battle`のendpoint採点とdisruption構造
- TenkaCloudのAWSデプロイ導線
- Problem PackのCLI導線
- Zenn Bookの構成、textlint、文字数、Mermaid検証

一方、Cloud Rescueという独立問題については、まだ次の実AWS通し検証を完了していません。

- TenkaCloudChallengeへの`cloud-rescue`実装
- 新規AWS環境へのデプロイ
- participant権限での解答
- ChallengeとBattleの採点
- disruptionと自動revert
- stack削除後の残存リソース確認
- 初見者による解答時間とヒント利用の測定

したがって、本文中のCloud Rescue固有のコード例は**設計例**です。存在しない実行結果や成功ログを、検証済みであるかのようには掲載しません。実問題の通し検証後に、実際のファイル、画面、ログ、所要時間へ置き換えます。

## 1つの章を進める手順

実装を含む章では、次の順で進めます。

1. **目的を確認する**  
   参加者にどの判断を体験させる章かを確認します。
2. **基準となる既存問題を動かす**  
   変更前の`hello-world`または`hello-world-battle`が検証を通ることを確認します。
3. **変更を一つだけ加える**  
   metadata、CloudFormation、採点、ヒント、disruptionを一度に変更しません。
4. **ローカル検証を実行する**  
   `bun run validate`でschemaと参照関係を確認します。
5. **実AWSで確認する**  
   AWS resourceを使う章では、新しいstackへデプロイします。
6. **participantとして解く**  
   管理者権限ではなく、実際のParticipantViewerRole経路で操作します。
7. **採点を確認する**  
   正常、失敗、復旧、再デプロイの各状態を確認します。
8. **削除する**  
   stack削除だけでなく、課金リソースの残存を確認します。

## ローカル検証と実AWS検証の境界

`bun run validate`は重要ですが、AWS上の動作を保証するものではありません。

### ローカルで確認できること

- `metadata.json`のschema適合
- 問題IDとディレクトリ名の一致
- endpoint、scoring、portal slotの参照整合
- カタログindexの整合
- 一部のCloudFormation構文
- Zenn原稿の構成とlint

### 実AWSで確認すること

- CloudFormation resourceの作成
- IAMの実権限
- AWS Consoleが内部で呼ぶAPI
- SSM Session Managerの接続
- EC2 UserDataとsystemdの起動順序
- 採点環境からendpointへの到達性
- disruptionとrevertの実行
- CloudFormation削除後の残存リソース
- 実際の費用

「CIが通った」と「競技として開催できる」は別の状態です。

## 章と実装の対応

| 章 | 主な対象 | 基準となる実装・資料 |
| --- | --- | --- |
| 第1〜3章 | 競技設計 | 本書のCloud Rescue設計シート |
| 第4章 | 問題scaffold | TenkaCloudChallengeの`bun run new`、README、`SCHEMA.json` |
| 第5章 | CloudFormationとIAM | `battles/hello-world-battle/template.yaml` |
| 第6章 | 問題metadata | `SCHEMA.json`、`CATALOG.md`、既存問題の`metadata.json` |
| 第7章 | flag採点 | `challenges/hello-world` |
| 第8章 | ヒントとREADME | 既存Challengeの`scoring.hints`、README構成 |
| 第9章 | 実機検証 | TenkaCloudChallengeのvalidatorと実AWS stack |
| 第10章 | uptime採点 | `battles/hello-world-battle/metadata.json` |
| 第11章 | phasesとdisruptions | `hello-world-battle`、`microservice-migration-battle`、`stackstack` |
| 第12章 | Portal plugin | 既存問題の`portal/`とTenkaCloud側slot実装 |
| 第13章 | AWSデプロイ | TenkaCloud README、`lite-pipeline.yaml`、deployment guide |
| 第14章 | eventとteam | Application Admin Consoleとproblem deploy flow |
| 第15章 | 当日運営 | `docs/operations/event-runbook.md`と問題固有runbook |
| 第16章 | 削除と振り返り | CodeBuildの`destroy-all`、AWS側の残存確認 |
| 第17章 | OSSとProblem Pack | TenkaCloudChallengeのcontribution flow、TenkaCloudのpack CLI |

## コマンド例の読み方

本文中のコマンドには、次の3種類があります。

### そのまま実行するコマンド

```bash
bun install
bun run validate
```

固定のリポジトリ操作として使えます。

### 値を置き換えるコマンド

```bash
aws ssm start-session --target <instance-id>
```

`<instance-id>`のような山括弧は、CloudFormation OutputやParticipant Portalで得た実値へ置き換えます。

### 構造を説明する例

```json
{
  "scoring": {
    "kind": "uptime-flat"
  }
}
```

一部のfieldだけを示す例です。実ファイルへ貼り付けるときは、必須fieldを含む既存問題から編集し、`SCHEMA.json`と`bun run validate`で確認します。

## 検証結果の記録方法

Cloud Rescueを実装した後は、各確認を次の形で記録します。

```text
対象commit:  <TenkaCloud SHA>
問題commit:  <TenkaCloudChallenge SHA>
リージョン:  <AWS region>
デプロイ:    CREATE_COMPLETE
参加者接続:  SSM Session Manager成功
初期状態:    frontend失敗 / API成功
復旧後:      frontend 200 / API 200
採点:        復旧後の次pollで加点再開
disruption:  nginx停止と自動revertを確認
削除:        DELETE_COMPLETE、残存課金resourceなし
所要時間:    <実測>
```

値が毎回変わるID、URL、時刻、scoreは、本文と一字一句一致する必要はありません。確認すべき条件が成立したかを記録します。

次章から、Cloud Rescueの設計を始めます。
