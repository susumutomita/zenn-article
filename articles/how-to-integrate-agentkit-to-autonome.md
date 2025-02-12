---
title: "AutonomeでAgent Kitを使う"
emoji: "🦁"
type: "tech"
topics: [Autonome, AgentKit, Docker]
published: false
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

#### 環境変数の設定

```.env
CDP_API_KEY_NAME=your-cdp-key-name
CDP_API_KEY_PRIVATE_KEY=your-cdp-private-key
OPENAI_API_KEY=your-openai-key
NETWORK_ID=base-sepolia
DOCKER_USERNAME=your-docker-username # Docker Hubのユーザー名イメージのプッシュスクリプトで使用
```

#### Agentの作成

```agent.ts
import {
  AgentKit,
  CdpWalletProvider,
  wethActionProvider,
  walletActionProvider,
  erc20ActionProvider,
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
import * as readline from "readline";

/**
 * Validates that required environment variables are set
 *
 * @throws {Error} - If required environment variables are missing
 * @returns {void}
 */
function validateEnvironment(): void {
  const missingVars: string[] = [];

  // Check required variables
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

  // Exit if any required variables are missing
  if (missingVars.length > 0) {
    console.error("Error: Required environment variables are not set");
    missingVars.forEach((varName) => {
      console.error(`${varName}=your_${varName.toLowerCase()}_here`);
    });
    process.exit(1);
  }

  // Warn about optional NETWORK_ID
  if (!process.env.NETWORK_ID) {
    console.warn(
      "Warning: NETWORK_ID not set, defaulting to base-sepolia testnet",
    );
  }
}

// Add this right after imports and before any other code
validateEnvironment();

// Configure a file to persist the agent's CDP MPC Wallet Data
const WALLET_DATA_FILE = "wallet_data.txt";

/**
 * Initialize the agent with CDP Agentkit
 *
 * @returns Agent executor and config
 */
async function initializeAgent() {
  try {
    // Initialize LLM
    const llm = new ChatOpenAI({
      model: "gpt-4o-mini",
    });

    let walletDataStr: string | null = null;

    // Read existing wallet data if available
    if (fs.existsSync(WALLET_DATA_FILE)) {
      try {
        walletDataStr = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      } catch (error) {
        console.error("Error reading wallet data:", error);
        // Continue without wallet data
      }
    }

    // Configure CDP Wallet Provider
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

    // Initialize AgentKit
    const agentkit = await AgentKit.from({
      walletProvider,
      actionProviders: [
        wethActionProvider(),
        pythActionProvider(),
        walletActionProvider(),
        erc20ActionProvider(),
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

    const tools = await getLangChainTools(agentkit);

    // Store buffered conversation history in memory
    const memory = new MemorySaver();
    const agentConfig = {
      configurable: { thread_id: "CDP AgentKit Chatbot Example!" },
    };

    // Create React Agent using the LLM and CDP AgentKit tools
    const agent = createReactAgent({
      llm,
      tools,
      checkpointSaver: memory,
      messageModifier: `
        You are a helpful agent that can interact onchain using the Coinbase Developer Platform AgentKit. You are
        empowered to interact onchain using your tools. If you ever need funds, you can request them from the
        faucet if you are on network ID 'base-sepolia'. If not, you can provide your wallet details and request
        funds from the user. Before executing your first action, get the wallet details to see what network
        you're on. If there is a 5XX (internal) HTTP error code, ask the user to try again later. If someone
        asks you to do something you can't do with your currently available tools, you must say so, and
        encourage them to implement it themselves using the CDP SDK + Agentkit, recommend they go to
        docs.cdp.coinbase.com for more information. Be concise and helpful with your responses. Refrain from
        restating your tools' descriptions unless it is explicitly requested.
        `,
    });

    // Save wallet data
    const exportedWallet = await walletProvider.exportWallet();
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(exportedWallet));

    return { agent, config: agentConfig };
  } catch (error) {
    console.error("Failed to initialize agent:", error);
    throw error; // Re-throw to be handled by caller
  }
}

/**
 * Run the agent autonomously with specified intervals
 */
async function runAutonomousMode(agent: any, config: any, interval = 10) {
  console.log("Starting autonomous mode...");

  while (true) {
    try {
      const thought =
        "Be creative and do something interesting on the blockchain. " +
        "Choose an action or set of actions and execute it that highlights your abilities.";

      const stream = await agent.stream(
        { messages: [new HumanMessage(thought)] },
        config,
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }

      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    } catch (error) {
      if (error instanceof Error) {
        console.error("Error:", error.message);
      }
      process.exit(1);
    }
  }
}

/**
 * Run the agent interactively based on user input
 */
async function runChatMode(agent: any, config: any) {
  console.log("Starting chat mode... Type 'exit' to end.");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  try {
    while (true) {
      const userInput = await question("\nPrompt: ");

      if (userInput.toLowerCase() === "exit") {
        break;
      }

      const stream = await agent.stream(
        { messages: [new HumanMessage(userInput)] },
        config,
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
        console.log("-------------------");
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Choose whether to run in autonomous or chat mode
 */
async function chooseMode(): Promise<"chat" | "auto"> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  while (true) {
    console.log("\nAvailable modes:");
    console.log("1. chat    - Interactive chat mode");
    console.log("2. auto    - Autonomous action mode");

    const choice = (await question("\nChoose a mode (enter number or name): "))
      .toLowerCase()
      .trim();

    if (choice === "1" || choice === "chat") {
      rl.close();
      return "chat";
    } else if (choice === "2" || choice === "auto") {
      rl.close();
      return "auto";
    }
    console.log("Invalid choice. Please try again.");
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { agent, config } = await initializeAgent();
    const mode = await chooseMode();

    if (mode === "chat") {
      await runChatMode(agent, config);
    } else {
      await runAutonomousMode(agent, config);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    }
    process.exit(1);
  }
}

// Start the agent when running directly
if (require.main === module) {
  console.log("Starting Agent...");
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
```

