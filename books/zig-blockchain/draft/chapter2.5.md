# Chapter 3: デジタル署名とトランザクションAPIの実装

前章までで、Zigによる**PoWブロックチェイン**と**P2Pネットワーク**が最低限動く状態になりました。しかし現在のトランザクションは、あくまで「`sender`, `receiver`, `amount`を埋めているだけ」であり、**誰でも好き放題に送信者を詐称できる**問題があります。実際のブロックチェインでは、**秘密鍵によるデジタル署名**を用いてトランザクション送信者を証明し、かつ改ざん・二重支出を防いでいます。本章では以下のステップを実装して、より現実的なブロックチェインに近づけていきましょう。

1. **デジタル署名を含むトランザクション構造**の再定義
2. **秘密鍵で署名 → 公開鍵（アドレス）で検証**する仕組みをZigに導入
3. **トランザクションAPI（JSON-RPC）** による外部からの取引投稿
4. **署名検証 → ノードがmempoolに格納 → マイニング → ブロックに格納** の一連の流れをテスト
5. （発展）**NFTやガス代ゼロ運用の拡張**に向けた布石

## 1. トランザクションデータ構造の拡張

### 1-1. 署名付きトランザクションのフィールド

従来は下記のような簡易トランザクションでした:

```zig
const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
};
```

これを、**イーサリアムやビットコインのような署名つき形式**に拡張します。大まかなフィールド例:

- **nonce**: 送信元が何回トランザクション送信したかを表す通し番号。連番管理で二重送信や順序管理を行う。
- **senderPublicKey**: 送信者の公開鍵（楕円曲線sec256k1の圧縮形式など）
- **to**: 受信先のアドレス（20バイト程度）。イーサリアムなら`keccak-256(pubkey)`の下位20バイト
- **value**: 金額。
- **signature (r, s, v)**: 送信者の秘密鍵で署名した結果。ビットコインなら`(r,s)`のペア、イーサリアムなら`(r,s,v)`の3要素。
- **data**: コントラクト呼び出し用のデータや、単にメモとして使う場合に備えた任意バイト列。シンプルに省略も可能。

本書のサンプルとして、以下のような構造にしましょう。実際のイーサリアムよりずっと簡略化しています。

```zig
const MAX_DATA_SIZE = 128;  // 適当に制限

const SignedTransaction = struct {
    nonce: u32,
    to: [20]u8,             // 受信アドレス (20バイト)
    amount: u64,
    data: [MAX_DATA_SIZE]u8, // 固定長の簡易データ領域
    data_len: u16,          // dataにどこまで使っているか
    // 署名関連
    pubkey: [33]u8,         // secp256k1圧縮公開鍵(33バイト)
    sig_r: [32]u8,
    sig_s: [32]u8,
    sig_v: u8,              // リカバリIDなど
};
```

- **`pubkey`** は署名検証時に必要な公開鍵。ビットコインやイーサリアムの標準で使われるsecp256k1楕円曲線の圧縮形式（先頭1バイト + X座標32バイト）とします。
- **`to`** は送信先アドレスを20バイトと定義。実際の生成は「`pubkey`をKeccak-256して下位20バイトを取り出す」などのルールを想定（イーサリアムの方式）。
- 署名要素はECDSAの**(r, s) + リカバリID v** を保持します。イーサリアムではチェーンIDを組み込んだ`v=27|28|...`になることもありますが、とりあえず1バイトで十分。

### 1-2. トランザクションID (ハッシュ)

各トランザクションに一意のIDを付与したいなら、**トランザクションの主要フィールドをハッシュ**して`txid`として使います。ビットコインでは`txid`＝SHA-256d(トランザクションのバイナリ)ですが、本書では簡略化して「`nonce,to,amount,data,pubkey`をまとめてSHA-256」などでよいでしょう。このIDはブロック内での参照やトランザクションプール管理に便利です。

```zig
fn calcTxId(tx: *const SignedTransaction) [32]u8 {
    // nonce, to, amount, data, pubkey を順にハッシュして返す
    // (sig_r, sig_s, sig_vは含めない → 署名前の内容がIDに関わる)
}
```

## 2. Zigでのデジタル署名実装: 秘密鍵 → 署名・公開鍵 → 検証

### 2-1. libsecp256k1 などの暗号ライブラリを使う

Zig標準ライブラリには楕円曲線署名(ECDSA)の実装が（2025年時点）含まれていません。そのため、多くの場合は**C言語で実装されたlibsecp256k1**をZigから呼び出すか、Zigコミュニティ製の`secp256k1`ラッパーを利用します。例えば以下のような流れで行います。

