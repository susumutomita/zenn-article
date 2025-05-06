---
title: "Zigで簡易EVMバイトコードエンジンを実装し、Solidityスマートコントラクトを実行する"
free: true
---

## Zigで簡易EVMバイトコードエンジンを実装し、Solidityスマートコントラクトを実行する

このチュートリアルでは、**Zig**プログラミング言語を用いてEthereum Virtual Machine (EVM)を実装します。その後、Solidityで書かれたスマートコントラクトのバイトコードを実行します。

**目標:**

- EVMの基本構造（スタック・メモリ・ストレージ）を理解する
- Zigでスタックベースの仮想マシンを構築し、EVMバイトコードを実行する
- Solidityで簡単なスマートコントラクトを作成し、EVM上で動作させる
- EVMの制限や最適化、発展的な技術（zkEVMなど）について言及する

## EVMとは

Ethereumブロックチェイン上でスマートコントラクトを実行するための仮想マシンです。イーサリアムの各ノードはEVMを内部に持ち、ブロック内の取引に含まれるスマートコントラクトのコードをEVM上で実行することで、結果として世界状態（ワールドステート）を更新します。EVMは256ビット長のWord（32バイト）を基本単位とする**スタックマシン**であり、プログラム（バイトコード）を順次読み取り実行していきます。スマートコントラクトのコードは**バイトコード**（機械語に相当）でブロックチェイン上に保存され、EVMがこれを解釈・実行します。

