---
title: "Voyager APIを利用したリアルタイムブロックチェインアート：Blockchain Pulseの紹介"
emoji: "🎨"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Voyager,React,Socket.IO,StarkNet]
published: true
---

## この記事について

ETHGlobalの[StarkHack](https://ethglobal.com/events/starkhack)イベントで開発した[Blockchain Pulse](https://ethglobal.com/showcase/blockchain-pulse-rnnt1)の紹介と、Voyager APIを使った開発過程での学びについて共有します。

## ETHGlobalとは

Web3開発者の育成と支援を目的に、さまざまなイベントを主催する組織です。2023年には日本で[ETHGlobal Tokyo](https://ethglobal.com/events/tokyo)が開催され、多くの革新的なプロジェクトが発表されました。その他の主要イベントとしては[Devconnect](https://devconnect.org/)があります。

## ETHGlobalで紹介される技術

ETHGlobalでは、主にイーサリアムブロックチェイン上で動作するアプリケーション(DApps)開発に関連する技術が紹介されます。

## 今回のStarkHackのイベントについて

StarkHackは、イーサリアムのスケーラビリティと効率性を向上させるために設計されたレイヤー2ソリューションであるStarkNetを中心に行われるハッカソンです。参加者は、StarkNet上で動作する革新的なプロジェクトを開発することが求められます。

### StarkNetとは

StarkNetは、イーサリアムのレイヤー2スケーリングソリューションであり、ゼロ知識証明技術（ZK-STARKs）を使用してトランザクションのバッチ処理と検証をします。これにより、高いスループットと低コストでのトランザクション処理が可能になります。

## Voyager APIの紹介

今回利用した[Voyager](https://voyager.online/)は、StarkNetのトランザクションデータにアクセスするための強力なツールです。以下に簡単なサンプルコードを示します。また、詳細なチュートリアルは[Voyager API Documentation](https://docs.voyager.online/)をご覧ください。

### Voyager APIのサンプルコード

まず、Voyager APIを使用するためのセットアップを行います。

```bash
npm install axios dotenv
```

次に、以下のサンプルコードを使って、Voyager APIからトランザクションデータを取得します。

```typescript
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VOYAGER_API_KEY = process.env.VOYAGER_API_KEY;

class HttpClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'x-api-key': VOYAGER_API_KEY,
        'accept': 'application/json'
      }
    });
  }

  public async get(url: string) {
    try {
      console.log(`Sending GET request to: ${url}`);
      const response = await this.client.get(url);
      console.log("Response received");
      return response.data;
    } catch (error) {
      const err = error as any;
      console.error('Error during GET request:', err.response ? err.response.data : err.message);
      throw err;
    }
  }
}

const apiBaseURL = 'https://api.voyager.online/beta';
const httpClient = new HttpClient(apiBaseURL);

async function fetchTransactionData(txHash: string) {
  const txData = await httpClient.get(`/txns/${txHash}`);
  console.log('Transaction Data:', txData);
}

const txHash = '0x1234567890abcdef';
fetchTransactionData(txHash);
```

このコードは、指定されたトランザクションハッシュに対応するデータを取得し、コンソールに表示します。APIキーは`.env`ファイルに設定してください。

`.env`ファイルの内容例。

```.env
VOYAGER_API_KEY=your_api_key_here
```

## 今回開発したプロジェクトについて

[Blockchain Pulse](https://github.com/susumutomita/2024-StarkHack)は、リアルタイムでブロックチェイントランザクションデータを可視化するインタラクティブなデジタルアートインスタレーションです。[Voyager API](https://docs.voyager.online/)を使ってStarkNetのトランザクションデータを取得し、そのデータを元に視覚的に表現しています。

### 動作プロセス

ユーザーは以下のステップで操作します。

- ブラウザを開く - `http://localhost:3000`にアクセスします。
- リアルタイムで表示 - ブロックチェイン上のトランザクションがリアルタイムで表示されます。

### 使用技術

1. **Voyager API**:
   - データ取得 - Voyager APIは、StarkNetのリアルタイムトランザクションデータへのアクセスを提供します。これにより、視覚化に使用するデータが正確かつ最新であることを保証できます。
   - 統合 - Voyager APIはプロジェクトの中心的な部分であり、リアルタイム更新と正確なデータ表示を支えています。

2. **React**:
   - ユーザーインタフェース - Reactは、動的な視覚化を表示するフロントエンドインタフェースを構築するために使用されます。

3. **Socket.IO**:
   - リアルタイム通信 - Socket.IOは、バックエンドとフロントエンドの間のリアルタイム通信を可能にします。これにより、新しいトランザクションデータが即座に反映されます。

#### 技術選定の理由

Voyager APIは、リアルタイムデータの取得に不可欠であり、Blockchain Pulseの核心的な機能を支えています。ReactとSocket.IOは、動的でインタラクティブなユーザー体験を提供するために選ばれました。

### Voyager APIの具体的な使い方

Voyager APIを使用して、StarkNet上のトランザクションデータを取得し、それを視覚化する方法について説明します。

1. **トランザクションデータの取得**:

```typescript
import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const VOYAGER_API_KEY = process.env.VOYAGER_API_KEY;

class HttpClient {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'x-api-key': VOYAGER_API_KEY,
        'accept': 'application/json'
      }
    });
  }

  public async get(url: string) {
    try {
      console.log(`Sending GET request to: ${url}`);
      const response = await this.client.get(url);
      console.log("Response received");
      return response.data;
    } catch (error) {
      const err = error as any;
      console.error('Error during GET request:', err.response ? err.response.data : err.message);
      throw err;
    }
  }
}

const apiBaseURL = 'https://api.voyager.online/beta';
const httpClient = new HttpClient(apiBaseURL);

async function fetchTransactionData(txHash: string) {
  const txData = await httpClient.get(`/txns/${txHash}`);
  console.log('Transaction Data:', txData);
}

const txHash = '0x1234567890abcdef';
fetchTransactionData(txHash);
```

2. **リアルタイム更新の実装**:

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('new_transaction', (data) => {
  console.log('New transaction received:', data);
});

socket.on('error', (error) => {
  console.error('Error:', error);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});
```

## 開発で苦労した点と工夫

### Opcodeの取得

当初、トランザクションのBytecodeからOpcodeを取り出して色付けしようとしましたが、Voyager APIでは取得できなませんでした。そのため、個々のトランザクション情報（blockNumber、contractAddress、hash、senderAddress、actualFee）を使いました。アートという意味では良かったのですが、より意味のあるデータ表現をしたかったです。

### インタラクティブな視覚化の実装

リアルタイムでの視覚化とユーザーインタラクションを実現するために、データパイプラインを最適化し、Socket.IOを活用して遅延なくデータを更新できるようにしました。
