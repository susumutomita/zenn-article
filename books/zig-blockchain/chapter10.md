---
title: "EVM実行エンジンを実装する"
free: true
---

この章では引き続き、**Zig**プログラミング言語を用いてEthereum Virtual Machine (EVM)を実装します。

### EVM実行エンジンの実装

EVMの実行エンジン部分は、オペコードの読み取り、解釈、実行を担当します。主な機能は以下の通りです。

- オペコード定数の定義: EVMで使用される命令コードを定数として定義します（STOP, ADD, MULなど）
- 実行ループ: バイトコードを1命令ずつ処理し、コンテキストを更新していきます
- 命令処理: 各オペコードに対応する処理をswitch文で実装します

下記は実行エンジンの核となる部分です。

`src/evm.zig`を新規に作成し、以下のように記述します。

```zig
//! Ethereum Virtual Machine (EVM) 実装
//!
//! このモジュールはEthereumのスマートコントラクト実行環境であるEVMを
//! 簡易的に実装します。EVMバイトコードを解析・実行し、スタックベースの
//! 仮想マシンとして動作します。

const std = @import("std");
const logger = @import("logger.zig");
const evm_types = @import("evm_types.zig");
// u256型を別名で使用して衝突を回避
const EVMu256 = evm_types.EVMu256;
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
    @memcpy(result, context.returndata.items);
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
                try context.stack.push(EVMu256.zero());
            } else {
                // 簡易版ではu64の範囲のみサポート
                if (a.hi == 0 and b.hi == 0) {
                    const result = EVMu256.fromU64(@intCast(a.lo / b.lo));
                    try context.stack.push(result);
                } else {
                    // 本来はより複雑な処理が必要
                    try context.stack.push(EVMu256.zero());
                }
            }
            context.pc += 1;
        },

        // PUSH1: 1バイトをスタックにプッシュ
        Opcode.PUSH1 => {
            if (context.pc + 1 >= context.code.len) return EVMError.InvalidOpcode;
            const value = EVMu256.fromU64(context.code[context.pc + 1]);
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

            var result = EVMu256.zero();
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

// シンプルなEVM実行テスト
test "Simple EVM execution" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    // シンプルなバイトコード: PUSH1 0x05, PUSH1 0x03, ADD, PUSH1 0x00, MSTORE, PUSH1 0x20, PUSH1 0x00, RETURN
    // 意味: 5 + 3 = 8 を計算し、メモリに格納して返す
    const bytecode = [_]u8{
        0x60, 0x05, // PUSH1 5
        0x60, 0x03, // PUSH1 3
        0x01, // ADD
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    const calldata = [_]u8{};

    // EVMを実行し、戻り値を取得
    const result = try execute(allocator, &bytecode, &calldata, 100000);
    defer allocator.free(result);

    // 結果をEVMu256形式で解釈
    var value = EVMu256{ .hi = 0, .lo = 0 };
    if (result.len >= 32) {
        // 上位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i];
            value.hi |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }

        // 下位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i + 16];
            value.lo |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }
    }

    // 結果が8（5+3）になっていることを確認
    try std.testing.expect(value.hi == 0);
    try std.testing.expect(value.lo == 8);
}

// 乗算のテスト
test "EVM multiplication" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    // バイトコード: PUSH1 0x07, PUSH1 0x06, MUL, PUSH1 0x00, MSTORE, PUSH1 0x20, PUSH1 0x00, RETURN
    // 意味: 7 * 6 = 42 を計算し、メモリに格納して返す
    const bytecode = [_]u8{
        0x60, 0x07, // PUSH1 7
        0x60, 0x06, // PUSH1 6
        0x02, // MUL
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    const calldata = [_]u8{};
    const result = try execute(allocator, &bytecode, &calldata, 100000);
    defer allocator.free(result);

    // 結果をEVMu256形式で解釈
    var value = EVMu256{ .hi = 0, .lo = 0 };
    if (result.len >= 32) {
        // 上位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i];
            value.hi |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }

        // 下位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i + 16];
            value.lo |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }
    }

    // 結果が42（7*6）になっていることを確認
    try std.testing.expect(value.hi == 0);
    try std.testing.expect(value.lo == 42);
}

// ストレージ操作のテスト
test "EVM storage operations" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    // バイトコード:
    // PUSH1 0x2A, PUSH1 0x01, SSTORE, // キー1に42を保存
    // PUSH1 0x01, SLOAD,               // キー1の値をロード
    // PUSH1 0x00, MSTORE,              // メモリに保存
    // PUSH1 0x20, PUSH1 0x00, RETURN   // 戻り値を返す
    const bytecode = [_]u8{
        0x60, 0x2A, // PUSH1 42
        0x60, 0x01, // PUSH1 1
        0x55, // SSTORE
        0x60, 0x01, // PUSH1 1
        0x54, // SLOAD
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    const calldata = [_]u8{};
    const result = try execute(allocator, &bytecode, &calldata, 100000);
    defer allocator.free(result);

    // 結果をEVMu256形式で解釈
    var value = EVMu256{ .hi = 0, .lo = 0 };
    if (result.len >= 32) {
        // 上位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i];
            value.hi |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }

        // 下位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i + 16];
            value.lo |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }
    }

    // 結果が42になっていることを確認
    try std.testing.expect(value.hi == 0);
    try std.testing.expect(value.lo == 42);
}

// 複数のオペコード実行テスト
test "EVM multiple operations" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    // バイトコード:
    // PUSH1 0x0A, PUSH1 0x0B, ADD,    // 10 + 11 = 21
    // PUSH1 0x03, MUL,                // 21 * 3 = 63
    // PUSH1 0x02, SWAP1, DIV,         // 63 / 2 = 31 (スワップしてスタックを調整)
    // PUSH1 0x00, MSTORE,             // 結果をメモリに保存
    // PUSH1 0x20, PUSH1 0x00, RETURN  // 戻り値を返す
    const bytecode = [_]u8{
        0x60, 0x0A, // PUSH1 10
        0x60, 0x0B, // PUSH1 11
        0x01, // ADD
        0x60, 0x03, // PUSH1 3
        0x02, // MUL
        0x60, 0x02, // PUSH1 2
        0x90, // SWAP1
        0x04, // DIV
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    const calldata = [_]u8{};
    const result = try execute(allocator, &bytecode, &calldata, 100000);
    defer allocator.free(result);

    // 結果をEVMu256形式で解釈
    var value = EVMu256{ .hi = 0, .lo = 0 };
    if (result.len >= 32) {
        // 上位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i];
            value.hi |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }

        // 下位16バイトを解析
        for (0..16) |i| {
            const byte_val = result[i + 16];
            value.lo |= @as(u128, byte_val) << @as(u7, @intCast((15 - i) * 8));
        }
    }

    // 結果が31（(10+11)*3/2）になっていることを確認
    try std.testing.expect(value.hi == 0);
    try std.testing.expect(value.lo == 31);
}
```

