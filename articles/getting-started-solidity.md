---
title: "Solidityのコンストラクターの処理を追ってみる"
emoji: "📌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Solidity,EVM]
published: false
---

## このページは

Solidityにおけるコンストラクタの動作と、それがEthereum Virtual Machine (EVM) でどのように表現されるかを探求します。SolidityのコードがどのようにEVMバイトコードにコンパイルされ、EVMアセンブリとオペコードの形でどのように実行されるかを詳しく見ていきます。

## 環境の構築

この記事では、Solidityコンパイラ（`solc`）を使用してコントラクトをコンパイルし、コンパイル結果を分析します。`solc`はSolidityの公式コンパイラで、コマンドラインツールとして提供されています。

### solcのインストール方法

[公式ドキュメント](https://docs.soliditylang.org/en/v0.8.24/installing-solidity.html#macos-packages)を参照してインストールします。

Macの場合は[Homebrew](https://brew.sh/ja/)を使ってインストールできます。

```shell
brew update
brew upgrade
brew tap ethereum/ethereum
brew install solidity
```

## Solidityのコードを作成

コードの例として、次の単純なSolidityコントラクトを考えます。このコントラクトは、単一の状態変数`value1`を持ち、コンストラクタでその値を`17`に設定します。

```Example.sol
// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

contract Example{

    uint256 value1;

    constructor(){
        value1 = 17;
    }

}
```

## コンパイル

Solidityのコードをコンパイルし、EVMのアセンブリコードとオペコードを確認するために、次のコマンドを実行しました。
今回はバイナリ、オペコード、EVMアセンブリを出力したいので--bin --opcodes --asmオプションを付けます。

```shell
solc --bin --opcodes --asm Example.sol
```

実行してみると次の結果が出てきます。今回オプションを3つつけているのでEVMアセンブリ、オペコード、バイナリがセクションを分けて出力されています。

```shell

======= Example.sol:Example =======
EVM assembly:
    /* "Example.sol":64:152  contract Example{... */
  mstore(0x40, 0x80)
    /* "Example.sol":108:149  constructor(){... */
  callvalue
  dup1
  iszero
  tag_1
  jumpi
  0x00
  dup1
  revert
tag_1:
  pop
    /* "Example.sol":140:142  17 */
  0x11
    /* "Example.sol":131:137  value1 */
  0x00
    /* "Example.sol":131:142  value1 = 17 */
  dup2
  swap1
  sstore
  pop
    /* "Example.sol":64:152  contract Example{... */
  dataSize(sub_0)
  dup1
  dataOffset(sub_0)
  0x00
  codecopy
  0x00
  return
stop

sub_0: assembly {
        /* "Example.sol":64:152  contract Example{... */
      mstore(0x40, 0x80)
      0x00
      dup1
      revert

    auxdata: 0xa26469706673582212205a5d70e397159f6e438b1d3ae9ac30c9b5ea0ecded360c718e24280a9e33222d64736f6c63430008180033
}

Opcodes:
PUSH1 0x80 PUSH1 0x40 MSTORE CALLVALUE DUP1 ISZERO PUSH1 0xE JUMPI PUSH0 DUP1 REVERT JUMPDEST POP PUSH1 0x11 PUSH0 DUP2 SWAP1 SSTORE POP PUSH1 0x3E DUP1 PUSH1 0x21 PUSH0 CODECOPY PUSH0 RETURN INVALID PUSH1 0x80 PUSH1 0x40 MSTORE PUSH0 DUP1 REVERT INVALID LOG2 PUSH5 0x6970667358 0x22 SLT KECCAK256 GAS TSTORE PUSH17 0xE397159F6E438B1D3AE9AC30C9B5EA0ECD 0xED CALLDATASIZE 0xC PUSH18 0x8E24280A9E33222D64736F6C634300081800 CALLER
Binary:
6080604052348015600e575f80fd5b5060115f81905550603e8060215f395ff3fe60806040525f80fdfea26469706673582212205a5d70e397159f6e438b1d3ae9ac30c9b5ea0ecded360c718e24280a9e33222d64736f6c63430008180033

```

### EVMアセンブリを見ていく

次の部分がEVMのアセンブリコードです。

```shell
EVM assembly:
    /* "Example.sol":64:152  contract Example{... */
  mstore(0x40, 0x80)
    /* "Example.sol":108:149  constructor(){... */
  callvalue
  dup1
  iszero
  tag_1
  jumpi
  0x00
  dup1
  revert
tag_1:
  pop
    /* "Example.sol":140:142  17 */
  0x11
    /* "Example.sol":131:137  value1 */
  0x00
    /* "Example.sol":131:142  value1 = 17 */
  dup2
  swap1
  sstore
  pop
    /* "Example.sol":64:152  contract Example{... */
  dataSize(sub_0)
  dup1
  dataOffset(sub_0)
  0x00
  codecopy
  0x00
  return
stop

sub_0: assembly {
        /* "Example.sol":64:152  contract Example{... */
      mstore(0x40, 0x80)
      0x00
      dup1
      revert

    auxdata: 0xa26469706673582212205a5d70e397159f6e438b1d3ae9ac30c9b5ea0ecded360c718e24280a9e33222d64736f6c63430008180033
}
```

上記のコマンドによって生成されたEVMアセンブリの主な処理の流れは以下の通りです。
ただコンストラクタを初期化しているだけです。

1. **フリーメモリポインタの初期化**: `mstore(0x40, 0x80)`により、EVMのフリーメモリポインタを初期化します。
2. **Ether送信のチェック**: `callvalue`にてトランザクションで送信されたEtherの量をチェックし、それが`0`でない場合、`revert`でトランザクションを中止します。
3. **状態変数の初期化**: `value1`に`17`を割り当てます。これは`0x11`（17）をステート変数`value1`の位置（`0x00`）に保存することで実現されます。

具体的に見ていきます。
このの部分がEVMのフリーメモリポインタを初期化しています。

```shell
    /* "Example.sol":64:152  contract Example{... */
  mstore(0x40, 0x80)
```

#### EVMのフリーメモリポインタとは

EVMのフリーメモリポインタは、スマートコントラクトがメモリを使用する際の「開始点」を示します。EVMのメモリは、スマートコントラクトが実行されるたびにリセットされる一時的なストレージエリアです。40の位置に保存されたフリーメモリポインタは、未使用のメモリの最初の位置を指し、スマートコントラクトがメモリを動的に割り当てる際に利用されます。mstore(40, 80)によって、未使用のメモリはアドレス80から開始することが示されます。これにより、スマートコントラクトは80以降のメモリ位置を自由に使用できるようになります。


### オペコードの解説

オペコードは、EVMアセンブリのより低レベルな表現です。この例では、`PUSH1 0x80`、`MSTORE`、`CALLVALUE`、`ISZERO`、`JUMPI`など、EVMが理解できる基本的な命令セットを見ることができます。これらの命令は、EVM上でコントラクトがどのように実行されるかを直接的に示しています。

- **`PUSH1 0x80`**: 1バイトの値`0x80`をスタックにプッシュします。この命令は、次に来る`MSTORE`命令で使用される値をスタックに積みます。
- **`MSTORE`**: スタックの上から2番目の値（この場合は`0x40`）をアドレスとして、スタックのトップにある値（`0x80`）をそのアドレスに保存します。
- **`CALLVALUE`**: トランザクションで送信されたEtherの量をスタックにプッシュします。
- **`DUP1`**: スタックのトップにある値を複製し、複製した値をスタックにプッシュします。
- **`ISZERO`**: スタックのトップにある値が`0`かどうかをチェックし、結果をスタックにプッシュします。`0`の場合は`1`を、非`0`の場合は`0`をプッシュします。
- **`JUMPI`**: スタックの上から2番目の値（ジャンプ先のアドレス）に、スタックのトップにある値（条件）が非`0`の場合にジャンプします。

### バイナリの解説

バイナリ出力は、コンパイルされたコントラクトの実際のバイトコードです。これはEthereumブロックチェインにデプロイされ、EVMによって直接実行される形式です。
例えば、PUSH1 0×80はバイトコード0×6080に対応します。PUSH1は0×60で表され、次にプッシュする値0×80が続きます。同様に、MSTOREはオペコード0×52で表されます。これらのオペコードは、EVMが実行する具体的な命令セットを形成します。

全体として、バイナリセクションは、EVMアセンブリとオペコードの具体的な実行形式を提供します。これにより、スマートコントラクトがブロックチェイン上でどのように実行されるか、開発者が理解しやすくなります。

## 結論

この記事では、SolidityコントラクトのコンストラクタがEVM上でどのように表現され、実行されるかを見てきました。EVMアセンブリとオペコードを通じて、Solidityコードが低レベルでどのように動作するかの理解を深めることができました。
