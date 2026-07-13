---
title: "簡易EVM実装（2）Solidity向けオペコード"
free: true
---

前半で作った実行エンジンへ、Solidityの関数セレクタ判定に必要な命令を追加します。作業ディレクトリは引き続き`book-work/chapter10`です。各節のテストを通し、最後に独立した第10章スナップショットと同じ`EVM result: 5 + 3 = 8`へ到達します。

## Solidity実行に必要なオペコードを追加する

次章では、Solidityが生成した関数ディスパッチャーを実行します。
そのため、ここまでの基本命令だけでは足りません。
次章へ進む前に、完成形の`src/evm.zig`と同じ方針で命令を追加します。

> **対象パス:** `src/evm.zig`
>
> **開始地点:** `ch10-sec05-basic-opcodes`
>
> **今回の変更:** `Opcode`と`EVMError`を拡張し、3つのシフトヘルパーを`executeStep`の直前へ追加します。各命令分岐は`executeStep`の`switch (opcode)`内で、最後の`else`より前へ追加し、最後にその`else`を汎用PUSH、DUP、SWAP処理へ置き換えます。
>
> **テスト:** 後述の`EVM chapter 10 dispatcher readiness`を追加し、同名フィルターが1件以上実行されたことを検査します。その後、`zig test src/evm.zig`ですべての既存テストも通します。
>
> **実行:** Solidity ABIと同じ68バイトのcalldataを簡易runtime codeへ渡し、`SHR`、`PUSH4`、`EQ`、`JUMPI`、`JUMPDEST`、`CALLDATALOAD`、`ADD`、`RETURN`を連続実行します。
>
> **期待する結果:** 戻り値は32バイトで末尾が8になり、不正なセレクタなら関数本体へジャンプせず空の戻り値になります。

特に次章のテストでは、`SHR(0x1c)`、`PUSH4(0x63)`、`EQ(0x14)`、`JUMPI(0x57)`、`JUMPDEST(0x5b)`を使います。
これらが未実装のままだと、Solidityの関数セレクタ判定で停止します。

まず、`Opcode`構造体内の`pub const NOT = 0x19;`の直後へ、不足している定数を追加します。`PUSH0`は既存の`PUSH1`宣言の直前、code、returndata、callvalue関連は既存のcalldata定数の直後に置いても構いません。Zigでは宣言順は動作へ影響しませんが、すべて`Opcode`の閉じ括弧`};`より前に入れてください。

```zig
// ビットシフト操作
pub const SHL = 0x1B;
pub const SHR = 0x1C;
pub const SAR = 0x1D;

// PUSHシリーズ
pub const PUSH0 = 0x5F;

// コード関連
pub const CODESIZE = 0x38;
pub const CODECOPY = 0x39;

// 戻りデータ関連
pub const RETURNDATASIZE = 0x3D;
pub const RETURNDATACOPY = 0x3E;

// コントラクト関連
pub const CALLVALUE = 0x34;
```

`EVMError`には、`REVERT`用のエラーも加えます。既存の`pub const EVMError = error{`から対応する`};`までを、次の定義で丸ごと置き換えてください。

```zig
pub const EVMError = error{
    OutOfGas,
    StackOverflow,
    StackUnderflow,
    InvalidJump,
    InvalidOpcode,
    MemoryOutOfBounds,
    Revert,
};
```

次に、`executeStep`の`switch`へ次の分岐を追加します。挿入位置は既存の`Opcode.RETURN`分岐が閉じた直後、既存の最後の`else`分岐より前です。既存の`else`分岐はまだ残しておき、最後の汎用処理を入れる時点で置き換えます。

