---
title: "Expo Go + React NativeでSindri APIを実行してみる"
emoji: "😎"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Sindri, React Native]
published: true
---

## Sindri API とは

[Sindri](https://sindri.app/)は、ゼロ知識証明を簡単に生成できるAPIを提供します。これにより、開発者はプライバシーを保護しながら、特定の情報（例えば、年齢の証明）が真実であることを証明できます。

## 準備

### ゼロ知識証明とは

[イーサリアムコミュニティとゼロ知識証明の発展](https://youtu.be/7NVb07bYDoY?feature=shared)
あたりで学習しておくとイメージがつかみやすいです。

### Sindri API キーの取得

[Sindri](https://sindri.app/)にログインするためのユーザー情報を発行して貰う必要があります。
直接メールをするなりしてコンタクトをしてログインするためのユーザー情報を発行してもらいます。
無事ログインができるとAccount Settings -> API KeysからAPI Keyを発行できます。
なお、APIやCLI経由でもAPI Keyは発行できます。
具体的なやり方は[チュートリアル](https://sindri.app/docs/getting-started/cli/)に書いてありますが次のようになります。

```bash
npm install -g sindri@latest
sindri login
```

と実行してログインをするとAPI Keyが発行されます。

### 回路のデプロイ

[Sindri CLIを使ってゼロ知識証明回路をデプロイする](https://zenn.dev/bull/articles/getting-started-sindri)
で使用した回路を使っています。

### Expoのセットアップ

[Tutorial](https://reactnative.dev/docs/environment-setup?guide=quickstart)に書いてある手順でExpoをインストールします。
合わせてスマートフォン側で[アプリ](https://expo.dev/client)をインストールしておきます。

```bash
npx create-expo-app SindriAPISample

cd SindriAPISample
npx expo start
```

### [Sindri API](https://sindri.app/)を実行する準備

APIを実行するためのライブラリのインストール。

```bash
npm install axios react-native-config
```

```Sindri.js
import axios from 'axios';
import Config from 'react-native-config';

// APIキーとURLの取得
const API_KEY = Config.SINDRI_API_KEY || "";
const API_URL_PREFIX = Config.SINDRI_API_URL || "https://sindri.app/api/";
const API_VERSION = "v1";
const API_URL = API_URL_PREFIX.concat(API_VERSION);

const headersJson = {
  Accept: "application/json",
  Authorization: `Bearer ${API_KEY}`
};

async function pollForStatus(endpoint, timeout = 20 * 60) {
  for (let i = 0; i < timeout; i++) {
    const response = await axios.get(API_URL + endpoint, {
      headers: headersJson,
      validateStatus: (status) => status === 200,
    });

    const status = response.data.status;
    if (["Ready", "Failed"].includes(status)) {
      console.log(`Poll exited after ${i} seconds with status: ${status}`);
      return response;
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error(`Polling timed out after ${timeout} seconds.`);
}

export async function generateProof(input) {
  try {
    const circuitId = "SindriでデプロイしたIDに置き換える";
    console.log("Proving circuit...");
    const proofInput = `input = ${input}`;
    const proveResponse = await axios.post(
      API_URL + `/circuit/${circuitId}/prove`,
      { proof_input: proofInput },
      { headers: headersJson, validateStatus: (status) => status === 201 },
    );
    const proofId = proveResponse.data.proof_id;

    const proofDetailResponse = await pollForStatus(`/proof/${proofId}/detail`);
    const proofDetailStatus = proveResponse.data.status;
    if (proofDetailStatus === "Failed") {
      throw new Error("Proving failed");
    }

    const proverTomlContent = proofDetailResponse.data.proof_input['Prover.toml'];
    const verifierTomlContent = proofDetailResponse.data.public['Verifier.toml'];

    console.log(proverTomlContent);
    console.log(verifierTomlContent);
    const publicOutput = verifierTomlContent;
    console.log(`Circuit proof output signal: ${publicOutput}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("An unknown error occurred.");
    }
  }
}
```

```App.js
import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, Button } from 'react-native';
import { generateProof } from 'Sindri.jsへのパス';

export default function App() {
  const [age, setAge] = useState('');
  const [proofResult, setProofResult] = useState('');

  const handleGenerateProof = async () => {
    try {
      const result = await generateProof(age);
      setProofResult('年齢が証明されました');
    } catch (error) {
      setProofResult('証明に失敗しました');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="年齢を入力"
        value={age}
        onChangeText={setAge}
        keyboardType="numeric"
      />
      <Button title="年齢を証明" onPress={handleGenerateProof} />
      {proofResult ? <Text>{proofResult}</Text> : null}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
    width: '80%',
  },
});
```

### 動作確認

```bash
npx expo start
```

その後、アプリ側でQRコードをスキャンすると確認できます。

### 検証

[noirの場合はnargo verifyを使います。](https://sindri.app/docs/how-to-guides/frameworks/noir/#verify)
