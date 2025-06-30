---
title: "Solidityのコンストラクターの処理を追ってみる"
emoji: "📌"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [Solidity,EVM]
published: true
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
なお[Remix](https://remix.ethereum.org/)でもコンパイルやオペコードを確認できます。

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
この部分がEVMのフリーメモリポインタを初期化しています。

```shell
    /* "Example.sol":64:152  contract Example{... */
  mstore(0x40, 0x80)
```

次を見ていきます。

```shell
  callvalue
  dup1
  iszero
  tag_1
  jumpi
  0x00
  dup1
  revert
```

- `callvalue` - この命令は、コントラクト実行時に送信されたEtherの量（wei単位）を取得します。この値はスタックにプッシュされます。

- `dup1` - スタックのトップにある値（この場合、前のステップで取得したEtherの量）を複製し、複製した値をスタックのトップにプッシュします。
- `iszero` - スタックのトップにある値が0であるかどうかをチェックします。0であれば1を、0以外であれば0をスタックにプッシュします。これは、Etherが送信されていないかどうかをチェックするために使われます。
- `tag_1` - これは後続のjumpi命令で使用されるジャンプ先のラベル（またはアドレス）です。
- `jumpi` - iszeroの結果に基づいて条件分岐します。Etherが送信されていない場合（iszeroの結果が1）、tag_1に指定されたアドレスへジャンプします。このジャンプによって、revert命令をスキップし、処理を続行します。
- `0×00 dup1 revert` - このコードは、Etherが送信された場合に実行されます。0×00はリバートメッセージの開始位置を示し、dup1はその長さを示します（この場合、長さは0です）。revert命令は、スマートコントラクトの実行を中止し、状態の変更をロールバックします。これにより、Etherが送信された場合にコントラクトの実行が安全に中止されます。

次のコードセクションを見ていきます。

```shell
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
```

- `pop` - 前段の条件分岐（`jumpi`）から続いて、スタックのトップにある（Ether送信量のチェック結果などの）不要な値をポップ（削除）します。

- `0x11`（`17`）をスタックにプッシュ - コントラクタで`value1`に割り当てられる値`17`をスタックにプッシュします。

- `0x00`をスタックにプッシュ - `value1`が格納されるステートストレージの位置（ここでは0番地を示します）をスタックにプッシュします。

- `dup2` - スタック上の2番目の値（ここでは`17`）を複製し、スタックのトップにプッシュします。これにより、`17`と`0`（位置）の両方が、`sstore`命令によるストレージへの書き込みに使えます。

- `swap1` - スタックのトップ2つの値の位置を入れ替えます。これにより、`sstore`命令に順序（位置、値）で値を提供します。

- `sstore` - スタックの上から2番目の値（位置`0`）にスタックのトップの値（`17`）をストレージに保存します。これにより、`value1`の初期値が`17`に設定されます。

- `pop` - `sstore`によって使用された値（`17`）をスタックからポップします。

- `dataSize(sub_0)` - `sub_0`セクション（コントラクトのランタイムコード）のサイズを取得します。

- `dup1` - デプロイされるランタイムコードのサイズを複製します。

- `dataOffset(sub_0)` - `sub_0`セクションの開始位置（オフセット）を取得します。

- `0x00`をスタックにプッシュ - メモリの書き込み開始位置を指定します。

- `codecopy` - コントラクトのランタイムコード（`sub_0`セクション）をメモリにコピーします。この命令は、`dataOffset(sub_0)`で指定されたコードの開始位置から、`dataSize(sub_0)`で指定された長さのコードを、メモリの`0x00`から始まる位置にコピーします。

- `return` - メモリから指定された範囲のデータを使って、EVM実行を終了し、結果を外部に返します。この場合、コピーされたランタイムコードがブロックチェインにデプロイされます。

この`sub_0: assembly`セクションは、Solidityコントラクトのランタイム部分を定義しています。具体的には、この部分はコントラクトがデプロイされた後、ブロックチェイン上で実行されるコードを表しています。

```shell
sub_0: assembly {
        /* "Example.sol":64:152  contract Example{... */
      mstore(0x40, 0x80)
      0x00
      dup1
      revert

    auxdata: 0xa26469706673582212205a5d70e397159f6e438b1d3ae9ac30c9b5ea0ecded360c718e24280a9e33222d64736f6c63430008180033
}
```

- `mstore(0x40, 0x80)` - これは、フリーメモリポインタを初期化する標準的な手順です。メモリの位置`0x40`に値`0x80`を設定することにより、動的にメモリを割り当てるための「開始点」としています。これは、ランタイムコード実行時のメモリ管理に関連します。

- `0x00` - この命令はスタックに値`0`をプッシュします。これは通常、後続の命令で使用される値をスタックに置くためです。

- `dup1` - この命令は、スタックのトップにある値（この場合は`0`）を複製し、その複製をスタックにプッシュします。これにより、スタックのトップには`0`が2つ存在する状態になります。

- `revert` - この命令は、スマートコントラクトの実行を中止し、すべての状態変更をロールバックします。`revert`は2つの引数を取ります：エラーメッセージの開始位置とその長さです。この場合、両方の引数が`0`であるため、エラーメッセージは空となります。このランタイムコードは即座にリバート（実行のキャンセル）します。

### `auxdata`について

- `auxdata` - この部分は、コントラクトのメタデータを含む補助データです。ここには、コントラクトのソースコードがどのバージョンのSolidityでコンパイルされたか、コンパイル時に使用された設定、コントラクトのソースコードのハッシュ値などが含まれます。この情報は、デバッグやコントラクトの検証に役立ちます。

#### EVMのフリーメモリポインタとは

EVMのフリーメモリポインタは、スマートコントラクトがメモリを使用する際の「開始点」を示します。EVMのメモリは、スマートコントラクトが実行されるたびにリセットされる一時的なストレージエリアです。40の位置に保存されたフリーメモリポインタは、未使用のメモリの最初の位置を指し、スマートコントラクトがメモリを動的に割り当てる際に利用されます。mstore(40, 80)によって、未使用のメモリはアドレス80から開始することが示されます。これにより、スマートコントラクトは80以降のメモリ位置を自由に使用できるようになります。

### オペコードについて

[オペコード](https://ethervm.io/)は、EVMアセンブリのより低レベルな表現です。上と同じ処理をしています。

- `PUSH0` - `0`の値をスタックにプッシュします。この命令は、通常、リバート操作のためにメッセージの長さを指定する場合や、特定の値を初期化する際に使用されます。

- `REVERT` - トランザクションを中止し、全ての状態の変更をロールバックします。`REVERT`は2つの引数を取ります：エラーメッセージの開始位置とその長さです。これは、条件に基づいてトランザクションが失敗するべき場合に使用されます。

- `JUMPDEST` - ジャンプの目的地としてマークされるポイントです。`JUMPI`や`JUMP`命令によるジャンプ先として機能します。これにより、コード内の特定の位置に制御を移動できます。

- `POP` - スタックのトップにある値を削除します。この命令は、使用済みの値をスタックからクリアするために使用されます。

- `CODECOPY` - コントラクトのコードをメモリにコピーします。

- `RETURN` - 実行を停止し、指定されたメモリ範囲からデータを呼び出し元に返します。

- `INVALID` - 無効な命令です。実行されると、例外を発生させ、実行を中止します。意図的に使用されることはほとんどありませんが、コード内の不正アクセスを防ぐために役立つ場合があります。

### バイナリの解説

バイナリ出力は、コンパイルされたコントラクトの実際のバイトコードです。これはEthereumブロックチェインにデプロイされ、EVMによって直接実行される形式です。
例えば、PUSH1 0×80はバイトコード0×6080に対応します。PUSH1は0×60で表され、次にプッシュする値0×80が続きます。同様に、MSTOREはオペコード0×52で表されます。これらのオペコードは、EVMが実行する具体的な命令セットを形成します。

全体として、バイナリセクションは、EVMアセンブリとオペコードの具体的な実行形式を提供します。これにより、スマートコントラクトがブロックチェイン上でどのように実行されるか、開発者が理解しやすくなります。
なお、バイナリからオペコードへは[Bytecode to Opcode Disassembler](https://etherscan.io/opcode-tool)を使うと変換できます。

## 結論

この記事では、SolidityコントラクトのコンストラクタがEVM上でどのように表現され、実行されるかを見てきました。EVMアセンブリとオペコードを通じて、Solidityコードが低レベルでどのように動作するかの理解を深めることができました。
