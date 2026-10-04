---
title: "World IDを使った認証をアプリケーションへ組み込む"
emoji: "💨"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [WorldID, Web3, Authentication]
published: true
---

## はじめに

この記事では、[World ID](https://ja-jp.worldcoin.org/world-id)の基本的なセットアップと使用方法について紹介します。World IDは、ユーザーのプライバシーを保護しながら信頼性の高い認証を提供するWeb3プロジェクトです。特に、Web3アプリケーションにおいて、実在するユーザーのみを対象とする認証が必要な場合に有効に感じました。ボット対策やユーザーの実在確認が求められるプロジェクトでは、特に役立ちそうです。

## World IDとは

World IDは、[Worldcoin](https://ja-jp.worldcoin.org/world-id)によって提供される、プライバシー重視の分散型認証プロトコルです。このプロトコルは、ボットや偽アカウントを排除し、実在するユーザーのみが認証できることを保証します。特に、ブロックチェイン技術を活用するアプリケーションにおいて、安全で信頼性の高い認証を実現します。

### 主な特徴

- プライバシー保護 - World IDはゼロ知識証明を使用し、個人情報を公開せずにユーザーの存在を証明します。
- 分散型 - 中央集権的な認証システムとは異なり、World IDは分散型ネットワークを基盤としています。
- 簡単な統合 - 開発者は簡単にWorld IDをアプリケーションに統合できます。

## World IDのセットアップ

### 1. World IDの取得

World IDの機能を使うには、まず自分のWorld IDを作成します。World IDは、Orbと呼ばれるデバイスを使って取得します。Orbは虹彩認証を利用して、ユーザーの個人情報を保護しながら唯一無二のIDを生成します。

[こちら](https://worldcoin.org/find-orb)のリンクから、最寄りのOrb設置場所を探し、予約のうえ訪問します。現地で指示に従って認証することで、World IDを取得できます。

### 2. World ID Developer Portalへのアクセス

World IDを取得したら、[World ID Developer Portal](https://developer.worldcoin.org)にアクセスして、アプリケーションを作成します。このアプリケーションのIDと識別子を使用して、自分のアプリケーションにWorld IDの機能を統合できます。

### 3. テンプレートを活用して動かしてみる

次に、[Next.js用のテンプレート](https://github.com/worldcoin/world-id-nextauth-template)を利用して、World IDの基本機能を自分のアプリに組み込んでみましょう。以下の手順に従ってセットアップします。
[World IDドキュメント](https://docs.worldcoin.org/quick-start/templates)にもやり方が載っています。

まず、テンプレートに記載されている通り、必要なライブラリをインストールします。

```bash
npm install @worldcoin/idkit
```

次に、フロントエンドにWorld ID認証ボタンを追加するコードは以下の通りです。このコードを使用することで、簡単にWorld ID認証を組み込むことができます。

### フロントエンド統合コード

以下は、World ID認証ウィジェットをアプリケーションのフロントエンドに統合するためのコード例です。
[参考コード](https://github.com/worldcoin/world-id-cloud-template/blob/main/src/app/page.tsx):

```typescript
"use client";

import { VerificationLevel, IDKitWidget, useIDKit } from "@worldcoin/idkit";
import type { ISuccessResult } from "@worldcoin/idkit";
import { verify } from "./actions/verify";

export default function Home() {
  const app_id = process.env.NEXT_PUBLIC_WLD_APP_ID as `app_${string}`;
  const action = process.env.NEXT_PUBLIC_WLD_ACTION;

  if (!app_id) {
    throw new Error("app_id is not set in environment variables!");
  }
  if (!action) {
    throw new Error("action is not set in environment variables!");
  }

  const { setOpen } = useIDKit();

  const onSuccess = (result: ISuccessResult) => {
    window.alert(
      "Successfully verified with World ID! Your nullifier hash is: " +
        result.nullifier_hash
    );
  };

  const handleProof = async (result: ISuccessResult) => {
    console.log(
      "Proof received from IDKit, sending to backend:\n",
      JSON.stringify(result)
    );
    const data = await verify(result);
    if (data.success) {
      console.log("Successful response from backend:\n", JSON.stringify(data));
    } else {
      throw new Error(`Verification failed: ${data.detail}`);
    }
  };

  return (
    <div>
      <div className="flex flex-col items-center justify-center align-middle h-screen">
        <p className="text-2xl mb-5">World ID Cloud Template</p>
        <IDKitWidget
          action={action}
          app_id={app_id}
          onSuccess={onSuccess}
          handleVerify={handleProof}
          verification_level={VerificationLevel.Orb}
        />
        <button
          className="border border-black rounded-md"
          onClick={() => setOpen(true)}
        >
          <div className="mx-3 my-1">Verify with World ID</div>
        </button>
      </div>
    </div>
  );
}
```

### サーバーサイド認証検証コード

次に、サーバーサイドで認証結果を検証するためのコードです。これにより、サーバー側でユーザー認証の結果を安全に確認できます。
[参考コード](https://github.com/worldcoin/world-id-cloud-template/blob/main/src/app/actions/verify.ts):

```typescript
"use server";

import { VerificationLevel } from "@worldcoin/idkit-core";
import { verifyCloudProof } from "@worldcoin/idkit-core/backend";

export type VerifyReply = {
  success: boolean;
  code?: string;
  attribute?: string | null;
  detail?: string;
};

interface IVerifyRequest {
  proof: {
    nullifier_hash: string;
    merkle_root: string;
    proof: string;
    verification_level: VerificationLevel;
  };
  signal?: string;
}

const app_id = process.env.NEXT_PUBLIC_WLD_APP_ID as `app_${string}`;
const action = process.env.NEXT_PUBLIC_WLD_ACTION as string;

export async function verify(
  proof: IVerifyRequest["proof"],
  signal?: string
): Promise<VerifyReply> {
  const verifyRes = await verifyCloudProof(proof, app_id, action, signal);
  if (verifyRes.success) {
    return { success: true };
  } else {
    return {
      success: false,
      code: verifyRes.code,
      attribute: verifyRes.attribute,
      detail: verifyRes.detail,
    };
  }
}
```

より詳細な実装とテンプレートコードについては、[world-id-cloud-template](https://github.com/worldcoin/world-id-cloud-template)のGitHubリポジトリを参照してください。

### 4. テストとデプロイ

実装が完了したら、Vercelなどのプラットフォームを使用してアプリケーションをデプロイします。デプロイ後、すべての機能が正しく動作することを確認します。

## まとめ

World IDを利用することで、Web3アプリケーションにおいて安全で信頼性の高い認証システムを簡単に導入できます。特に、Orbで認証することで、ボット対策や実在ユーザーの確認が必要なプロジェクトにおいてその効果を発揮します。

今回、ETHGlobalの[SuperHack 2024ハッカソン](https://ethglobal.com/events/superhack2024)で開発した[Onchain Senryu](https://github.com/susumutomita/2024-Superhack)という川柳を投稿できるプロダクトにWorld IDを統合してみました。ボット対策として非常に有用であると感じましたが、World IDを作成するためにOrbを予約し、虹彩情報を提供する必要がある点から、普及のハードルがあるようにも感じました。しかし、本人確認済みのIDを使える点は強力だなと思いました。
