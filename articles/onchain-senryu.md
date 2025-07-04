---
title: "川柳をスマートコントラクトに乗せてみるOnchain Senryuの紹介と使った技術を紹介します"
emoji: "🖋️"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Base,Next.js,Solidity,WorldID,Goldsky,Groq]
published: true
---

## この記事について

ETHGlobalの[Superhack 2024](https://ethglobal.com/events/superhack2024)イベントで開発した[Onchain Senryu](https://ethglobal.com/showcase/onchain-senryu-sfbo5)の紹介と、World ID, BaseおよびGoldskyを使った開発過程での学びについて共有します。

## ETHGlobalとは

Web3開発者の育成と支援を目的に、さまざまなイベントを主催する組織です。2023年には日本で[ETHGlobal Tokyo](https://ethglobal.com/events/tokyo)が開催され、多くの革新的なプロジェクトが発表されました。その他の主要イベントとしては[Devconnect](https://devconnect.org/)があります。

## 今回のSuperhackのイベントについて

[Superhack 2024](https://ethglobal.com/events/superhack2024)は、Web3やその他の最新技術を活用した革新的なプロジェクトを開発することを目的としたハッカソンです。参加者は、様々なブロックチェインや技術スタックを使って、クリエイティブで実用的なプロジェクトを構築することが求められます。
スポンサーにはBaseやMetal L2といったところがPrizeを出していました。

## Onchain Senryuの紹介

**Onchain Senryu**は、川柳をWeb3技術で新たに体験するための分散型プラットフォームです。このプラットフォームでは、ユーザーが川柳を作成・投稿し、コミュニティによる投票を行えます。ブロックチェイン技術を活用することで、透明性と真正性が保証され、AIがユーザー入力に基づいて川柳を生成します。

### 使用技術

1. Base:
   - ブロックチェインプラットフォーム - Baseブロックチェイン上で川柳の作成・投稿・投票することで、透明性と安全性を確保。

2. Next.js:
   - フロントエンド - ユーザーに対してスムーズで直感的なインタフェースを提供。

3. Solidity:
   - スマートコントラクト - 川柳の投稿と投票を処理し、すべてのデータが透明かつ不変であることを保証。

4. World ID:
   - 認証 - ボット対策として、World IDを使用してユーザー認証をして、実在するユーザーのみがプラットフォームにアクセス可能。

5. Goldsky:
   - リアルタイムデータ - Goldskyを利用して、川柳のランキングや投票結果をリアルタイムで表示。

6. Groq:
   - 川柳の作成サポート - Groq APIを利用して川柳の作成をサポート

### Onchain Senryuの動作プロセス

- 川柳の作成 - ユーザーがテーマやプロンプトを英語で入力すると、AIがそれをもとに日本語の川柳を生成します。
- 投稿と投票 - 生成された川柳がブロックチェインに投稿され、コミュニティによる投票します。投票結果はリアルタイムでブロックチェインに記録され、透明性が保証されます。

## 開発で苦労した点と工夫

### Baseブロックチェインの使用

Baseチェインは、初めて使用するプラットフォームだったため、FoundryやMetaMaskとの統合に不安がありました。しかし、これらのツールがスムーズに連携し、予想以上に簡単にセットアップできたことが非常に印象的でした。特に、Baseはイーサリアム互換のため、既存の知識が活かせた点も大きな助けとなりました。スマートコントラクトについてはSolidityを使って作成しています。

### Goldskyによるリアルタイムランキング

投票数に基づいてランキング機能を実装する際、ブロックチェインでは関係データベースのような簡単なソートが難しいことに直面しました。しかし、Goldskyのサブグラフ機能を活用することで、GraphQLを用いてリアルタイムにクエリを送信できるようになり、機能を諦めることなく実装しました。これにより、リアルタイムデータの管理が簡略化されました。[チュートリアルはあるものの](https://docs.goldsky.com/subgraphs/deploying-subgraphs)具体的に組み込むとなったときにパイプラインと、サブグラフどちらを使うか悩みました。結局パイプライン、サブグラフ両方動かしてみてサブグラフがうまく行ったので採用しましたが、リアルタイムで分析をしたい場合はパイプラインの方が向いているようにも感じました。

### World IDの統合

World IDを使ったユーザー認証は、World IDを使えるようにOrbによる虹彩認証が必要であり、予約と現地に行く必要がありました。ただ組み込み自体は、充実したドキュメントとサンプルコードのおかげでスムーズに組み込むことができました。これにより、ボット対策が効果的に行え、プラットフォームの信頼性が向上しました。さらに、World IDの統合により、実在するユーザーのみが川柳の作成と投票に参加できる環境が構築されました。[World IDを使った認証をアプリケーションへ組み込む](https://zenn.dev/bull/articles/getting-started-world-id)で組み込みのやり方は書きました。

### Groqによる川柳の生成

[GitHub Vector Issue Processor](https://zenn.dev/bull/articles/github-issue-vector-processor)を作ったときにGroq APIを使ったことがあったので組み込み自体はスムースに進みました。
ただ、安定して期待する結果を出力するのは難しく、[プロンプト](https://github.com/susumutomita/2024-Superhack/blob/main/frontend/src/pages/api/generate-senryu.ts#L21)を工夫したものの、自動作成に課題は残っています。
UI上から修正はできるようにしたものの、LLMをアプリケーションに組み込む難しさを感じました。

## 結果

ファイナリストトラックとパートナープライズ両方に申し込みました。ファイナリストについては上位20パーセント（ジャッジ側のキャパシティに依存するが5-60くらい）が進めるライブジャッジに進めなかったので、プロダクトのアイデアなり作り込みに課題がありました。ガスレストランザクションや画像生成、UIの改善とかやりたいことはあったものの実装できなかったのは残念です。とはいえ新しい技術に触れることで引き出しは増えたので良かったです。パートナープライズはまだ発表されていないので待っている状態です。