## Solidityコントラクトの実行

ここまでで基本的なEVM実装ができましたので、実際のSolidityコントラクトを実行してみましょう。

### Solidityコントラクトのコンパイルとデプロイ

まず、Solidityで書かれた簡単な加算コントラクトをコンパイルします。`contract/SimpleAdder2.sol`に以下のコントラクトがあります。

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleAdder {
    function add(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            return a + b;
        }
    }
}
```

このコントラクトをコンパイルするには、Solidityコンパイラ（solc）を使用します。以下のコマンドでバイトコードとABIを生成できます。

```bash
solc --bin --abi contract/SimpleAdder2.sol
```

コンパイル結果のバイトコードは、コントラクトのデプロイコード（コンストラクタ）とランタイムコード（実際の関数実装）の両方を含みます。

### 関数セレクタとABI

EVMでスマートコントラクトの関数を呼び出す際は、**関数セレクタ**という仕組みを使います。関数セレクタは、関数シグネチャ（関数名と引数の型）のKeccak-256ハッシュの最初の4バイトです。

例えば、`add(uint256,uint256)`の関数セレクタは`0x771602f7`です。これは以下のように計算されます。

1. 関数シグネチャ: `add(uint256,uint256)`
2. Keccak-256ハッシュ: `771602f70e831cbc32b27580e53e6e4b1aa9aec52a62c2329c181691bcd0720f`
3. 最初の4バイト: `0x771602f7`

関数を呼び出す際のcalldataは以下の構造になります。

- 最初の4バイト: 関数セレクタ
- 続く32バイト: 第1引数（uint256）
- 続く32バイト: 第2引数（uint256）

### アセンブリ版の実装

EVMの動作をより深く理解するために、Solidityのインラインアセンブリを使った実装も見てみましょう。`contract/SimpleAdderAssembly.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleAdderAssembly {
    fallback() external payable {
        assembly {
            // calldataが68バイト以上あることを確認
            if lt(calldatasize(), 68) {
                revert(0, 0)
            }

            // 関数セレクタを読み込み（最初の4バイト）
            let selector := shr(224, calldataload(0))

            // 第1引数を読み込み（オフセット4から32バイト）
            let a := calldataload(4)

            // 第2引数を読み込み（オフセット36から32バイト）
            let b := calldataload(36)

            // 加算を実行
            let result := add(a, b)

            // 結果をメモリのアドレス0に格納
            mstore(0, result)

            // メモリのアドレス0から32バイトを返す
            return(0, 32)
        }
    }
}
```

### EVMでのコントラクト実行テスト

では、実際にEVMでSolidityコントラクトを実行するテストを追加します。`src/evm.zig`の最後に以下のテストを追加します。

```zig
// Solidityコントラクトの実行テスト
test "Execute Solidity add function" {
    var arena = std.heap.ArenaAllocator.init(std.testing.allocator);
    defer arena.deinit();
    const allocator = arena.allocator();

    // SimpleAdderのランタイムバイトコード（抜粋）
    // 実際のバイトコードは solc でコンパイルして取得
    // ここでは関数ディスパッチャーと add 関数の実装を含む簡略版
    const runtime_bytecode = [_]u8{
        // 関数セレクタのチェック
        0x60, 0x00, // PUSH1 0x00
        0x35, // CALLDATALOAD
        0x60, 0xe0, // PUSH1 0xe0
        0x1c, // SHR
        0x63, 0x77, 0x16, 0x02, 0xf7, // PUSH4 0x771602f7 (add関数のセレクタ)
        0x14, // EQ
        0x60, 0x1b, // PUSH1 0x1b (ジャンプ先)
        0x57, // JUMPI
        0x00, // STOP (セレクタが一致しない場合)

        // add関数の実装 (0x1b)
        0x5b, // JUMPDEST
        0x60, 0x04, // PUSH1 0x04
        0x35, // CALLDATALOAD (第1引数)
        0x60, 0x24, // PUSH1 0x24
        0x35, // CALLDATALOAD (第2引数)
        0x01, // ADD
        0x60, 0x00, // PUSH1 0x00
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 0x20
        0x60, 0x00, // PUSH1 0x00
        0xf3, // RETURN
    };

    // 関数呼び出しのcalldata
    // 0x771602f7 (関数セレクタ) + 0x0000...0005 (a=5) + 0x0000...0003 (b=3)
    var calldata = std.ArrayList(u8).init(allocator);
    defer calldata.deinit();

    // 関数セレクタ
    try calldata.appendSlice(&[_]u8{ 0x77, 0x16, 0x02, 0xf7 });

    // 第1引数: 5 (32バイト、右詰め)
    try calldata.appendNTimes(0, 31);
    try calldata.append(5);

    // 第2引数: 3 (32バイト、右詰め)
    try calldata.appendNTimes(0, 31);
    try calldata.append(3);

    // EVMを実行
    const result = try execute(allocator, &runtime_bytecode, calldata.items, 100000);
    defer allocator.free(result);

    // 結果をチェック（5 + 3 = 8）
    try std.testing.expectEqual(@as(usize, 32), result.len);

    var value: u256 = 0;
    for (result[31], 0..) |byte, i| {
        value |= @as(u256, byte) << @intCast(i * 8);
    }

    try std.testing.expectEqual(@as(u256, 8), value);
}
```

### EVMデバッグツール

EVM実行をデバッグするために、`src/evm_debug.zig`にデバッグ用のユーティリティを実装します。これにより、EVMの実行状態やスタックの内容を確認できます。

```zig
//! EVMデバッグユーティリティ