```zig
Opcode.MOD => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    if (b.hi == 0 and b.lo == 0) {
        try context.stack.push(EVMu256.zero());
    } else if (a.hi == 0 and b.hi == 0) {
        try context.stack.push(EVMu256.fromU64(@intCast(a.lo % b.lo)));
    } else {
        try context.stack.push(EVMu256.zero());
    }
    context.pc += 1;
},

Opcode.POP => {
    if (context.stack.depth() < 1) return EVMError.StackUnderflow;
    _ = try context.stack.pop();
    context.pc += 1;
},

Opcode.EQ => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    const value: u64 = if (a.hi == b.hi and a.lo == b.lo) 1 else 0;
    try context.stack.push(EVMu256.fromU64(value));
    context.pc += 1;
},

Opcode.LT => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    const value: u64 = if (a.hi < b.hi or (a.hi == b.hi and a.lo < b.lo)) 1 else 0;
    try context.stack.push(EVMu256.fromU64(value));
    context.pc += 1;
},

Opcode.GT => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    const value: u64 = if (a.hi > b.hi or (a.hi == b.hi and a.lo > b.lo)) 1 else 0;
    try context.stack.push(EVMu256.fromU64(value));
    context.pc += 1;
},

Opcode.ISZERO => {
    if (context.stack.depth() < 1) return EVMError.StackUnderflow;
    const x = try context.stack.pop();
    const value: u64 = if (x.hi == 0 and x.lo == 0) 1 else 0;
    try context.stack.push(EVMu256.fromU64(value));
    context.pc += 1;
},

Opcode.AND => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    try context.stack.push(EVMu256{ .hi = a.hi & b.hi, .lo = a.lo & b.lo });
    context.pc += 1;
},

Opcode.OR => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    try context.stack.push(EVMu256{ .hi = a.hi | b.hi, .lo = a.lo | b.lo });
    context.pc += 1;
},

Opcode.XOR => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    const b = try context.stack.pop();
    try context.stack.push(EVMu256{ .hi = a.hi ^ b.hi, .lo = a.lo ^ b.lo });
    context.pc += 1;
},

Opcode.NOT => {
    if (context.stack.depth() < 1) return EVMError.StackUnderflow;
    const a = try context.stack.pop();
    try context.stack.push(EVMu256{ .hi = ~a.hi, .lo = ~a.lo });
    context.pc += 1;
},
```

シフト命令は、関数セレクタを取り出す`SHR 224`でも必要になります。`EVMu256`は128ビットずつの`hi`と`lo`で構成するため、桁の境界も128です。0、127、128、255、256をまたぐケースをヘルパー関数とテストで固定します。

3つのヘルパー関数は、`execute`の閉じ括弧`}`の直後、コメント`/// 単一のEVM命令を実行`の直前へ追加します。同じコードブロック後半にある`Opcode.SHL`、`Opcode.SHR`、`Opcode.SAR`の3分岐は、`executeStep`の`switch`内の最後の`else`より前へ追加します。ヘルパー関数を`switch`の中へ貼り付けないでください。

```zig
fn logicalShiftLeft(value: EVMu256, shift: EVMu256) EVMu256 {
    if (shift.hi != 0 or shift.lo >= 256) return EVMu256.zero();
    const amount: u8 = @intCast(shift.lo);
    if (amount == 0) return value;
    if (amount < 128) {
        const right: u7 = @intCast(128 - amount);
        const left: u7 = @intCast(amount);
        return .{
            .hi = (value.hi << left) | (value.lo >> right),
            .lo = value.lo << left,
        };
    }
    if (amount == 128) return .{ .hi = value.lo, .lo = 0 };
    const left: u7 = @intCast(amount - 128);
    return .{ .hi = value.lo << left, .lo = 0 };
}

fn logicalShiftRight(value: EVMu256, shift: EVMu256) EVMu256 {
    if (shift.hi != 0 or shift.lo >= 256) return EVMu256.zero();
    const amount: u8 = @intCast(shift.lo);
    if (amount == 0) return value;
    if (amount < 128) {
        const right: u7 = @intCast(amount);
        const left: u7 = @intCast(128 - amount);
        return .{
            .hi = value.hi >> right,
            .lo = (value.lo >> right) | (value.hi << left),
        };
    }
    if (amount == 128) return .{ .hi = 0, .lo = value.hi };
    const right: u7 = @intCast(amount - 128);
    return .{ .hi = 0, .lo = value.hi >> right };
}

fn arithmeticShiftRight(value: EVMu256, shift: EVMu256) EVMu256 {
    const negative = (value.hi & (@as(u128, 1) << 127)) != 0;
    const fill: u128 = if (negative) std.math.maxInt(u128) else 0;
    if (shift.hi != 0 or shift.lo >= 256) return .{ .hi = fill, .lo = fill };

    const amount: u8 = @intCast(shift.lo);
    if (amount == 0) return value;
    if (amount < 128) {
        const right: u7 = @intCast(amount);
        const left: u7 = @intCast(128 - amount);
        const sign_mask: u128 = if (negative)
            @as(u128, std.math.maxInt(u128)) << left
        else
            0;
        return .{
            .hi = (value.hi >> right) | sign_mask,
            .lo = (value.lo >> right) | (value.hi << left),
        };
    }
    if (amount == 128) return .{ .hi = fill, .lo = value.hi };

    const right: u7 = @intCast(amount - 128);
    const left: u7 = @intCast(256 - @as(u16, amount));
    const sign_mask: u128 = if (negative)
        @as(u128, std.math.maxInt(u128)) << left
    else
        0;
    return .{
        .hi = fill,
        .lo = (value.hi >> right) | sign_mask,
    };
}

Opcode.SHL => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const shift = try context.stack.pop();
    const value = try context.stack.pop();
    try context.stack.push(logicalShiftLeft(value, shift));
    context.pc += 1;
},

Opcode.SHR => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const shift = try context.stack.pop();
    const value = try context.stack.pop();
    try context.stack.push(logicalShiftRight(value, shift));
    context.pc += 1;
},

Opcode.SAR => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const shift = try context.stack.pop();
    const value = try context.stack.pop();
    try context.stack.push(arithmeticShiftRight(value, shift));
    context.pc += 1;
},
```

