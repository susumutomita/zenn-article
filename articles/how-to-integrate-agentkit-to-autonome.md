---
title: "Autonome+Agent Kitを使ってCrypto AI Agentを作成する"
emoji: "🦁"
type: "tech"
topics: [Autonome, AgentKit, Docker,TypeScript]
published: true
---

## AutonomeでAgent Kitを使う

**この記事は2025年2月時点の情報です。**
最近話題の「AIエージェント」を手軽にデプロイできる
プラットフォームとして注目されるのが**Autonome（オートノーム）**です。
本記事では、Autonome上でAgent Kitを利用して
AIエージェントを作成し、デプロイする方法を解説します。

### Autonomeとは

**Autonome**はAltLayer社が提供する
自律型AIエージェントの作成とデプロイのための
プラットフォームです。
Web上のダッシュボードから簡単にエージェントを起動でき、
インフラ構築の手間が不要です。

Autonomeのエージェントは、通常のチャットボットのように
ユーザーと対話できます。さらに、自律的な判断や
ブロックチェイン上での動作も可能です。
例えば、次のユースケースが想定されます。

- **自動取引エージェント**
  市場データをAIで分析し、ユーザーの許可範囲内で暗号資産の売買を自律実行します。
- **オンチェイン分析エージェント**
  ブロックチェイン上の取引データやスマートコントラクトを監視し
  異常検知やレポートを生成します。
- **ポートフォリオ管理エージェント**
  複数のウォレット残高やNFTコレクションを追跡し、
  最適な資産配分を提案します。

このように、AIとブロックチェインの組み合わせは
2025年の注目トレンドです。
Autonomeはエージェントの動作信頼性を担保するため、
Trusted Execution Environment (TEE) により保護します。

<details>
<summary>TEEがなぜ必要か？</summary>

ブロックチェインはオープンで誰でも検証可能なパーミッションレスなシステムであるため、信頼性の担保が重要です。
しかし、オフチェインでの計算処理やAPI経由でのAI利用など外部リソースを用いると、各ノードで結果が異なったり不正な操作が介在することもあります。
これを解決するため、TEEのようなハードウェアベースの隔離環境を利用することで以下のことを実現します。

- **処理の安全性**（コードやデータが外部から改ざんされない）
- **リモートアテステーション**（実行結果が正当に生成されたことの検証）

が実現され、ユーザーはエージェントの動作結果に対して高い信頼性を持つことができます。

つまり、TEEは「この処理は確実に安全な環境で実行され、改ざんがない」という証明を提供するための技術なのです。
</details>

なお、Autonomeではエージェント構築時に複数のフレームワークを選択できます。
現在は**AgentKit**、Based Agent、Eliza、Perplexicaに対応しています。
本記事では**AgentKit**を用いた開発方法に焦点をあてます。

### Agent Kitとは

**Agent Kit（エージェントキット）**は、Coinbase社が提供する
開発者向けプラットフォーム「Coinbase Developer Platform, CDP」の一部です。
AIエージェントにブロックチェイン上で動作する能力を与えます。

Agent Kitを使うと、LLM（大規模言語モデル）を用いた
エージェントに次の機能を追加できます。

- **オンチェイン操作**
  暗号資産の転送やスマートコントラクトの実行が可能です。
  例として「ウォレットにテストネットETHを送金して」
  と指示すれば自動で送金処理を行います。
- **マルチモデル対応**
  GPT-4/3.5だけでなく、AnthropicのClaudeやLlamaも
  利用できるため、用途に合ったモデルを選べます。
- **ツールの統合**
  Agent Kitはフレームワーク非依存の設計です。
  LangChainなどと統合し、既存ツールに
  オンチェイン機能を簡単に追加できます。
- **ウォレット管理**
  各エージェントに固有のウォレットを持たせます。
  CDPのウォレットAPI/SDKを活用し、安全に鍵管理が行えます。

このように、Agent KitはAIエージェントにブロックチェインの「腕と足」を生やします。

