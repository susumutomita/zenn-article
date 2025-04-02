<!-- textlint-enable ja-technical-writing/sentence-length -->
![GitHub last commit (by committer)](https://img.shields.io/github/last-commit/susumutomita/zenn-article)
![GitHub top language](https://img.shields.io/github/languages/top/susumutomita/zenn-article)
![GitHub pull requests](https://img.shields.io/github/issues-pr/susumutomita/zenn-article)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/susumutomita/zenn-article)
![GitHub repo size](https://img.shields.io/github/repo-size/susumutomita/zenn-article)
[![lint](https://github.com/susumutomita/zenn-article/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/susumutomita/zenn-article/actions/workflows/lint.yml)
<!-- textlint-enable ja-technical-writing/sentence-length -->

# zenn-article

技術記事とブックコンテンツを管理するZennのリポジトリです。

## 開発環境のセットアップ

必要な依存関係をインストールします。

```bash
npm install
pip install -r requirements.txt
pre-commit install
```

## 記事の作成

新しい記事を作成するには以下のコマンドを使用します。

```bash
npx zenn new:article
```

タイトルとスラッグを指定して作成する場合は以下のコマンドを使用します。

```bash
npx zenn new:article --slug <slug> --title <title> --type idea --emoji ✨
```

または、Makefileを使用します。

```bash
make new_article slug=<slug> title="<title>"
```

## ブックの作成

新しいブックを作成するには以下のコマンドを使用します。

```bash
npx zenn new:book
```

## プレビュー

コンテンツをローカルでプレビューするには以下のコマンドを実行します。

```bash
npx zenn preview
```

## リンター

このプロジェクトでは以下のリンターを使用しています。

- textlint: Markdown文書のリント
- pre-commit: コミット前のコード品質チェック

リンターを手動で実行するには以下のコマンドを使用します。

```bash
make lint
```

## 利用可能なMakeコマンド

- `make lint`: リンターを実行します。
- `make new_article`: 新しい記事を作成します。
- `make preview`: ローカルプレビューを開始します。