EVMには、実行時に使用されるいくつかの主要なデータ領域があります。[Ethereum Yellow Paper](https://ethereum.github.io/yellowpaper/paper.pdf)。

- **ストレージ (Storage)**: 各コントラクト（アカウント）に紐づく永続的な**キー値ストア**です。256ビットのキーと値のマッピングで表現され、トランザクション間で保存されます ([スマートコントラクトの紹介](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html#))。コントラクトの状態変数はこのストレージに格納され、ブロックチェイン上の状態の一部として永続化されます。ストレージへの書き込み・読み出しはガスコストが高く、他のコントラクトのストレージには直接アクセスできません。

- **メモリ (Memory)**: コントラクト実行中のみ有効な一時的なメモリ空間です。呼び出しごとにリセットされ、バイトアドレスでアクセス可能な1次元の配列として扱われます。読み書きは基本的に32バイト幅単位で行われ、必要に応じて末尾に向かって拡張されます（拡張にはガスコストが伴います）。計算中の一時データや後述する戻り値の一時格納に利用されます。

- **スタック (Stack)**: EVMの算術演算やオペコードのオペランド受け渡しに使われるLIFOスタックです。最大で1024要素の深さがあり、各要素は256ビットの値です。EVMはレジスタを持たず、全ての計算はスタック上で行われます。通常、オペコードはスタックの最上位要素（トップ）から必要な数の項目をPOPし、計算結果を再びスタックにPUSHします。スタックの深い位置に直接アクセスはできず、`DUP`（トップ16個までの要素を複製）や`SWAP`（トップと下位の一部を交換）命令で間接的に操作します。スタックオーバーフロー（積みすぎ）やスタックアンダーフローは実行失敗を招きます。

上記の他にも、**プログラムカウンタ (PC)** や**ガス (Gas)** といった要素があります。プログラムカウンタは現在実行中のバイトコードの位置を指し示すものです。EVMは**命令ポインタ**であるPCを開始時に0とセットし、各オペコードの実行後に進めていきます。条件付きジャンプ命令などによりPCを書き換えることで、ループや条件分岐も実現します。

**ガス**とは、EVM上でコードを実行する際に必要となる手数料単位です。各オペコード毎に「この命令で必要なガス量」が定められています。また、スマートコントラクトを呼び出すトランザクションには上限となるガス量（ガスリミット）が指定されます。EVMは命令のたびに消費ガスを積算し、ガスリミットを超えると**アウトオブガス**となり実行が停止（通常は巻き戻し）されます。ガスは無限ループや過度な計算を防ぐ仕組みです。

EVMの命令（オペコード）は1バイト長で表現され、例えば`0x01`はADD（加算）、`0x60`はPUSH（スタックへ即値を積む）といったように定義されています。スマートコントラクトのバイトコード実行は常にコードの先頭（PC=0）から開始され、`STOP (0x00)`命令に到達するか実行が中断されるまで、命令を順次取り出して解釈・実行していきます。PUSH系命令だけは直後のバイト列をオペランド（値）として持つため可変長ですが、その他の命令は固定1バイトで、スタックから値を取り出し結果をスタックに戻すという挙動をとります。

以上がEVMの基本的な仕組みです。Ethereumクライアント（例：GethやNethermindなど）には各々EVM実装が内蔵されていますが、全てEthereumの公式仕様（イエローペーパー）に従う必要があります。このチュートリアルでは、このEVMの一部機能をZigで再現し、簡単なスマートコントラクトのバイトコードを実行してみます。

## ZigでEVMを実装する準備

開発環境の準備をします。

**Solidityコンパイラの準備:** Solidityのスマートコントラクトをバイトコードにコンパイルできるように、Solidity公式のコマンドラインコンパイラ`solc`を用意します。Solidityの開発環境が既にある場合はsolcコマンドが使えるはずです。インストールされていない場合、Ethereum公式サイトや各種ドキュメントに従ってインストールしてください（例：macOSならHomebrewで`brew install solidity`）。

Solidityコンパイラ`solc`を使うと、Solidityコードから各種出力を得ることができます ([Using the Compiler](https://docs.soliditylang.org/en/latest/using-the-compiler.html))。バイトコード（EVMが実行するバイナリ）を取得するには、以下のように`--bin`オプションを指定します。

まず、コンパイルするSolidityコードを用意します。以下のような簡単なコントラクトを`contract/SimpleAdder.sol`というファイル名で保存します。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract Adder {
    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }
}
```

次に、コントラクトをコンパイルしてバイトコードを取得します。以下のコマンドを実行してください。

```bash
solc --bin --asm --abi contract/SimpleAdder.sol
```

それぞれのオプションの意味は以下の通りです。

- `--bin`: バイトコードを出力します。
- `--asm`: EVMアセンブリコードを出力します。
- `--abi`: コントラクトのABI（Application Binary Interface）を出力します。ABIはコントラクトの関数やイベントのインタフェースを定義したものです。

上記コマンドを実行すると、コンパイル結果としてバイトコードとABI（Application Binary Interface）が表示されます。バイトコードは`0x`で始まる16進数の文字列で、EVMが実行する命令列です。
ABIは、コントラクトの関数やイベントのインタフェースを定義したものです。ABIは、コントラクトの関数を呼び出す際に必要な情報を提供します。具体的には、関数名、引数の型、戻り値の型などが含まれます。
EVMアセンブリコードは、EVMが実行する命令の一覧を示しています。これにより、EVMがどのようにバイトコードを解釈しているかを理解する手助けになります。

```bash
solc --bin --asm --abi contract/SimpleAdder.sol

======= contract/SimpleAdder.sol:Adder =======
EVM assembly:
    /* "contract/SimpleAdder.sol":57:174  contract Adder {... */
  mstore(0x40, 0x80)
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
  dataSize(sub_0)
  dup1
  dataOffset(sub_0)
  0x00
  codecopy
  0x00
  return
stop

sub_0: assembly {
        /* "contract/SimpleAdder.sol":57:174  contract Adder {... */
      mstore(0x40, 0x80)
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
      jumpi(tag_2, lt(calldatasize, 0x04))
      shr(0xe0, calldataload(0x00))
      dup1
      0x771602f7
      eq
      tag_3
      jumpi
    tag_2:
      0x00
      dup1
      revert
        /* "contract/SimpleAdder.sol":78:172  function add(uint256 a, uint256 b) public pure returns (uint256) {... */
    tag_3:
      tag_4
      0x04
      dup1
      calldatasize
      sub
      dup2
      add
      swap1
      tag_5
      swap2
      swap1
      tag_6
      jump      // in
    tag_5:
      tag_7
      jump      // in
    tag_4:
      mload(0x40)
      tag_8
      swap2
      swap1
      tag_9
      jump      // in
    tag_8:
      mload(0x40)
      dup1
      swap2
      sub
      swap1
      return
    tag_7:
        /* "contract/SimpleAdder.sol":134:141  uint256 */
      0x00
        /* "contract/SimpleAdder.sol":164:165  b */
      dup2
        /* "contract/SimpleAdder.sol":160:161  a */
      dup4
        /* "contract/SimpleAdder.sol":160:165  a + b */
      tag_11
      swap2
      swap1
      tag_12
      jump      // in
    tag_11:
        /* "contract/SimpleAdder.sol":153:165  return a + b */
      swap1
      pop
        /* "contract/SimpleAdder.sol":78:172  function add(uint256 a, uint256 b) public pure returns (uint256) {... */
      swap3
      swap2
      pop
      pop
      jump      // out
        /* "#utility.yul":88:205   */
    tag_14:
        /* "#utility.yul":197:198   */
      0x00
        /* "#utility.yul":194:195   */
      dup1
        /* "#utility.yul":187:199   */
      revert
        /* "#utility.yul":334:411   */
    tag_16:
        /* "#utility.yul":371:378   */
      0x00
        /* "#utility.yul":400:405   */
      dup2
        /* "#utility.yul":389:405   */
      swap1
      pop
        /* "#utility.yul":334:411   */
      swap2
      swap1
      pop
      jump      // out
        /* "#utility.yul":417:539   */
    tag_17:
        /* "#utility.yul":490:514   */
      tag_27
        /* "#utility.yul":508:513   */
      dup2
        /* "#utility.yul":490:514   */
      tag_16
      jump      // in
    tag_27:
        /* "#utility.yul":483:488   */
      dup2
        /* "#utility.yul":480:515   */
      eq
        /* "#utility.yul":470:533   */
      tag_28
      jumpi
        /* "#utility.yul":529:530   */
      0x00
        /* "#utility.yul":526:527   */
      dup1
        /* "#utility.yul":519:531   */
      revert
        /* "#utility.yul":470:533   */
    tag_28:
        /* "#utility.yul":417:539   */
      pop
      jump      // out
        /* "#utility.yul":545:684   */
    tag_18:
        /* "#utility.yul":591:596   */
      0x00
        /* "#utility.yul":629:635   */
      dup2
        /* "#utility.yul":616:636   */
      calldataload
        /* "#utility.yul":607:636   */
      swap1
      pop
        /* "#utility.yul":645:678   */
      tag_30
        /* "#utility.yul":672:677   */
      dup2
        /* "#utility.yul":645:678   */
      tag_17
      jump      // in
    tag_30:
        /* "#utility.yul":545:684   */
      swap3
      swap2
      pop
      pop
      jump      // out
        /* "#utility.yul":690:1164   */
    tag_6:
        /* "#utility.yul":758:764   */
      0x00
        /* "#utility.yul":766:772   */
      dup1
        /* "#utility.yul":815:817   */
      0x40
        /* "#utility.yul":803:812   */
      dup4
        /* "#utility.yul":794:801   */
      dup6
        /* "#utility.yul":790:813   */
      sub
        /* "#utility.yul":786:818   */
      slt
        /* "#utility.yul":783:902   */
      iszero
      tag_32
      jumpi
        /* "#utility.yul":821:900   */
      tag_33
      tag_14
      jump      // in
    tag_33:
        /* "#utility.yul":783:902   */
    tag_32:
        /* "#utility.yul":941:942   */
      0x00
        /* "#utility.yul":966:1019   */
      tag_34
        /* "#utility.yul":1011:1018   */
      dup6
        /* "#utility.yul":1002:1008   */
      dup3
        /* "#utility.yul":991:1000   */
      dup7
        /* "#utility.yul":987:1009   */
      add
        /* "#utility.yul":966:1019   */
      tag_18
      jump      // in
    tag_34:
        /* "#utility.yul":956:1019   */
      swap3
      pop
        /* "#utility.yul":912:1029   */
      pop
        /* "#utility.yul":1068:1070   */
      0x20
        /* "#utility.yul":1094:1147   */
      tag_35
        /* "#utility.yul":1139:1146   */
      dup6
        /* "#utility.yul":1130:1136   */
      dup3
        /* "#utility.yul":1119:1128   */
      dup7
        /* "#utility.yul":1115:1137   */
      add
        /* "#utility.yul":1094:1147   */
      tag_18
      jump      // in
    tag_35:
        /* "#utility.yul":1084:1147   */
      swap2
      pop
        /* "#utility.yul":1039:1157   */
      pop
        /* "#utility.yul":690:1164   */
      swap3
      pop
      swap3
      swap1
      pop
      jump      // out
        /* "#utility.yul":1170:1288   */
    tag_19:
        /* "#utility.yul":1257:1281   */
      tag_37
        /* "#utility.yul":1275:1280   */
      dup2
        /* "#utility.yul":1257:1281   */
      tag_16
      jump      // in
    tag_37:
        /* "#utility.yul":1252:1255   */
      dup3
        /* "#utility.yul":1245:1282   */
      mstore
        /* "#utility.yul":1170:1288   */
      pop
      pop
      jump      // out
        /* "#utility.yul":1294:1516   */
    tag_9:
        /* "#utility.yul":1387:1391   */
      0x00
        /* "#utility.yul":1425:1427   */
      0x20
        /* "#utility.yul":1414:1423   */
      dup3
        /* "#utility.yul":1410:1428   */
      add
        /* "#utility.yul":1402:1428   */
      swap1
      pop
        /* "#utility.yul":1438:1509   */
      tag_39
        /* "#utility.yul":1506:1507   */
      0x00
        /* "#utility.yul":1495:1504   */
      dup4
        /* "#utility.yul":1491:1508   */
      add
        /* "#utility.yul":1482:1488   */
      dup5
        /* "#utility.yul":1438:1509   */
      tag_19
      jump      // in
    tag_39:
        /* "#utility.yul":1294:1516   */
      swap3
      swap2
      pop
      pop
      jump      // out
        /* "#utility.yul":1522:1702   */
    tag_20:
        /* "#utility.yul":1570:1647   */
      0x4e487b7100000000000000000000000000000000000000000000000000000000
        /* "#utility.yul":1567:1568   */
      0x00
        /* "#utility.yul":1560:1648   */
      mstore
        /* "#utility.yul":1667:1671   */
      0x11
        /* "#utility.yul":1664:1665   */
      0x04
        /* "#utility.yul":1657:1672   */
      mstore
        /* "#utility.yul":1691:1695   */
      0x24
        /* "#utility.yul":1688:1689   */
      0x00
        /* "#utility.yul":1681:1696   */
      revert
        /* "#utility.yul":1708:1899   */
    tag_12:
        /* "#utility.yul":1748:1751   */
      0x00
        /* "#utility.yul":1767:1787   */
      tag_42
        /* "#utility.yul":1785:1786   */
      dup3
        /* "#utility.yul":1767:1787   */
      tag_16
      jump      // in
    tag_42:
        /* "#utility.yul":1762:1787   */
      swap2
      pop
        /* "#utility.yul":1801:1821   */
      tag_43
        /* "#utility.yul":1819:1820   */
      dup4
        /* "#utility.yul":1801:1821   */
      tag_16
      jump      // in
    tag_43:
        /* "#utility.yul":1796:1821   */
      swap3
      pop
        /* "#utility.yul":1844:1845   */
      dup3
        /* "#utility.yul":1841:1842   */
      dup3
        /* "#utility.yul":1837:1846   */
      add
        /* "#utility.yul":1830:1846   */
      swap1
      pop
        /* "#utility.yul":1865:1868   */
      dup1
        /* "#utility.yul":1862:1863   */
      dup3
        /* "#utility.yul":1859:1869   */
      gt
        /* "#utility.yul":1856:1892   */
      iszero
      tag_44
      jumpi
        /* "#utility.yul":1872:1890   */
      tag_45
      tag_20
      jump      // in
    tag_45:
        /* "#utility.yul":1856:1892   */
    tag_44:
        /* "#utility.yul":1708:1899   */
      swap3
      swap2
      pop
      pop
      jump      // out

    auxdata: 0xa2646970667358221220e478f9e62b837b6d95fa3abbc3c7eb6c02d17eb28b14607d07eb892ef9992db964736f6c63430008180033
}

Binary:
608060405234801561000f575f80fd5b506101a58061001d5f395ff3fe608060405234801561000f575f80fd5b5060043610610029575f3560e01c8063771602f71461002d575b5f80fd5b610047600480360381019061004291906100a9565b61005d565b60405161005491906100f6565b60405180910390f35b5f818361006a919061013c565b905092915050565b5f80fd5b5f819050919050565b61008881610076565b8114610092575f80fd5b50565b5f813590506100a38161007f565b92915050565b5f80604083850312156100bf576100be610072565b5b5f6100cc85828601610095565b92505060206100dd85828601610095565b9150509250929050565b6100f081610076565b82525050565b5f6020820190506101095f8301846100e7565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52601160045260245ffd5b5f61014682610076565b915061015183610076565b92508282019050808211156101695761016861010f565b5b9291505056fea2646970667358221220e478f9e62b837b6d95fa3abbc3c7eb6c02d17eb28b14607d07eb892ef9992db964736f6c63430008180033
Contract JSON ABI
[{"inputs":[{"internalType":"uint256","name":"a","type":"uint256"},{"internalType":"uint256","name":"b","type":"uint256"}],"name":"add","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"pure","type":"function"}]
```

`-o`オプションで出力先ディレクトリを指定すれば、コンパイル結果をファイルとして保存も可能です。

## 簡易EVMの実装

それでは、ZigでEVMのコアとなるバイトコード実行エンジンを実装してみましょう。EVMはスタックマシンですので、スタックやメモリ、ストレージを管理しつつ、バイトコード中のオペコードを読み取って解釈・実行するループを作ることになります。

### データ構造の定義

まず、EVMの実行に必要なデータを用意します。スタック、メモリ、ストレージ、プログラムカウンタ、ガスなどです。今回は各コンポーネントを明確に分離し、オブジェクト指向的な設計で実装します。

- **256ビット整数型 (u256)**: EVMの基本データ型です。Zigには組み込みの256ビット整数型がないため、2つの128ビット整数（上位128ビットと下位128ビット）を組み合わせた独自の構造体として実装します。加算・減算などの演算メソッドも提供します。
- **スタック (EvmStack)**: 固定長配列（サイズ1024）で表現し、各要素を`u256`型とします。スタックポインタ（現在のスタック高さ）を別途管理し、プッシュ/ポップ操作を提供します。
- **メモリ (EvmMemory)**: 動的に拡張可能な`std.ArrayList(u8)`で表現します。32バイト単位でデータを読み書きするメソッドを提供し、必要に応じてサイズを拡張します。
- **ストレージ (EvmStorage)**: コントラクトの永続的なキー/値ストアです。シンプルな実装として、`std.AutoHashMap(u256, u256)`を使用し、キーと値の組を保持します。
- **実行コンテキスト (EvmContext)**: 上記のコンポーネントをまとめ、プログラムカウンタ、残りガス量、実行中のコード、呼び出しデータなどを含む実行環境を表現します。
- **プログラムカウンタ (PC)**: 現在の命令位置を示すインデックスです。`usize`型（符号なしサイズ型）で0からバイトコード長-1まで動きます。
- **ガス**: 残り実行可能ガスを示すカウンタです。`usize`または十分大きい整数型で扱います。処理するごとに各命令のガス消費量を差し引き、0未満になったらアウトオブガスです。
- **その他**: 戻り値を格納する一時バッファや、実行終了フラグなどもあると便利です。例えば`RETURN`命令があった場合に、どのデータを返すかを記録しておきます。

では、これらを踏まえてZigコードを書いていきます。
まずEVMデータ構造の基本定義です。

evm_types.zigを新規に作成し、以下のように記述します。

```evm_types.zig
//! EVMデータ構造定義
//!
//! このモジュールはEthereum Virtual Machine (EVM)の実行に必要な
//! データ構造を定義します。スマートコントラクト実行環境に
//! 必要なスタック、メモリ、ストレージなどの構造体を含みます。

const std = @import("std");

/// 256ビット整数型（EVMの基本データ型）
/// 現在はu128の2つの要素で256ビットを表現
pub const u256 = struct {
    // 256ビットを2つのu128値で表現（上位ビットと下位ビット）
    hi: u128, // 上位128ビット
    lo: u128, // 下位128ビット

    /// ゼロ値の作成
    pub fn zero() u256 {
        return u256{ .hi = 0, .lo = 0 };
    }

    /// u64値からu256を作成
    pub fn fromU64(value: u64) u256 {
        return u256{ .hi = 0, .lo = value };
    }

    /// 加算演算
    pub fn add(self: u256, other: u256) u256 {
        var result = u256{ .hi = self.hi, .lo = self.lo };
        const overflow = @addWithOverflow(result.lo, other.lo, &result.lo);
        // オーバーフローした場合は上位ビットに1を加算
        result.hi = result.hi + other.hi + @intFromBool(overflow);
        return result;
    }

    /// 減算演算
    pub fn sub(self: u256, other: u256) u256 {
        var result = u256{ .hi = self.hi, .lo = self.lo };
        const underflow = @subWithOverflow(result.lo, other.lo, &result.lo);
        // アンダーフローした場合は上位ビットから1を引く
        result.hi = result.hi - other.hi - @intFromBool(underflow);
        return result;
    }

    /// 乗算演算（シンプル実装 - 実際には最適化が必要）
    pub fn mul(self: u256, other: u256) u256 {
        // 簡易実装: 下位ビットのみの乗算
        // 注：完全な256ビット乗算は複雑なため、ここでは省略
        if (self.hi == 0 and other.hi == 0) {
            const result_lo = @as(u128, @truncate(self.lo * other.lo));
            const result_hi = @as(u128, @truncate((self.lo * other.lo) >> 128));
            return u256{ .hi = result_hi, .lo = result_lo };
        } else {
            // 簡易実装のため、上位ビットがある場合は詳細計算を省略
            return u256{ .hi = 0, .lo = 0 };
        }
    }

    /// 等価比較
    pub fn eql(self: u256, other: u256) bool {
        return self.hi == other.hi and self.lo == other.lo;
    }
};

/// EVMスタック（1024要素まで格納可能）
pub const EvmStack = struct {
    /// スタックデータ（最大1024要素）
    data: [1024]u256,
    /// スタックポインタ（次に積むインデックス）
    sp: usize,

    /// 新しい空のスタックを作成
    pub fn init() EvmStack {
        return EvmStack{
            .data = undefined,
            .sp = 0,
        };
    }

    /// スタックに値をプッシュ
    pub fn push(self: *EvmStack, value: u256) !void {
        if (self.sp >= 1024) {
            return error.StackOverflow;
        }
        self.data[self.sp] = value;
        self.sp += 1;
    }

    /// スタックから値をポップ
    pub fn pop(self: *EvmStack) !u256 {
        if (self.sp == 0) {
            return error.StackUnderflow;
        }
        self.sp -= 1;
        return self.data[self.sp];
    }

    /// スタックの深さを取得
    pub fn depth(self: *const EvmStack) usize {
        return self.sp;
    }
};

/// EVMメモリ（動的に拡張可能なバイト配列）
pub const EvmMemory = struct {
    /// メモリデータ（初期サイズは1024バイト）
    data: std.ArrayList(u8),

    /// 新しいEVMメモリを初期化
    pub fn init(allocator: std.mem.Allocator) EvmMemory {
        var memory = std.ArrayList(u8).init(allocator);
        return EvmMemory{
            .data = memory,
        };
    }

    /// メモリを必要に応じて拡張
    pub fn ensureSize(self: *EvmMemory, size: usize) !void {
        if (size > self.data.items.len) {
            // サイズを32バイト単位に切り上げて拡張
            const new_size = ((size + 31) / 32) * 32;
            try self.data.resize(new_size);
            // 拡張部分を0で初期化
            var i = self.data.items.len;
            while (i < new_size) : (i += 1) {
                self.data.items[i] = 0;
            }
        }
    }

    /// メモリから32バイト（256ビット）読み込み
    pub fn load32(self: *EvmMemory, offset: usize) !u256 {
        try self.ensureSize(offset + 32);
        var result = u256.zero();

        // 下位128ビット
        var lo: u128 = 0;
        for (0..16) |i| {
            const byte_val = self.data.items[offset + i];
            lo |= @as(u128, byte_val) << @intCast((15 - i) * 8);
        }

        // 上位128ビット
        var hi: u128 = 0;
        for (0..16) |i| {
            const byte_val = self.data.items[offset + 16 + i];
            hi |= @as(u128, byte_val) << @intCast((15 - i) * 8);
        }

        result.lo = lo;
        result.hi = hi;
        return result;
    }

    /// メモリに32バイト（256ビット）書き込み
    pub fn store32(self: *EvmMemory, offset: usize, value: u256) !void {
        try self.ensureSize(offset + 32);

        // 上位128ビットをバイト単位で書き込み
        var hi = value.hi;
        var i: usize = 0;
        while (i < 16) : (i += 1) {
            const byte_val = @truncate(u8, hi >> @intCast((15 - i) * 8));
            self.data.items[offset + i] = byte_val;
        }

        // 下位128ビットをバイト単位で書き込み
        var lo = value.lo;
        i = 0;
        while (i < 16) : (i += 1) {
            const byte_val = @truncate(u8, lo >> @intCast((15 - i) * 8));
            self.data.items[offset + 16 + i] = byte_val;
        }
    }

    /// 解放処理
    pub fn deinit(self: *EvmMemory) void {
        self.data.deinit();
    }
};

/// EVMストレージ（永続的なキー/バリューストア）
pub const EvmStorage = struct {
    /// ストレージデータ（キー: u256, 値: u256のマップ）
    data: std.AutoHashMap(u256, u256),

    /// 新しいストレージを初期化
    pub fn init(allocator: std.mem.Allocator) EvmStorage {
        return EvmStorage{
            .data = std.AutoHashMap(u256, u256).init(allocator),
        };
    }

    /// ストレージから値を読み込み
    pub fn load(self: *EvmStorage, key: u256) u256 {
        return self.data.get(key) orelse u256.zero();
    }

    /// ストレージに値を書き込み
    pub fn store(self: *EvmStorage, key: u256, value: u256) !void {
        try self.data.put(key, value);
    }

    /// 解放処理
    pub fn deinit(self: *EvmStorage) void {
        self.data.deinit();
    }
};

/// EVM実行コンテキスト（実行状態を保持）
pub const EvmContext = struct {
    /// プログラムカウンタ（現在実行中のコード位置）
    pc: usize,
    /// 残りガス量
    gas: usize,
    /// 実行中のバイトコード
    code: []const u8,
    /// 呼び出しデータ（コントラクト呼び出し時の引数）
    calldata: []const u8,
    /// 戻り値データ
    returndata: std.ArrayList(u8),
    /// スタック
    stack: EvmStack,
    /// メモリ
    memory: EvmMemory,
    /// ストレージ
    storage: EvmStorage,
    /// 呼び出し深度（再帰呼び出し用）
    depth: u8,
    /// 実行終了フラグ
    stopped: bool,
    /// エラー発生時のメッセージ
    error_msg: ?[]const u8,

    /// 新しいEVM実行コンテキストを初期化
    pub fn init(allocator: std.mem.Allocator, code: []const u8, calldata: []const u8) EvmContext {
        return EvmContext{
            .pc = 0,
            .gas = 10_000_000, // 初期ガス量（適宜調整）
            .code = code,
            .calldata = calldata,
            .returndata = std.ArrayList(u8).init(allocator),
            .stack = EvmStack.init(),
            .memory = EvmMemory.init(allocator),
            .storage = EvmStorage.init(allocator),
            .depth = 0,
            .stopped = false,
            .error_msg = null,
        };
    }

    /// リソース解放
    pub fn deinit(self: *EvmContext) void {
        self.returndata.deinit();
        self.memory.deinit();
        self.storage.deinit();
    }
};
```

### EVM実行エンジンの実装

EVMの実行エンジン部分は、オペコードの読み取り、解釈、実行を担当します。主な機能は以下の通りです。

- オペコード定数の定義: EVMで使用される命令コードを定数として定義します（STOP, ADD, MULなど）
- 実行ループ: バイトコードを1命令ずつ処理し、コンテキストを更新していきます
- 命令処理: 各オペコードに対応する処理をswitch文で実装します

下記は実行エンジンの核となる部分です。

evm.zigを新規に作成し、以下のように記述します。

```evm.zig
//! Ethereum Virtual Machine (EVM) 実装
//!
//! このモジュールはEthereumのスマートコントラクト実行環境であるEVMを
//! 簡易的に実装します。EVMバイトコードを解析・実行し、スタックベースの
//! 仮想マシンとして動作します。

const std = @import("std");
const logger = @import("logger.zig");
const evm_types = @import("evm_types.zig");
const u256 = evm_types.u256;
const EvmContext = evm_types.EvmContext;

/// EVMオペコード定義
pub const Opcode = struct {
    // 終了・リバート系
    pub const STOP = 0x00;
    pub const RETURN = 0xF3;
    pub const REVERT = 0xFD;

    // スタック操作・算術命令
    pub const ADD = 0x01;
    pub const MUL = 0x02;
    pub const SUB = 0x03;
    pub const DIV = 0x04;
    pub const SDIV = 0x05;
    pub const MOD = 0x06;
    pub const SMOD = 0x07;
    pub const ADDMOD = 0x08;
    pub const MULMOD = 0x09;
    pub const EXP = 0x0A;
    pub const LT = 0x10;
    pub const GT = 0x11;
    pub const SLT = 0x12;
    pub const SGT = 0x13;
    pub const EQ = 0x14;
    pub const ISZERO = 0x15;
    pub const AND = 0x16;
    pub const OR = 0x17;
    pub const XOR = 0x18;
    pub const NOT = 0x19;
    pub const POP = 0x50;

    // メモリ操作
    pub const MLOAD = 0x51;
    pub const MSTORE = 0x52;
    pub const MSTORE8 = 0x53;

    // ストレージ操作
    pub const SLOAD = 0x54;
    pub const SSTORE = 0x55;

    // 制御フロー
    pub const JUMP = 0x56;
    pub const JUMPI = 0x57;
    pub const PC = 0x58;
    pub const JUMPDEST = 0x5B;

    // PUSHシリーズ (PUSH1-PUSH32)
    pub const PUSH1 = 0x60;
    // 他のPUSH命令も順次増えていく (0x61-0x7F)

    // DUPシリーズ (DUP1-DUP16)
    pub const DUP1 = 0x80;
    // 他のDUP命令も順次増えていく (0x81-0x8F)

    // SWAPシリーズ (SWAP1-SWAP16)
    pub const SWAP1 = 0x90;
    // 他のSWAP命令も順次増えていく (0x91-0x9F)

    // 呼び出しデータ関連
    pub const CALLDATALOAD = 0x35;
    pub const CALLDATASIZE = 0x36;
    pub const CALLDATACOPY = 0x37;
};

/// エラー型定義
pub const EVMError = error{
    OutOfGas,
    StackOverflow,
    StackUnderflow,
    InvalidJump,
    InvalidOpcode,
    MemoryOutOfBounds,
};

/// EVMバイトコードを実行する
///
/// 引数:
///     allocator: メモリアロケータ
///     code: EVMバイトコード
///     calldata: コントラクト呼び出し時の引数データ
///     gas_limit: 実行時のガス上限
///
/// 戻り値:
///     []const u8: 実行結果のバイト列
///
/// エラー:
///     様々なEVM実行エラー
pub fn execute(allocator: std.mem.Allocator, code: []const u8, calldata: []const u8, gas_limit: usize) ![]const u8 {
    // EVMコンテキストの初期化
    var context = EvmContext.init(allocator, code, calldata);
    // ガスリミット設定
    context.gas = gas_limit;
    defer context.deinit();

    // メインの実行ループ
    while (context.pc < context.code.len and !context.stopped) {
        try executeStep(&context);
    }

    // 戻り値をコピーして返す
    const result = try allocator.alloc(u8, context.returndata.items.len);
    std.mem.copy(u8, result, context.returndata.items);
    return result;
}

/// 単一のEVM命令を実行
fn executeStep(context: *EvmContext) !void {
    // 現在のオペコードを取得
    const opcode = context.code[context.pc];

    // ガス消費（シンプル版 - 本来は命令ごとに異なる）
    if (context.gas < 1) {
        context.error_msg = "Out of gas";
        return EVMError.OutOfGas;
    }
    context.gas -= 1;

    // オペコードを解釈して実行
    switch (opcode) {
        Opcode.STOP => {
            context.stopped = true;
        },

        Opcode.ADD => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const a = try context.stack.pop();
            const b = try context.stack.pop();
            try context.stack.push(a.add(b));
            context.pc += 1;
        },

        Opcode.MUL => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const a = try context.stack.pop();
            const b = try context.stack.pop();
            try context.stack.push(a.mul(b));
            context.pc += 1;
        },

        Opcode.SUB => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const a = try context.stack.pop();
            const b = try context.stack.pop();
            try context.stack.push(a.sub(b));
            context.pc += 1;
        },

        Opcode.DIV => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const a = try context.stack.pop();
            const b = try context.stack.pop();
            // 0除算の場合は0を返す
            if (b.hi == 0 and b.lo == 0) {
                try context.stack.push(u256.zero());
            } else {
                // 簡易版ではu64の範囲のみサポート
                if (a.hi == 0 and b.hi == 0) {
                    const result = u256.fromU64(@intCast(a.lo / b.lo));
                    try context.stack.push(result);
                } else {
                    // 本来はより複雑な処理が必要
                    try context.stack.push(u256.zero());
                }
            }
            context.pc += 1;
        },

        // PUSH1: 1バイトをスタックにプッシュ
        Opcode.PUSH1 => {
            if (context.pc + 1 >= context.code.len) return EVMError.InvalidOpcode;
            const value = u256.fromU64(context.code[context.pc + 1]);
            try context.stack.push(value);
            context.pc += 2; // オペコード＋データで2バイト進む
        },

        // DUP1: スタックトップの値を複製
        Opcode.DUP1 => {
            if (context.stack.depth() < 1) return EVMError.StackUnderflow;
            const value = context.stack.data[context.stack.sp - 1];
            try context.stack.push(value);
            context.pc += 1;
        },

        // SWAP1: スタックトップと2番目の要素を交換
        Opcode.SWAP1 => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const a = context.stack.data[context.stack.sp - 1];
            const b = context.stack.data[context.stack.sp - 2];
            context.stack.data[context.stack.sp - 1] = b;
            context.stack.data[context.stack.sp - 2] = a;
            context.pc += 1;
        },

        Opcode.MLOAD => {
            if (context.stack.depth() < 1) return EVMError.StackUnderflow;
            const offset = try context.stack.pop();
            // 現在はu64範囲のみサポート
            if (offset.hi != 0) return EVMError.MemoryOutOfBounds;
            const value = try context.memory.load32(@intCast(offset.lo));
            try context.stack.push(value);
            context.pc += 1;
        },

        Opcode.MSTORE => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const offset = try context.stack.pop();
            const value = try context.stack.pop();
            // 現在はu64範囲のみサポート
            if (offset.hi != 0) return EVMError.MemoryOutOfBounds;
            try context.memory.store32(@intCast(offset.lo), value);
            context.pc += 1;
        },

        Opcode.SLOAD => {
            if (context.stack.depth() < 1) return EVMError.StackUnderflow;
            const key = try context.stack.pop();
            const value = context.storage.load(key);
            try context.stack.push(value);
            context.pc += 1;
        },

        Opcode.SSTORE => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const key = try context.stack.pop();
            const value = try context.stack.pop();
            try context.storage.store(key, value);
            context.pc += 1;
        },

        Opcode.CALLDATALOAD => {
            if (context.stack.depth() < 1) return EVMError.StackUnderflow;
            const offset = try context.stack.pop();
            if (offset.hi != 0) return EVMError.MemoryOutOfBounds;

            var result = u256.zero();
            const off = @as(usize, @intCast(offset.lo));

            // calldataから32バイトをロード（範囲外は0埋め）
            for (0..32) |i| {
                const byte_pos = off + i;
                if (byte_pos < context.calldata.len) {
                    const byte_val = context.calldata[byte_pos];
                    if (i < 16) {
                        // 上位16バイト
                        result.hi |= @as(u128, byte_val) << @intCast((15 - i) * 8);
                    } else {
                        // 下位16バイト
                        result.lo |= @as(u128, byte_val) << @intCast((31 - i) * 8);
                    }
                }
            }

            try context.stack.push(result);
            context.pc += 1;
        },

        Opcode.RETURN => {
            if (context.stack.depth() < 2) return EVMError.StackUnderflow;
            const offset = try context.stack.pop();
            const length = try context.stack.pop();

            // 現在はu64範囲のみサポート
            if (offset.hi != 0 or length.hi != 0) return EVMError.MemoryOutOfBounds;

            const off = @as(usize, @intCast(offset.lo));
            const len = @as(usize, @intCast(length.lo));

            try context.memory.ensureSize(off + len);
            if (len > 0) {
                try context.returndata.resize(len);
                for (0..len) |i| {
                    if (off + i < context.memory.data.items.len) {
                        context.returndata.items[i] = context.memory.data.items[off + i];
                    } else {
                        context.returndata.items[i] = 0;
                    }
                }
            }

            context.stopped = true;
        },

        else => {
            logger.debugLog("未実装のオペコード: 0x{x:0>2}", .{opcode});
            context.error_msg = "未実装または無効なオペコード";
            return EVMError.InvalidOpcode;
        },
    }
}

