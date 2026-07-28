---
title: "Part 3｜Challengeのファイルを作る"
free: true
---

ここからCloud Rescueを実装します。最初に、TenkaCloudが問題を読み込む仕組みと、編集するファイルの役割を確認します。

## 開発環境を準備する

TenkaCloudChallengeは、TenkaCloudの`problems/`ディレクトリにGit submoduleとして組み込まれています。本書ではTenkaCloudをsubmodule付きで取得します。準備と検証には、リポジトリの`Makefile`を使います。

```bash
git clone --recurse-submodules https://github.com/susumutomita/TenkaCloud.git
cd TenkaCloud
make install
make validate-problems
```

`make validate-problems`が成功すれば、既存の問題カタログを検証できる開始地点に立てています。以降、明記しない限りコマンドはTenkaCloudのルートで実行します。

## 1つの問題を構成するファイル

Challengeは`problems/challenges/<problem-id>/`に置きます。Cloud Rescueの最小構成は次のとおりです。

```text
problems/challenges/cloud-rescue/
├── metadata.json
├── template.yaml
├── README.md
└── README.ja.md
```

各ファイルの役割は明確に分かれています。

| ファイル | 役割 |
| --- | --- |
| `template.yaml` | チームのAWSアカウントへ作るリソースを定義するCloudFormation template |
| `metadata.json` | 問題文、学習目標、template、採点、ヒントをTenkaCloudへ伝える |
| `README.md` | 問題の英語ドキュメント |
| `README.ja.md` | 問題の日本語ドキュメント |

`template.yaml`だけでは、AWS環境は作れても競技にはなりません。反対に、`metadata.json`だけでは参加者が操作する環境を作れません。2つのファイルを次の参照で接続します。

```text
metadata.json
├── cfnTemplate ──────────> template.yaml
├── cfnParametersのキー ─> template.yamlのParameters
└── scoring.flagOutputKey -> template.yamlのOutputs
```

Cloud Rescueでは、`metadata.json`の`FlagSeed`をCloudFormationへ渡します。採点時には、CloudFormationの`RecoveryFlag`を正解として読み取ります。

## 動く雛形から始める

空のJSONとYAMLを手作業で用意せず、カタログのscaffoldコマンドで既存Challengeを複製します。

```bash
cd problems
bun run new challenges cloud-rescue --from hello-world
cd ..
make validate-problems
```

`bun run new`はTenkaCloudChallengeが提供する問題作成コマンドです。依存関係の準備と検証は、TenkaCloudルートの`make`から実行します。

作成直後は、次の対応だけを確認します。

- ディレクトリ名と`metadata.json`の`id`が`cloud-rescue`で一致する
- `metadata.json`の`cfnTemplate`が`template.yaml`を指す
- `template.yaml`が`NamePrefix`などの共通parameterを受け取る
- `make validate-problems`が成功する

この時点では、まだnginxを止めません。次章で`template.yaml`の形式を確認し、正常な環境を作ってから競技用の障害を入れます。
