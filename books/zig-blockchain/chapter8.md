---
title: "Zigで簡易EVMバイトコードエンジンを実装し、Solidityスマートコントラクトを実行する"
free: true
---

## Zigで簡易EVMバイトコードエンジンを実装し、Solidityスマートコントラクトを実行する

このチュートリアルでは、**Zig**プログラミング言語を用いてEthereumの**Ethereum Virtual Machine (EVM)**を簡易的に実装し、Solidityで書かれたスマートコントラクトのバイトコードを実行します。EVMの基礎概念から始め、Zigによるスタック型仮想マシンの構築、Solidityコントラクトのコンパイルと実行まで、段階的に解説します。実装コードと詳細な説明を交えていますので、ぜひ手を動かしながら学んでみてください。

**目標:**

- EVMの基本構造（スタック・メモリ・ストレージ）を理解する
- Zigでスタックベースの仮想マシンを構築し、EVMバイトコードを実行する
- Solidityで簡単なスマートコントラクトを作成し、Zigで実装したEVM上で動作させる
- EVMの制限や最適化、発展的な技術（zkEVMなど）について言及する

## 1. EVMとは？

**Ethereum Virtual Machine (EVM)**とは、Ethereumブロックチェイン上でスマートコントラクト（契約コード）を実行するための仮想マシンです。イーサリアムの各ノードはEVMを内部に持ち、ブロック内の取引（トランザクション）に含まれるスマートコントラクトのコードをEVM上で実行することで、結果として世界状態（ワールドステート）を更新します。EVMは256ビット長のWord（32バイト）を基本単位とする**スタックマシン**であり、プログラム（バイトコード）を順次読み取り実行していきます。スマートコントラクトのコードは**バイトコード**（機械語に相当）でブロックチェイン上に保存され、EVMがこれを解釈・実行します。

