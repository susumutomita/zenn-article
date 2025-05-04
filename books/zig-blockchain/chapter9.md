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

まず、EVMの実行に必要なデータを用意します。スタック、メモリ、ストレージ、プログラムカウンタ、ガスなどです。今回はシンプルにするため、それぞれ以下のように設計します。

- **スタック**: 固定長配列（サイズ1024）で表現し、各要素を`u256`（256ビット整数）型とします。スタックポインタ（現在のスタック高さ）を別途管理し、PUSHやPOP時にインクリメント/デクリメントします。
- **メモリ**: 可変長のバイト配列で表現します。EVMでは実行中に動的に拡張されますが、簡易実装では最大長をあらかじめ決め（例えば1024バイト）確保しておきます。必要があれば後で拡張も可能です。
- **ストレージ**: 永続的なキー/値ストアですが、ここでは単純に`std.HashMap(u256, u256)`（Zig標準ライブラリのハッシュマップ）を用いてキーと値を保持します。永続性は考慮せず、実行中のメモリ上のデータ構造として扱います。
- **プログラムカウンタ (PC)**: 現在の命令位置を示すインデックスです。`usize`型（符号なしサイズ型）で0からバイトコード長-1まで動きます。
- **ガス**: 残り実行可能ガスを示すカウンタです。`usize`または十分大きい整数型で扱います。処理するごとに各命令のガス消費量を差し引き、0未満になったらアウトオブガスです。
- **その他**: 戻り値を格納する一時バッファや、実行終了フラグなどもあると便利です。例えば`RETURN`命令があった場合に、どのデータを返すかを記録しておきます。

では、これらを踏まえてZigコードを書いていきます。以下に、EVM実行用の関数`run()`を実装します。この関数は入力としてバイトコードとコールデータ（後述、コントラクト呼び出し時の引数データ）を受け取り、結果として返り値のバイト列を返すようにします。