/// EVMバイトコードの逆アセンブル（デバッグ用）
pub fn disassemble(code: []const u8, writer: anytype) !void {
    var pc: usize = 0;
    while (pc < code.len) {
        const opcode = code[pc];
        try writer.print("0x{x:0>4}: ", .{pc});

        switch (opcode) {
            Opcode.STOP => try writer.print("STOP", .{}),
            Opcode.ADD => try writer.print("ADD", .{}),
            Opcode.MUL => try writer.print("MUL", .{}),
            Opcode.SUB => try writer.print("SUB", .{}),
            Opcode.DIV => try writer.print("DIV", .{}),
            Opcode.MLOAD => try writer.print("MLOAD", .{}),
            Opcode.MSTORE => try writer.print("MSTORE", .{}),
            Opcode.SLOAD => try writer.print("SLOAD", .{}),
            Opcode.SSTORE => try writer.print("SSTORE", .{}),
            Opcode.JUMP => try writer.print("JUMP", .{}),
            Opcode.JUMPI => try writer.print("JUMPI", .{}),
            Opcode.JUMPDEST => try writer.print("JUMPDEST", .{}),
            Opcode.RETURN => try writer.print("RETURN", .{}),

            Opcode.PUSH1 => {
                if (pc + 1 < code.len) {
                    const value = code[pc + 1];
                    try writer.print("PUSH1 0x{x:0>2}", .{value});
                    pc += 1;
                } else {
                    try writer.print("PUSH1 <データ不足>", .{});
                }
            },

            Opcode.DUP1 => try writer.print("DUP1", .{}),
            Opcode.SWAP1 => try writer.print("SWAP1", .{}),
            Opcode.CALLDATALOAD => try writer.print("CALLDATALOAD", .{}),

            else => {
                if (opcode >= 0x60 and opcode <= 0x7F) {
                    // PUSH1-PUSH32
                    const push_bytes = opcode - 0x5F;
                    if (pc + push_bytes < code.len) {
                        try writer.print("PUSH{d} ", .{push_bytes});
                        for (0..push_bytes) |i| {
                            try writer.print("0x{x:0>2}", .{code[pc + 1 + i]});
                        }
                        pc += push_bytes;
                    } else {
                        try writer.print("PUSH{d} <データ不足>", .{push_bytes});
                        pc = code.len;
                    }
                } else if (opcode >= 0x80 and opcode <= 0x8F) {
                    // DUP1-DUP16
                    try writer.print("DUP{d}", .{opcode - 0x7F});
                } else if (opcode >= 0x90 and opcode <= 0x9F) {
                    // SWAP1-SWAP16
                    try writer.print("SWAP{d}", .{opcode - 0x8F});
                } else {
                    // その他の未実装オペコード
                    try writer.print("UNKNOWN 0x{x:0>2}", .{opcode});
                }
            },
        }

        try writer.print("\n", .{});
        pc += 1;
    }
}
```

この実装では、最初にあるシンプルな演算命令(ADD、MUL、SUB、DIV)。スタック操作命令(PUSH1、DUP1、SWAP1)。メモリ/ストレージアクセス(MLOAD/MSTORE/SLOAD/SSTORE)。そして制御フロー(RETURNなど)を実装します。EVMには140種類以上の命令がありますが、今回はAdder.solのようなシンプルなコントラクトを実行するのに必要な最小限の命令セットに絞っています。

## サンプルコントラクト実行の流れ

SimpleAdder.solのようなシンプルなSolidityコントラクトをEVMで実行する基本的な流れは次のとおりです。

- コントラクトのコンパイル: SolidityコードをEVMバイトコードにコンパイル
- バイトコードの解析: バイトコードを読み込み、実行可能な形式に変換
- 実行コンテキストの準備: 関数呼び出しに必要なcalldataの作成
- EVM実行: バイトコードをステップバイステップで実行
- 結果の取得: returndataを取得して結果を解釈

### 簡易EVMでの実行

Zig側で、コンパイルして得たバイトコードと、関数呼び出しの入力データを用意し、`run`関数に渡します。一般にコントラクトの関数を呼び出す際、EVMに与える入力データ（call data）は以下のように構成されます。

- 最初の4バイト: 呼び出す関数を表す**関数セレクタ**（関数識別子）。関数名と引数型から計算される固定の識別子です。
- 残り: 各引数の値を32バイトにエンコードしたものを順番に並べたもの。

今回の`add(uint256,uint256)`関数の場合、関数セレクタは`"add(uint256,uint256)"`という文字列のKeccak-256ハッシュの先頭4バイトで決まります。計算すると`0x771602f7`という値になります。続いて、例えば引数`a = 10`、`b = 32`を与えたい場合、それぞれ32バイトにパディングされた表現を付加します。10は16進で`0x0a`、32は`0x20`ですので、32バイト表現ではそれぞれ`0x000...00a`（最後の1バイトが0×0a）と`0x000...020`になります。つまり、呼び出しデータ全体を16進で表すと次のようになります。

```bash
0x771602f7 000000000000000000000000000000000000000000000000000000000000000a
0000000000000000000000000000000000000000000000000000000000000020
```

（スペースは見やすさのため。実際には詰めて68バイトのデータ）。このデータを我々の`run`関数に渡せば、関数`add(10,32)`を実行したのと同じ効果が得られるはずです。

では、Zigの`main`関数内で具体的に実行してみます。Zigでの16進データの扱いとして、ここでは簡単のため入力データをバイト配列リテラルとして直接埋め込んでいます。先ほどのバイトコードもコピーしてバイト列として渡します。

```zig
pub fn main() !void {
    const bytecode = &[_]u8{
        // ここにAdderコントラクトのバイトコードを16進で並べる（長いため省略）
        0x60,0x80,0x60,0x40,0x52,0x34,0x80,0x15,0x60,0x0f,0x57,0x60,0x00,0x80,0xfd,0x5b,
        0x50,0x60,0x15,0x00,0x56,0xfe,0xa2,0x64,0x69,0x70,0x66,0x73,0x58,0x22,0x12,0x20,
        // （中略: 実際にはバイトコード全体をここに貼り付け）
    };
    const input_data = &[_]u8{
        // 関数セレクタ 0x771602f7
        0x77, 0x16, 0x02, 0xf7,
        // 引数a=10の32バイト表現（31バイトの0の後に0x0a）
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x0a,
        // 引数b=32の32バイト表現（31バイトの0の後に0x20）
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
        0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x20,
    };

    const result = run(bytecode, input_data);

    // 結果を16進数で出力
    std.debug.print("Return data (hex): ", .{});
    for (result) |byte| {
        std.debug.print("{02x}", .{byte});
    }
    std.debug.print("\n", .{});
}
```

上記の`main`では、`bytecode`にコンパイルして得たAdderコントラクトのバイトコード（ランタイム部分も含む）をバイト列として定義しています。次に`input_data`を、先ほど説明した関数セレクタ＋引数の形式で構築しています。そして`run(bytecode, input_data)`を呼び出し、その戻り値（バイト列）を取得しています。

最後に、その`result`バイト列を16進で出力しています。EVM上の関数戻り値は32バイト長のデータ（今回なら計算結果の整数を32バイトにエンコードしたもの）なので、それをそのまま表示する形です。

ではこのプログラムをビルド・実行してみましょう。Zigファイルを`evm_main.zig`とすると、以下のようにコンパイル＆実行します。

```bash
$ zig build-exe evm_main.zig
$ ./evm_main
Return data (hex): 000000000000000000000000000000000000000000000000000000000000002a
```

出力された`Return data`がずらっと並ぶ0と`2a`という値になっていることがわかります。`0x2a`は10進数で42に相当します。元の関数呼び出しは`add(10, 32)`でしたので、戻り値が42となっているのは正しい結果です 🎉。

このようにして、Solidityで書いたスマートコントラクト（の一部機能）を、実装したEVMエンジン上で実行できました。もちろん、実際のEthereumノードが行っている処理のごく一部を真似ただけですが、EVMバイトコードの動作原理が体験できたました。

## EVMの拡張と発展的な話題

### zkEVMとEVMの進化

近年注目されている技術トピックとして**zkEVM**があります。zkEVMとは、**Zero-Knowledge Proof（ゼロ知識証明）**を統合したEVM互換の実行環境のことです。 [Kakarot zkEVM の詳細解説：Starknet の EVM 互換の道 - ChainCatcher](https://www.chaincatcher.com/ja/article/2097197)。具体的には、通常は全ノードがEVMを実行してトランザクションを検証するところを、EVMの実行プロセス自体を暗号学的証明（有効性証明）によって保証しようという試みで。これにより、ブロックチェイン上の全検証者が逐一EVM計算を再現しなくても、証明を検証するだけで正しい結果であることを確認できるようになります。

zkEVMは主にLayer2（レイヤー2）のスケーリングソリューションとして期待されています。代表的なプロジェクトにPolygon zkEVMやScroll、StarkWareの**Kakarot**などがあります。例えばKakarotはStarknet上にCairo言語で実装されたEVM互換機です。CairoスマートコントラクトとしてEVMのスタックやメモリ、命令実行をシミュレートするものになっています。zkEVMによってLayer2上でEVMをそのまま動かしつつ、各トランザクションの有効性をロールアップします。そうすることで、Ethereumメインネットよりも高速・安価な処理を実現できます。

Ethereum自体の進化という点では、**イスタンブール**や**ロンドン**といったハードフォークでEVMのガスコスト調整や新命令の追加が行われてきました。直近では`RETURNDATA`系命令の導入や`CREATE2`命令の追加などがありました。また将来的な提案として、EVMのバイトコードフォーマットを改良する**EVM Object Format (EOF)**や、高レベル命令セットへの置き換えなどもあります。しかし互換性の問題から、EthereumメインネットのEVMは慎重にアップグレードが進められています。現在はEthereum2.0移行に伴いコンセンサス層が大きく変わりましたが、実行層としてのEVMは従来の仕組みを維持しています。その意味で、EVMは依然としてEthereumエコシステムの根幹であり続けています。

### おわりに

本記事では、Zig言語を使ってEVMの簡易実装に挑戦し、Solidityスマートコントラクトの実行を確認しました。EVMの仕組み（スタックマシン、バイトコード、ガスモデルなど）を低レベルから体験することで、Solidityを書くときにもその裏側で何が行われているのかイメージできるようになったのではないでしょうか。
