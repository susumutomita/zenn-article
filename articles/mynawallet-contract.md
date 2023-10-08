---
title: "MynaWalletのコードを読み込んでいく"
emoji: "⛳"
type: "tech"
topics: [forge,solidity]
published: false
---

## 2023

### 10/8

#### RsaVerify.solについて

***pkcs1Sha256Verifyのコードは何をしていたのか***
RAS署名の検証をしているコードだった。
フローは以下。

```mermaid
graph TB
    Start[Start] --> A[Check if decipherlen >= 62]
    A -->|Yes| B[Join _s, _e, _m into input]
    A -->|No| End1((Return Error))
    B --> C[Initialize 'decipher' array]
    C --> D[Perform staticcall for decryption]
    D --> E[Log decrypted data]
    E -->|PKCS#1 v1.5のフォーマットチェック|F[プレフィックスが0x00と0x01で始まっているか]
    F -->|Yes| G[パディングのチェックCheck all bytes from 3 to decipherlen-52 are 0xFF]
    F -->|No| End2((Return 1))
    G -->|Yes| H[区切りのチェックCheck if byte at decipherlen - 52 is 0]
    G -->|No| End3((Return 2))
    H -->|Yes| I[プレフィックスがSHA-256であるかチェックVerify sha256Prefix]
    H -->|No| End4((Return 3))
    I -->|Yes| J[実際のハッシュ値の確認Verify _sha256]
    I -->|No| End5((Return 4))
    J -->|Yes| End6((Return 0))
    J -->|No| End7((Return 5))
```

[SHA-256ハッシュのプレフィックスについてはRFC3447に記載があった](https://www.rfc-editor.org/rfc/rfc3447#page-43)

#### 復号化の処理について

```RsaVerify.sol
        assembly {
            pop(
                staticcall(
                    gas(),
                    0x05,
                    add(input, 0x20),
                    inputlen,
                    add(decipher, 0x20),
                    decipherlen
                )
            )
        }
```

この部分で復号化をしている。ここで0×05については、Ethereumのプリコンパイルドコントラクトで復号処理をするものである。

#### Solidity のコンソールログの出力方法について

[forge-std/console.sol](https://github.com/foundry-rs/forge-std/blob/master/src/console.sol) をインポートして、console.logBytesとかでできる。

例えば以下のようにするとログを出せる。

```RsaVerify.sol
import "forge-std/console.sol";
        console.logString("hoge-------------------------");
        console.logBytes(decipher);
        console.logUint(uint8(decipher[1]));
        console.logString("fuga-------------------------");
```

## 足したい Issue

- RsaVerifyのテストケース追加
- RsaVerifyのテストコードのリファクタリングをする。ホワイトボックス的なテストケース名でなく、仕様を表すテストケース名にする
- RsaVerifyのリファクタリング -> バリデーションメソッドに切り出し、returnで数字ではなく例外発生これはガスの増加の影響も計測しながら進めてみる
