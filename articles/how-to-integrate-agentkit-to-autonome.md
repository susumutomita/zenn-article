```markdown
---
title: "AutonomeでAgent Kitを使う"
emoji: "🦁"
type: "tech"
topics: [Autonome, AgentKit, Docker]
published: false
---

## AutonomeでAgent Kitを使う

**この記事は2025年2月時点の情報です。今後仕様が変わる可能性があります。**
最近話題の「AIエージェント」を手軽にデプロイできる
プラットフォームとして注目されるのが**Autonome（オートノーム）**です。
本記事では、Autonome上でAgent Kitを利用して
AIエージェントを作成し、デプロイする方法を解説します。

**目次**
- [Autonomeとは](#autonomeとは)
- [Agent Kitとは](#agent-kitとは)
- [環境構築](#環境構築)
- [Agent KitのDocker化](#agent-kitのdocker化)
- [Autonomeへのデプロイ](#autonomeへのデプロイ)
- [Agent Kitの機能追加](#agent-kitの機能追加)
- [ハマったポイントと回避策](#ハマったポイントと回避策)
- [コードと参考リンク](#コードと参考リンク)

では早速見ていきましょう。

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

▶ **参考資料**
Autonome公式ドキュメントの「Deploy AI Agent」章を参照してください。

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

このように、Agent Kitは
AIエージェントにブロックチェインの「腕と足」を生やします。
通常のチャットAIがテキスト応答するだけなのに対し、
Agent Kit搭載エージェントは自らウォレット操作を実行できます。

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
  エージェントをコンテナ化してAutonomeにデプロイするために使用します。
  Docker Desktopなどを導入してください。
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
   ここでは後ほどDockerイメージのアップロードや設定を行います。

また、エージェント動作用に以下のAPIキーも用意してください。

- **OpenAI APIキー**
  LLM（GPT-4/3.5等）利用のために必要です。
- **Coinbase CDP APIキー**
  オンチェイン操作に用いる秘密鍵付きAPIキーです。

### Agent KitのDocker化

ここでは、Agent Kitを利用したエージェントアプリケーションを
Dockerイメージ化する手順を説明します。
AutonomeはDockerコンテナとしてエージェントを実行します。

まずはエージェントのアプリコードを用意します。
例として、Agent Kitの公式サンプルであるチャットボットを基に
`chatbot.ts`を作成します。
以下はその概要です。

```typescript
// chatbot.ts（エージェントのメインロジック）
import { OpenAI } from "langchain/llms/openai";
import { initializeAgentExecutor } from "langchain/agents";
import { WalletTool } from "@coinbase/agentkit";
import { theGraphTool } from "./TheGraphActionProvider";

// OpenAI LLMを初期化します。
const model = new OpenAI({ temperature: 0.2, modelName: "gpt-3.5-turbo" });

// Agent Kitのウォレットツールを初期化します。
const walletTool = new WalletTool({
  cdpApiKey: process.env.CDP_API_KEY!,
  privateKey: process.env.WALLET_PRIVATE_KEY!
});

// カスタムツール（The Graph用）を含むツールリストです。
const tools = [walletTool, theGraphTool];

// LangChainのエージェントを初期化します。
const executor = await initializeAgentExecutor(
  tools,
  model,
  "zero-shot-react-description"
);

import express from "express";
const app = express();
app.use(express.json());

// ヘルスチェック用エンドポイントです。
app.get("/", (_req, res) => res.send("OK"));

// POST /chat でユーザー入力を受け付け、応答します。
app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  try {
    const agentResponse = await executor.call({ input: userMessage });
    res.json({ answer: agentResponse.output });
  } catch (err) {
    console.error("Agent error:", err);
    res.status(500).json({ error: "Agent failed to respond" });
  }
});

// ポート3000で待機します。
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent server listening on port ${PORT}`);
});
```

上記コードは、以下のポイントを含みます。

- OpenAI APIを利用してLLMを構築します。
- Agent Kitのウォレットツールで
  暗号資産の送金やトランザクション処理を行います。
- カスタムツールとしてThe Graph用のツールを追加します。
- ExpressでシンプルなHTTPサーバを構築し、
  `GET /`でヘルスチェック、`POST /chat`で対話を実現します。

次に、上記アプリをDocker化するために
以下の**Dockerfile**を用意します。

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

### Agent Kitの機能追加

基本的なエージェントが動作したら、
次はカスタム機能の追加方法を説明します。
ここでは、**The Graph**というブロックチェインデータ照会サービスを例にとります。

The Graphは、GraphQLでブロックチェインデータを検索できるサービスです。
たとえば「Uniswapのプールから最新の価格データを取得する」
や「特定ウォレットのNFT一覧を取得する」ことが可能です。
これをエージェントに組み込むと、オンチェインデータを参照して対話できます。

まず、`TheGraphActionProvider.ts`を作成します。