```zig
const std = @import("std");

pub fn run(code: []const u8, calldata: []const u8) []const u8 {
    // スタック（1024要素まで）
    var stack: [1024]u256 = undefined;
    var sp: usize = 0; // スタックポインタ（次に値を積む位置）

    // メモリ（1024バイトのゼロ初期化）
    var memory: [1024]u8 = [_]u8{0} ** 1024;

    // ストレージ（ハッシュマップ）
    var storage = std.HashMap(u256, u256).init(std.heap.page_allocator);

    // ガスとプログラムカウンタの初期化
    var gas: usize = 10_000; // 仮のガス上限
    var pc: usize = 0;

    // 戻り値用のバッファ（最大32バイト=256ビット分）
    var return_data: [32]u8 = undefined;
    var return_size: usize = 0;

    // EVM命令実行ループ
    while (pc < code.len) : (pc += 1) {
        const opcode = code[pc];

        // ガス消費: シンプルに各命令ごとに1ガス（本実装では細かく設定可能）
        if (gas == 0) break; // ガス切れで停止
        gas -= 1;

        switch (opcode) {
            0x00 => |STOP| { // STOP命令: 実行終了
                break :while;
            },
            0x01 => |ADD| { // ADD命令: スタック上位2項を加算
                if (sp < 2) break :while; // アンダーフロー対策
                sp -= 2;
                // 256ビット加算（オーバーフローは自動で256bit内に切り捨て）
                stack[sp] = stack[sp] + stack[sp + 1];
                sp += 1;
            },
            0x02 => |MUL| { // MUL命令: 乗算
                if (sp < 2) break :while;
                sp -= 2;
                stack[sp] = stack[sp] * stack[sp + 1];
                sp += 1;
            },
            0x03 => |SUB| { // SUB命令: 減算 (stack[sp-2] - stack[sp-1])
                if (sp < 2) break :while;
                sp -= 2;
                stack[sp] = stack[sp] - stack[sp + 1];
                sp += 1;
            },
            0x04 => |DIV| { // DIV命令: 除算（整数の商）
                if (sp < 2) break :while;
                sp -= 2;
                const divisor = stack[sp + 1];
                if (divisor == 0) {
                    // EVMのDIVは divisor=0 の場合は結果0を返す
                    stack[sp] = 0;
                } else {
                    stack[sp] = stack[sp] / divisor;
                }
                sp += 1;
            },
            0x35 => |CALLDATALOAD| { // CALLDATALOAD: コールデータから32バイト読み込む
                if (sp < 1) break :while;
                // 引数としてオフセット値をスタックから取得
                const offset = stack[sp - 1] & 0xffffffffffffffff; // 下位64bitを取り出しusizeに
                const off = @intCast(usize, offset);
                sp -= 1;
                // オフセットから32バイトを読み込み、足りない部分は0埋め
                var word: u256 = 0;
                var i: u8 = 0;
                while (i < 32 and off + @intCast(usize, i) < calldata.len) : (i += 1) {
                    word |= (u256(calldata[off + i]) << ((31 - i) * 8));
                }
                // 読み取った32バイトの値をスタックに積む
                stack[sp] = word;
                sp += 1;
            },
            0x51 => |MLOAD| { // MLOAD: メモリから32バイト読み込む
                if (sp < 1) break :while;
                const offset = @intCast(usize, stack[sp - 1]);
                sp -= 1;
                var word: u256 = 0;
                // メモリ[offset: offset+32]の値を読み込み（境界チェックあり）
                if (offset + 32 <= memory.len) {
                    // 32バイトをまとめて読み取り
                    var j: usize = 0;
                    while (j < 32) : (j += 1) {
                        word |= (u256(memory[offset + j]) << ((31 - j) * 8));
                    }
                }
                stack[sp] = word;
                sp += 1;
            },
            0x52 => |MSTORE| { // MSTORE: メモリに32バイト書き込む
                if (sp < 2) break :while;
                sp -= 2;
                const offset = @intCast(usize, stack[sp]);
                var value = stack[sp + 1];
                if (offset + 32 <= memory.len) {
                    // 32バイトをメモリに書き込む
                    var j: usize = 0;
                    while (j < 32) : (j += 1) {
                        memory[offset + j] = @byteCast(value >> ((31 - j) * 8));
                    }
                }
            },
            0x54 => |SLOAD| { // SLOAD: ストレージから読み込み
                if (sp < 1) break :while;
                const key = stack[sp - 1];
                sp -= 1;
                const result = storage.get(key);
                stack[sp] = if (result) |val| val else 0;
                sp += 1;
            },
            0x55 => |SSTORE| { // SSTORE: ストレージに書き込み
                if (sp < 2) break :while;
                sp -= 2;
                const key = stack[sp];
                const value = stack[sp + 1];
                // ハッシュマップにキーと値を保存（既存なら更新）
                _ = storage.put(key, value);
            },
            0x56 => |JUMP| { // JUMP: 無条件ジャンプ
                if (sp < 1) break :while;
                const dest = @intCast(usize, stack[sp - 1]);
                sp -= 1;
                // ジャンプ先はJUMPDEST命令(0x5B)である必要がある（簡易実装では省略可）
                if (dest >= code.len or code[dest] != 0x5B) {
                    break :while; // 不正なジャンプ先なら停止
                }
                pc = dest;
            },
            0x57 => |JUMPI| { // JUMPI: 条件付きジャンプ
                if (sp < 2) break :while;
                sp -= 2;
                const dest = @intCast(usize, stack[sp]);
                const cond = stack[sp + 1];
                if (cond != 0) {
                    if (dest >= code.len or code[dest] != 0x5B) {
                        break :while;
                    }
                    pc = dest;
                }
            },
            0x5B => |JUMPDEST| {
                // ジャンプ先ラベル（何もしない）
            },
            0xF3 => |RETURN| { // RETURN: 実行結果を返して停止
                if (sp < 2) break :while;
                sp -= 2;
                const offset = @intCast(usize, stack[sp]);
                const length = @intCast(usize, stack[sp + 1]);
                // メモリからoffset位置よりlengthバイトを取り出しreturn_dataに格納
                if (offset + length <= memory.len and length <= return_data.len) {
                    std.mem.copy(u8, return_data[0..length], memory[offset .. offset+length]);
                    return_size = length;
                }
                break :while; // 実行ループを抜ける
            },
            else => {
                // 未実装のオペコードに遭遇した場合
                break :while;
            }
        } // end switch
    } // end while

    return return_data[0..return_size];
}
```