#### Agentの起動確認

```bash
❯ pnpm run start

> autonome-coinbase-agentkit-integration@1.0.0 start /Users/susumu/autonome-coinbase-agentkit-integration
> node --env-file .env build/index.js

Starting Agent...
(node:10522) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

Available modes:
1. chat    - Interactive chat mode
2. auto    - Autonomous action mode

Choose a mode (enter number or name): 1
Starting chat mode... Type 'exit' to end.

Prompt: hi
Hello! How can I assist you today?
```

これでAgent Kitを使ったエージェントが起動しました。

## Autonomeで動かせるようにする

Autonomeで動かすには以下の作業が必要でした。

1. linux/amd64に対応したDockerイメージの作成
2. API経由で起動できるようにする
3. ヘルスチェックの追加

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

合わせてテスト用にdocker runを行うための`docker-compose.yml`も作成します。

```docker-compose.yml
services:
  autonome-coinbase-agentkit-integration:
    build:
      context: .
      dockerfile: Dockerfile
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

またイメージのビルドとプッシュ用のMakefileも作成します。

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

####

### Agent をAPI経由で起動できるようにする

### Agent KitのDocker化

ここでは、Agent Kitを利用したエージェントアプリケーションを
Dockerイメージ化する手順を説明します。
AutonomeはDockerコンテナとしてエージェントを実行します。

```dockerfile
# Node.js 18-slimをベースイメージに使用します。
FROM node:18-slim

# 作業ディレクトリを /app に設定します。
WORKDIR /app

# 依存関係ファイルを先にコピーし、npm ciでインストールします。
COPY package.json package-lock.json ./
RUN npm ci

# 残りのソースコードをコピーします。
COPY . .

# TypeScriptをビルドします。出力は dist に配置されます。
RUN npm run build

# PORTは3000に設定します。
ENV PORT=3000