EVMには、実行時に使用されるいくつかの主要なデータ領域があります ([How does Ethereum Virtual Machine (EVM) work? A deep dive into EVM Architecture and Opcodes | QuickNode Guides](https://www.quicknode.com/guides/ethereum-development/smart-contracts/a-dive-into-evm-architecture-and-opcodes#:~:text=state%20of%20Ethereum%20%28,machine%20architecture%20consisting%20of%20components))：

- **ストレージ (Storage)**: 各コントラクト（アカウント）に紐づく永続的な**キー値ストア**です。256ビットのキーと値のマッピングで表現され、トランザクション間で保存されます ([スマートコントラクトの紹介 — Solidity 0.8.21 ドキュメント](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html#))。コントラクトの状態変数はこのストレージに格納され、ブロックチェイン上の状態の一部として永続化されます。ストレージへの書き込み・読み出しはガスコストが高く、他のコントラクトのストレージには直接アクセスできません。

- **メモリ (Memory)**: コントラクト実行中のみ有効な一時的なメモリ空間です。呼び出しごとにリセットされ、バイトアドレスでアクセス可能な1次元の配列として扱われます。読み書きは基本的に32バイト幅単位で行われ、必要に応じて末尾に向かって拡張されます（拡張にはガスコストが伴います）。計算中の一時データや後述する戻り値の一時格納に利用されます。

- **スタック (Stack)**: EVMの算術演算やオペコードのオペランド受け渡しに使われるLIFOスタックです。最大で1024要素の深さがあり、各要素は256ビットの値です。EVMはレジスタを持たず、全ての計算はスタック上で行われます。通常、オペコードはスタックの最上位要素（トップ）から必要な数の項目をPOPし、計算結果を再びスタックにPUSHします ([Ethereum Virtual Machineについて #Rust - Qiita](https://qiita.com/Akatsuki_py/items/05e8ad91d09f9db1fe64#:~:text=%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AE%E5%AE%9F%E8%A1%8C%E3%81%AF%E3%83%90%E3%82%A4%E3%83%88%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AE%E5%85%88%E9%A0%AD%E3%81%8B%E3%82%89%E9%96%8B%E5%A7%8B%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82))。スタックの深い位置に直接アクセスすることはできず、`DUP`（トップ16個までの要素を複製）や`SWAP`（トップと下位の一部を交換）命令で間接的に操作します。スタックオーバーフロー（積みすぎ）やスタックアンダーフロー（取り出しすぎ）は実行失敗を招きます。

上記の他にも、**プログラムカウンタ (PC)** や**ガス (Gas)** といった要素があります。プログラムカウンタは現在実行中のバイトコードの位置を指し示すものです。EVMは**命令ポインタ**であるPCを開始時に0にセットし、各オペコードの実行後に進めていきます。条件付きジャンプ命令などによりPCを書き換えることで、ループや条件分岐も実現します。

**ガス**とは、EVM上でコードを実行する際に必要となる手数料単位です。各オペコード毎に「この命令を実行するのに必要なガス量」が定められており ([How does Ethereum Virtual Machine (EVM) work? A deep dive into EVM Architecture and Opcodes | QuickNode Guides](https://www.quicknode.com/guides/ethereum-development/smart-contracts/a-dive-into-evm-architecture-and-opcodes#:~:text=,in%20wei))、スマートコントラクトを呼び出すトランザクションには上限となるガス量（ガスリミット）が指定されます。EVMは命令を実行するたびに消費ガスを積算し、ガスリミットを超えると**アウトオブガス**となり実行が停止（通常は巻き戻し）されます。ガスは無限ループや過度な計算を防ぎ、また計算リソースに応じた手数料をネットワークに支払わせる仕組みになっています。

EVMの命令（オペコード）は1バイト長で表現され、例えば`0x01`はADD（加算）、`0x60`はPUSH（スタックへ即値を積む）といったように定義されています ([Ethereum Virtual Machineについて #Rust - Qiita](https://qiita.com/Akatsuki_py/items/05e8ad91d09f9db1fe64#:~:text=%E3%83%90%E3%82%A4%E3%83%88%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AF%E3%82%AA%E3%83%9A%E3%83%A9%E3%83%B3%E3%83%89%E3%82%92%E6%8C%81%E3%81%A4PUSH%E5%91%BD%E4%BB%A4%E3%82%92%E9%99%A4%E3%81%84%E3%81%A61%E3%83%90%E3%82%A4%E3%83%88%E3%81%AE%E5%9B%BA%E5%AE%9A%E9%95%B7%E3%81%A7%E3%81%99%E3%80%82))。スマートコントラクトのバイトコード実行は常にコードの先頭（PC=0）から開始され ([Ethereum Virtual Machineについて #Rust - Qiita](https://qiita.com/Akatsuki_py/items/05e8ad91d09f9db1fe64#:~:text=%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AE%E5%AE%9F%E8%A1%8C%E3%81%AF%E3%83%90%E3%82%A4%E3%83%88%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AE%E5%85%88%E9%A0%AD%E3%81%8B%E3%82%89%E9%96%8B%E5%A7%8B%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82))、`STOP (0x00)`命令に到達するか実行が中断されるまで、命令を順次取り出して解釈・実行していきます。PUSH系命令だけは直後のバイト列をオペランド（値）として持つため可変長ですが、その他の命令は固定1バイトで、スタックから値を取り出し結果をスタックに戻すという挙動をとります ([Ethereum Virtual Machineについて #Rust - Qiita](https://qiita.com/Akatsuki_py/items/05e8ad91d09f9db1fe64#:~:text=%E3%83%90%E3%82%A4%E3%83%88%E3%82%B3%E3%83%BC%E3%83%89%E3%81%AF%E3%82%AA%E3%83%9A%E3%83%A9%E3%83%B3%E3%83%89%E3%82%92%E6%8C%81%E3%81%A4PUSH%E5%91%BD%E4%BB%A4%E3%82%92%E9%99%A4%E3%81%84%E3%81%A61%E3%83%90%E3%82%A4%E3%83%88%E3%81%AE%E5%9B%BA%E5%AE%9A%E9%95%B7%E3%81%A7%E3%81%99%E3%80%82))。

以上がEVMの基本的な仕組みです。Ethereumクライアント（例：GethやNethermindなど）には各々EVM実装が内蔵されていますが、全てEthereumの公式仕様（イエローペーパー）に従う必要があります ([How does Ethereum Virtual Machine (EVM) work? A deep dive into EVM Architecture and Opcodes | QuickNode Guides](https://www.quicknode.com/guides/ethereum-development/smart-contracts/a-dive-into-evm-architecture-and-opcodes#:~:text=The%20EVM%20is%20contained%20within,machine%20architecture%20consisting%20of%20components))。このチュートリアルでは、このEVMの一部機能をZigで再現し、簡単なスマートコントラクトのバイトコードを実行してみます。

## 2. ZigでEVMを実装する準備

まずはEVM実装に取りかかる前に、開発環境の準備をします。

**Zigの環境構築:** ZigはC言語に似た構文を持つシステムプログラミング言語で、高いパフォーマンスと安全性を兼ね備えています。公式サイトからコンパイラをダウンロードするか、各種パッケージマネージャ（HomebrewやChocolateyなど）でインストールできます。執筆時点ではZigの最新版を利用してください。Zigは単一のソースファイルを直接ビルドできるので、`zig run`や`zig build-exe`コマンドで手軽に実行・ビルドが可能です。

**依存ライブラリ:** 今回の実装ではZigの**標準ライブラリ**以外の外部依存は使用しません。Zigは任意精度のビット幅を持つ整数型をサポートしており、例えば`u256`型を宣言すれば256ビットの符号なし整数を扱えます ([Documentation - The Zig Programming Language](https://ziglang.org/documentation/master/#:~:text=Zig%20supports%20arbitrary%20bit,uses%20a%20two%27s%20complement%20representation))。この機能により、EVMの256ビット幅の数値（スタックの値やストレージのキー・値など）も専用の特別な大数ライブラリを使わずに表現できます。また、メモリやスタックはZigの配列やリストを使って実装し、マップ（ハッシュマップ）も標準ライブラリのコンテナを利用します。

**Solidityコンパイラの準備:** 次に、Solidityのスマートコントラクトをバイトコードにコンパイルするために、Solidity公式のコマンドラインコンパイラ`solc`を用意します。Solidityの開発環境が既にある場合はsolcコマンドが使えるはずです。インストールされていない場合、Ethereum公式サイトや各種ドキュメントに従ってインストールしてください（例：Ubuntuなら`sudo apt install solc`、macOSならHomebrewで`brew install solidity`）。

Solidityコンパイラ`solc`を使うと、Solidityコードから各種出力を得ることができます ([Using the Compiler — Solidity 0.8.29 documentation](https://docs.soliditylang.org/en/latest/using-the-compiler.html#:~:text=One%20of%20the%20build%20targets,asm%20sourceFile.sol))。バイトコード（EVMが実行するバイナリ）を取得するには、以下のように`--bin`オプションを指定します。

```bash
$ solc --bin MyContract.sol
```

上記コマンドを実行すると、標準出力にバイトコードの16進数表現が表示されます ([Using the Compiler — Solidity 0.8.29 documentation](https://docs.soliditylang.org/en/latest/using-the-compiler.html#:~:text=binaries%20and%20assembly%20over%20an,asm%20sourceFile.sol))。`-o`オプションで出力先ディレクトリを指定すれば、コンパイル結果をファイルとして保存することも可能です。今回は簡単のためコンパイル結果を直接コピー&ペーストしてZigコード内に埋め込んで使用します（後述）。

**補足:** `solc --asm`オプションを使うとSolidityが生成したEVMアセンブリ（オペコードの一覧）を見ることができます。興味があれば確認してみると良いでしょう。また、`--optimize`を付けるとバイトコードが最適化されますが、チュートリアルでは動作をわかりやすくするため最適化なしで進めます。

準備が整ったら、次はいよいよZigでEVMエンジン本体を実装していきます。

## 3. 簡易EVMの実装

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

- **PUSH系**: コード中では一般化していますが、`0x60`から`0x7F`までの命令はそれぞれPUSH1～PUSH32を表し、直後の1～32バイトの即値をスタックに積む命令です。上のコードでは`switch`の`else`で一括処理していませんが、本来であれば`opcode >= 0x60 and opcode <= 0x7F`の場合にその値に応じたバイト数を読み取ってスタックに積む処理を行います。例えばPUSH1 (0×60)なら次の1バイトを、PUSH32 (0×7F)なら次の32バイトをまとめて読み込み、256ビット値に詰めてスタックに載せ、`pc`を対応する分だけ進めます。**（注: 上記コードでは簡潔さのためPUSH命令の実装は省略しています。同様にPOP(0×50)やDUP, SWAPなどのスタック操作命令も省略しています）。**

- **メモリアクセス** (`MLOAD`, `MSTORE`): メモリ配列からの読み書きを行います。`MLOAD(0x51)`はスタックからオフセットを取り出し、その位置から32バイトのデータを読み込んでスタックに積みます。`MSTORE(0x52)`はスタックから値とオフセットを取り出し、メモリの指定位置に32バイトの値を書き込みます。ここではメモリ配列`memory`を1024バイトに固定しており、範囲外アクセスは何もしない形で対処しています。本来EVMでは、未アクセス領域に書き込もうとすると自動でメモリが拡張され、その分のガスを消費します ([スマートコントラクトの紹介 — Solidity 0.8.21 ドキュメント](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html#:~:text=2%E3%81%A4%E7%9B%AE%E3%81%AE%E3%83%87%E3%83%BC%E3%82%BF%E9%A0%98%E5%9F%9F%E3%81%AF%20%E3%83%A1%E3%83%A2%E3%83%AA%20%E3%81%A8%E5%91%BC%E3%81%B0%E3%82%8C%E3%80%81%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AF%E3%83%A1%E3%83%83%E3%82%BB%E3%83%BC%E3%82%B8%E3%82%92%E5%91%BC%E3%81%B3%E5%87%BA%E3%81%99%E3%81%9F%E3%81%B3%E3%81%AB%E3%82%AF%E3%83%AA%E3%82%A2%E3%81%95%E3%82%8C%E3%81%9F%E3%81%B0%E3%81%8B%E3%82%8A%E3%81%AE%E3%82%A4%E3%83%B3%E3%82%B9%E3%82%BF%E3%83%B3%E3%82%B9%E3%82%92%E5%8F%96%E5%BE%97%E3%81%97%E3%81%BE%E3%81%99%E3%80%82%20%E3%83%A1%E3%83%A2%E3%83%AA%E3%81%AF%E7%B7%9A%E5%BD%A2%E3%81%A7%E3%80%81%E3%83%90%E3%82%A4%E3%83%88%E3%83%AC%E3%83%99%E3%83%AB%E3%81%A7%E3%82%A2%E3%83%89%E3%83%AC%E3%82%B9%E3%82%92%E6%8C%87%E5%AE%9A%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99%E3%81%8C%E3%80%81%E8%AA%AD%E3%81%BF%E5%87%BA%E3%81%97%E3%81%AF256%E3%83%93%E3%83%83%E3%83%88%E3%81%AE%E5%B9%85%E3%81%AB%E5%88%B6%E9%99%90%E3%81%95%E3%82%8C%E3%80%81%E6%9B%B8%E3%81%8D%E8%BE%BC%E3%81%BF%E3%81%AF8%E3%83%93%E3%83%83%E3%83%88%E3%81%BE%E3%81%9F%E3%81%AF256%E3%83%93%E3%83%83%E3%83%88%E3%81%AE%E5%B9%85%E3%81%AB%E5%88%B6%E9%99%90%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82%20%E3%83%A1%E3%83%A2%E3%83%AA%E3%81%AF%E3%80%81%E3%81%93%E3%82%8C%E3%81%BE%E3%81%A7%E6%89%8B%E3%81%A4%E3%81%8B%E3%81%9A%E3%81%A0%E3%81%A3%E3%81%9F%E3%83%A1%E3%83%A2%E3%83%AA%E3%83%AF%E3%83%BC%E3%83%89%EF%BC%88%E3%83%AF%E3%83%BC%E3%83%89%E5%86%85%E3%81%AE%E4%BB%BB%E6%84%8F%E3%81%AE%E3%82%AA%E3%83%95%E3%82%BB%E3%83%83%E3%83%88%EF%BC%89%E3%81%AB%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%EF%BC%88%E8%AA%AD%E3%81%BF%E5%87%BA%E3%81%97%E3%81%BE%E3%81%9F%E3%81%AF%E6%9B%B8%E3%81%8D%E8%BE%BC%E3%81%BF%EF%BC%89%E3%81%99%E3%82%8B%E3%81%A8%E3%80%81%E3%83%AF%E3%83%BC%E3%83%89%EF%BC%88256%E3%83%93%E3%83%83%E3%83%88%EF%BC%89%E5%8D%98%E4%BD%8D%E3%81%A7%E6%8B%A1%E5%BC%B5%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82,%E6%8B%A1%E5%BC%B5%E6%99%82%E3%81%AB%E3%81%AF%E3%80%81%E3%82%AC%E3%82%B9%E3%81%AB%E3%82%88%E3%82%8B%E3%82%B3%E3%82%B9%E3%83%88%E3%82%92%E6%94%AF%E6%89%95%E3%82%8F%E3%81%AA%E3%81%91%E3%82%8C%E3%81%B0%E3%81%AA%E3%82%8A%E3%81%BE%E3%81%9B%E3%82%93%E3%80%82%20%E3%83%A1%E3%83%A2%E3%83%AA%E3%81%AF%E5%A4%A7%E3%81%8D%E3%81%8F%E3%81%AA%E3%82%8C%E3%81%B0%E3%81%AA%E3%82%8B%E3%81%BB%E3%81%A9%E3%82%B3%E3%82%B9%E3%83%88%E3%81%8C%E9%AB%98%E3%81%8F%E3%81%AA%E3%82%8A%E3%81%BE%E3%81%99%EF%BC%88%E4%BA%8C%E6%AC%A1%E9%96%A2%E6%95%B0%E7%9A%84%E3%81%AB%E3%82%B9%E3%82%B1%E3%83%BC%E3%83%AB%E3%81%99%E3%82%8B%EF%BC%89%E3%80%82))。簡易実装では固定長かつガス消費も一律にしているため、その部分は省略しています。

- **ストレージアクセス** (`SLOAD`, `SSTORE`): `SLOAD(0x54)`はスタックトップのキーを取り出し、ストレージマップから該当する値を読み込んでスタックに積みます。`SSTORE(0x55)`はスタックトップのキーとその下の値を取り出し、ストレージマップに保存します。ここではZigの`std.HashMap`を用いて`u256`→`u256`のマッピングを実現しています。初期化に`std.heap.page_allocator`という簡易なアロケータを使っている点はZig特有ですが、要はヒープ上にハッシュマップを確保しています。ストレージアクセス命令もメモリアクセス同様、本来は高額なガスを消費し、特にSSTOREは書き込み状況により異なる複雑なコスト計算があります ([スマートコントラクトの紹介 — Solidity 0.8.21 ドキュメント](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html#:~:text=%E5%90%84%E3%82%A2%E3%82%AB%E3%82%A6%E3%83%B3%E3%83%88%E3%81%AB%E3%81%AF%20%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%20%E3%81%A8%E5%91%BC%E3%81%B0%E3%82%8C%E3%82%8B%E3%83%87%E3%83%BC%E3%82%BF%E9%A0%98%E5%9F%9F%E3%81%8C%E3%81%82%E3%82%8A%E3%80%81%E9%96%A2%E6%95%B0%E5%91%BC%E3%81%B3%E5%87%BA%E3%81%97%E3%82%84%E3%83%88%E3%83%A9%E3%83%B3%E3%82%B6%E3%82%AF%E3%82%B7%E3%83%A7%E3%83%B3%E9%96%93%E3%81%A7%E6%B0%B8%E7%B6%9A%E7%9A%84%E3%81%AB%E4%BD%BF%E7%94%A8%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82%20storage%E3%81%AF256%E3%83%93%E3%83%83%E3%83%88%E3%81%AE%E3%83%AF%E3%83%BC%E3%83%89%E3%82%92256%E3%83%93%E3%83%83%E3%83%88%E3%81%AE%E3%83%AF%E3%83%BC%E3%83%89%E3%81%AB%E3%83%9E%E3%83%83%E3%83%94%E3%83%B3%E3%82%B0%E3%81%99%E3%82%8Bkey,%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E5%86%85%E3%81%8B%E3%82%89%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%E3%82%92%E5%88%97%E6%8C%99%E3%81%A7%E3%81%8D%E3%81%9A%E3%80%81%E8%AA%AD%E3%81%BF%E8%BE%BC%E3%81%BF%E3%81%AB%E3%81%AF%E6%AF%94%E8%BC%83%E7%9A%84%E3%82%B3%E3%82%B9%E3%83%88%E3%81%8C%E3%81%8B%E3%81%8B%E3%82%8A%E3%80%81%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%E3%81%AE%E5%88%9D%E6%9C%9F%E5%8C%96%E3%82%84%E5%A4%89%E6%9B%B4%E3%81%AB%E3%81%AF%E3%81%95%E3%82%89%E3%81%AB%E3%82%B3%E3%82%B9%E3%83%88%E3%81%8C%E3%81%8B%E3%81%8B%E3%82%8A%E3%81%BE%E3%81%99%E3%80%82%20%E3%81%93%E3%81%AE%E3%82%B3%E3%82%B9%E3%83%88%E3%81%AE%E3%81%9F%E3%82%81%E3%80%81%E6%B0%B8%E7%B6%9A%E7%9A%84%E3%81%AA%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%E3%81%AB%E4%BF%9D%E5%AD%98%E3%81%99%E3%82%8B%E3%82%82%E3%81%AE%E3%81%AF%E3%80%81%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%8C%E5%AE%9F%E8%A1%8C%E3%81%99%E3%82%8B%E3%81%9F%E3%82%81%E3%81%AB%E5%BF%85%E8%A6%81%E3%81%AA%E3%82%82%E3%81%AE%E3%81%AB%E9%99%90%E5%AE%9A%E3%81%99%E3%82%8B%E3%81%B9%E3%81%8D%E3%81%A7%E3%81%99%E3%80%82%20%E6%B4%BE%E7%94%9F%E3%81%99%E3%82%8B%E8%A8%88%E7%AE%97%E3%80%81%E3%82%AD%E3%83%A3%E3%83%83%E3%82%B7%E3%83%B3%E3%82%B0%E3%80%81%E3%82%A2%E3%82%B0%E3%83%AA%E3%82%B2%E3%83%BC%E3%83%88%E3%81%AA%E3%81%A9%E3%81%AE%E3%83%87%E3%83%BC%E3%82%BF%E3%81%AF%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AE%E5%A4%96%E3%81%AB%E4%BF%9D%E5%AD%98%E3%81%97%E3%81%BE%E3%81%99%E3%80%82%20%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AF%E3%80%81%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E4%BB%A5%E5%A4%96%E3%81%AE%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%E3%81%AB%E5%AF%BE%E3%81%97%E3%81%A6%E8%AA%AD%E3%81%BF%E6%9B%B8%E3%81%8D%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%9B%E3%82%93%E3%80%82))。ここでは簡単化のため、一律のガス消費（上記では各命令ごとに仮に1ガス）で処理しています。

- **コールデータアクセス** (`CALLDATALOAD`): コールデータ（呼び出し時の入力）から32バイトを読み込む命令です。Solidityで関数の引数を読み取る際などに使用されています。上記コードでは`CALLDATALOAD(0x35)`にて、スタックから読み込み開始オフセットを取得し、その位置から32バイトを`calldata`配列からコピーしています。`calldata`は`run`関数の引数で渡されるバイト列で、呼び出し元が事前に構築します（後述しますが、関数識別子や引数をエンコードしたデータです）。`CALLDATALOAD`は範囲外を読み込もうとした場合は足りない部分をゼロ埋めする仕様なので、コピー時に配列範囲をチェックし、足りなければ残りは0のままにしています。

- **ジャンプ命令** (`JUMP`, `JUMPI`, `JUMPDEST`): コントラクト内のコードの分岐やループに使われます。`JUMP(0x56)`はスタックトップの値をジャンプ先アドレス（PC値）として設定します。`JUMPI(0x57)`は条件付きジャンプで、スタックトップの条件値が0でない場合のみ2番目の値をPCに設定します。ジャンプ先は必ず`JUMPDEST(0x5B)`命令の位置でなければなりません ([スマートコントラクトの紹介 — Solidity 0.8.21 ドキュメント](https://docs.soliditylang.org/ja/latest/introduction-to-smart-contracts.html#:~:text=EVM%E3%81%AF%E3%83%AC%E3%82%B8%E3%82%B9%E3%82%BF%E3%83%9E%E3%82%B7%E3%83%B3%E3%81%A7%E3%81%AF%E3%81%AA%E3%81%8F%E3%80%81%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%83%9E%E3%82%B7%E3%83%B3%E3%81%AA%E3%81%AE%E3%81%A7%E3%80%81%E3%81%99%E3%81%B9%E3%81%A6%E3%81%AE%E8%A8%88%E7%AE%97%E3%81%AF%20%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%20%E3%81%A8%E5%91%BC%E3%81%B0%E3%82%8C%E3%82%8B%E3%83%87%E3%83%BC%E3%82%BF%E9%A0%98%E5%9F%9F%E3%81%A7%E8%A1%8C%E3%82%8F%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82%20%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AE%E6%9C%80%E5%A4%A7%E3%82%B5%E3%82%A4%E3%82%BA%E3%81%AF1024%E8%A6%81%E7%B4%A0%E3%81%A7%E3%80%81256%E3%83%93%E3%83%83%E3%83%88%E3%81%AE%E3%83%AF%E3%83%BC%E3%83%89%E3%82%92%E5%90%AB%E3%81%BF%E3%81%BE%E3%81%99%E3%80%82%20%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%B8%E3%81%AE%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%AF%E6%AC%A1%E3%81%AE%E3%82%88%E3%81%86%E3%81%AB%E4%B8%8A%E7%AB%AF%E3%81%AB%E5%88%B6%E9%99%90%E3%81%95%E3%82%8C%E3%81%A6%E3%81%84%E3%81%BE%E3%81%99%E3%80%82,%E4%B8%80%E7%95%AA%E4%B8%8A%E3%81%AE16%E5%80%8B%E3%81%AE%E8%A6%81%E7%B4%A0%E3%81%AE1%E3%81%A4%E3%82%92%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AE%E4%B8%80%E7%95%AA%E4%B8%8A%E3%81%AB%E3%82%B3%E3%83%94%E3%83%BC%E3%81%97%E3%81%9F%E3%82%8A%E3%80%81%E4%B8%80%E7%95%AA%E4%B8%8A%E3%81%AE%E8%A6%81%E7%B4%A0%E3%82%92%E3%81%9D%E3%81%AE%E4%B8%8B%E3%81%AE16%E5%80%8B%E3%81%AE%E8%A6%81%E7%B4%A0%E3%81%AE1%E3%81%A4%E3%81%A8%E5%85%A5%E3%82%8C%E6%9B%BF%E3%81%88%E3%81%9F%E3%82%8A%E3%81%99%E3%82%8B%E3%81%93%E3%81%A8%E3%81%8C%E5%8F%AF%E8%83%BD%E3%81%A7%E3%81%99%E3%80%82%20%E3%81%9D%E3%82%8C%E4%BB%A5%E5%A4%96%E3%81%AE%E6%93%8D%E4%BD%9C%E3%81%A7%E3%81%AF%E3%80%81%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%8B%E3%82%89%E6%9C%80%E4%B8%8A%E4%BD%8D%E3%81%AE2%E8%A6%81%E7%B4%A0%EF%BC%88%E6%93%8D%E4%BD%9C%E3%81%AB%E3%82%88%E3%81%A3%E3%81%A6%E3%81%AF1%E8%A6%81%E7%B4%A0%E3%80%81%E3%81%BE%E3%81%9F%E3%81%AF%E3%81%9D%E3%82%8C%E4%BB%A5%E4%B8%8A%EF%BC%89%E3%82%92%E5%8F%96%E3%82%8A%E5%87%BA%E3%81%97%E3%80%81%E3%81%9D%E3%81%AE%E7%B5%90%E6%9E%9C%E3%82%92%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AB%E3%83%97%E3%83%83%E3%82%B7%E3%83%A5%E3%81%97%E3%81%BE%E3%81%99%E3%80%82%20%E3%82%82%E3%81%A1%E3%82%8D%E3%82%93%E3%80%81%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AE%E8%A6%81%E7%B4%A0%20%E3%82%92%E3%82%B9%E3%83%88%E3%83%AC%E3%83%BC%E3%82%B8%E3%82%84%E3%83%A1%E3%83%A2%E3%83%AA%E3%81%AB%E7%A7%BB%E5%8B%95%E3%81%95%E3%81%9B%E3%81%A6%E3%80%81%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AB%E6%B7%B1%E3%81%8F%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%99%E3%82%8B%E3%81%93%E3%81%A8%E3%81%AF%E5%8F%AF%E8%83%BD%E3%81%A7%E3%81%99%E3%81%8C%E3%80%81%E6%9C%80%E5%88%9D%E3%81%AB%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AE%E6%9C%80%E4%B8%8A%E9%83%A8%E3%82%92%E5%8F%96%E3%82%8A%E9%99%A4%E3%81%8B%E3%81%9A%E3%81%AB%E3%80%81%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%81%AE%E6%B7%B1%E3%81%84%E3%81%A8%E3%81%93%E3%82%8D%E3%81%AB%E3%81%82%E3%82%8B%E4%BB%BB%E6%84%8F%E3%81%AE%E8%A6%81%E7%B4%A0%E3%81%AB%E3%82%A2%E3%82%AF%E3%82%BB%20%E3%82%B9%E3%81%99%E3%82%8B%E3%81%93%E3%81%A8%E3%81%AF%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%9B%E3%82%93%E3%80%82))。本実装でも最低限それをチェックし、不正なジャンプ先なら停止しています。`JUMPDEST`は何もしないただのラベルのような命令で、ジャンプ可能位置を示すマーカーとして使われます。Solidityが生成するバイトコードでは関数の先頭や分岐先に必ず配置されています。

- **停止/戻り値** (`STOP`, `RETURN`): `STOP(0x00)`は単に実行を終了します。一方`RETURN(0xF3)`は指定したメモリ範囲のデータを**戻り値**として返しつつ実行を終了します。`RETURN`ではスタックからオフセットと長さを取り出し、そのメモリ内容を`return_data`バッファにコピーしています。そしてループを抜けて`run`関数の戻り値としてそのデータスライスを返しています。EVMでは関数の戻り値やログデータの返却にこの命令が使われます。

以上で、簡易EVMエンジンの実装コードは完成です。ガス消費については上記では極めて大雑把に「命令ごとに1減らす」という処理を入れましたが、実際には各オペコードに固有のコストが設定されています ([How does Ethereum Virtual Machine (EVM) work? A deep dive into EVM Architecture and Opcodes | QuickNode Guides](https://www.quicknode.com/guides/ethereum-development/smart-contracts/a-dive-into-evm-architecture-and-opcodes#:~:text=,in%20wei))。例えば、`ADD`は3ガス、`MSTORE`は12ガス、`SLOAD`は100ガスといったように定義があります ([What OPCODES are available for the Ethereum EVM?](https://ethereum.stackexchange.com/questions/119/what-opcodes-are-available-for-the-ethereum-evm#:~:text=What%20OPCODES%20are%20available%20for,operation%200x04%20DIV%20Integer))（ハードフォークによって数値は変更されることがあります）。本実装では深追いしませんが、興味があればイエローペーパーのGas表や[Ethereum EVM Opcodeリファレンス](https://github.com/crytic/evm-opcodes)を参照してください。

### 実装の簡略化と限界

上記の実装は学習目的の簡易EVMであり、実際のEVMと比べて多くの簡略化をしています。例えば:

- 未実装のオペコードが多数あります（論理演算、比較演算、SHA3ハッシュ、CALL関連の命令など）。
- Gas計算が大幅に簡略化されています。本来はメモリ拡張やストレージ書き込み、各種命令で異なるガスコスト計算があります。
- エラーハンドリングが単純化されています。実コードではスタックアンダーフローや不正ジャンプ時には例外リターンし、状態を巻き戻す処理が必要ですが、ここではただループを抜けるだけです。
- 外部との相互作用（CALL/DELEGATECALLによる他コントラクト呼び出しやログ出力、CREATEによるコントラクト生成など）は一切扱っていません。
- 署名検証やトランザクションの概念も省いています。あくまで「単一のEVMコードを実行する」ことに特化しています。

これらの制限により、セキュリティや正確性は本物のEVMに比べて劣りますが、EVMの基本動作を理解するには十分でしょう。次章では、この実装を使って実際にSolidityで書いたスマートコントラクトのバイトコードを動かしてみます。

## 4. スマートコントラクトのデプロイと実行

それでは、先ほど実装した簡易EVMエンジンを使ってSolidity製のスマートコントラクトを実行してみましょう。ここではデモとして**二つの数の加算を行う関数**を持つごく簡単なコントラクトを例にします。

### Solidityでコントラクトを記述

以下にSolidityでシンプルなコントラクトを示します。このコントラクト`Adder`は、`add(uint256 a, uint256 b) public pure returns (uint256)`という関数を持ち、入力された2つの整数の和を返すだけのものです。

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
$ solc --bin SimpleAdder.sol -o output
```

このコマンドは、Solidityコンパイラに`SimpleAdder.sol`をコンパイルしてバイトコードを`output`ディレクトリに出力するよう指示しています。`output`ディレクトリ内に`Adder.bin`（コントラクトのバイトコード）というファイルが生成されるはずです。**注意:** `--bin`オプションだけだとデプロイ用のバイトコード（constructorを含むコード）が出力されます。関数を呼び出す際に実行される**ランタイムバイトコード**のみを取得したい場合は、`solc --bin-runtime`を使います。今回はconstructorを持たずシンプルなので`--bin`出力でも差し支えありません。

コンパイルが成功したら、出力されたバイトコードを確認してみましょう。内容は16進数の文字列になっているはずです。例えば（Solidityバージョン等によって異なりますが）以下のような形になります。

```
6080604052348015600f57600080fd5b5060...（中略）...150056fea2646970667358221220...
```

非常に長いですが、これが`Adder`コントラクトのバイトコードです。前半はコントラクトデプロイ時に実行されるコード（constructorがないので単にランタイムコードを返す処理）で、`fe`以降に続く部分がランタイムコード本体です。今回は詳細な解析は行いませんが、EVMアセンブリを覗いてみると`ADD (0x01)`命令などが含まれているのが確認できます。

それでは、このバイトコードを先ほど実装した`run`関数で実行してみます。

### 簡易EVMでの実行

Zig側で、コンパイルして得たバイトコードと、関数呼び出しの入力データを用意し、`run`関数に渡します。一般にコントラクトの関数を呼び出す際、EVMに与える入力データ（call data）は以下のように構成されます ([solidity - What is a good implementation to get function signatures from contract ABI? - Ethereum Stack Exchange](https://ethereum.stackexchange.com/questions/39346/what-is-a-good-implementation-to-get-function-signatures-from-contract-abi#:~:text=getState%20add%20,state%27%2C))。

- 最初の4バイト: 呼び出す関数を表す**関数セレクタ**（関数識別子）。関数名と引数型から計算される固定の識別子です。
- 残り: 各引数の値を32バイトにエンコードしたものを順番に並べたもの。

今回の`add(uint256,uint256)`関数の場合、関数セレクタは`"add(uint256,uint256)"`という文字列のKeccak-256ハッシュの先頭4バイトで決まります。計算すると`0x771602f7`という値になります ([solidity - What is a good implementation to get function signatures from contract ABI? - Ethereum Stack Exchange](https://ethereum.stackexchange.com/questions/39346/what-is-a-good-implementation-to-get-function-signatures-from-contract-abi#:~:text=getState%20add%20,state%27%2C))。続いて、例えば引数`a = 10`、`b = 32`を与えたい場合、それぞれ32バイトにパディングされた表現を付加します。10は16進で`0x0a`、32は`0x20`ですので、32バイト表現ではそれぞれ`0x000...00a`（最後の1バイトが0×0a）と`0x000...020`になります。つまり、呼び出しデータ全体を16進で表すと次のようになります ([solidity - What is a good implementation to get function signatures from contract ABI? - Ethereum Stack Exchange](https://ethereum.stackexchange.com/questions/39346/what-is-a-good-implementation-to-get-function-signatures-from-contract-abi#:~:text=0x771602f7000000000000000000000000000000000000000000000000000000000000000a00%2000000000000000000000000000000000000000000000000000000000000020))。

```
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

上記の`main`では、`bytecode`にコンパイルして得たAdderコントラクトのバイトコード（ランタイム部分も含む）をバイト列として定義しています（非常に長いので途中省略していますが、実際には全部貼り付けます）。次に`input_data`を、先ほど説明した関数セレクタ＋引数の形式で構築しています。そして`run(bytecode, input_data)`を呼び出し、その戻り値（バイト列）を取得しています。

最後に、その`result`バイト列を16進で出力しています。EVM上の関数戻り値は32バイト長のデータ（今回なら計算結果の整数を32バイトにエンコードしたもの）なので、それをそのまま表示する形です。

ではこのプログラムをビルド・実行してみましょう。Zigファイルを`evm_main.zig`とすると、以下のようにコンパイル＆実行します。

```bash
$ zig build-exe evm_main.zig
$ ./evm_main
Return data (hex): 000000000000000000000000000000000000000000000000000000000000002a
```

出力された`Return data`がずらっと並ぶ0と`2a`という値になっていることがわかります。`0x2a`は10進数で42に相当します。元の関数呼び出しは`add(10, 32)`でしたので、戻り値が42となっているのは正しい結果です 🎉。

このようにして、Solidityで書いたスマートコントラクト（の一部機能）を、Zigで実装したEVMエンジン上で実行できました。もちろん、実際のEthereumノードが行っている処理のごく一部を真似ただけですが、EVMバイトコードの動作原理が体験できたと思います。

**デバッグ:** 実装がうまく動かない場合、EVMエンジンのデバッグには工夫が必要です。今回のようなシンプルなコードであれば、`std.debug.print`を使って各ステップでのスタックやPC、ガスの状態を出力するのが有効です。例えばループ内で`std.debug.print("PC={d} Opcode={x} StackTop={x}\n", .{ pc, opcode, stack[sp-1] })`のようなログを入れると、命令実行の追跡ができます。また、Solidity側のアセンブリ出力やEVMの各種リファレンスを見比べながら、どこで食い違いがあるかを探すのも勉強になります。

## 5. EVMの拡張と発展的な話題

以上のように、簡易EVMを実装しSolidityコントラクトを実行するところまで体験しました。本章では、実際のEVM実装との比較や、EVMに関する発展的な話題について触れてみます。

### 実際のEVM実装との比較

我々が実装したものは教育目的の極簡易版ですが、実際のEthereumクライアント（例えばGethやNethermind、Erigonなど）は独自の最適化を凝らしたEVMエンジンを持っています。多くの公式クライアントは**インタプリタ**方式でEVMバイトコードを実行していますが、そのパフォーマンス向上のために様々な工夫がされています。

例えば、Ethereum Foundationのチームが開発した**evmone**というC++製のEVM実装があります。evmoneでは命令実行ループの効率化やジャンプ先テーブルの事前解析、ガス計算の最適化などを行い、他の従来実装と比べて**約10倍もの高速化**を達成したという報告もありま ([Optimization techniques for EVM implementations · Devcon Archive: Ethereum Developer Conference](https://archive.devcon.org/archive/watch/5/optimization-techniques-for-evm-implementations/?playlist=Devcon%205#:~:text=A%20number%20of%20optimization%20techniques,them%20even%20to%20interpreted%20languages))】。一方で、EthereumJSやPyEthereumのようにJavaScriptやPythonで書かれた実装もありますが、こちらは主にテストや学習目的であり本番ネットワークでブロックを検証する用途には向きません。

今回Zigで作成した実装は非常に単純であり、実用的な性能は期待できません。しかし、低レベル言語であるZigはC/C++に匹敵するパフォーマンスが出せるため、もしこの実装を拡張し高度な最適化を施せば、高速なEVMエンジンに育てることも可能でしょう。実際に**zEVM* ([rauljordan/zevm: Zig implementation of the Ethereum Virtual Machine](https://github.com/rauljordan/zevm#:~:text=rauljordan%2Fzevm%3A%20Zig%20implementation%20of%20the,the%20work%20from%20Revolutionary))】や**zig-evm* ([cryptuon/zig-evm: An experimental EVM implementation in ziglang](https://github.com/cryptuon/zig-evm#:~:text=cryptuon%2Fzig,to%20provide%20a%20lightweight))】といったプロジェクトでZigによるEVM実装が試みられています。

### EVMの最適化手法

EVMの最適化には大きく二方向あります。1つは**EVM自体の実装を速くする**こと、もう1つは**EVM上で動くコントラクトのガス消費を減らす（効率の良いコードを書く）**ことです。

前者については、先述のevmoneのようにインタプリタを工夫する方法に加え、**JIT（Just-In-Time）コンパイル**技術を用いるアプローチもあります。かつてEthereumのC++クライアントには**EVM JIT**が組み込まれ、ホスト上のネイティブな機械語にEVMバイトコードをその場で変換することで高速実行を図っていました。最近ではParadigm社が研究する**revmc**というコンパイラが、EVMバイトコードを事前にネイティブコードへコンパイル（AOT：Ahead-Of-Time）し、1.9倍から最大19倍の性能向上を示したとの報告もありま ([Releasing Revmc - Paradigm](https://www.paradigm.xyz/2024/06/revmc#:~:text=Today%2C%20we%E2%80%99re%20excited%20to%20open,shine%20in%20computationally%20heavy%20workloads))】。JIT/AOTによる高速化は、処理速度と引き換えに実装の複雑さやセキュリティ上の考慮点（JIT固有の脆弱性リスクなど）もありますが、ブロックチェイン全体のスループット向上に直結するため活発に研究されています。

一方、後者の「スマートコントラクトのガス消費を抑える」という視点では、Solidityコンパイラの最適化改善や、開発者がガス効率の良いコードを書くことが重要です。例えば同じ処理を行うにもガス単価の安い命令を使う、ストレージアクセスを減らしメモリや計算で代替する、ループ回数を減らすアルゴリズムを採用する等が考えられます。EVM自体は仕様上決められたガスコストで動くため、ソフト側で工夫する余地があります。SolidityやVyperなど高級言語のコンパイラも、年々最適化が進み無駄な命令を削除したりガスの高い処理を置き換えたりする改良が加えられています。

### zkEVMとEVMの進化

近年注目されている技術トピックとして**zkEVM**があります。zkEVMとは、**Zero-Knowledge Proof（ゼロ知識証明）**を統合したEVM互換の実行環境のことで ([Kakarot zkEVM の詳細解説：Starknet の EVM 互換の道 - ChainCatcher](https://www.chaincatcher.com/ja/article/2097197#:~:text=%E3%82%B0%E3%83%A9%E3%83%A0%E3%82%92%E5%88%B6%E5%BE%A1%E3%81%95%E3%82%8C%E3%81%9F%E4%BA%92%E6%8F%9B%E6%80%A7%E3%81%AE%E3%81%82%E3%82%8B%E7%92%B0%E5%A2%83%E3%81%A7%E5%AE%9F%E8%A1%8C%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99%E3%80%82%E3%82%A4%E3%83%BC%E3%82%B5%E3%83%AA%E3%82%A2%E3%83%A0%E4%BB%AE%E6%83%B3%E3%83%9E%E3%82%B7%E3%83%B3%EF%BC%88EVM%EF%BC%89%E3%81%AF%E3%80%81%E3%82%A4%E3%83%BC%E3%82%B5%E3%83%AA%E3%82%A2%E3%83%A0%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%82%92%E5%AE%9F%E8%A1%8C%E3%81%99%E3%82%8B%E3%81%9F%E3%82%81%E3%81%AE%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%83%99%E3%83%BC%E3%82%B9%E3%81%AE%E4%BB%AE%E6%83%B3%E3%83%9E%E3%82%B7%E3%83%B3%20%E3%81%A7%E3%81%99%E3%80%82%20))】。具体的には、通常は全ノードがEVMを実行してトランザクションを検証するところを、EVMの実行プロセス自体を暗号学的証明（有効性証明）によって保証しようという試みで ([Kakarot zkEVM の詳細解説：Starknet の EVM 互換の道 - ChainCatcher](https://www.chaincatcher.com/ja/article/2097197#:~:text=,2%E3%81%A7%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%81%AE%E5%AE%9F%E8%A1%8C%E3%82%92%E3%82%B5%E3%83%9D%E3%83%BC%E3%83%88%E3%81%99%E3%82%8B%E4%BB%AE%E6%83%B3%E3%83%9E%E3%82%B7%E3%83%B3%E3%81%B8%E3%81%AE%E9%9C%80%E8%A6%81%E3%81%AB%E3%81%82%E3%82%8A%E3%81%BE%E3%81%99%E3%80%82%E3%81%BE%E3%81%9F%E3%80%81%E4%B8%80%E9%83%A8%E3%81%AE%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88%E3%81%AF%E3%80%81EVM%E3%81%AE%E5%BA%83%E7%AF%84%20%E3%81%AA%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E3%82%A8%E3%82%B3%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E3%82%92%E6%B4%BB%E7%94%A8%E3%81%97%E3%80%81%E3%82%BC%E3%83%AD%E7%9F%A5%E8%AD%98%E8%A8%BC%E6%98%8E%E3%81%AB%E3%82%88%E3%82%8A%E8%A6%AA%E3%81%97%E3%81%BF%E3%82%84%E3%81%99%E3%81%84%E5%91%BD%E4%BB%A4%E3%82%BB%E3%83%83%E3%83%88%E3%82%92%E8%A8%AD%E8%A8%88%E3%81%99%E3%82%8B%E3%81%9F%E3%82%81%E3%81%ABzkEVM%E3%82%92%E9%81%B8%E6%8A%9E%E3%81%97%E3%81%A6%E3%81%84%E3%81%BE%E3%81%99%E3%80%82))】。これにより、ブロックチェイン上の全検証者が逐一EVM計算を再現しなくても、証明を検証するだけで正しい結果であることを確認できるようになります。

zkEVMは主にLayer2（レイヤー2）のスケーリングソリューションとして期待されています。代表的なプロジェクトにPolygon zkEVMやScroll、StarkWareの**Kakarot**などがあります。例えばKakarotはStarknet上にCairo言語で実装されたEVM互換機で、CairoスマートコントラクトとしてEVMのスタックやメモリ、命令実行をシミュレートするもので、zkEVMによってLayer2上でEVMをそのまま動かしつつ、各トランザクションの有効性をロールアップ（一括証明）することで、Ethereumメインネットよりも高速・安価な処理を実現できます。

Ethereum自体の進化という点では、**イスタンブール**や**ロンドン**といったハードフォークでEVMのガスコスト調整や新命令の追加が行われてきました。直近では`RETURNDATA`系命令の導入や`CREATE2`命令の追加などがありました。また将来的な提案として、EVMのバイトコードフォーマットを改良する**EVM Object Format (EOF)**や、高レベル命令セットへの置き換え（かつて議論されたeWASMへの移行案）などもあります。しかし互換性の問題から、EthereumメインネットのEVMは慎重にアップグレードが進められています。現在はEthereum2.0移行に伴いコンセンサス層が大きく変わりましたが、実行層としてのEVMは従来の仕組みを維持しています。その意味で、EVMは依然としてEthereumエコシステムの根幹であり続けています。

### おわりに

本記事では、Zig言語を使ってEVMの簡易実装に挑戦し、Solidityスマートコントラクトの実行を確認しました。EVMの仕組み（スタックマシン、バイトコード、ガスモデルなど）を低レベルから体験することで、普段何気なくSolidityを書くときにもその裏側で何が行われているのかイメージできるようになったのではないでしょうか。

実装したEVMエンジンは機能的に不完全ですが、ソースコードを拡張していけば更なる命令のサポートや最適化も実現できます。興味があれば、自分でオペコードを追加実装したり、別のSolidityコントラクト（例えば状態変数を扱うものやループを含むもの）を実行してみたりして、理解を深めてみてください。公式のEVM実装や先人たちのプロジェクトも参考になるでしょう。

スマートコントラクトの世界は、言語レベル（Solidity/Vyperなど）から下層のEVM、そしてブロックチェイン全体のメカニズムまで多層にわたります。今回学んだEVMの知識は、その中間部分を支える重要なピースです。ぜひ今後の開発や学習に役立ててください。ありがとうございました ([How does Ethereum Virtual Machine (EVM) work? A deep dive into EVM Architecture and Opcodes | QuickNode Guides](https://www.quicknode.com/guides/ethereum-development/smart-contracts/a-dive-into-evm-architecture-and-opcodes#:~:text=The%20EVM%20is%20contained%20within,machine%20architecture%20consisting%20of%20components)) ([Kakarot zkEVM の詳細解説：Starknet の EVM 互換の道 - ChainCatcher](https://www.chaincatcher.com/ja/article/2097197#:~:text=%E3%82%B0%E3%83%A9%E3%83%A0%E3%82%92%E5%88%B6%E5%BE%A1%E3%81%95%E3%82%8C%E3%81%9F%E4%BA%92%E6%8F%9B%E6%80%A7%E3%81%AE%E3%81%82%E3%82%8B%E7%92%B0%E5%A2%83%E3%81%A7%E5%AE%9F%E8%A1%8C%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%99%E3%80%82%E3%82%A4%E3%83%BC%E3%82%B5%E3%83%AA%E3%82%A2%E3%83%A0%E4%BB%AE%E6%83%B3%E3%83%9E%E3%82%B7%E3%83%B3%EF%BC%88EVM%EF%BC%89%E3%81%AF%E3%80%81%E3%82%A4%E3%83%BC%E3%82%B5%E3%83%AA%E3%82%A2%E3%83%A0%E3%82%B9%E3%83%9E%E3%83%BC%E3%83%88%E3%82%B3%E3%83%B3%E3%83%88%E3%83%A9%E3%82%AF%E3%83%88%E3%82%92%E5%AE%9F%E8%A1%8C%E3%81%99%E3%82%8B%E3%81%9F%E3%82%81%E3%81%AE%E3%82%B9%E3%82%BF%E3%83%83%E3%82%AF%E3%83%99%E3%83%BC%E3%82%B9%E3%81%AE%E4%BB%AE%E6%83%B3%E3%83%9E%E3%82%B7%E3%83%B3%20%E3%81%A7%E3%81%99%E3%80%82%20))】
