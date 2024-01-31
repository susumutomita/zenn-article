---
title: "Sindri CLIを使ってゼロ知識証明回路をデプロイする"
emoji: "🙆"
type: "tech"
topics: [Sindri]
published: true
---

## Sindri API とは

[Sindri](https://sindri.app/) は、ゼロ知識証明を簡単に生成できるAPIを提供します。これにより、開発者はプライバシーを保護しながら、特定の情報（例えば、年齢の証明）が真実であることを証明できます。

## 実際にやってみる

### 1. Sindri API キーの取得

[Sindri](https://sindri.app/) にログインするためのユーザー情報を発行して貰う必要があります。
直接メールをするなりしてコンタクトをしてログインするためのユーザー情報を発行してもらいます。
無事ログインができるとAccount Settings -> API KeysからAPI Keyを発行できます。
なお、APIやCLI経由でもAPI Keyは発行できます。
具体的なやり方は[チュートリアル](https://sindri.app/docs/getting-started/cli/)に書いてありますが次のようになります。

```bash
npm install -g sindri@latest
sindri login
```

と実行してログインをするとAPI Keyが発行されます。

### 2. プロジェクトのセットアップ

```bash
sindri init <プロジェクトの名前>
```

を実行するとプロジェクトが作られます。
その後回路を作成して、以下のコマンドを実行することでデプロイまでできます。
例えば入力値が20以上であるかを確認する回路を[Noir](https://noir-lang.org/)で作ってみます。

```noir
fn main(input: u8) -> pub bool {
    input >= 20
}

#[test]
fn test_main_with_valid_age() {
    assert(main(20));
}

#[test]
fn test_main_with_invalid_age() {
    let result = main(19);
    assert(!result);
}

#[test]
fn test_main_with_zero() {
    let result = main(0);
    assert(!result);
}

#[test]
fn test_main_with_200() {
    let result = main(200);
    assert(result);
}

```

```bash
sindri lint
```

```bash
sindri deploy
```

デプロイ後はダッシュボードで詳細を確認できます。

### 確認

確認用のスクリプトを用意します。

```verify.js
const process = require("process");
const axios = require("axios");
const toml = require('@iarna/toml');

// NOTE: Provide your API key here.
const API_KEY = process.env.SINDRI_API_KEY || "";
const API_URL_PREFIX = process.env.SINDRI_API_URL || "https://sindri.app/api/";

const API_VERSION = "v1";
const API_URL = API_URL_PREFIX.concat(API_VERSION);

const headersJson = {
  Accept: "application/json",
  Authorization: `Bearer ${API_KEY}`
};

// Utility to poll a detail API endpoint until the status is `Ready` or `Failed`.
// Returns the response object of the final request or throws an error if the timeout is reached.
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

async function main() {
  try {
    const circuitId = "デププロイした回路のIDを指定する";
    // Initiate proof generation.
    console.log("Proving circuit...");
    const proofInput = toml.stringify({ input: 10 });
    const proveResponse = await axios.post(
      API_URL + `/circuit/${circuitId}/prove`,
      { proof_input: proofInput },
      { headers: headersJson, validateStatus: (status) => status === 201 },
    );
    const proofId = proveResponse.data.proof_id;

    // Poll the proof detail endpoint until the compilation status is `Ready` or `Failed`.
    const proofDetailResponse = await pollForStatus(`/proof/${proofId}/detail`);

    // Check for proving issues.
    const proofDetailStatus = proveResponse.data.status;
    if (proofDetailStatus === "Failed") {
      throw new Error("Proving failed");
    }

    // Retrieve output from the proof.
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

if (require.main === module) {
  main();
}
```

このスクリプトを実行してみると確認結果が取得できます。
今回は入力値が10なのでfalseが返ってきました。

```bash
❯ node verify.js
Proving circuit...
Poll exited after 2 seconds with status: Ready
input = 10
return = false
Circuit proof output signal: return = false
```

### 検証

調査中です。

### 結論

回路のデプロイや検証がAPI経由で完結してとても便利でした。継続してチェックしていきます。
