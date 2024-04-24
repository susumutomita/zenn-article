---
title: "shell-pilotをLlama 3で動かしてみる"
emoji: "🔥"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["Llama","shell-pilot"]
published: true
---

## Shell Pilotとは

[README](https://github.com/reid41/shell-pilot/blob/main/README.md)によると、Shell Pilotはコマンドライン操作をAIがサポートするツールです。OpenAIのAPIだけでなく、ローカルLLMもサポートしているため、実質的にコストがかかりません。これは非常に便利です。

## 事前準備

使用するモデルは事前にダウンロードしておく必要があります。[Ollama](https://ollama.com/)を利用すれば簡単にダウンロードできます。以下のコマンドを実行しましょう。

```shell
ollama run llama3:70b
```

このモデルは約40GBありますので、ダウンロードには時間がかかります。llama3モデルであれば4.7GBと約1/10と小さいですが、より高性能なモデルを使用したほうが正確性もあがるので待つ価値はあります。
これで準備は完了です。

参考記事：
[ローカルAI完全ガイド：Metaの最新生成AI「Llama 3」をMacBook Airで快適に使う](https://notai.jp/llama-3-mac-local/)

## インストール

まずは[リポジトリ](https://github.com/reid41/shell-pilot)をクローンして、次の設定を調整して実行してみます。

```s-pilot
SHELL_PILOT_CONFIG_PATH="~/shell-pilot"
OLLAMA_SERVER_IP=127.0.0.1
```

使用するモデルもデフォルトからダウンロードしたものに変えます。

```spilot_common.sh
MODEL_OLLAMA=llama3:70b
```

## 起動させてみる

問題なく起動しました。

```shell
❯ ./s-pilot
Welcome to Shell Pilot!!
You can quit with 'q' or 'e'.

<<You>>
hey

<<ShellPilot>> Hey!
```

## 質問をしてみる

Shell Pilotは日本語もしっかり理解しており、Llama3:70bのパフォーマンスは素晴らしいです。応答速度も十分です。ファンの音が大きくなるのはご愛嬌です。

> You
> jq コマンドを使ってjsonをパースしたい
>
> ShellPilot
> jq コマンドは JSON データをパースしてフィルタリング、変換するための強力なツールです。
> 基本的な使い方は、次の通りです：
>
> jq [options] < json_file
> 例えば、example.json ファイルに以下のような JSON データがあると仮定します。
>
> {
> "name": "John",
> "age": 30,
> " occupation": "Engineer"
> }
> この場合、jq コマンドで名前を抽出するには次のようにします：
>
> jq '.name' example.json
> 結果として、「"John"」という文字列が出力されます。
>
> その他の例：
>
> 全体的な JSON データを出力： jq '.' example.json
> *特定のキーを持つオブジェクトを抽出： jq '. occupation' example.json
> 配列内の要素を抽出： jq '.[] | .name' example.json (この例では、配列内にある全ての "name" を抽出)
> jq コマンドには多くのオプションがあります。詳細は、公式ドキュメントやマニュアルを参照してください。

## まとめ

十分使えそうな感触です。ローカルLLMであれば課金や扱う情報についても気をつける必要がないのでどんどん使っていきたいです。
