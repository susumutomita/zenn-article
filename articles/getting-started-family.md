---
title: "React + Familyを使ってウォレットを接続する"
emoji: "🐙"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [family]
published: false
---

## [Family](https://family.co/)とは

Familyは、Web3アプリケーションにウォレット接続機能を簡単に統合するためのツールキットです。
このライブラリは、開発者がユーザーのウォレットとの連携を簡単に実装できるよう設計されています。
Familyはユーザーにとって直感的で使いやすいインタフェースを提供し、開発者は複雑なブロックチェイン関連の処理を気にすることなく、
アプリケーションの他の部分に集中できます。

## クイックスタートをやってみる

Familyを利用して、Reactアプリケーションにウォレット接続機能を追加するための基本的なステップは次のとおりです。

1. **Familyのインストール：** チュートリアルに書いてあるとおり。connectkit、wagmi、viemをインストールします。

    ```bash
    npm install connectkit wagmi@1.x viem@1.x
    ```

2. **ウォレット接続ボタンの統合：** Familyはウォレット接続のためのUIコンポーネントを提供しています。これらをReactコンポーネントとして簡単に統合できます。

**サンプルアプリケーション：** FamilyのGitHubリポジトリには、Create React Appを使ったサンプルアプリケーションの[例](https://github.com/family/connectkit/tree/main/examples/cra)があります。これを参考にすることで、実際のアプリケーション開発におけるFamilyの利用方法を学ぶことができます。

これらを参照しなが作ってみます。
[WalletConnect](https://walletconnect.com/)と[Alchemy](https://www.alchemy.com/)もしくは[Infura](https://www.infura.io/)のIDを設定しないと画面に何も表示されないので合わせて取得しておきます。

```index.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { App } from './App';

const rootElement = document.getElementById('root');
const root = createRoot(rootElement as HTMLElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);

```

```app.tsx
import { WagmiConfig, createConfig } from 'wagmi';
import {
  ConnectKitProvider,
  getDefaultConfig,
  ConnectKitButton,
} from 'connectkit';
import React from 'react';

const config = createConfig(
  getDefaultConfig({
    // Required API Keys
    alchemyId: 'ALCHEMYID',
    walletConnectProjectId: 'WALLETCONNECTPROJECTID',
    // Required
    appName: 'TEST-Wallet',
  })
);

const buttonStyle = {
  backgroundColor: '#4CAF50',
  border: 'none',
  color: 'white',
  padding: '15px 32px',
  textAlign: 'center',
  textDecoration: 'none',
  display: 'inline-block',
  fontSize: '16px',
  margin: '4px 2px',
  cursor: 'pointer',
  borderRadius: '12px',
};

export const App = () => {
  return (
    <WagmiConfig config={config}>
      <ConnectKitProvider>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
          }}
        >
          <ConnectKitButton style={buttonStyle} />
        </div>
      </ConnectKitProvider>
    </WagmiConfig>
  );
};
```

ここまでできたらアプリケーションを起動させるとボタンが出てきます。
このボタンをクリックするとサポートしているウォレットとの接続が簡単にできます。