const std = @import("std");
const evm_types = @import("evm_types.zig");
const EvmContext = evm_types.EvmContext;
const Opcode = @import("evm.zig").Opcode;

/// コンテキストの現在位置付近のオペコードを逆アセンブルするヘルパー関数
pub fn disassembleContext(context: *EvmContext, writer: anytype) !void {
    // PC前後の限定された範囲のオペコードを逆アセンブル
    const startPc = if (context.pc > 10) context.pc - 10 else 0;
    const endPc = if (context.pc + 10 < context.code.len) context.pc + 10 else context.code.len;
    var pc = startPc;

    while (pc < endPc) {
        const opcode = context.code[pc];
        if (pc == context.pc) {
            try writer.print("[0x{x:0>4}]: ", .{pc}); // 現在のPCをマーク
        } else {
            try writer.print("0x{x:0>4}: ", .{pc});
        }

        // オペコードに応じた出力
        switch (opcode) {
            Opcode.STOP => try writer.print("STOP", .{}),
            Opcode.ADD => try writer.print("ADD", .{}),
            Opcode.MUL => try writer.print("MUL", .{}),
            // ... 他のオペコード

            Opcode.PUSH1 => {
                if (pc + 1 < context.code.len) {
                    const value = context.code[pc + 1];
                    try writer.print("PUSH1 0x{x:0>2}", .{value});
                    pc += 1;
                } else {
                    try writer.print("PUSH1 <データ不足>", .{});
                }
            },

            else => {
                try writer.print("UNKNOWN 0x{x:0>2}", .{opcode});
            },
        }

        try writer.print("\n", .{});
        pc += 1;
    }
}