制御フローの3分岐も、`executeStep`の`switch`内の最後の`else`より前へ追加します。ジャンプ先が`JUMPDEST`であることを確認します。
これにより、Solidityのディスパッチャーが安全に関数本体へ移れます。

```zig
Opcode.JUMPDEST => {
    context.pc += 1;
},

Opcode.JUMP => {
    if (context.stack.depth() < 1) return EVMError.StackUnderflow;
    const dest = try context.stack.pop();
    if (dest.hi != 0) return EVMError.InvalidJump;
    const jump_dest = @as(usize, @intCast(dest.lo));
    if (jump_dest >= context.code.len) return EVMError.InvalidJump;
    if (context.code[jump_dest] != Opcode.JUMPDEST) return EVMError.InvalidJump;
    context.pc = jump_dest;
},

Opcode.JUMPI => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    const dest = try context.stack.pop();
    const condition = try context.stack.pop();
    if (condition.hi != 0 or condition.lo != 0) {
        if (dest.hi != 0) return EVMError.InvalidJump;
        const jump_dest = @as(usize, @intCast(dest.lo));
        if (jump_dest >= context.code.len) return EVMError.InvalidJump;
        if (context.code[jump_dest] != Opcode.JUMPDEST) return EVMError.InvalidJump;
        context.pc = jump_dest;
    } else {
        context.pc += 1;
    }
},
```

Solidityの初期化コードとABI処理では、calldataやcodeをメモリへコピーする命令も使われます。次の分岐も`executeStep`の`switch`内の最後の`else`より前へ追加します。

```zig
Opcode.CALLDATASIZE => {
    try context.stack.push(EVMu256.fromU64(context.calldata.len));
    context.pc += 1;
},

Opcode.CALLDATACOPY => {
    if (context.stack.depth() < 3) return EVMError.StackUnderflow;
    const mem_offset = try context.stack.pop();
    const data_offset = try context.stack.pop();
    const length = try context.stack.pop();
    if (mem_offset.hi != 0 or data_offset.hi != 0 or length.hi != 0) {
        return EVMError.MemoryOutOfBounds;
    }
    const mem_off = @as(usize, @intCast(mem_offset.lo));
    const data_off = @as(usize, @intCast(data_offset.lo));
    const len = @as(usize, @intCast(length.lo));
    try context.memory.ensureSize(mem_off + len);
    for (0..len) |i| {
        context.memory.data.items[mem_off + i] =
            if (data_off + i < context.calldata.len) context.calldata[data_off + i] else 0;
    }
    context.pc += 1;
},

Opcode.CODESIZE => {
    try context.stack.push(EVMu256.fromU64(context.code.len));
    context.pc += 1;
},

Opcode.CODECOPY => {
    if (context.stack.depth() < 3) return EVMError.StackUnderflow;
    const mem_offset = try context.stack.pop();
    const code_offset = try context.stack.pop();
    const length = try context.stack.pop();
    if (mem_offset.hi != 0 or code_offset.hi != 0 or length.hi != 0) {
        return EVMError.MemoryOutOfBounds;
    }
    const mem_off = @as(usize, @intCast(mem_offset.lo));
    const code_off = @as(usize, @intCast(code_offset.lo));
    const len = @as(usize, @intCast(length.lo));
    try context.memory.ensureSize(mem_off + len);
    for (0..len) |i| {
        context.memory.data.items[mem_off + i] =
            if (code_off + i < context.code.len) context.code[code_off + i] else 0;
    }
    context.pc += 1;
},

Opcode.RETURNDATASIZE, Opcode.CALLVALUE => {
    try context.stack.push(EVMu256.zero());
    context.pc += 1;
},

Opcode.REVERT => {
    if (context.stack.depth() < 2) return EVMError.StackUnderflow;
    context.stopped = true;
    return EVMError.Revert;
},
```