1. **libsecp256k1のソースコード**をサブモジュールなどで取得
2. Zig の `build.zig` で `@cImport()` を使ってCコードをビルドし、Zigから呼び出せるようにする
3. `secp256k1_ecdsa_sign` や `secp256k1_ec_pubkey_create` などの関数を呼び出し、署名や公開鍵生成を行う

簡易的な例（擬似コード）:

```zig
// cImportセクション (build.zigやソースの先頭で)
const c = @cImport({
    @cInclude("secp256k1.h");
});

// 署名生成
fn signTransaction(tx_hash: [32]u8, seckey: [32]u8) !Signature {
    // 1. secp256k1_context_create
    const ctx = c.secp256k1_context_create(c.SECP256K1_CONTEXT_SIGN);
    defer c.secp256k1_context_destroy(ctx);

    var sig: c.secp256k1_ecdsa_signature = undefined;

    if (c.secp256k1_ecdsa_sign(ctx, &sig, tx_hash.ptr, seckey.ptr, null, null) != 1) {
        return error.SignFailed;
    }

    // 2. r, s 値取得
    //   例: c.secp256k1_ecdsa_signature_serialize_compact(ctx, &output[0], &sig)
    //   で 64バイトにまとめる etc.
    ...
}

// 公開鍵生成
fn createPubkey(seckey: [32]u8) ![33]u8 {
    const ctx = c.secp256k1_context_create(c.SECP256K1_CONTEXT_SIGN | c.SECP256K1_CONTEXT_VERIFY);
    defer c.secp256k1_context_destroy(ctx);

    var pubkey: c.secp256k1_pubkey = undefined;
    if (c.secp256k1_ec_pubkey_create(ctx, &pubkey, seckey.ptr) != 1) {
        return error.InvalidSeckey;
    }
    // 圧縮形式にシリアライズ
    var output: [33]u8 = undefined;
    var output_len: usize = 33;
    const flags = c.SECP256K1_EC_COMPRESSED;
    c.secp256k1_ec_pubkey_serialize(ctx, &output[0], &output_len, &pubkey, flags);

    return output; // 33バイトに圧縮された公開鍵
}
```

これらのC関数をZigでラップしてあげれば、Zig内で「秘密鍵→署名を生成」「公開鍵の算出」「署名検証（`secp256k1_ecdsa_verify`）」といった処理が呼べるようになります。本当に一から実装すると楕円曲線計算が大変ですが、libsecp256k1を使うことで**実運用レベルの高速かつ安全なECDSA**を利用できます。

> **注意:** 秘密鍵の取り扱いは慎重に！ ファイル保存や画面表示など漏洩リスクを常に考慮してください。

### 2-2. 署名付きトランザクションの検証

マイニングノード（フルノード）は、新しい取引(SignedTransaction)を受け取るたびに**以下をチェック**します。

1. `secp256k1_ecdsa_verify(...)` で**署名が正しい**か検証
2. 復元した公開鍵からアドレス（`keccak256(pubkey)[12..32]`など）を計算し、それがトランザクションの`to`や`sender`相当と矛盾していないか確認
3. nonceや残高を確認（簡略化可）
4. 問題なければ mempool に追加

これにより、**不正なトランザクション（秘密鍵を持たない人が送信者を詐称した取引）が拒否**されます。一方、正当な取引はmempool入り→ブロックマイニングされる流れです。

## 3. JSON-RPCによる外部API設計

### 3-1. なぜRPCが必要か

現状の実装では、トランザクションを**プログラム内で直接`append`している**状態です。これでは外部アプリやウォレットが取引を投稿できません。
一般にイーサリアムやビットコインが提供している`eth_sendRawTransaction`や`sendrawtransaction`のような**JSON-RPCエンドポイント**を設けることで、外部クライアントがRPCリクエストを送る形にします。

### 3-2. 簡易JSON-RPCサーバの設計

ZigでHTTPサーバを立ち上げ、`POST /` に対してJSONを受け取る簡易実装か、あるいは生TCP上で独自プロトコルのRPCでも構いません。分かりやすいのは**HTTP + JSON**の組み合わせでしょう。例えば:

1. ノードが`localhost:8545`でHTTP待ち受け
2. クライアントは `POST /` に、`{"jsonrpc":"2.0","method":"sendTransaction","params":[...],"id":1}` のようなJSONを送る
3. ノードが署名付きトランザクションをパースし、検証し、mempoolに追加し、`{"jsonrpc":"2.0","result":"0x1234...txHash","id":1}` を返す

#### 実装例 (擬似コード)