公式リポジトリは[coinbase/agentkit](https://github.com/coinbase/agentkit)です。
TypeScript版とPython版が提供されていますが、
本記事ではTypeScript版を使用します。
Coinbase公式ドキュメントの解説ページも参考にしてください。

### 環境構築

まずは手元の環境を整えます。
次のツールとアカウントを準備してください。

- **Node.js 18以上**
  Agent Kit（TypeScript版）の実行にはNode.jsが必要です。
  インストールがまだの場合は、公式サイトからLTS版を入れてください。
- **Docker**
  エージェントをコンテナ化してAutonomeで動作させるために使用します。
  Docker Desktopなどを導入してください。
- **Docker Hubのユーザー作成**
  DockerイメージをプッシュするためにDocker Hubのアカウントが必要です。
  まだの場合は[公式サイト](https://hub.docker.com/)から登録してください。
- **Git**
  ソースコード管理用です。サンプルリポジトリのクローン時に必要です。

上記のインストールが完了したら、**Autonomeのアカウント**を作成します。
公式ドキュメント([Deploy AI Agent](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agent#:~:text=1))に沿って
ログインしてください。

1. **Autonomeにログイン**
   ブラウザで`https://apps.autono.meme/`にアクセスし、
   Googleアカウントでログインします。
   初回ログイン時に組織名の作成を求められますので、適切な名称で作成してください。
2. **エージェントの新規作成**
   ダッシュボードの「+」ボタンをクリックすると、
   新しいAIエージェントのデプロイ画面が表示されます。
   ここでは後ほどDockerイメージのアップロードや設定をします。

また、エージェント動作用に以下のAPIキーも用意してください。

- **OpenAI APIキー**
  LLM（GPT-4/3.5等）利用のために必要です。
- **Coinbase CDP APIキー名**
  オンチェイン操作に用いる秘密鍵付きAPIキーの名前です。
- **Coinbase CDP APIキー**
  オンチェイン操作に用いる秘密鍵付きAPIキーです。

### Agent Kitを使いAI Agentを作成

[Quickstart](https://docs.cdp.coinbase.com/agentkit/docs/quickstart#starting-from-scratch-with-langchain)
に従ってAgentを構築していきます。
今回はTypeScript版を使用します。

#### 必要パッケージのインストール

```bash
pnpm install @coinbase/agentkit @coinbase/agentkit-langchain @langchain/openai @langchain/core @langchain/langgraph viem
```

追加で必要なものもインストールしておきます。

```bash
pnpm add @types/express @types/node express swagger-jsdoc swagger-ui-express
pnpm add -D @types/swagger-jsdoc @types/swagger-ui-express express prettier ts-node typescript
```

必要なスクリプトも追加しておきます。

```package.json
{
  "name": "autonome-coinbase-agentkit-integration",
  "version": "1.0.0",
  "description": "",
  "main": "build/index.js",
  "scripts": {
    "start": "node --env-file .env build/index.js",
    "build": "tsc",
    "format": "prettier --write '**/**/*.{js,ts,tsx,css}'",
    "format:check": "prettier --check '**/**/*.{ts,tsx,js,jsx,css}'"
  },
:
}
```

#### 環境変数の設定

.envファイルを作成し、以下の環境変数を設定します。

```.env
CDP_API_KEY_NAME=your-cdp-key-name
CDP_API_KEY_PRIVATE_KEY=your-cdp-private-key
OPENAI_API_KEY=your-openai-key
NETWORK_ID=base-sepolia
DOCKER_USERNAME=your-docker-username # Docker Hubのユーザー名イメージのプッシュスクリプトで使用
```

#### Agentの作成

Autonomeで動せるようにヘルスチェックとAPI経由で起動できるようにします。

```index.ts
import {
  AgentKit,
  CdpWalletProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
  erc721ActionProvider,
  cdpApiActionProvider,
  cdpWalletActionProvider,
  pythActionProvider,
} from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import * as fs from "fs";
import express, { Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";

// 環境変数の検証
function validateEnvironment(): void {
  const missingVars: string[] = [];
  const requiredVars = [
    "OPENAI_API_KEY",
    "CDP_API_KEY_NAME",
    "CDP_API_KEY_PRIVATE_KEY",
  ];
  requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });
  if (missingVars.length > 0) {
    console.error("Missing required environment variables:", missingVars);
    missingVars.forEach((varName) => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }
  if (!process.env.NETWORK_ID) {
    console.warn("NETWORK_ID not set, defaulting to base-sepolia");
  }
}

validateEnvironment();

const WALLET_DATA_FILE = "wallet_data.txt";

async function initializeAgent() {
  console.log("Initializing agent...");
  const llm = new ChatOpenAI({ model: "gpt-4o-mini" });
  let walletDataStr: string | null = null;
  if (fs.existsSync(WALLET_DATA_FILE)) {
    try {
      walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      console.log("Wallet data read from file");
    } catch (error) {
      console.error("Error reading wallet data file", error);
    }
  }

  const config = {
    apiKeyName: process.env.CDP_API_KEY_NAME,
    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n",
    ),
    cdpWalletData: walletDataStr || undefined,
    networkId: process.env.NETWORK_ID || "base-sepolia",
  };

  const walletProvider = await CdpWalletProvider.configureWithWallet(config);
  console.log("Wallet provider configured");

  const agentkit = await AgentKit.from({
    walletProvider,
    actionProviders: [
      wethActionProvider(),
      pythActionProvider(),
      walletActionProvider(),
      erc20ActionProvider(),
      erc721ActionProvider(),
      cdpApiActionProvider({
        apiKeyName: process.env.CDP_API_KEY_NAME,
        apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(
          /\\n/g,
          "\n",
        ),
      }),
      cdpWalletActionProvider({
        apiKeyName: process.env.CDP_API_KEY_NAME,
        apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY?.replace(
          /\\n/g,
          "\n",
        ),
      }),
    ],
  });
  console.log("AgentKit initialized");

  const tools = await getLangChainTools(agentkit);
  const memory = new MemorySaver();
  const agentConfig = {
    configurable: { thread_id: "CDP AgentKit Chatbot" },
  };
  const agent = createReactAgent({
    llm,
    tools,
    checkpointSaver: memory,
    messageModifier: `
      You are a helpful agent that can interact onchain using Coinbase Developer Platform AgentKit.
      If you ever need funds, request them appropriately.
      Be concise and helpful.
    `,
  });
  console.log("Agent created");

  const exportedWallet = await walletProvider.exportWallet();
  fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet));
  console.log("Wallet data exported and saved");

  return { agent, config: agentConfig };
}

// Swagger の設定
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Agent API",
    version: "1.0.0",
    description: "API documentation for the Coinbase AgentKit based service",
  },
  servers: [
    {
      url: "http://localhost:3000",
    },
  ],
};

const swaggerOptions = {
  swaggerDefinition,
  apis: ["./src/index.ts"],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

async function startAgentServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  app.use(express.json());

  // Swagger UI のエンドポイント
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  /**
   * @swagger
   * /message:
   *   post:
   *     summary: Chat with the agent
   *     description: Sends a text message to the agent and returns its response.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - message
   *             properties:
   *               message:
   *                 type: string
   *                 example: "Hello, Agent!"
   *     responses:
   *       200:
   *         description: Agent response
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 text:
   *                   type: string
   *                   example: "This is the agent's response."
   *       400:
   *         description: Bad request
   *       500:
   *         description: Internal server error
   */
  app.post("/message", async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
      console.error("Invalid request", req.body);
      return res
        .status(400)
        .json({ error: "Invalid request: 'message' field is required." });
    }
    if (message === "healthz") {
      return res.status(200).json({ status: "ok" });
    }
    console.log("Processing chat request:", message);
    try {
      const { agent, config } = await initializeAgent();
      const stream = await agent.stream(
        { messages: [new HumanMessage(message)] },
        config,
      );
      let fullResponse = "";
      for await (const chunk of stream) {
        if (
          "agent" in chunk &&
          chunk.agent.messages &&
          chunk.agent.messages[0]
        ) {
          fullResponse += chunk.agent.messages[0].content;
        }
      }
      console.log("Agent response:", fullResponse);
      res.json({ text: fullResponse });
    } catch (error) {
      console.error("Error processing chat request", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`Agent REST server is listening on port ${port}`);
    console.log(`Swagger UI available at http://localhost:${port}/api-docs`);
  });
}

if (require.main === module) {
  startAgentServer().catch((error) => {
    console.error("Failed to start agent server:", error);
    process.exit(1);
  });
}
```

#### Agentの起動確認

```bash
❯ pnpm run build && pnpm run start

> autonome-coinbase-agentkit-integration@1.0.0 build /Users/susumu/autonome-coinbase-agentkit-integration
> tsc


> autonome-coinbase-agentkit-integration@1.0.0 start /Users/susumu/autonome-coinbase-agentkit-integration
> node --env-file .env build/index.js

(node:3727) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)
Agent REST server is listening on port 3000
Swagger UI available at http://localhost:3000/api-docs
```

これでAgent Kitを使ったエージェントが起動しました。
Swagger UIにアクセスして試すこともできます。

## Autonomeで動かせるようにする

Autonomeで動かすには以下の作業が必要でした。

1. linux/amd64に対応したDockerイメージの作成
2. API経由で起動できるようにする(実装済み)
3. ヘルスチェックの追加(healthzというメッセージが送られてきます。これも実装済み)

残りのDockerイメージの作成します。

### linux/amd64に対応したDockerイメージの作成

#### docker-entrypoint.shの作成

ルートディレクトリ配下に`docker-entrypoint.sh`を作成します。

```docker-entrypoint.sh
#!/bin/sh
set -e
exec "$@"
```

#### Dockerfileの作成

ルートディレクトリ配下に`Dockerfile`を作成します。
ポイントは/usr/local/bin/docker-entrypoint.shへの配置です。

```Dockerfile
FROM node:23

WORKDIR /app

RUN npm install -g pnpm

# Copy package files (if needed for runtime scripts)
COPY package*.json ./

# Install production dependencies only
RUN pnpm install

COPY . .

RUN pnpm run build
# Copy entrypoint script and set execution permissions
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Set production environment variables
ENV NODE_ENV=production
ENV DAEMON_PROCESS=true
ENV SERVER_PORT=3000

# Set entrypoint and command:
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
```

イメージのビルドとプッシュ用のMakefileも作成します。

```Makefile
# Load .env file if available (.env should contain KEY=VALUE pairs)
-include .env

# Retrieve DOCKER_USERNAME from the environment (error out if not set)
ifndef DOCKER_USERNAME
$(error DOCKER_USERNAME is not set. Please set it in your environment or in a .env file)
endif

# Docker related variables
IMAGE_NAME = autonome-coinbase-agentkit-integration
TAG ?= latest

# Full image name with tag
DOCKER_IMAGE = $(DOCKER_USERNAME)/$(IMAGE_NAME):$(TAG)

.PHONY: build
build:
	docker build --platform linux/amd64 -t $(DOCKER_IMAGE) .

.PHONY: push
push:
	@if ! docker images | grep -q $(DOCKER_IMAGE); then \
		$(MAKE) build; \
	fi
	docker push $(DOCKER_IMAGE)

.PHONY: all
all: build push

.PHONY: help
help:
	@echo "Available commands:"
	@echo "  make build    - Build the Docker image (targeting linux/amd64)"
	@echo "  make push     - Push the image to DockerHub (build automatically if image is not found)"
	@echo "  make all      - Build and push the image"
	@echo ""
	@echo "Environment variable settings:"
	@echo "  DOCKER_USERNAME    - Your DockerHub username (do not hardcode sensitive information)"
	@echo "  TAG                - Image tag (default: latest)"
```

`make all`を実行することでlinux/amd64用のイメージのビルドとDocker Hubへのプッシュが行えるようになります。

さらに合わせてテスト用にdocker runを行うための`docker-compose.yml`も作成します。

```docker-compose.yml
services:
  autonome-coinbase-agentkit-integration:
    image: ${DOCKER_USERNAME}/autonome-coinbase-agentkit-integration:latest
    platform: linux/amd64
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      CDP_API_KEY_NAME: ${CDP_API_KEY_NAME}
      CDP_API_KEY_PRIVATE_KEY: ${CDP_API_KEY_PRIVATE_KEY}
      NETWORK_ID: ${NETWORK_ID:-base-sepolia}
    ports:
      - "3000:3000"
    stdin_open: true
    tty: true
```

これで、Docker Hubにプッシュしたイメージを使ってローカルでテストができるようになります。

実際にイメージをプッシュしてみます。

```bash
make build
make push
```

を行いDocker Hubにイメージをプッシュします。

その後プッシュしたイメージを使ってコンテナが立ち上がることを確認します。

```bash
docker compose up
```

を実行してイメージが起動したら成功です。

## Autonomeへのデプロイ

### Frame Workの作成

まず今回プッシュしたイメージをAutonomeで使えるようにします。

Autonomeにサインインしたら[Upload your framework](https://dev.autonome.fun/autonome/publish)を選択します。

フォームに必要項目を入力します。

```text
Name: 任意の名前
DESCRIPTION: 任意の説明
DOCKER IMAGE: 作成したイメージのURL
AGENT LOGO: 任意の画像
CAHT EDNPOINT: 任意のエンドポイント今回の場合だと/message
PORT: 3000
CHAT REQUEST SCHEMA: デフォルトのまま
CHAT RESPONSE SCHEMA: デフォルトのまま
GITHUB URL: 任意のURL
SPECIFY ENVIRONMENT VARIABLES: 以下の環境変数を設定

- OPENAI_API_KEY
- CDP_API_KEY_NAME
- CDP_API_KEY_PRIVATE_KEY
- NETWORK_ID
```

これらを入力したらSubmitをクリックします。

## Deploy

https://dev.autonome.fun/autonome/new
に移動して
Select a template -> UPLOADをクリックして今回作成したフレームワークを選択します。
AGENT PREFIX NAME: 任意の名前
を入力してSubmitをクリックします。

環境変数に値を設定してConfirm
その後サブスクリプションの選択がありますがfree trialもしくはPromo codeを[Google Form](https://forms.gle/gXWvdVBoxEchu2gp6)から入手して入力してください。

これでエージェントがデプロイされます。

### デプロイの確認

2025/2時点ではベーシック認証を使っているため、ベーシック認証のヘッダを付与してリクエストを送る必要があります。

具体的なやり方は[API guide](https://docs.google.com/document/d/1k9AXoY8Yljw_I_yS3arnALfytqKQiSMfZaYX6GI71qk/edit?tab=t.0)に書かれています。

リクエストの例。

```bash
curl --location --request POST 'https://autonome.alt.technology/<Project Name>/message' \
--header 'Content-Type: application/json' \
--header 'Authorization: Basic <BASIC 認証>' \
--data '{
    "message": "hi"
}'

