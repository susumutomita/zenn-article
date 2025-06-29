#!/bin/bash

# 設定
KEYCHAIN_SERVICE="Claude Code-credentials"
KEYCHAIN_ACCOUNT=`whoami`

# Git remote URLから自動的にリポジトリ情報を取得
REMOTE_URL=$(git remote get-url origin 2>/dev/null)

if [ -z "$REMOTE_URL" ]; then
    echo "Error: Not a git repository or no origin remote found"
    exit 1
fi

# SSH形式とHTTPS形式の両方に対応してリポジトリ情報を抽出
if [[ $REMOTE_URL =~ github\.com[:/]([^/]+)/([^/.]+)(\.git)?$ ]]; then
    OWNER="${BASH_REMATCH[1]}"
    REPO_NAME="${BASH_REMATCH[2]}"
    REPO="$OWNER/$REPO_NAME"
    echo "Detected repository: $REPO"
else
    echo "Error: Could not extract repository information from git remote URL: $REMOTE_URL"
    exit 1
fi

# JSONデータを取得
JSON_DATA=$(security find-generic-password -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w)

if [ $? -ne 0 ]; then
    echo "Failed to retrieve data from keychain"
    exit 1
fi

# JSONから各パラメータを抽出
ACCESS_TOKEN=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.accessToken')
REFRESH_TOKEN=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.refreshToken')
EXPIRES_AT=$(echo "$JSON_DATA" | jq -r '.claudeAiOauth.expiresAt')

# 各シークレットを更新
if [ "$ACCESS_TOKEN" != "null" ] && [ "$ACCESS_TOKEN" != "" ]; then
    echo "$ACCESS_TOKEN" | gh secret set CLAUDE_ACCESS_TOKEN --repo "$REPO"
    echo "Updated CLAUDE_ACCESS_TOKEN"
fi

if [ "$REFRESH_TOKEN" != "null" ] && [ "$REFRESH_TOKEN" != "" ]; then
    echo "$REFRESH_TOKEN" | gh secret set CLAUDE_REFRESH_TOKEN --repo "$REPO"
    echo "Updated CLAUDE_REFRESH_TOKEN"
fi

if [ "$EXPIRES_AT" != "null" ] && [ "$EXPIRES_AT" != "" ]; then
    echo "$EXPIRES_AT" | gh secret set CLAUDE_EXPIRES_AT --repo "$REPO"
    echo "Updated CLAUDE_EXPIRES_AT"
fi

echo "All secrets updated successfully"