```zig
// 1. HTTPサーバを起動
fn startHttpRpcServer(port: u16) !void {
    // Zigの std.http.Server を使うか、自前でTCP→HTTPパースしてもOK
    var server = try std.http.Server.init(...);
    ...
    server.listen(port, handleRpcRequest);
}

// 2. リクエストごとに呼ばれるハンドラ
fn handleRpcRequest(ctx: *std.http.ServerCtx) !void {
    // ctx.request.body をJSONデコードし、"method"を確認
    if (method == "sendTransaction") {
        // paramsから署名付きトランザクションフィールドを取得
        const tx = parseSignedTxFromJson(params);
        try verifySignature(tx);
        ...
        try mempool.append(tx);
        return jsonResponse(ctx, .{"result": "TxAccepted"});
    } else {
        return jsonError(ctx, "Method not found");
    }
}
```

ここではZigの標準HTTPサーバ/クライアントライブラリ（`std.http.server`）を想定していますが、まだAPIが完全安定ではないかもしれません。最小限で済ませるなら**自前でTCPをlisten**し、HTTPリクエストを手動パース（`GET / HTTP/1.1\r\nHost: ...`）してJSONデコードする方法でも構いません。

### 3-3. イーサリアム風のメソッド例

- `eth_sendRawTransaction(hexString)`: すでに署名済みのトランザクションをRLPやバイナリ形式で16進エンコードし、送る。ノードは署名検証し、受理したらトランザクションハッシュを返す。
- `eth_getTransactionReceipt(txHash)`: そのトランザクションがブロックに含まれたかどうか、実行結果は成功か失敗かなどを返す（本書では省略してOK）。
- `eth_call`、`eth_estimateGas` 等も本格的にはあるが、今回は基礎的トランザクション送信だけで十分。

これで「**ウォレットがローカルのZigノードにJSON-RPCで送信** → **Zigノードが取引を検証・mempoolに入れる** → **PoWマイニング**」という流れを構築できます。たとえばShellや別プログラムから下記のように送信できます（curl使用）:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"sendTransaction",
    "params":[{
      "nonce": 1,
      "to": "0xabcd1234...",  /* 20バイトアドレスのhex */
      "amount": 100,
      "pubkey": "0x02...",
      "sig_r": "...",
      "sig_s": "...",
      "sig_v": 1
    }],
    "id":1
  }' http://localhost:8545