# コンテナ起動時に entrypoint.sh を実行します。
ENTRYPOINT ["./entrypoint.sh"]
```

次に、同じディレクトリに**entrypoint.sh**を用意します。

```bash
#!/bin/sh
# entrypoint.sh

# 必須の環境変数が設定されているかチェックします。
if [ -z "$OPENAI_API_KEY" ] || [ -z "$CDP_API_KEY" ] || [ -z "$WALLET_PRIVATE_KEY" ]; then
  echo "Error: 必須のAPIキーが設定されていません。"
  exit 1
fi

# npm startでアプリを起動します。
npm run start
```

※スクリプトに実行権限を与えてください（例: `chmod +x entrypoint.sh`）。

これでDockerイメージのビルド準備が整いました。
ターミナルで以下のコマンドを実行します。

```bash
docker build --platform linux/amd64 -t myagent:latest .
```

ビルド完了後、次のコマンドでローカル実行し動作確認してください。

```bash
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=<OpenAIキー> \
  -e CDP_API_KEY=<CDPキー> \
  -e WALLET_PRIVATE_KEY=<ウォレット秘密鍵> \
  myagent:latest
```

ブラウザまたはcurlで`http://localhost:3000/`にアクセスし
"OK"が返れば成功です。
また、`POST /chat`に対してJSONを送信し応答が返るか確認してください。

### Autonomeへのデプロイ

次に、DockerイメージをAutonomeにデプロイします。
大まかな手順は以下の通りです。

1. **コンテナイメージのプッシュ**
   Docker Hubなどのレジストリに、
   `myagent:latest`イメージをプッシュします。
   例: `username/myagent:latest`
2. **Autonomeで新規エージェント作成**
   ダッシュボードの「+ 新規デプロイ」からエージェント作成画面へ進みます。
   エージェント名や説明を入力し、**AgentKit**スタックを選択します。
   コンテナイメージ名を指定してください。
3. **環境変数の設定**
   UI上で`OPENAI_API_KEY`や`CDP_API_KEY`、`WALLET_PRIVATE_KEY`を入力します。
4. **デプロイ実行**
   デプロイボタンを押して、コンテナが起動するのを待ちます。
   数分後、ダッシュボードにエージェントが登録されます。

デプロイ後、AutonomeのUIから
「Chat with Agent」ボタンをクリックして対話を開始できます。
なお、一度デプロイしたエージェントは
その場で編集できません。変更する場合は、
新しいイメージをビルドして再デプロイしてください。

また、エージェントのエンドポイント設定も重要です。
必ず`POST /chat`や`GET /`でリクエストを受け付けるようにしてください。
特に、サーバは0.0.0.0で待機する必要があります。

## ハマったポイントと回避策

最後に、筆者が実際にAutonome＋AgentKit環境を触ってみてハマったポイントとその回避策を共有します。

### ヘルスチェック

Autonomeではデプロイしたコンテナの稼働監視のためにhealthzというメッセージを送りヘルスチェックを行います。リクエストに対してすぐに200を返す実装にしてください。

### exec /usr/local/bin/docker-entrypoint.sh: exec format error`

Dockerイメージの中にdocker-entrypoint.shを配置してあげて0なりをリターンするようにします。

### Apple Silicon Macでのイメージのビルド

Apple SiliconのMacを使っていたのですが、DockerイメージをビルドしてもAutonome上で動かないという問題がありました。docker build --platform linux/amd64 -t <タグ名> .として上げると回避できます。

## コードと参考リンク

#### コード

最後に、今回解説したコード一式はGitHubにアップロードしてあります [autonome-coinbase-agentkit-integration](https://github.com/susumutomita/autonome-coinbase-agentkit-integration)

#### 参考リンク集

- [AltLayer公式: Autonomeドキュメント](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agent)
- [Introducing AgentKit | Coinbase](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit)
- [Coinbase Developer Docs: AgentKit](https://docs.cdp.coinbase.com/agentkit/docs/welcome)
- [Coinbase GitHub](https://github.com/coinbase/agentkit)