/// スタックの内容をダンプする
pub fn dumpStack(context: *EvmContext, writer: anytype) !void {
    try writer.print("Stack (depth: {}):\n", .{context.stack.depth()});

    var i: usize = 0;
    while (i < context.stack.sp) : (i += 1) {
        const value = context.stack.data[context.stack.sp - 1 - i];
        try writer.print("  [{d}]: 0x{x}\n", .{ i, value });
    }
}

/// EVMの実行状態を表示する
pub fn dumpContext(context: *EvmContext, writer: anytype) !void {
    try writer.print("=== EVM State ===\n", .{});
    try writer.print("PC: 0x{x:0>4}\n", .{context.pc});
    try writer.print("Gas: {d}\n", .{context.gas});
    try writer.print("Stopped: {}\n", .{context.stopped});

    if (context.error_msg) |msg| {
        try writer.print("Error: {s}\n", .{msg});
    }

    try writer.print("\n", .{});
    try dumpStack(context, writer);
    try writer.print("\n", .{});
    try disassembleContext(context, writer);
}
```

### EVMトレースの実装

EVMの実行をステップごとに追跡できるトレース機能も追加しましょう。これにより、各オペコードの実行前後のスタック状態やメモリの変化を記録できます。

```zig
/// EVMトレースログ
pub const TraceLog = struct {
    pc: usize,
    opcode: u8,
    gas: usize,
    stack_before: []const evm_types.EVMu256,
    stack_after: []const evm_types.EVMu256,
    memory_size: usize,
    allocator: std.mem.Allocator,

    pub fn deinit(self: *TraceLog) void {
        self.allocator.free(self.stack_before);
        self.allocator.free(self.stack_after);
    }
};

/// トレース機能付きEVM実行
pub fn executeWithTrace(
    allocator: std.mem.Allocator,
    code: []const u8,
    calldata: []const u8,
    gas_limit: usize
) !struct { result: []const u8, trace: []TraceLog } {
    var context = EvmContext.init(allocator, code, calldata);
    context.gas = gas_limit;
    defer context.deinit();

    var trace_logs = std.ArrayList(TraceLog).init(allocator);
    defer trace_logs.deinit();

    // 実行ループ
    while (context.pc < context.code.len and !context.stopped) {
        // 実行前のスタック状態を記録
        var stack_before = try allocator.alloc(evm_types.EVMu256, context.stack.sp);
        @memcpy(stack_before, context.stack.data[0..context.stack.sp]);

        const opcode = context.code[context.pc];
        const gas_before = context.gas;

        // ステップ実行
        try executeStep(&context);

        // 実行後のスタック状態を記録
        var stack_after = try allocator.alloc(evm_types.EVMu256, context.stack.sp);
        @memcpy(stack_after, context.stack.data[0..context.stack.sp]);

        // トレースログを追加
        try trace_logs.append(TraceLog{
            .pc = context.pc,
            .opcode = opcode,
            .gas = gas_before - context.gas,
            .stack_before = stack_before,
            .stack_after = stack_after,
            .memory_size = context.memory.data.items.len,
            .allocator = allocator,
        });
    }

    // 結果をコピー
    const result = try allocator.alloc(u8, context.returndata.items.len);
    @memcpy(result, context.returndata.items);

    return .{
        .result = result,
        .trace = try trace_logs.toOwnedSlice(),
    };
}
```

## ブロックチェインへのEVM統合

ここまでで独立したEVM実装ができました。次は、これを前章までで作成したブロックチェインに統合します。

### スマートコントラクトのデプロイと実行

ブロックチェインでスマートコントラクトを扱うには、以下の2つの操作が必要です。

1. **デプロイ**: コントラクトのバイトコードをブロックチェインに保存
2. **実行**: デプロイされたコントラクトの関数を呼び出す

これらの操作を`src/blockchain.zig`に追加します。

```zig
/// スマートコントラクトのデプロイ
pub fn deployContract(
    self: *Blockchain,
    deployer: []const u8,
    bytecode: []const u8,
    gas_limit: usize
) ![]const u8 {
    // コントラクトアドレスを生成（簡易版：デプロイヤーアドレス + nonce）
    var hasher = std.crypto.hash.sha3.Sha3_256.init(.{});
    hasher.update(deployer);
    hasher.update(&[_]u8{self.contracts.count()});
    var hash: [32]u8 = undefined;
    hasher.final(&hash);

    // アドレスは最後の20バイト
    const contract_address = hash[12..];

    // EVMでコンストラクタを実行
    const runtime_code = try evm.execute(
        self.allocator,
        bytecode,
        &[_]u8{},  // コンストラクタ引数なし
        gas_limit
    );

    // コントラクトコードを保存
    try self.contracts.put(
        try self.allocator.dupe(u8, contract_address),
        try self.allocator.dupe(u8, runtime_code)
    );

    return contract_address;
}