{"text":"Hello! How can I assist you today?"}
```

のように応答が返ってきます。

## ハマったポイントと回避策

最後に、筆者が実際にAutonome＋AgentKit環境を触ってみてハマったポイントとその回避策を共有します。

### ヘルスチェック

Autonomeではデプロイしたコンテナの稼働監視のためにhealthzというメッセージを送りヘルスチェックを行います。リクエストに対してすぐに200を返す実装にしてください。

### exec /usr/local/bin/docker-entrypoint.sh: exec format error`

Dockerイメージの中にdocker-entrypoint.shを配置してあげて0なりをリターンするようにします。

### Apple Silicon Macでのイメージのビルド

Apple SiliconのMacを使っていたのですが、DockerイメージをビルドしてもAutonome上で動かないという問題がありました。docker build --platform linux/amd64 -t <タグ名> .として上げると回避できます。

## コードと参考リンク

### コード

最後に、今回解説したコード一式はGitHubにアップロードしてあります [autonome-coinbase-agentkit-integration](https://github.com/susumutomita/autonome-coinbase-agentkit-integration)

#### 参考リンク集

- [AltLayer公式: Autonomeドキュメント](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agent)
- [Introducing AgentKit | Coinbase](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit)
- [Coinbase Developer Docs: AgentKit](https://docs.cdp.coinbase.com/agentkit/docs/welcome)
- [Coinbase GitHub](https://github.com/coinbase/agentkit)