最後に、`PUSH`、`DUP`、`SWAP`を汎用処理にします。`executeStep`の末尾にある既存の`else => { std.log.debug(...); ... },`全体だけを、次の`else`へ置き換えてください。`switch`より後にある`disassemble`の`else`は別物なので変更しません。
これにより、`PUSH4`などの可変長の即値命令も扱えます。

```zig
else => {
    if (opcode >= 0x5F and opcode <= 0x7F) {
        const push_bytes = opcode - 0x5F;
        var value = EVMu256.zero();
        if (context.pc + push_bytes + 1 > context.code.len) {
            context.error_msg = "コード範囲外のPUSH操作";
            return EVMError.InvalidOpcode;
        }
        for (0..push_bytes) |i| {
            const byte = context.code[context.pc + 1 + i];
            if (push_bytes <= 16) {
                const shift = @as(u7, @intCast(8 * (push_bytes - 1 - i)));
                value.lo |= @as(u128, byte) << shift;
            } else if (i < push_bytes - 16) {
                const shift = @as(u7, @intCast(8 * (push_bytes - 17 - i)));
                value.hi |= @as(u128, byte) << shift;
            } else {
                const shift = @as(u7, @intCast(8 * (push_bytes - 1 - i)));
                value.lo |= @as(u128, byte) << shift;
            }
        }
        try context.stack.push(value);
        context.pc += push_bytes + 1;
    } else if (opcode >= 0x80 and opcode <= 0x8F) {
        const dup_index = opcode - 0x7F;
        if (context.stack.depth() < dup_index) return EVMError.StackUnderflow;
        try context.stack.push(context.stack.data[context.stack.sp - dup_index]);
        context.pc += 1;
    } else if (opcode >= 0x90 and opcode <= 0x9F) {
        const swap_index = opcode - 0x8F;
        if (context.stack.depth() < swap_index + 1) return EVMError.StackUnderflow;
        const top = context.stack.sp - 1;
        const other = context.stack.sp - 1 - swap_index;
        const temp = context.stack.data[top];
        context.stack.data[top] = context.stack.data[other];
        context.stack.data[other] = temp;
        context.pc += 1;
    } else {
        context.error_msg = "未実装または無効なオペコード";
        return EVMError.InvalidOpcode;
    }
},
```

`src/evm.zig`の末尾、既存の`test "EVM multiple operations"`より後へ、次の受け入れテストを追加します。先にシフト境界を直接検査し、その後に次章と同じ関数ディスパッチを実行します。

