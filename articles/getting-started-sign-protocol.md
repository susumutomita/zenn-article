---
title: "getting-started-sign-protocol"
emoji: "😸"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: signprotocol]
published: false
---

## はじめに

Sign Protocolは、分散型エコシステムにおいて、**信頼性**と**検証可能性**を担保するために開発された、オンチェインおよびオフチェインでのアテステーションを生成するプロトコルです。本記事では、Sign Protocolを用いてスキーマを作成し、アテステーションを発行、管理するのか、その詳細な方法を紹介します。

### Sign Protocolの重要性

Sign Protocolは、様々なシナリオでの**アテステーション**（証明書）の信頼性と検証可能性を向上させます。従来の手法では中央集権的な第三者による検証が必要でしたが、Sign Protocolを利用することで、データを公開せずとも、主張や証明ができます。

- **ゼロ知識証明の利用**: プライバシーを保ちながら主張を証明可能
- **分散型ストレージ**: IPFSやArweaveを活用してコストを最適化しつつ、オンチェインでの検証が可能
- **クロスチェイン対応**: 複数のブロックチェインをサポートし、様々なネットワークでの活用が可能

---

## 実装手順

実際にSign Protocolを使って、スキーマを作成し、アテステーションを生成するのかを、以下のコードを通じて解説します。

### 必要な環境

- **Node.js v14+**
- プライベートキーを保存した.envファイル

以下のコマンドで必要なライブラリをインストールしてください。

```bash
npm init -y
npm install @ethsign/sp-sdk viem axios ethers dotenv
```

.envファイルを作成し、以下のようにプライベートキーを設定します。

```.env
PRIVATE_KEY=your_private_key_here
```

### クライアントの初期化

まず、Sign Protocolクライアントを初期化します。クライアントは、EVMチェインでアテステーションやスキーマを操作するために使用します。

```javascript
const { SignProtocolClient, SpMode, EvmChains } = require("@ethsign/sp-sdk");
const { privateKeyToAccount } = require("viem/accounts");
const { ethers } = require("ethers");

async function init() {
  const privateKey = process.env.PRIVATE_KEY;
  const client = new SignProtocolClient(SpMode.OnChain, {
    chain: EvmChains.sepolia, // Sepoliaテストネットを使用
    account: privateKeyToAccount(privateKey),
  });
  console.log("Client initialized");
  return { client };
}
```

### スキーマの作成

次に、アテステーションを保存するスキーマを作成します。スキーマはデータの形式を定義し、後のアテステーションに使用されます。

```javascript
async function createSchema(client) {
  const res = await client.createSchema({
    name: "BlockFeedBack",
    data: [
      { name: "userAddress", type: "address" },
    ],
  });
  console.log("Schema created with ID:", res.schemaId);
  return res.schemaId;
}
```

### アテステーションの作成

スキーマを使ってアテステーションを作成します。アテステーションは特定のユーザーアドレスなどのデータを含む証明です。

```javascript
async function createNotaryAttestation(client, schemaId, userAddress, signer) {
  const res = await client.createAttestation({
    schemaId: schemaId,
    data: {
      userAddress,
    },
    indexingValue: signer.toLowerCase(),
  });
  console.log("Attestation created");
  return res;
}
```

### アテステーションのクエリ

アテステーションが正しく作成されたかどうかを確認するために、Sign ProtocolのAPIを使ってクエリを実行します。

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
    throw new Error(JSON.stringify(res));
  }
  return res.data;
}

async function queryAttestations(schemaId, attester) {
  const response = await makeAttestationRequest("index/attestations", {
    method: "GET",
    params: {
      mode: "onchain",
      schemaId,
      attester,
    },
  });

  if (!response.success) {
    console.log("アテステーションが見つかりませんでした。");
    return;
  }

  console.log("アテステーション:", response.data.rows);
  return response.data.rows;
}
```

### 実際のコード統合

すべての要素を統合して、以下のコードでクライアントの初期化からスキーマの作成、アテステーションの生成、そしてクエリまでを実行します。

```javascript
async function main() {
  const { client } = await init();

  // スキーマの作成
  const schemaId = await createSchema(client);

  // アテステーションの作成
  await createNotaryAttestation(client, schemaId, "0xYourUserAddress", "0xYourSignerAddress");

  // アテステーションのクエリ
  const attestationResults = await queryAttestations(schemaId, "0xYourSignerAddress");
  console.log(attestationResults);
}

main();
```

---

## 技術的な背景

Sign Protocolが実現する重要な要素を理解することが、このプロトコルを最大限に活用する鍵です。

### ゼロ知識証明（ZK Proofs）

Sign Protocolは**ゼロ知識証明**を活用して、ユーザーのプライバシーを確保しつつ、データの検証をします。これにより、データを公開せずにその正当性を証明できます。例えば、ユーザーがフィードバックを提供する際、その詳細な内容を開示せずに「フィードバックが行われた」という事実のみを証明できます。

### 分散型ストレージ

Sign Protocolは、大規模なデータセットをオンチェインに保存するのではなく、**IPFS**や**Arweave**などの分散型ストレージに保存し、コストを削減しています。この方法により、ストレージにかかるコストを抑えながらも、オンチェインでの検証が可能です。

### クロスチェイン対応

Sign Protocolの大きな特徴は、そのクロスチェイン対応です。異なるブロックチェイン（例: Ethereum、Polygon、BSC）間でデータをやり取りしつつ、共通の信頼性を維持できるため、異なるネットワーク間での相互運用性が確保されます。

---

## まとめ

Sign Protocolは、信頼性の高いアテステーションを簡単に作成し、プライバシーを保ちながら検証までできるプロトコルです。本ガイドを通じて、スキーマの作成からアテステーションの発行、そしてクエリの実行まで、一連のプロセスを実行してみました。

より詳細な情報や高度な使用方法については、公式ドキュメントを参考にしてください。