/// スマートコントラクトの呼び出し
pub fn callContract(
    self: *Blockchain,
    contract_address: []const u8,
    calldata: []const u8,
    gas_limit: usize
) ![]const u8 {
    // コントラクトコードを取得
    const code = self.contracts.get(contract_address) orelse
        return error.ContractNotFound;

    // EVMで実行
    return try evm.execute(
        self.allocator,
        code,
        calldata,
        gas_limit
    );
}
```

### トランザクションタイプの拡張

スマートコントラクト関連のトランザクションを扱うため、トランザクション構造を拡張します。

```zig
pub const TransactionType = enum {
    Transfer,        // 通常の送金
    ContractDeploy,  // コントラクトデプロイ
    ContractCall,    // コントラクト呼び出し
};

pub const Transaction = struct {
    from: []const u8,
    to: ?[]const u8,      // デプロイ時はnull
    amount: u64,
    data: []const u8,     // コントラクトコードまたはcalldata
    tx_type: TransactionType,
    gas_limit: u64,
    gas_price: u64,
    nonce: u64,
    signature: ?[]const u8,
};
```

## 実践的な使用例

最後に、完成したEVM統合ブロックチェインの使用例を示します。以下のコードは、Solidityで書かれた`SimpleAdder`コントラクトをデプロイし、`add(5, 3)`を呼び出して結果を取得するものです。

```zig
// メインプログラムでの使用例
pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // ブロックチェインの初期化
    var blockchain = try Blockchain.init(allocator);
    defer blockchain.deinit();

    // SimpleAdderコントラクトのバイトコード（コンパイル済み）
    const contract_bytecode = [_]u8{
        // ... Solidityコンパイラで生成されたバイトコード
    };

    // コントラクトをデプロイ
    const deployer = "0x1234567890123456789012345678901234567890";
    const contract_address = try blockchain.deployContract(
        deployer,
        &contract_bytecode,
        1_000_000  // ガスリミット
    );

    std.debug.print("コントラクトアドレス: 0x", .{});
    for (contract_address) |byte| {
        std.debug.print("{x:0>2}", .{byte});
    }
    std.debug.print("\n", .{});

    // add(5, 3)を呼び出すcalldataを作成
    var calldata = std.ArrayList(u8).init(allocator);
    defer calldata.deinit();

    // 関数セレクタ: 0x771602f7
    try calldata.appendSlice(&[_]u8{ 0x77, 0x16, 0x02, 0xf7 });

    // 引数1: 5
    try calldata.appendNTimes(0, 31);
    try calldata.append(5);

    // 引数2: 3
    try calldata.appendNTimes(0, 31);
    try calldata.append(3);

    // コントラクトを実行
    const result = try blockchain.callContract(
        contract_address,
        calldata.items,
        100_000  // ガスリミット
    );
    defer allocator.free(result);

    // 結果を表示（8が返るはず）
    if (result.len >= 32) {
        const value = result[31];
        std.debug.print("結果: {d}\n", .{value});
    }
}
```

## まとめ

この章では、Zigを使用してEthereum Virtual Machine (EVM)の簡易版を実装しました。実装した主な要素は以下の通りです。

1. 256ビット整数型: EVMの基本データ型を独自に実装
2. スタック・メモリ・ストレージ: EVMの3つの主要なデータ領域を実装
3. オペコード実行エンジン: バイトコードを解釈・実行する仮想マシン
4. Solidityコントラクトの実行: 実際のスマートコントラクトを動作させる
5. ブロックチェインへの統合: コントラクトのデプロイと実行をサポート

この実装により、スマートコントラクトがどのように動作するかを深く理解できました。実際のEthereumのEVMはより多くの機能（全オペコード、ガス計算、プリコンパイルコントラクトなど）を持ちますが、基本的な仕組みは同じです。

次章では、このEVM統合ブロックチェインをP2Pネットワークで動作させ、複数ノード間でスマートコントラクトを共有・実行する分散システムを構築します。