```zig
test "EVM chapter 10 dispatcher readiness" {
    const marker = EVMu256{ .hi = 1, .lo = 2 };
    const high_bit = EVMu256{
        .hi = @as(u128, 1) << 127,
        .lo = 0,
    };
    try std.testing.expect(logicalShiftRight(
        marker,
        EVMu256.zero(),
    ).eql(marker));
    try std.testing.expect(logicalShiftLeft(
        EVMu256.one(),
        EVMu256.fromU64(127),
    ).eql(.{ .hi = 0, .lo = @as(u128, 1) << 127 }));
    try std.testing.expect(logicalShiftRight(
        high_bit,
        EVMu256.fromU64(127),
    ).eql(.{ .hi = 1, .lo = 0 }));
    try std.testing.expect(logicalShiftRight(
        marker,
        EVMu256.fromU64(128),
    ).eql(.{ .hi = 0, .lo = 1 }));
    try std.testing.expect(logicalShiftLeft(
        marker,
        EVMu256.fromU64(128),
    ).eql(.{ .hi = 2, .lo = 0 }));
    try std.testing.expect(logicalShiftRight(
        high_bit,
        EVMu256.fromU64(255),
    ).eql(EVMu256.one()));
    try std.testing.expect(logicalShiftRight(
        marker,
        EVMu256.fromU64(256),
    ).eql(EVMu256.zero()));

    const runtime_bytecode = [_]u8{
        0x60, 0x00, // PUSH1 0
        0x35, // CALLDATALOAD
        0x60, 0xe0, // PUSH1 224
        0x1c, // SHR
        0x63, 0x77, 0x16, 0x02, 0xf7, // PUSH4 add(uint256,uint256)
        0x14, // EQ
        0x60, 0x10, // PUSH1 0x10 (JUMPDESTの位置)
        0x57, // JUMPI
        0x00, // STOP
        0x5b, // JUMPDEST
        0x60, 0x04, // PUSH1 4
        0x35, // CALLDATALOAD
        0x60, 0x24, // PUSH1 36
        0x35, // CALLDATALOAD
        0x01, // ADD
        0x60, 0x00, // PUSH1 0
        0x52, // MSTORE
        0x60, 0x20, // PUSH1 32
        0x60, 0x00, // PUSH1 0
        0xf3, // RETURN
    };

    var calldata = [_]u8{0} ** 68;
    @memcpy(calldata[0..4], &[_]u8{ 0x77, 0x16, 0x02, 0xf7 });
    calldata[35] = 5;
    calldata[67] = 3;

    const result = try execute(
        std.testing.allocator,
        &runtime_bytecode,
        &calldata,
        100_000,
    );
    defer std.testing.allocator.free(result);
    try std.testing.expectEqual(@as(usize, 32), result.len);
    for (result[0..31]) |byte| {
        try std.testing.expectEqual(@as(u8, 0), byte);
    }
    try std.testing.expectEqual(@as(u8, 8), result[31]);

    calldata[0] = 0;
    const rejected = try execute(
        std.testing.allocator,
        &runtime_bytecode,
        &calldata,
        100_000,
    );
    defer std.testing.allocator.free(rejected);
    try std.testing.expectEqual(@as(usize, 0), rejected.len);
}
```

非0件のフィルターゲートと、ファイル内の全テストを順番に通します。

```bash
docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  zig-blockchain-book \
  sh -eu -c '
  output="$(zig test src/evm.zig \
    --test-filter "EVM chapter 10 dispatcher readiness" \
    --cache-dir /tmp/zig-cache \
    --global-cache-dir /tmp/zig-global-cache 2>&1)"
  printf "%s\n" "$output"
  printf "%s\n" "$output" |
    grep -Eq "^[1-9][0-9]*/[1-9][0-9]* .*dispatcher readiness"
'
docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  zig-blockchain-book \
  zig test src/evm.zig \
    --cache-dir /tmp/zig-cache \
    --global-cache-dir /tmp/zig-global-cache
```

このゲートを通った状態が、次章の開始地点`ch10-sec06-evm-engine`です。

## 章末: 実行可能なEVMデモへ切り替える

最後に、第9章の数値デモだった`src/main.zig`をEVM実行デモへ置き換えます。ファイルの一部分へ追記するのではなく、全内容を次へ置き換えてください。

> **対象パス:** `src/main.zig`
>
> **開始地点:** `ch10-sec06-evm-engine`
>
> **今回の変更:** `src/main.zig`全体を、5と3を足すEVMバイトコードの実行プログラムへ置き換えます。
>
> **テスト:** `zig build test`で、第9章から残したルートテストと第10章のEVMテストをまとめて実行します。
>
> **実行:** `zig build run`
>
> **期待する結果:** `EVM result: 5 + 3 = 8`が表示されます。

```zig
const std = @import("std");
const evm = @import("evm.zig");

pub fn main() !void {
    const allocator = std.heap.page_allocator;
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

    const result = try evm.execute(allocator, &bytecode, &.{}, 100_000);
    defer allocator.free(result);
    if (result.len != 32) return error.UnexpectedReturnLength;

    const stdout = std.io.getStdOut().writer();
    try stdout.print("EVM result: 5 + 3 = {d}\n", .{result[31]});
}
```

### 第10章のテストを`zig build test`へ登録する

第9章の`build.zig`は`root.zig`と`main.zig`だけをテストします。`src/evm.zig`を追加しただけでは、その9件のテストを`zig build test`が実行しません。0件の見落としを章末へ持ち込まないよう、`build.zig`全体を次へ置き換えます。

