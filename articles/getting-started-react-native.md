---
title: "Expo Go + React NativeでSindri APIを実行してみる"
emoji: "😎"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Sindri, React Native]
published: false
---

## 準備

### Expoのセットアップ

[Tutorial](https://reactnative.dev/docs/environment-setup?guide=quickstart)に書いてある手順でExpoをインストールします。
合わせてスマートフォン側で[アプリ](https://expo.dev/client)をインストールしておきます。

```bash
npx create-expo-app SindriAPISample

cd AwesomeProject
npx expo start
```

### [Sindri API](https://sindri.app/)を実行する準備

APIを実行するためのライブラリのインストール。

```bash
npm install axios @iarna/toml
```