上記のコードで、EVMの主要なオペコードの一部（算術演算、メモリアクセス、ストレージアクセス、ジャンプ、リターンなど）を実装しています。それぞれの部分について補足説明します。

- **算術演算系** (`ADD`, `SUB`, `MUL`, `DIV`): スタックトップの2つの値を取り出して演算し、結果をスタックに積み直しています。Zigの`u256`型は256ビット整数ですので、加減乗除はいずれも256ビットの範囲で自動的に桁あふれ（オーバーフロー）時には下位256ビットに切り詰められます。EVM仕様では算術は全てモジュロ$2^{256}$（256ビット幅で切り詰め）ですので、Zigのデフォルト動作と合致します。DIV命令では除数が0の場合に結果を0とする処理も再現しています。各演算の直前にスタックポインタ`sp`を調整し、スタックアンダーフローが起きないようにチェックしています。

- **PUSH系**: コード中では一般化していますが、`0x60`から`0x7F`までの命令はそれぞれPUSH1～PUSH32を表し、直後の1～32バイトの即値をスタックに積む命令です。例えばPUSH1 (0×60)なら次の1バイトを、PUSH32 (0×7F)なら次の32バイトをまとめて読み込みます。その後、256ビット値に詰めてスタックに載せ、`pc`を対応する分だけ進めます。

- **メモリアクセス** (`MLOAD`, `MSTORE`): メモリ配列からの読み書きをします。`MLOAD(0x51)`はスタックからオフセットを取り出し、その位置から32バイトのデータを読み込んでスタックに積みます。`MSTORE(0x52)`はスタックから値とオフセットを取り出し、メモリの指定位置に32バイトの値を書き込みます。ここではメモリ配列`memory`を1024バイトに固定しており、範囲外アクセスは何もしない形で対処しています。本来EVMでは、未アクセス領域に書き込もうとすると自動でメモリが拡張され、その分のガスを消費します ([スマートコントラクトの紹介](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html))。簡易実装では固定長かつガス消費も一律にしているため、その部分は省略しています。

- **ストレージアクセス** (`SLOAD`, `SSTORE`): `SLOAD(0x54)`はスタックトップのキーを取り出し、ストレージマップから該当する値を読み込んでスタックに積みます。`SSTORE(0x55)`はスタックトップのキーとその下の値を取り出し、ストレージマップに保存します。ここではZigの`std.HashMap`を用いて`u256`→`u256`のマッピングを実現しています。初期化に`std.heap.page_allocator`という簡易なアロケータを使っている点はZig特有ですが、要はヒープ上にハッシュマップを確保しています。ストレージアクセス命令もメモリアクセス同様、本来は高額なガスを消費し、特にSSTOREは書き込み状況により異なる複雑なコスト計算があります。ここでは簡単化のため、一律のガス消費（上記では各命令ごとに仮に1ガス）で処理しています。

- **コールデータアクセス** (`CALLDATALOAD`): コールデータ（呼び出し時の入力）から32バイトを読み込む命令です。Solidityで関数の引数を読み取る際などに使用されています。上記コードでは`CALLDATALOAD(0x35)`にて、スタックから読み込み開始オフセットを取得し、その位置から32バイトを`calldata`配列からコピーしています。`calldata`は`run`関数の引数で渡され、呼び出し元が事前に構築します（関数識別子や引数をエンコードしたデータです）。`CALLDATALOAD`は範囲外を読み込もうとした場合は足りない部分をゼロ埋めする仕様なので、コピー時に配列範囲をチェックし、足りなければ残りは0のままにしています。

- **ジャンプ命令** (`JUMP`, `JUMPI`, `JUMPDEST`): コントラクト内のコードの分岐やループに使われます。`JUMP(0x56)`はスタックトップの値をジャンプ先アドレス（PC値）として設定します。`JUMPI(0x57)`は条件付きジャンプで、スタックトップの条件値が0でない場合のみ2番目の値をPCに設定します。ジャンプ先は必ず`JUMPDEST(0x5B)`命令の位置でなければなりません。本実装でも最低限それをチェックし、不正なジャンプ先なら停止しています。`JUMPDEST`は何もしないただのラベルのような命令で、ジャンプ可能位置を示すマーカーとして使われます。Solidityが生成するバイトコードでは関数の先頭や分岐先に必ず配置されています。

