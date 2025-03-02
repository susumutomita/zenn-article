---
title: "開発環境のセットアップ"
free: true
---

開発を始める前に必要な**環境セットアップ**を行います。

## はじめに

ZigはC言語に近い構文と性能を持ちながらも、メモリセーフティやエラーハンドリングなどの機能を備えています。ブロックチェインのような**高い信頼性が求められるアプリケーション**にも適しており、本チュートリアルではその特性を活かしてブロックチェインの基本構造を実装していきます。
本チュートリアルでは、Zigを使って**ブロックチェインの基本要素**（ブロック、トランザクション、ハッシュ計算、Proof of Work）を実装し、最終的には**シンプルなブロックチェイン**を完成させます。ブロックチェインの仕組みやZigの基本的な使い方についても解説しますので、Zigやブロックチェインに興味がある方はぜひお試しください。

学習ソースとしては[Zig Book](https://github.com/pedropark99/zig-book)がオススメです。

## Zigの環境セットアップ

まずはZigの開発環境を整えます。

### Zigのインストール方法

Zig公式サイトから各プラットフォーム向けのバイナリをダウンロードし、パスを通すのが最も手軽な方法です ([Getting Started⚡Zig Programming Language](https://ziglang.org/learn/getting-started/))。Zigはインストールがシンプルで、単一の実行ファイルを好きな場所に置いてパスを設定すれば利用できます。
インストール後、ターミナル/コマンドプロンプトで `zig version` を実行し、バージョンが表示されれば成功です。Mac + Homebrewの場合は`brew install zig`でインストールできます。

```bash
❯ zig version
0.13.0
```

### ビルドツールとエディタの準備

Zigは独自のビルドシステムを備えており、`zig build`コマンドでプロジェクトのコンパイルや実行が可能です。プロジェクトを開始するには、空のディレクトリで `zig init` コマンドを実行すると、ビルド用の設定ファイルとサンプルのソースコードが生成されます。生成された`build.zig`と`src/main.zig`を使って、`zig build run`とするだけでHello Worldプログラムをビルド&実行できます。Zig製の実行ファイルはネイティブなバイナリで、特別なVMは不要です。
エディタはお好みのものを使用できますが、**VSCode**には公式のZig拡張機能がありシンタックスハイライトや補完が利用できます。また、Zig用の言語サーバー (Zig Language Server, *ZLS*) も提供されており、より高度なエディタ連携が可能です。主要なテキストエディタにはZigのシンタックスハイライトが用意されていますので、まずはコードが見やすい環境を整えましょう。

### プロジェクトの作成

```bash
❯ zig init
info: created build.zig
info: created build.zig.zon
info: created src/main.zig
info: created src/root.zig
info: see `zig build --help` for a menu of options
```

### 簡単なHello Worldプログラムの実行

環境確認のため、簡単なZigプログラムを作成してみます。src/main.zigを更新して、以下のコードを書いてください。

```zig
const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello, {s}\n", .{"world"});
}
```

次に、準備したターミナルで次のコマンドを実行してみましょう。

```bash
zig run src/main.zig
```

`zig run`コマンドはソースをビルドして即座に実行してくれます。正しく環境構築できていれば、コンソールに **Hello, world** と表示されるはずです。これでZigの開発環境は準備完了です。