```

ノードが`TxAccepted`や`txHash`を返せば成功、という形です。

## 4. トランザクション → ブロック採用の流れを統合する

以上を踏まえ、本書サンプルチェーンでの「取引投稿→署名検証→マイニング→ブロック格納→P2P伝搬」の全体像は以下のようになります。

1. **ユーザ(ウォレット)**: 署名付きトランザクションを生成（秘密鍵でECDSA署名）。JSON-RPCでノードへ送信。
2. **ノード**: 受信したTxを検証（署名OKか、nonceの重複がないかなど）→ mempoolに追加。
3. **マイナー（同じノードでも可）**: 定期的にmempoolから複数Txをピックアップ→ 新規ブロックを作成→ PoWマイニング（`nonce`探し）→ 解が見つかったらブロック完成。
4. **ノード**: 完成したブロックをネットワークにブロードキャスト（P2P）。受け取った他ノードもブロックに含まれるTxをmempoolから削除してチェインに追加。
5. **ユーザ(ウォレット)**: 自分のTxがブロックに含まれると**送金成功**。ブロックチェーンエクスプローラ等で確認可能。

このアーキテクチャはビットコインやイーサリアムの基本と同じ構造です。もちろんイーサリアムはさらに**ガス代**やEVMなど多様な要素を加えていますが、本質的なフローは**秘密鍵で署名→ノード受理→ブロック生成→全員に共有**という形になります。

## 5. NFTやガス代無料運用への展開

### 5-1. NFTを発行（ミント）＆転送するには？

NFT(Non-Fungible Token)は「トークンIDごとに所有者を管理する仕組み」です。イーサリアム上ではERC-721やERC-1155などの仕様がありますが、原理的には以下を満たせばNFT相当を作れます。

- **トークンID** → それを所有するアドレス → 移転（transfer）トランザクション
- **発行（mint）** → トークンID新規作成＆所有者を設定
- **送信者が所有権を持っている**か署名＆ブロックチェーンルールで確認
- **ブロックに記録**: 以後は「そのトークンIDは新しいアドレスが持っている」と合意できる

したがって、NFT化したければ**ブロックチェインにトークンID管理ロジック**を追加し、転送Txを承認するときに「送信者が本当にそのTokenIDを所持しているか」チェックすればOKです。実際にERC-721標準を模した**NFTコントラクト**をZigのチェーンに組み込むか、あるいはチェーン自体がトークン管理機能をデフォルト搭載するかの違いがあります。いずれにしても、**コントラクトorルールをブロックチェーン上に定義**し、トランザクション処理時に「送信者が本当にNFTを持っているか？」「すでに存在しないトークンではないか？」等を検証すればよいのです。

### 5-2. ガス代をゼロにして無料運用するには？

イーサリアムやビットコインではトランザクション送信時に**手数料(ガス代)** が必要で、マイナーはその手数料インセンティブでマイニングを行います。一方で「無料チェーン」なら、**トランザクション手数料を一切徴収しない**設計にできます。
- メリット: ユーザが手数料を払わず気軽にNFTやトークン送信が可能
- デメリット: スパム的な大量Txを制限できないため、**ノードが攻撃を受けやすい**

もし無料チェーンを作るなら、**トランザクション数に上限**（1ブロック何件まで）を設けるとか、**ユーザのアカウントごとに1日n回まで無料**など、何らかのスパム対策が必要になるでしょう。そうしないと悪意のあるユーザが1秒間に何千ものTxを投稿してノードを圧迫し、**DOS攻撃**が容易になります。
ただし学習・テスト用ブロックチェーンなら、シンプルに「無料でTxを受け付ける」と割り切ってもいいかもしれません。**本番運用の際はスパム問題に注意**してください。

---

# まとめ

本章では、**イーサリアム風のトランザクションモデル**をベースに、

1. **署名付きトランザクションの構造**
2. **ECDSA署名のZig実装(またはlibsecp256k1利用)**
3. **JSON-RPC APIでトランザクション投稿**
4. **ノード側で署名検証→mempool→ブロック追加**
5. **NFTやガス代無料チェーンへの応用**

などを整理しました。これにより、以下のような「本格的なブロックチェーン」にかなり近づきます。

- **「ウォレットアプリ」**（秘密鍵管理 + 署名生成） → **「Zigノード」**（PoW・P2P・ブロック生成） → **「他ノードへ共有」**
- 実際に自分のアドレスを用いて送金やNFT転送ができる。署名しないと無効になる。
- 手数料を設定すれば「トランザクションが採用される優先度の制御」なども実装可能。

この段階で、**「自作チェーンをテストネット的に運用して簡単なdAppを動かす」**といったことも見えてきます。さらに先へ進むなら、

- **EVM（Ethereum Virtual Machine）互換**
- スマートコントラクト実行
- Gasと手数料計算
- RPC拡張 (状態参照`eth_call`、ブロックやトランザクション問い合わせAPI)

などを実装する流れになります。
本章の内容を踏まえて、ぜひ**独自のトランザクション仕様を考えたり、NFTやファンジブルトークンの管理ロジック**を追加したりしてみてください。Zigのスピード感と低レベル制御力を活かし、新しいブロックチェーンを自由にデザインできるのが醍醐味です。

### 参考リンク

- [**libsecp256k1** GitHubリポジトリ](https://github.com/bitcoin-core/secp256k1)
- [**Zig + secp256k1** の導入例 (コミュニティのパッケージなど)](https://github.com/ZcashFoundation/zig-secp256k1)
- [**JSON-RPC** 公式仕様 (jsonrpc.org)](https://www.jsonrpc.org/specification)
- [**eth_sendRawTransaction** (Ethereum JSON-RPC)](https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction)
- [**ERC-721 (NFT標準) 日本語訳**](https://ethereum-japan.net/erc721/)
- [**フルノード vs ライトクライアント (SPV)**](https://bitcoin.org/en/full-node#pruning-nodes)

---

## 章の配置について

- **Chapter 1**: Zigで始めるブロックチェイン構築（ブロック構造、PoW、トランザクション配列、単一ノードでハッシュ計算を理解）
- **Chapter 2**: Zigを用いたP2Pブロックチェインの実装（複数ノードネットワーク、ブロック同期、ノード連携）
- **Chapter 3**（本章）: **デジタル署名・トランザクションAPI**
  1. 署名つきTxの構造
  2. ZigでECDSAを扱う（libsecp256k1など）
  3. JSON-RPCでのトランザクション送信
  4. 検証→mempool→ブロック生成→共有
  5. NFT・ガス代無料運用などの応用

その後の章で、より高度な「EVM互換」「スマートコントラクト実行」や「zk証明」「レイヤー2」などに進む形になるでしょう。今回の章内容を挿入する場所としては、**「P2Pネットワークが動く→次にトランザクションを本格的に扱う」**のタイミングが自然なので、**Chapter 3**（あるいは4） くらいが妥当です。

これで**デジタル署名やAPI連携**を取り入れた、実用的なブロックチェーンに一歩近づくことができます。次のステップとしては**契約（コントラクト）処理**や**最適化・セキュリティ強化**など、実際のイーサリアム的要素へ拡張するとさらに学びが深まります。ぜひ本章の実装を手がかりに、Zigブロックチェーンの完成度を高めてみてください。
