---
title: "無料でGitHub Issueの重複チェックができるGitHub Vector Issue Processorの紹介"
emoji: "🦔"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [GitHub, AI, Qdrant, Groq]
published: true
---

## このページは

この記事では、[GitHub Vector Issue Processor](https://github.com/marketplace/actions/github-vector-issue-processor)について紹介します。無料で始めることができ、GitHub Issuesの重複チェックができます。

## きっかけ

[都知事選マニフェストのレポジトリで実施していたIssueの重複チェックがいいなと思ったのがきっかけです](https://github.com/takahiroanno2024/election2024/blob/main/.github/scripts/review_issue.py)。ただし、OpenAIのAPIを使っていたため、無料で使いたいと思い、自分で作成することにしました。

## プロダクトの特徴

無料で試せることがポイントです。そのために、Groqを使用しています。また、GroqではOpenAIのAPIで返されていたベクトル値が取得できなかったため、[Nomic](https://nomic.ai)を使うようにしました。

## 使い方

### 必要なAPIキーの取得

GitHub Vector Issue Processorを利用するためには、いくつかのAPIキーが必要です。以下の手順で取得してください。

1. **Groq API Key**:
   - [Groq](https://groq.com)にサインアップまたはログインします。
   - アカウント設定のAPIセクションに移動し、新しいAPIキーを生成します。

2. **Qdrant API KeyとURL**:
   - [Qdrant](https://qdrant.tech)にサインアップまたはログインします。
   - アカウント設定のAPIセクションに移動し、新しいAPIキーを生成し、QdrantインスタンスのURLを取得します。

3. **Nomic API Key**:
   - [Nomic](https://nomic.ai)にサインアップまたはログインします。
   - アカウント設定のAPIセクションに移動し、新しいAPIキーを生成します。

### 呼び出し方法

GitHub Actionsワークフローで呼び出せるようになっています。

```yaml
name: Issue Review

on:
  issues:
    types: [opened]
  workflow_dispatch:

permissions:
  issues: write
  contents: read

jobs:
  review_issue:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Review Issue with LLM
        uses: susumutomita/GitHubVectorIssueProcessor@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          qd-url: ${{ secrets.QD_URL }}
          qd-api-key: ${{ secrets.QD_API_KEY }}
          groq-api-key: ${{ secrets.GROQ_API_KEY }}
          nomic-api-key: ${{ secrets.NOMIC_API_KEY }}
          github-event-issue-number: ${{ github.event.issue.number }}
          github-repository: ${{ github.repository }}
```

このワークフローは、Issuesがオープンされたときに自動的にトリガーされ、AIが問題をレビューして重複しているかどうかを確認します。

## 将来的に追加しようとしている機能

### ベクトルデータベース

今はQdrantを選定していますが、[Azure AI Search](https://azure.microsoft.com/ja-jp/products/ai-services/ai-search)など他のベクトルデータベースも使えるようにすることで、企業内のユースケースもカバーできると考えています。

### AI モデル

GroqのAIモデル以外に、[Azure OpenAI Service](https://azure.microsoft.com/ja-jp/products/ai-services/openai-service)などのモデルもサポートする予定です。

### 実行時間の短縮

現在はPythonを使用していますが、依存関係のインストールに時間がかかるため、依存関係のインストール無しで動作するように改善したいと考えています。[Setup Node](https://github.com/actions/setup-node/blob/main/action.yml)などを参考に、実行時間の短縮方法を検討していきます。

## まとめ

GitHub Vector Issue Processorは、無料で始められる便利なツールです。特に、GroqとNomicを活用することで、コストを抑えつつ高品質なAIレビューを実現できます。将来的には、さらなる機能拡張と最適化を図り、より多くのユーザーにとって有用なツールとなることを目指しています。
