---
title: "Rust × Docker環境でGitフックによる任意コマンド実行を行う方法"
emoji: "🌟"
type: "tech"
topics: [Rust, Docker, Git]
published: false
---

## 背景

JavaScript界隈では`husky`を用いて`pre-commit`や`pre-push`などのGitフックを簡単に設定できます。
これにより、コミットやプッシュ時に自動でテストやリント、
フォーマットチェックを実行する運用が一般的です。

一方、Rustプロジェクトでも同様のことを行いたい場合があります。
ただし、`npm`や`python`といった他言語ツールに依存せず、
Cargoエコシステム内で同様のフローを構築したいケースです。
そのような場面で役立つのが`cargo-husky`になります。

本記事では`cargo-husky`を使用してRustプロジェクトでGitフックを管理する方法を紹介します。
`pre-commit`や`pre-push`などのフックで任意コマンドを実行する手順と、
Docker環境下でコンテナ内コマンドを実行する際のポイントを示します。

## `cargo-husky`とは

`cargo-husky`は`cargo test`実行時に`.git/hooks`配下へフックファイルを自動生成するツールです。
`Cargo.toml`の`dev-dependencies`に`cargo-husky`を追加し、
`cargo test`を行うだけでデフォルトで`pre-push`フックが設定されます。

### インストール例

`Cargo.toml`に以下を記述します。

```toml
[dev-dependencies]
cargo-husky = "1"
```

この状態で`cargo test`を実行すると、
`git push`時に`cargo test`が自動的に実行される`pre-push`フックが`.git/hooks/pre-push`へ生成されます。

## 独自コマンドを実行したい場合

標準設定では`push`時に`cargo test`を実行します。
しかし、他のコマンド（ビルドツールやコード整形ツールなど）を使いたい場合や、
`pre-commit`フックで独自の処理を行いたい場合もあります。

そのようなときは`cargo-husky`が提供する`features`フラグや`user-hooks`機能を利用するとよいです。

### `user-hooks`機能を使ったカスタムフック設定

`user-hooks`機能を有効にすると、`cargo-husky`が自動生成するフックを抑制できます。
代わりに、`.cargo-husky/hooks`ディレクトリへユーザー独自のフックスクリプトを配置して、
任意のコマンドを実行可能になります。

**手順:**

1. `Cargo.toml`を以下のように変更します。

    ```toml
    [dev-dependencies.cargo-husky]
    version = "1"
    default-features = false
    features = ["user-hooks"]
    ```

    この設定により、`cargo test`を実行した際に、
    デフォルトの`pre-push`フック（`cargo test`実行）は生成されなくなります。

2. `.cargo-husky/hooks`ディレクトリを作成します。

    ```bash
    mkdir -p .cargo-husky/hooks
    ```

3. たとえば`pre-commit`フックで独自コマンド`my_custom_command`を実行したい場合、
   以下のようなスクリプトを用意します。

    ```bash
    echo '#!/bin/sh
    set -e
    my_custom_command
    ' > .cargo-husky/hooks/pre-commit
    chmod +x .cargo-husky/hooks/pre-commit
    ```

4. `cargo test`を実行すると、ビルドスクリプトが発動します。
   これにより`.cargo-husky/hooks`下のスクリプトが`.git/hooks/pre-commit`へコピーされます。

    ```bash
    cargo test
    ```

以上で`git commit`時に`my_custom_command`が実行されるようになります。

### Docker環境での実行例

Docker環境で開発する場合、フックスクリプト内で`docker compose exec`を利用すると、
コンテナ内で任意のコマンドを実行可能です。

```bash
echo '#!/bin/sh
set -e
docker compose exec -T my_container_name my_custom_command
' > .cargo-husky/hooks/pre-commit
chmod +x .cargo-husky/hooks/pre-commit
```

この設定により、`git commit`時にコンテナ内で`my_custom_command`が実行されます。
これによって外部ツールへの依存を減らし、
統合的なワークフローを実現できます。

## よくある質問

### `git push`時に`cargo test --all`が実行される理由

`cargo-husky`は標準で`pre-push`フックを生成し、`cargo test`を実行します。
別のコマンドを利用したい場合は`default-features = false`を指定し、`user-hooks`機能を有効化してください。
これで独自のフックが定義できるようになります。

### `package.metadata.husky.hooks`は使えるか

`cargo-husky`は`npm`版`husky`とは異なる仕組みで動作します。
`package.metadata.husky.hooks`はサポートされていません。
代わりに`[dev-dependencies.cargo-husky]`や`user-hooks`ディレクトリを用いてカスタマイズします。

## まとめ

- `cargo-husky`によりRustプロジェクトのGitフック管理が容易になります。
- `user-hooks`機能を使うことで任意コマンドやコンテナ内コマンドの実行が可能です。
- `npm`や`python`に依存しないCargoネイティブなフック管理により、開発効率が向上します。
