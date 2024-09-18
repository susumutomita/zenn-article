---
title: "Sign Protocolを用いたアテステーション生成入門"
emoji: "😸"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [signprotocol]
published: false
---

## はじめに

ブロックチェイン技術の進化に伴い、信頼性と検証可能性を高めるためのプロトコルが数多く開発されています。**Sign Protocol**は、その中でも特に注目を集めているオンチェインおよびオフチェインでのアテステーション（証明書）を生成・管理するためのプロトコルです。

本記事では、Sign Protocolの技術的背景や機能を解説するとともに、EthSignとの違いについても触れ、具体的な実装手順をステップバイステップで紹介します。

参考になる動画
https://www.youtube.com/watch?v=Grb6tRCelNo

https://www.youtube.com/watch?v=X2SIfaUWPI0

https://www.youtube.com/watch?v=eU-mcjTzXYk

### Sign ProtocolとEthSignの違い

はじめ、[EthSign](https://www.ethsign.xyz/)も似たような話に見えたのですが、Sign ProtocolはプロトコルでEthSignはプラットフォームです。

- **Sign Protocol**は、あらゆる情報をオンチェインでアテスト（証明）し、それを検証できる**オムニチェイン対応**のアテステーションプロトコルです。主に**アテステーションの生成、管理、検証**を目的とし、ゼロ知識証明やクロスチェイン対応など、高度なプライバシー保護と相互運用性を実現しています。これは、身分証明、サプライチェインのトレーサビリティ、学歴証明など、さまざまなユースケースに対応できます。

- 一方、**EthSign**は主に**電子契約書の署名プラットフォーム**であり、スマートコントラクトを活用してブロックチェイン上での**ドキュメント署名と管理**に特化しています。契約書や同意書のような法律的拘束力のある文書に対して、ユーザー同士が安全に署名できる機能を提供し、署名の真正性を保証します。

以下のような違いがある認識です。
|                 | **Sign Protocol**                           | **EthSign**                               |
|-----------------|---------------------------------------------|-------------------------------------------|
| **用途**         | アテステーション（証明）生成・管理              | 電子契約書や同意書の署名                    |
| **技術**         | オムニチェイン対応、ゼロ知識証明                | スマートコントラクトを用いた署名管理       |
| **主なユースケース**| 身分証明、学歴証明、サプライチェインの追跡等      | 法的文書への署名、契約管理                  |

---

## 技術的背景

### オムニチェインとは

オムニチェインとは、複数の異なるブロックチェインネットワーク間でシームレスにデータや資産を共有・転送できる技術です。オムニチェイン技術を用いることで、Ethereum、Polygon、Binance Smart Chainといった異なるチェイン間でのデータ共有が可能になりました。Sign Protocolもこの技術を活用しており、様々なチェイン上でのアテステーションの作成と検証が可能です。

### アテステーションとは

アテステーション（Attestation）とは、特定の主張や事実を証明するためのデジタル証明書です。ブロックチェイン上でのアテステーションは、改ざん不可能で透明性の高い方法で情報を証明します。これにより、信頼性の高いデータ共有が可能となり、個人情報やデジタル資産の証明にも応用できます。

### ゼロ知識証明

**ゼロ知識証明**は、証明したい事実を明かさずに、その事実が真であることを証明する技術です。Sign Protocolはこの技術を用いることで、プライバシーを保護しつつ、データの正当性を保証できます。

#### ゼロ知識証明の仕組み

- **証明者（Prover）**: 秘密の情報を明かさずにその正当性を証明します。
- **検証者（Verifier）**: 証明者の主張が真実であることを確認しますが、秘密の情報自体は知りたくありません。

このプロセスを通じて、データの正当性を保証しつつ、個人情報の保護を実現します。

## Sign Protocolの機能概要

### 主な機能

1. **スキーマの作成**: アテステーションで使用するデータの構造を定義します。
2. **アテステーションの生成**: スキーマに基づいてアテステーションを作成します。
3. **アテステーションの管理**: 生成したアテステーションの検証やクエリを行います。

---

## 実装手順

以下では、Sign Protocolを使用してスキーマを作成し、アテステーションを生成・管理する方法を詳しく解説します。

### 必要な環境

- **Node.js v14以上**: JavaScriptの実行環境として必要です。
- **プライベートキー**: Ethereumアカウントのプライベートキーを使用します。

#### ライブラリのインストール

以下のコマンドを実行して、必要なライブラリをインストールします。

```bash
npm init -y
npm install @ethsign/sp-sdk viem axios ethers dotenv
```

- **@ethsign/sp-sdk**: Sign Protocolの公式SDKです。
- **viem**: EVM互換チェインとの通信をするライブラリです。
- **axios**: HTTPリクエストを行うためのライブラリです。
- **ethers**: Ethereumブロックチェインとのやり取りを簡素化するためのライブラリです。
- **dotenv**: 環境変数を管理するためのライブラリです。

#### プライベートキーの設定

`.env`ファイルを作成し、以下のようにプライベートキーを設定します。

```.env
PRIVATE_KEY=あなたのプライベートキーをここに入力
```

**注意**: プライベートキーは安全に管理する。

### クライアントの初期化

Sign Protocolクライアントを初期化します。これにより、EVM互換チェイン上でアテステーションやスキーマの操作が可能となります。

```javascript
const { SignProtocolClient, SpMode, EvmChains } = require("@ethsign/sp-sdk");
const { privateKeyToAccount } = require("viem/accounts");
const dotenv = require("dotenv");

dotenv.config();

async function init() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("プライベートキーが設定されていません。");
  }

  const client = new SignProtocolClient(SpMode.OnChain, {
    chain: EvmChains.sepolia, // Sepoliaテストネットを使用
    account: privateKeyToAccount(privateKey),
  });

  console.log("クライアントが初期化されました。");
  return { client };
}
```

- **SpMode.OnChain**: オンチェインモードでクライアントを初期化します。
- **EvmChains.sepolia**: EthereumのSepoliaテストネットを指定しています。

### スキーマの作成

アテステーションのデータ構造を定義するためのスキーマを作成します。

```javascript
async function createSchema(client) {
  const schemaDefinition = {
    name: "BlockFeedBack",
    data: [
      { name: "userAddress", type: "address" },
      { name: "feedback", type: "string" },
      { name: "timestamp", type: "uint256" },
    ],
  };

  const res = await client.createSchema(schemaDefinition);

  console.log("スキーマが作成されました。ID:", res.schemaId);
  return res.schemaId;
}
```

- **name**: スキーマの名前を指定します。
- **data**: アテステーションで使用するフィールドを定義します。

### アテステーションの作成

スキーマを基に、アテステーションを作成します。

```javascript
async function createAttestation(client, schemaId, attestationData, indexingValue) {
  const res = await client.createAttestation({
    schemaId: schemaId,
    data: attestationData,
    indexingValue: indexingValue.toLowerCase(),
  });

  console.log("アテステーションが作成されました。");
  return res;
}
```

- **schemaId**: 使用するスキーマのIDです。
- **data**: アテステーションに含めるデータです。
- **indexingValue**: アテステーションの検索に使用するインデックス値です。

#### アテステーションデータの例

```javascript
const attestationData = {
  userAddress: "0xユーザーのアドレス",
  feedback: "素晴らしいサービスでした。",
  timestamp: Math.floor(Date.now() / 1000),
};

const indexingValue = attestationData.userAddress;
```

### アテステーションのクエリ

作成したアテステーションを取得・検証するために、Sign ProtocolのAPIを利用します。

```javascript
const axios = require("axios");

async function makeAttestationRequest(endpoint, options) {
  const url = `https://testnet-rpc.sign.global/api/${endpoint}`;
  const res = await axios.request({
    url,
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    ...options,
  });

  if (res.status !== 200) {
    throw new Error(`エラーが発生しました: ${res.statusText}`);
  }
  return res.data;
}

