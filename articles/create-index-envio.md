---
title: "Envioを使ってスマートコントラクトの監視をしてみる"
emoji: "😎"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: []
published: false
---

[Envio](https://envio.dev/)を利用してスマートコントラクトの監視をしてみます。

[Envio](https://envio.dev/)の紹介とチュートリアルをやってみた結果は、次の記事にまとめています。

config.yamlのstart_blockがどのブロックからインデックスを作成するか指定できる。
ただし、動的に変更したい場合はカスタムスクリプトを作る必要がある。

```config.yaml
networks:
  - id: 137 # Polygon
    start_block: 0
    contracts:
      - name: Greeter #A reference to the global contract definition
        address: 0x9D02A17dE4E68545d3a58D3a20BbBE0399E05c9c
```