```zig
const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const lib_mod = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });
    const exe_mod = b.createModule(.{
        .root_source_file = b.path("src/main.zig"),
        .target = target,
        .optimize = optimize,
    });
    exe_mod.addImport("chapter10_lib", lib_mod);

    const lib = b.addLibrary(.{
        .linkage = .static,
        .name = "chapter10",
        .root_module = lib_mod,
    });
    b.installArtifact(lib);

    const exe = b.addExecutable(.{
        .name = "chapter10",
        .root_module = exe_mod,
    });
    b.installArtifact(exe);

    const run_cmd = b.addRunArtifact(exe);
    run_cmd.step.dependOn(b.getInstallStep());
    if (b.args) |args| run_cmd.addArgs(args);
    const run_step = b.step("run", "Run the chapter 10 EVM demo");
    run_step.dependOn(&run_cmd.step);

    const lib_unit_tests = b.addTest(.{ .root_module = lib_mod });
    const run_lib_unit_tests = b.addRunArtifact(lib_unit_tests);
    const exe_unit_tests = b.addTest(.{ .root_module = exe_mod });
    const run_exe_unit_tests = b.addRunArtifact(exe_unit_tests);
    const evm_test_mod = b.createModule(.{
        .root_source_file = b.path("src/evm.zig"),
        .target = target,
        .optimize = optimize,
    });
    const evm_unit_tests = b.addTest(.{ .root_module = evm_test_mod });
    const run_evm_unit_tests = b.addRunArtifact(evm_unit_tests);

    const test_step = b.step("test", "Run unit tests");
    test_step.dependOn(&run_lib_unit_tests.step);
    test_step.dependOn(&run_exe_unit_tests.step);
    test_step.dependOn(&run_evm_unit_tests.step);
}
```

`build.zig.zon`も章スナップショット名へ更新します。

```zig
.{
    .name = .chapter10,
    .version = "0.0.0",
    .fingerprint = 0x1151924f522dbfb3,
    .minimum_zig_version = "0.14.0",
    .dependencies = .{},
    .paths = .{
        "build.zig",
        "build.zig.zon",
        "src",
    },
}
```

ここで`zig build test --summary all`を実行し、`src/evm.zig`の9件を含む合計15件が成功することを確認します。これが`references/chapter10/`と対になる章末状態です。

章末では、フォーマット、4つの非0件フィルター、EVM全体、ビルド、実行を一度に確認します。

```bash
docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  zig-blockchain-book \
  zig fmt --check src/evm_types.zig src/evm.zig src/main.zig

docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  zig-blockchain-book \
  sh -eu -c '
  for filter in EvmStack EvmMemory EvmStorage EvmContext; do
    output="$(zig test src/evm_types.zig --test-filter "$filter" \
      --cache-dir /tmp/zig-cache \
      --global-cache-dir /tmp/zig-global-cache 2>&1)"
    printf "%s\n" "$output"
    printf "%s\n" "$output" |
      grep -Eq "^[1-9][0-9]*/[1-9][0-9]* .*${filter}"
  done
'

docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  zig-blockchain-book \
  sh -eu -c '
    zig test src/evm.zig \
      --cache-dir /tmp/zig-cache \
      --global-cache-dir /tmp/zig-global-cache
    zig build test \
      --cache-dir /tmp/zig-cache \
      --global-cache-dir /tmp/zig-global-cache
    zig build \
      --cache-dir /tmp/zig-cache \
      --global-cache-dir /tmp/zig-global-cache \
      --prefix /tmp/zig-out
    zig build run \
      --cache-dir /tmp/zig-cache \
      --global-cache-dir /tmp/zig-global-cache \
      --prefix /tmp/zig-out
  '
```

期待する最後の行は次です。

```text
EVM result: 5 + 3 = 8
```

ここまで反映すれば、次章のSolidity関数呼び出しテストで使う命令は実装済みです。

ただし、これはEthereumメインネット互換のEVMではありません。ガスは全命令一律1で、`DIV`と`MOD`は結果を`u64`で表せる場合だけを扱います。ストレージは1回の`execute`内だけであり、`REVERT`データ、ログ、外部コール、コントラクト作成、world state、正確なガス返還は未実装です。また、定数を宣言していても本章の`switch`に分岐がない命令は`InvalidOpcode`になります。本章で保証する範囲は、掲載テストで使う命令列と次章の学習用関数ディスパッチャーです。
