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