```typescript
// TheGraphActionProvider.ts
import fetch from "node-fetch";

// Uniswap v3のサブグラフのエンドポイントURLです。
const THE_GRAPH_API_URL =
  "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3";

// The Graphに問い合わせを行う関数です。
async function queryTheGraph(graphQLQuery: string): Promise<any> {
  const res = await fetch(THE_GRAPH_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: graphQLQuery })
  });
  if (!res.ok) {
    throw new Error(`TheGraph APIが${res.status}を返しました`);
  }
  const data = await res.json();
  return data;
}

// LangChain用ツールの定義です。
export const theGraphTool = {
  name: "thegraph",
  description:
    "ブロックチェイン上のデータを照会します。GraphQLクエリ文字列を入力してください。",
  call: async (input: string) => {
    console.log("TheGraphクエリを実行します:", input);
    const result = await queryTheGraph(input);
    return JSON.stringify(result);
  }
};
```

このツールを`chatbot.ts`でインポートし、ツール配列に追加します。

```diff
 // chatbot.ts（一部抜粋）
 import { WalletTool } from "@coinbase/agentkit";
-import { theGraphTool } from "./TheGraphActionProvider";
+import { theGraphTool } from "./TheGraphActionProvider";
 ...
 // ツールの配列です。
-const tools = [ walletTool, theGraphTool ];
+const tools = [walletTool, theGraphTool];
 ...
 const executor = await initializeAgentExecutor(
   tools,
   model,
   "zero-shot-react-description"
 );
```

これでエージェントはThe Graph経由で
ブロックチェインデータを取得できる機能が追加されます。
例えば「このウォレットの最新トランザクション時刻を教えて」と入力すると、
内部でGraphQLクエリが組み立てられ、結果が返されます。

### ハマったポイントと回避策

最後に、筆者が実際にAutonome＋AgentKit環境を触ってみてハマったポイントとその回避策を共有します。

#### ヘルスチェック

Autonomeではデプロイしたコンテナの稼働監視のためにhealthzというメッセージを送りヘルスチェックを行います。リクエストに対してすぐに200を返す実装にしてください。

#### exec /usr/local/bin/docker-entrypoint.sh: exec format error`

Dockerイメージの中にdocker-entrypoint.shを配置してあげて0なりをリターンするようにします。

#### Apple Silicon Macでのイメージのビルド

Apple SiliconのMacを使っていたのですが、DockerイメージをビルドしてもAutonome上で動かないという問題がありました。docker build --platform linux/amd64 -t <タグ名> .として上げると回避できます。

### コードと参考リンク

最後に、今回解説したコード一式はGitHubにアップロードしてあります [autonome-coinbase-agentkit-integration](https://github.com/susumutomita/autonome-coinbase-agentkit-integration)

**参考リンク集**: 本記事執筆にあたり参考にした公式情報や関連資料を以下にまとめます。理解を深めるのに役立つので、興味があれば読んでみてください。

- [AltLayer公式: Autonomeドキュメント](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agen ([Deploy AI Agent | AltLayer Documentation](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agent#:~:text=3,deploying%20a%20new%20AI%20Agent)) ([Deploy AI Agent | AltLayer Documentation](https://docs.altlayer.io/altlayer-documentation/autonome/deploy-ai-agent#:~:text=5,and%20the%20Coinbase%20CDP%20guide))9】 - Autonomeの基本的な使い方が解説されています
- [Coinbase公式: AgentKit 紹介記事](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentki ([Introducing AgentKit | Coinbase](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit#:~:text=We%27re%20excited%20to%20announce%20the,powered%20applications)) ([Introducing AgentKit | Coinbase](https://www.coinbase.com/developer-platform/discover/launches/introducing-agentkit#:~:text=%2A%20Model%20Flexibility%3A%20AgentKit%27s%20model,that%20best%20suits%20their%20needs))6】 - AgentKitの狙いや機能が紹介されたブログ記事（英語）
- [Coinbase Developer Docs: AgentKit](https://docs.cdp.coinbase.com/agent-sdk/overvie ([GitHub - coinbase/agentkit: Every AI Agent deserves a wallet.](https://github.com/coinbase/agentkit#:~:text=Overview))6】 - AgentKitの開発者向けドキュメント（APIリファレンスやチュートリアル）
- [Coinbase GitHub: agentkitリポジトリ](https://github.com/coinbase/agentkit) - AgentKitのソースコード。TypeScriptとPythonのサンプル実装が見られます
- [CoinGecko解説: Crypto AIエージェントとは？](https://www.coingecko.com/ja/learn/what-are-crypto-ai-agent ([What Are Crypto AI Agents? The First Narrative to Watch for 2025 | CoinGecko](https://www.coingecko.com/learn/what-are-crypto-ai-agents#:~:text=Key%20Takeaways))7】 - Crypto領域におけるAIエージェントの概要と2025年展望について日本語で解説した記事