async function queryAttestations(schemaId, indexingValue) {
  const response = await makeAttestationRequest("index/attestations", {
    method: "GET",
    params: {
      mode: "onchain",
      schemaId,
      indexingValue: indexingValue.toLowerCase(),
    },
  });

  if (!response.success || response.data.total === 0) {
    console.log("アテステーションが見つかりませんでした。");
    return [];
  }

  console.log("アテステーションが見つかりました:", response.data.rows);
  return response.data.rows;
}
```

- **endpoint**: APIのエンドポイントを指定します。
- **options**: HTTPリクエストのオプションを設定します。
- **indexingValue**: アテステーションの検索に使用する値です。

### 全体のコード統合

これまでのコードを統合して、全体のフローを実装します。

```javascript
const { SignProtocolClient, SpMode, EvmChains } = require("@ethsign/sp-sdk");
const { privateKeyToAccount } = require("viem/accounts");
const axios = require("axios");
const { ethers } = require("ethers");

async function init() {
  const privateKey = process.env.PRIVATE_KEY;
  const client = new SignProtocolClient(SpMode.OnChain, {
    chain: EvmChains.sepolia,
    account: privateKeyToAccount(privateKey),
  });
  console.log("Client initialized");
  return { client };
}

async function createSchema(client, provider) {
  const res = await client.createSchema({
    name: "BlockFeedBack",
    data: [
      { name: "userAddress", type: "address" },
    ],
  });
  console.log("Schema created with ID:", res.schemaId);
  return res.schemaId;
}

