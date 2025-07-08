---
title: "Claude Code ActionsをMaxプランで使う際の注意点と解決方法"
emoji: "🤖"
type: "tech"
topics: [Claude, GitHub, Actions, AI, Max]
published: true
---

## Claude Code ActionsとMaxプランの関係

**この記事は2025年7月時点の情報です。**

Claude Code ActionsをGitHubで使用する際に、個人のMaxプランとの関係について混乱が生じることがあります。本記事では、この互換性について詳しく解説し、正しい設定方法を紹介します。

## 基本的な理解

### Claude Code Actionsとは

Claude Code ActionsはAnthropic社が提供するGitHub Actionsの拡張機能で、GitHub上のissueやPull Requestに対してClaudeが自動的に応答できるようにします。

### Maxプランとの関係

**重要**: Claude Code Actionsと個人のMaxプランは**別の仕組み**です。

- **Claude Code Actions**: GitHub App経由でのOAuth認証を使用
- **個人のMaxプラン**: claude.ai サイトでの直接利用

## 互換性の問題点

### 1. 認証方式の違い

```yaml
# Claude Code Actions（GitHub Actions）
claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}

# 個人のMaxプラン
# claude.ai サイトでの直接ログイン
```

### 2. 課金体系の分離

- **Claude Code Actions**: GitHub Actions内での利用量に基づく課金
- **個人のMaxプラン**: claude.ai での個人利用量に基づく課金

### 3. APIアクセスの違い

- **Claude Code Actions**: GitHub App経由でのアクセス
- **個人のMaxプラン**: Anthropic APIへの直接アクセス

## 正しい設定方法

### 1. Claude Code Actionsの設定

```yaml
name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
      actions: read
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@beta
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

### 2. 認証トークンの取得

1. **Claude Code CLI**をインストール
2. **OAuth認証**を実行
3. **トークンをGitHub Secrets**に設定

### 3. 認証トークンの更新

```bash
#!/bin/bash
# 認証トークンを自動更新するスクリプト例

KEYCHAIN_SERVICE="Claude Code-credentials"
KEYCHAIN_ACCOUNT=`whoami`

# JSONデータを取得
JSON_DATA=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w)

# JSONから各パラメータを抽出
ACCESS_TOKEN=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.accessToken')
REFRESH_TOKEN=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.refreshToken')
EXPIRES_AT=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.expiresAt')

# 各シークレットを更新
if [ "$ACCESS_TOKEN" != "null" ] && [ "$ACCESS_TOKEN" != "" ]; then
    echo "$ACCESS_TOKEN" | gh secret set CLAUDE_ACCESS_TOKEN --repo "$REPO"
    echo "Updated CLAUDE_ACCESS_TOKEN"
fi
```

## トラブルシューティング

### よくある問題と解決策

#### 1. 認証エラー

**問題**: `Authentication failed` エラーが発生

**解決策**:
- OAuth認証の再実行
- GitHub Secretsの更新
- 権限設定の確認

#### 2. 応答がない

**問題**: `@claude` でメンションしても応答がない

**解決策**:
- ワークフローの条件分岐を確認
- GitHub Actions の実行ログを確認
- 権限設定の確認

#### 3. 課金について

**問題**: 個人のMaxプランの利用量に影響するか心配

**解決策**:
- Claude Code Actions は独立した課金体系
- 個人のMaxプランには影響しない
- GitHub Actions の利用量として計算される

## まとめ

Claude Code ActionsとMaxプランは独立したシステムです。正しく設定することで、個人のMaxプランとは関係なく、GitHub上でClaudeを活用できます。

### 重要なポイント

1. **認証方式が異なる**: OAuth vs 個人ログイン
2. **課金体系が分離**: GitHub Actions vs 個人利用
3. **API アクセスが別**: GitHub App vs 直接API

適切な設定により、両方のサービスを並行して活用できます。

## 参考リンク

- [Claude Code Actions 公式ドキュメント](https://github.com/anthropics/claude-code-action)
- [GitHub Actions ドキュメント](https://docs.github.com/en/actions)
- [Anthropic API ドキュメント](https://docs.anthropic.com/)