- **停止/戻り値** (`STOP`, `RETURN`): `STOP(0x00)`は単に実行を終了します。一方`RETURN(0xF3)`は指定したメモリ範囲のデータを**戻り値**として返しつつ実行を終了します。`RETURN`ではスタックからオフセットと長さを取り出し、そのメモリ内容を`return_data`バッファにコピーしています。そしてループを抜けて`run`関数の戻り値としてそのデータスライスを返しています。EVMでは関数の戻り値やログデータの返却にこの命令が使われます。

以上で、簡易EVMエンジンの実装コードは完成です。ガス消費については上記では極めて大雑把に「命令ごとに1減らす」という処理を入れましたが、実際には各オペコードに固有のコストが設定されています。例えば、`ADD`は3ガス、`MSTORE`は12ガス、`SLOAD`は100ガスといったように定義があります（ハードフォークによって数値は変更されることがあります）。

### 実装の簡略化と限界

上記の実装は学習目的の簡易EVMであり、実際のEVMと比べて多くの簡略化をしています。例えば以下のような点が挙げられます。

- 未実装のオペコードが多数あります（論理演算、比較演算、SHA3ハッシュ、CALL関連の命令など）。
- Gas計算が大幅に簡略化されています。本来はメモリ拡張やストレージ書き込み、各種命令で異なるガスコスト計算があります。
- エラーハンドリングが単純化されています。実コードではスタックアンダーフローや不正ジャンプ時には例外リターンし、状態を巻き戻す処理が必要ですが、ここではただループを抜けるだけです。
- 外部との相互作用（CALL/DELEGATECALLによる他コントラクト呼び出しやログ出力、CREATEによるコントラクト生成など）は一切扱っていません。
- 署名検証やトランザクションの概念も省いています。あくまで「単一のEVMコードを実行する」ことに特化しています。

これらの制限により、セキュリティや正確性は本物のEVMに比べて劣りますが、EVMの基本動作を理解するには十分でしょう。次章では、この実装を使って実際にSolidityで書いたスマートコントラクトのバイトコードを動かしてみます。

## 4. スマートコントラクトのデプロイと実行

それでは、先ほど実装した簡易EVMエンジンを使ってSolidity製のスマートコントラクトを実行してみましょう。ここではデモとして**二つの数の加算をする関数**を持つごく簡単なコントラクトを例にします。

### Solidityでコントラクトを記述

以下にSolidityでシンプルなコントラクトを示します。このコントラクト入力された2つの整数の和を返すだけのものです。

```solidity
// SimpleAdder.sol
pragma solidity ^0.8.0;

contract Adder {
    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a + b;
    }
}
```

関数に`pure`修飾子を付けているため、状態を変更せず純粋に計算する関数となっています。では、このSolidityコードをコンパイルしてEVMバイトコードを取得しましょう。

### コントラクトのコンパイルとバイトコード取得

ターミナルで次のように`solc`を使ってコンパイルします。

```bash
solc --bin SimpleAdder.sol -o output
```

このコマンドは、Solidityコンパイラに`SimpleAdder.sol`をコンパイルしてバイトコードを`output`ディレクトリに出力するよう指示しています。`output`ディレクトリ内に`Adder.bin`（コントラクトのバイトコード）というファイルが生成されるはずです。**注意:** `--bin`オプションだけだとデプロイ用のバイトコード（constructorを含むコード）が出力されます。関数を呼び出す際に実行される**ランタイムバイトコード**のみを取得したい場合は、`solc --bin-runtime`を使います。今回はconstructorを持たずシンプルなので`--bin`出力でも差し支えありません。

コンパイルが成功したら、出力されたバイトコードを確認してみましょう。内容は16進数の文字列になっているはずです。例えば（Solidityバージョン等によって異なりますが）以下のような形になります。

```bash
6080604052348015600f57600080fd5b5060...（中略）...150056fea2646970667358221220...
```

非常に長いですが、これが`Adder`コントラクトのバイトコードです。前半はコントラクトデプロイ時に実行されるコード（constructorがないので単にランタイムコードを返す処理）で、`fe`以降に続く部分がランタイムコード本体です。EVMアセンブリを覗いてみると`ADD (0x01)`命令などが含まれているのが確認できます。

それでは、このバイトコードを先ほど実装した`run`関数で実行してみます。

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