async function createNotaryAttestation(client, schemaId, userAddress, signer, provider) {
  const res = await client.createAttestation({
    schemaId: schemaId,
    data: {
      userAddress,
    },
    indexingValue: signer.toLowerCase(),
  });
  console.log("Attestation created");
  console.log(res);
  return res;
}

async function main() {
  try {
    const { client } = await init();

    // スキーマの作成
    const schemaId = await createSchema(client);

    // アテステーションのデータ
    const attestationData = {
      userAddress: "0xユーザーのアドレス",
      feedback: "素晴らしいサービスでした。",
      timestamp: Math.floor(Date.now() / 1000),
    };

    // アテステーションの作成
    await createAttestation(client, schemaId, attestationData, attestationData.userAddress);

    // アテステーションのクエリ
    const attestationResults = await queryAttestations(schemaId, attestationData.userAddress);
    console.log("取得したアテステーション:", attestationResults);
  } catch (error) {
    console.error("エラーが発生しました:", error);
  }
}

main();
```

---

## 詳細な解説

### クライアントの初期化の詳細

クライアントを初期化する際、以下のパラメータを設定します。

- **chain**: 使用するブロックチェインネットワークを指定します。今回は`EvmChains.sepolia`を使用していますが、他のネットワークも選択可能です。
- **account**: アカウント情報を設定します。`privateKeyToAccount`関数を使用して、プライベートキーからアカウント情報を生成します。

### スキーマの設計

スキーマは、アテステーションで使用するデータの形式を定義します。各フィールドには以下のような情報を設定します。

- **name**: フィールドの名前。
- **type**: データ型。`address`, `string`, `uint256`など、EVM互換のデータ型を指定します。

### アテステーションのデータ作成

アテステーションを作成する際、スキーマで定義したフィールドに対応するデータを用意します。

- **userAddress**: ユーザーのウォレットアドレス。
- **feedback**: ユーザーからのフィードバック内容。
- **タイムスタンプ**: フィードバックが行われた時刻（Unixtimestamp）。

### インデックス値の重要性

`indexingValue`は、アテステーションを効率的に検索・取得するためのキーとなります。一般的には、ユーザーアドレスやユニークな識別子を使用します。

### アテステーションのクエリ方法

Sign ProtocolのAPIを使用して、特定の条件に合致するアテステーションを取得します。

- **mode**: `onchain`または`offchain`を指定します。
- **schemaId**: 検索対象のスキーマID。
- **indexingValue**: インデックス値でフィルタリングします。

クエリ結果には、アテステーションの詳細情報が含まれます。

---

## 実践的な応用例

### 身分証明のアテステーション

Sign Protocolを利用して、ユーザーの身分証明ができます。たとえば、以下のようなスキーマを作成します。

```javascript
const schemaDefinition = {
  name: "IdentityVerification",
  data: [
    { name: "userAddress", type: "address" },
    { name: "fullName", type: "string" },
    { name: "dateOfBirth", type: "string" },
    { name: "idNumber", type: "string" },
  ],
};
```

このスキーマに基づいて、ユーザーの個人情報を含むアテステーションを作成します。ゼロ知識証明を活用すれば、個人情報を公開せずに、本人確認が行えます。

### サプライチェインのトレーサビリティ

製品の生産から流通までの情報をアテステーションとして記録し、サプライチェインの透明性を高めることができます。

```javascript
const schemaDefinition = {
  name: "SupplyChainTracking",
  data: [
    { name: "productId", type: "string" },
    { name: "location", type: "string" },
    { name: "timestamp", type: "uint256" },
    { name: "status", type: "string" },
  ],
};
```

各ステップでアテステーションを生成し、製品の履歴を追跡します。

### 学歴・資格の証明

教育機関や認定機関が、卒業証明書や資格証明書をアテステーションとして発行できます。

```javascript
const schemaDefinition = {
  name: "AcademicCredential",
  data: [
    { name: "studentAddress", type: "address" },
    { name: "institution", type: "string" },
    { name: "degree", type: "string" },
    { name: "graduationYear", type: "uint256" },
  ],
};
```

これにより、雇用主や他の機関が信頼性の高い方法で資格の検証が可能となります。

---

## セキュリティとプライバシー

### ゼロ知識証明の活用

プライバシー保護の観点から、ゼロ知識証明は非常に重要です。Sign Protocolでは、個人情報や機密情報を公開することなく、その正当性を証明できます。

#### ゼロ知識証明の具体的な例

たとえば、年齢制限のあるサービスにおいて、ユーザーが18歳以上であることを証明する必要がある場合を考えます。ゼロ知識証明を使うと実際の生年月日を公開せずに、「18歳以上である」という事実のみを証明できます。

### 分散型ストレージの信頼性

データの保存に分散型ストレージを利用することで、単一障害点（Single Point of Failure）を排除し、データの可用性と耐久性を向上させます。

#### IPFSとArweaveの比較

- **IPFS**: データがネットワーク上の複数のノードに分散して保存されます。データの可用性はノードの稼働状況に依存します。
- **Arweave**: データが永続的に保存され、一度アップロードされたデータは削除できません。長期的なデータ保存に適しています。

### スマートコントラクトのセキュリティ

Sign Protocolのスマートコントラクトは、セキュリティ監査を受けており、安全性が確保されています。しかし、開発者自身もスマートコントラクトの安全な実装を心がける必要があります。

#### セキュリティ対策のベストプラクティス

- **再入可能な攻撃の防止**: 関数の状態を適切に管理し、外部コールの後に状態を更新しない。
- **整数オーバーフロー・アンダーフローの防止**: 安全な数学ライブラリを使用する。
- **アクセス制御の適切な設定**: 関数や変数の可視性を適切に設定し、権限のないユーザーからの操作を防ぐ。

---

## クロスチェイン対応の詳細

Sign Protocolのクロスチェイン対応により、異なるブロックチェイン間でのデータ共有が可能となります。これにより、以下のような利点があります。

- **柔軟なネットワーク選択**: アプリケーションの要件に応じて最適なブロックチェインを選択できます。
- **相互運用性**: 異なるネットワーク上のユーザーやアプリケーションと連携できます。
- **コスト効率**: ガス代やトランザクション速度を考慮して、最適なチェインを選択できます。

### 対応チェインの例

- **Ethereum**: セキュリティと分散性の高さから、多くのDAppsが利用しています。
- **Polygon**: 低ガス代と高速なトランザクションが特徴です。
- **Binance Smart Chain**: 高いスループットと低コストが魅力です。

### クロスチェインでのアテステーション管理

異なるチェイン上で生成されたアテステーションを統一的に管理するため、Sign Protocolは以下の仕組みを提供します。

- **共通のスキーマ定義**: スキーマIDはチェイン間で一意に識別されます。
- **統合されたAPI**: 単一のAPIエンドポイントで複数のチェイン上のデータにアクセスできます。
- **チェイン間のデータ転送**: ブリッジやオラクルを利用して、データの同期を行います。

---

## まとめ

Sign Protocolは、ブロックチェイン技術の持つ信頼性と透明性を最大限に活用し、アテステーションの生成・管理を効率的かつ安全に行うためのプロトコルです。ゼロ知識証明や分散型ストレージ、クロスチェイン対応といった先進的な技術を組み合わせることで、プライバシー保護と信頼性を両立しています。

本記事では、Sign Protocolの技術的背景から具体的な実装手順までを詳細に解説しました。以下に本記事のポイントをまとめます。

- **技術的背景**: ゼロ知識証明や分散型ストレージ、クロスチェイン対応の重要性を理解しました。
- **実装手順**: スキーマの作成からアテステーションの生成・クエリまで、実践的なコード例を紹介しました。
- **応用例**: 身分証明やサプライチェイン、学歴証明など、様々な分野での活用方法を提案しました。
- **セキュリティとプライバシー**: 安全なシステム構築のためのベストプラクティスを学びました。

Sign Protocolを活用することで、信頼性の高い分散型アプリケーションを開発できます。さらに詳しい情報や高度な機能の活用方法については、[Sign Protocol公式ドキュメント](https://signprotocol.io/docs)を参照してください。

---

## 参考資料

- [Sign Protocol公式サイト](https://sign.global/)
- [Sign Protocolドキュメント](https://docs.sign.global/)
- [EthSign公式サイト](https://www.ethsign.xyz/)

---

**注意**: 本記事の内容は執筆時点の情報に基づいており、将来的に変更される可能性があります。最新の情報や詳細な仕様については、公式リソースを確認してください。