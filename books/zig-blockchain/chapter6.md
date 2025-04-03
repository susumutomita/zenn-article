---
title: "Zigを用いたP2Pブロックチェインの実装"
free: true
---

## ステップ3: ノード間のブロック共有

前章でP2Pがどのように動作するのかを理解し、ノード間でのメッセージ交換ができるようになりました。分散型のブロックチェインを構築するには、複数のノード間でブロック情報を共有する仕組みが不可欠です。これまでにローカルにブロックチェインを構築できましたが、このままでは各ノードが別々のチェインを持つだけで、ネットワーク全体で一貫した台帳を保つことができません。そのためここからは、ブロックチェインのデータをネットワーク全体で共有する仕組みを実装します。ノードが新しいブロックを生成した際、それを他のノードに伝え、全体で同じブロックチェインを維持することが重要です。このステップでは、ブロックのやり取りをするためのメッセージフォーマットを定義し、ノード間でブロックを共有する仕組みを構築します。

ポイントを整理すると、ネットワーク対応により以下が可能になります。

- ブロックの伝播: あるノードで生成（マイニング）されたブロックをネットワーク内の他ノードへ配信し、全ノードのブロックチェインを同期させる。これによりPoWで得たブロックにネットワーク上の意味を持たせます。
- RPCによる操作: 外部からノードへトランザクションを送信したり、マイニングを指示したりするリモート呼び出しを提供する。ユーザや他のノードがネットワーク経由でsendTransactionやmineといった操作をできるようにします。

以上の仕組みにより、複数ノードが協調して1つのブロックチェインネットワークを形成します。

### RPC機能とブロック伝播の実装方針

ステップ3では、シンプルなP2Pネットワークを構築し、ノードが相互にブロックを交換できるようにします。具体的には以下のような機能を実装します。

1. トランザクション送信 (sendTransaction関数): ユーザ（または他ノード）からトランザクションを受け取り、ノード内のプールに追加します。将来このトランザクションはブロックに取り込まれます。
2. ブロック生成 (mine関数): 現在プールにあるトランザクションを含む新しいブロックを作成します。PoW（Proof of Work）は次章で本格的に実装しますが、ここではブロック生成とネットワークへの配信（ブロードキャスト）の流れを作ります。
3. チェイン情報取得 (getChain関数): ノードの持つブロックチェイン全体を取得するための関数です。他ノードからチェインを問い合わせて同期したり、デバッグ目的でチェイン内容を表示したりするのに利用します。
4. ブロック受信処理 (receiveBlock関数): 他ノードから新しいブロックを受け取った際に、そのブロックを検証し自分のチェインに取り込みます。必要に応じてさらに他のピアに転送（ブロックの再伝播）も行います。
5. 通信処理 (handleConnection関数): ノード同士（やクライアント）が接続した際のリクエストを読み取り、上記の関数（RPCコール）に振り分けます。sendTransactionやmineの呼び出し、ブロック受信などをコマンド別に処理します。

各ノードはTCP通信によって相互接続し、このRPCプロトコルに従ってメッセージをやり取りします。ネットワーク構成としては、ノード起動時に既知のピアのアドレスを指定し、必要なら接続・同期を行います。ブロックやトランザクションの情報は簡易的なテキスト形式で送受信し、パースとシリアライズも手動で実装します（プロトコルを簡単に保つため、JSONなどのライブラリは使わずに済ませます）。

それでは、それぞれの機能について設計意図とコードの一部を確認し、最後に全体のコードを掲示します。

```text
BLOCK: {"index":0, "timestamp":..., "nonce":..., "transactions":[...], ...}
```

のような文字列を送信し、受信側が "BLOCK:" を目印にしてその後ろをJSONとしてパース→Block構造体に復元→チェインへ追加します。
まず、ネットワーク接続相手(ピア)に関する情報を扱う構造体を用意します。IPアドレスやTCPストリームを保持し、送受信で使い回します。

```zig
const Peer = struct {
    address: std.net.Address,
    stream: std.net.Stream,
};
```

### サーバーモード：受信スレッドを追加

次にlisten()→accept()→新しいスレッドで受信をします。その際、受け取った文字列をチェックして、"BLOCK:" から始まるならブロックのJSONとみなすようにします。

- 受信ハンドラを定義
- データを受信したらparseMessage(msg)の関数を呼び出し、メッセージの先頭キーワードを判別
- "BLOCK:"の場合は後ろの部分をJSONパース→Blockとしてチェインに追加（詳しいパースの仕組みは後述）

受信ハンドラを実装していきます。

```zig
const ConnHandler = struct {
    fn run(conn: std.net.Server.Connection) !void {
        // 接続が終了したときに備えて必ずクローズ
        defer conn.stream.close();
        std.log.info("Accepted new connection from {any}", .{conn.address});

        var reader = conn.stream.reader();
        var buf: [256]u8 = undefined;

        // 無限ループでデータ受信
        while (true) {
            const n = try reader.read(&buf);
            // n==0 は相手が切断したサイン
            if (n == 0) {
                std.log.info("Peer {any} disconnected.", .{conn.address});
                break;
            }
            // 受信したメッセージを処理
            const msg_slice = buf[0..n];
            std.log.info("Received from {any}: {s}", .{conn.address, msg_slice});

            // ここで parseMessage を呼び出す
            parseMessage(msg_slice) catch |err| {
                std.log.err("parseMessage error: {any}", .{err});
                // 処理を継続するかどうかは設計次第
            };
        }
    }
};
```

次にメッセージをパースする関数parseMessage(msg_slice)を実装します。ここでは、メッセージの先頭が "BLOCK:" で始まる場合、その後ろの部分をJSONとしてパースし、Block構造体に復元する処理を行います。他のメッセージ種別がある場合は、それに応じた処理を追加していきます。

```zig
fn parseMessage(msg_slice: []const u8) !void {
    // 例: メッセージの先頭 6バイトが "BLOCK:" ならば、
    //     その後ろはブロックのJSON として parseBlockJson() に渡す
    if (std.mem.startsWith(u8, msg_slice, "BLOCK:")) {
        const json_part = msg_slice[6..];
        // parseBlockJson は後ほど実装し、Block構造体を返す設計
        var new_block = try parseBlockJson(json_part);
        // 受信したブロックをチェインに追加
        try addBlock(new_block);
    } else {
        // 今回は他のメッセージ種別がない前提で、
        // それ以外はログに出して終了
        std.log.info("Unknown message: {s}", .{msg_slice});
    }
}
```

- ここでは "BLOCK:" メッセージを唯一のコマンドと仮定し、それ以外はすべて「不明なメッセージ」として扱っています。
- parseBlockJsonは簡易的なJSONパース（または文字列処理）でBlockを生成する関数です。
- addBlock(new_block) は受け取ったブロックを自ノードのチェインに取り込みます。

ポイント:他に "TX:" や "GETBLOCKS" などのコマンドを増やしたい場合は、ここ拡張します。

### クライアントモード：接続＆送信専用スレッドを追加

- --connect <host:port> の引数を処理し、tcpConnectToAddress() でサーバーノードに接続
- 送信用スレッドを立ち上げ、ユーザがコンソールに入力した文字列をそのまま送る
- メインスレッドで受信ループを回し、同様にparseMessageを呼び出して処理する

接続＆送信用スレッドを次のように作成します。

```zig
pub fn main() !void {
    // ... (略) 引数パースなど

    if (std.mem.eql(u8, mode, "--connect")) {
        // (1) 文字列から host, port を取得
        const hostport = args[2];
        var tokenizer = std.mem.tokenizeScalar(u8, hostport, ':');
        const host_str = tokenizer.next() orelse {
            std.log.err("Please specify <host:port>", .{});
            return;
        };
        const port_str = tokenizer.next() orelse {
            std.log.err("No port after ':'", .{});
            return;
        };
        const port_num = std.fmt.parseInt(u16, port_str, 10) catch {
            std.log.err("Invalid port: {s}", .{port_str});
            return;
        };

        // (2) 接続を試みる
        std.log.info("Connecting to {s}:{d} ...", .{host_str, port_num});
        const remote_addr = try std.net.Address.resolveIp(host_str, port_num);
        var socket = try std.net.tcpConnectToAddress(remote_addr);

        // (3) 送信用スレッドを起動
        const peer = Peer{ .address=remote_addr, .stream=socket };
        _ = try std.Thread.spawn(.{}, SendHandler.run, .{peer});

        // (4) メインスレッドで受信
        var reader = socket.reader();
        var buf: [256]u8 = undefined;

        while (true) {
            const n = try reader.read(&buf);
            if (n == 0) {
                std.log.info("Remote disconnected.", .{});
                break;
            }
            const msg_slice = buf[0..n];
            std.log.info("[Recv] {s}", .{msg_slice});

            // サーバーから送られたデータを解析
            parseMessage(msg_slice) catch |err| {
                std.log.err("parseMessage error: {any}", .{err});
            };
        }
    }
}
```

送信用スレッド(SendHandler)も追加します。

```zig
const SendHandler = struct {
    fn run(peer: Peer) !void {
        defer peer.stream.close();

        std.log.info("Connected to peer {any}", .{peer.address});

        // 標準入力からユーザが入力した行を読み、
        // そのまま peer.stream に書き込む
        var stdin_file = std.io.getStdIn();
        const reader = stdin_file.reader();
        var line_buf: [256]u8 = undefined;

        while (true) {
            std.debug.print("Type your message: ", .{});
            const maybe_line = try reader.readUntilDelimiterOrEof(line_buf[0..], '\n');
            if (maybe_line == null) {
                std.log.info("EOF -> end sending loop.", .{});
                break;
            }
            const line_slice = maybe_line.?;

            // 送信
            var writer = peer.stream.writer();
            try writer.writeAll(line_slice);
        }
    }
};
```

- ユーザがコンソールに打ち込んだ文字列がそのままサーバーノードへ送られます。
- BLOCK:{"index":1,"nonce":999} のように手動でJSONテキストを送れば、サーバーモードで受信時に "BLOCK:" として認識します。
- 将来的には、ユーザ入力ではなく、プログラム側が自動で "BLOCK:" + jsonを作成して送信します。

ポイント:
テスト時は、サーバー側で --listen 8080 → クライアント側を--connect 127.0.0.1:8080と起動し、クライアントコンソールで文字列を入力→送信できます。
サーバーコンソールにはReceived from ...: <文字列>というログが表示されるはずです。

### メッセージ構文

本章では最低限 "BLOCK:" メッセージのみを実装します。

```text
BLOCK: {
  "index":0,
  "timestamp":1672531200,
  "prev_hash":"00000...000",
  "nonce":42,
  ...
}
```

受信側はJSONをパースして、Blockに復元し、自ノードのブロックチェインに追加する処理（addBlockなど）を呼び出します。JSONパース部分は、Zig標準ライブラリのstd.jsonや、簡易的な文字列パースで行えます。

コード全体は次のようになります。

以下は「ブロックチェイン構造＋P2P最小実装」を1ファイルにまとめたイメージです。大まかな流れは次のとおりです。

- 従来のBlockやTransactionの定義、マイニング関数 (mineBlock) などはそのまま。
- 新たにConnHandler, SendHandlerを追加し、サーバ受信、クライアント送信を担当させる。
- "BLOCK:" から始まるメッセージを受け取ったら、parseBlockJson(...)してBlockを作る。
- 新規ブロックを受け取ったら、チェインに追加して画面に表示する。

```zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;
const DIFFICULTY: u8 = 2;

pub const ChainError = error{
    InvalidHexLength,
    InvalidHexChar,
    InvalidFormat,
};

//------------------------------------------------------------------------------
// デバッグ出力関連
//------------------------------------------------------------------------------
//
// このフラグが true であれば、デバッグ用のログ出力を行います。
// コンパイル時に最適化されるため、false に設定されている場合、
// debugLog 関数は実行コードから除去されます。
const debug_logging = false;

/// debugLog:
/// デバッグログを出力するためのヘルパー関数です。
/// ※ debug_logging が true の場合のみ std.debug.print を呼び出します。
fn debugLog(comptime format: []const u8, args: anytype) void {
    if (comptime debug_logging) {
        std.debug.print(format, args);
    }
}

//------------------------------------------------------------------------------
// データ構造定義
//------------------------------------------------------------------------------

// Transaction 構造体
// ブロックチェーン上の「取引」を表現します。
// 送信者、受信者、取引金額の３要素のみ保持します。
const Transaction = struct {
    sender: []const u8, // 送信者のアドレスまたは識別子(文字列)
    receiver: []const u8, // 受信者のアドレスまたは識別子(文字列)
    amount: u64, // 取引金額(符号なし64ビット整数)
};

// Block 構造体
// ブロックチェーン上の「ブロック」を表現します。
// ブロック番号、生成時刻、前ブロックのハッシュ、取引リスト、PoW用の nonce、
// 追加データ、そして最終的なブロックハッシュを保持します。
const Block = struct {
    index: u32, // ブロック番号(0から始まる連番)
    timestamp: u64, // ブロック生成時のUNIXタイムスタンプ
    prev_hash: [32]u8, // 前のブロックのハッシュ(32バイト固定)
    transactions: std.ArrayList(Transaction), // ブロック内の複数の取引を保持する動的配列
    nonce: u64, // Proof of Work (PoW) 採掘用のnonce値
    data: []const u8, // 任意の追加データ(文字列など)
    hash: [32]u8, // このブロックのSHA-256ハッシュ(32バイト固定)
};

//------------------------------------------------------------------------------
// バイト変換ヘルパー関数
//------------------------------------------------------------------------------
//
// ここでは数値型 (u32, u64) をリトルエンディアンのバイト配列に変換します。
// また、値がu8の範囲を超えた場合はパニックします。

/// truncateU32ToU8:
/// u32 の値を u8 に変換(値が 0xff を超えるとエラー)
fn truncateU32ToU8(x: u32) u8 {
    if (x > 0xff) {
        @panic("u32 value out of u8 range");
    }
    return @truncate(x);
}

/// truncateU64ToU8:
/// u64 の値を u8 に変換(値が 0xff を超えるとエラー)
fn truncateU64ToU8(x: u64) u8 {
    if (x > 0xff) {
        @panic("u64 value out of u8 range");
    }
    return @truncate(x);
}

/// toBytesU32:
/// u32 の値をリトルエンディアンの 4 バイト配列に変換して返す。
fn toBytesU32(value: u32) [4]u8 {
    var bytes: [4]u8 = undefined;
    bytes[0] = truncateU32ToU8(value & 0xff);
    bytes[1] = truncateU32ToU8((value >> 8) & 0xff);
    bytes[2] = truncateU32ToU8((value >> 16) & 0xff);
    bytes[3] = truncateU32ToU8((value >> 24) & 0xff);
    return bytes;
}

/// toBytesU64:
/// u64 の値をリトルエンディアンの 8 バイト配列に変換して返す。
fn toBytesU64(value: u64) [8]u8 {
    var bytes: [8]u8 = undefined;
    bytes[0] = truncateU64ToU8(value & 0xff);
    bytes[1] = truncateU64ToU8((value >> 8) & 0xff);
    bytes[2] = truncateU64ToU8((value >> 16) & 0xff);
    bytes[3] = truncateU64ToU8((value >> 24) & 0xff);
    bytes[4] = truncateU64ToU8((value >> 32) & 0xff);
    bytes[5] = truncateU64ToU8((value >> 40) & 0xff);
    bytes[6] = truncateU64ToU8((value >> 48) & 0xff);
    bytes[7] = truncateU64ToU8((value >> 56) & 0xff);
    return bytes;
}

/// toBytes:
/// 任意の型 T の値をそのメモリ表現に基づいてバイト列(スライス)に変換する。
/// u32, u64 の場合は専用の関数を呼び出し、それ以外は @bitCast で固定長配列に変換します。
fn toBytes(comptime T: type, value: T) []const u8 {
    if (T == u32) {
        return toBytesU32(@as(u32, value))[0..];
    } else if (T == u64) {
        return toBytesU64(@as(u64, value))[0..];
    } else {
        const bytes: [@sizeOf(T)]u8 = @bitCast(value);
        return bytes[0..];
    }
}

//------------------------------------------------------------------------------
// ハッシュ計算とマイニング処理
//------------------------------------------------------------------------------
//
// calculateHash 関数では、ブロック内の各フィールドを連結して
// SHA-256 のハッシュを計算します。
// mineBlock 関数は、nonce をインクリメントしながら
// meetsDifficulty による難易度チェックをパスするハッシュを探します。

/// calculateHash:
/// 指定されたブロックの各フィールドをバイト列に変換し、
/// その連結結果から SHA-256 ハッシュを計算して返す関数。
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // nonce の値をバイト列に変換(8バイト)し、デバッグ用に出力
    const nonce_bytes = toBytesU64(block.nonce);
    debugLog("nonce bytes: ", .{});
    if (comptime debug_logging) {
        std.log.info("[Received] {x:0>2}", .{nonce_bytes});
        for (nonce_bytes) |byte| {
            std.debug.print("{x:0>2},", .{byte});
        }
        std.debug.print("\n", .{});
    }

    // ブロック番号 (u32) をバイト列に変換して追加
    hasher.update(toBytes(u32, block.index));
    // タイムスタンプ (u64) をバイト列に変換して追加
    hasher.update(toBytes(u64, block.timestamp));
    // nonce のバイト列を追加
    hasher.update(nonce_bytes[0..]);
    // 前ブロックのハッシュ(32バイト)を追加
    hasher.update(&block.prev_hash);

    // すべてのトランザクションについて、各フィールドを追加
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        const amount_bytes = toBytesU64(tx.amount);
        hasher.update(&amount_bytes);
    }
    // 追加データをハッシュに追加
    hasher.update(block.data);

    // 最終的なハッシュ値を計算
    const hash = hasher.finalResult();
    debugLog("nonce: {d}, hash: {x}\n", .{ block.nonce, hash });
    return hash;
}

/// meetsDifficulty:
/// ハッシュ値の先頭 'difficulty' バイトがすべて 0 であれば true を返す。
fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    // difficulty が 32 を超える場合は 32 に丸める
    const limit = if (difficulty <= 32) difficulty else 32;
    for (hash[0..limit]) |byte| {
        if (byte != 0) return false;
    }
    return true;
}

/// mineBlock:
/// 指定された難易度を満たすハッシュが得られるまで、
/// nonce の値を増やしながらハッシュ計算を繰り返す関数。
fn mineBlock(block: *Block, difficulty: u8) void {
    while (true) {
        const new_hash = calculateHash(block);
        if (meetsDifficulty(new_hash, difficulty)) {
            block.hash = new_hash;
            break;
        }
        block.nonce += 1;
    }
}

//------------------------------------------------------------------------------
// ブロックのシリアライズ（JSON形式の簡易実装）
//------------------------------------------------------------------------------
fn hexEncode(slice: []const u8, allocator: std.mem.Allocator) ![]const u8 {
    // 2文字×バイト数 + null終端不要なら省略
    var buf = try allocator.alloc(u8, slice.len * 2);
    var j: usize = 0;
    for (slice) |byte| {
        const high = byte >> 4;
        const low = byte & 0x0F;
        buf[j] = if (high < 10) '0' + high else 'a' + (high - 10);
        j += 1;
        buf[j] = if (low < 10) '0' + low else 'a' + (low - 10);
        j += 1;
    }
    return buf;
}

fn serializeTransactions(transactions: std.ArrayList(Transaction), allocator: std.mem.Allocator) ![]const u8 {
    if (transactions.items.len == 0) {
        return allocator.dupe(u8, "[]");
    }

    var list = std.ArrayList(u8).init(allocator);
    errdefer list.deinit();
    try list.appendSlice("[");

    for (transactions.items, 0..) |tx, i| {
        if (i > 0) {
            try list.appendSlice(",");
        }
        const tx_json = try std.fmt.allocPrintZ(allocator, "{{\"sender\":\"{s}\",\"receiver\":\"{s}\",\"amount\":{d}}}", .{ tx.sender, tx.receiver, tx.amount });
        defer allocator.free(tx_json);
        try list.appendSlice(tx_json);
    }

    try list.appendSlice("]");
    return list.toOwnedSlice();
}
fn serializeBlock(block: Block) ![]const u8 {
    const allocator = std.heap.page_allocator;
    const hash_str = hexEncode(block.hash[0..], allocator) catch unreachable;
    const prev_hash_str = hexEncode(block.prev_hash[0..], allocator) catch unreachable;
    const tx_str = try serializeTransactions(block.transactions, allocator);
    // JSON全体を出力するため、外側の中括弧をダブルにする
    const json = try std.fmt.allocPrintZ(allocator, "{{\"index\":{d},\"timestamp\":{d},\"nonce\":{d},\"data\":\"{s}\",\"prev_hash\":\"{s}\",\"hash\":\"{s}\",\"transactions\":{s}}}", .{ block.index, block.timestamp, block.nonce, block.data, prev_hash_str, hash_str, tx_str });
    allocator.free(hash_str);
    allocator.free(prev_hash_str);
    allocator.free(tx_str);
    return json;
}

//------------------------------------------------------------------------------
// ブロック生成（メッセージから）
//------------------------------------------------------------------------------
fn createBlock(input: []const u8, prevBlock: Block) Block {
    // 前ブロックの hash を prev_hash に設定し、index を 1 増やす
    return Block{
        .index = prevBlock.index + 1,
        .timestamp = @intCast(std.time.timestamp()),
        .prev_hash = prevBlock.hash,
        .transactions = std.ArrayList(Transaction).init(std.heap.page_allocator),
        .nonce = 0,
        .data = input,
        .hash = [_]u8{0} ** 32,
    };
}

//------------------------------------------------------------------------------
// mempoolからブロック生成（RPC用）
//------------------------------------------------------------------------------
fn createBlockFromMempool(prevBlock: *Block, mempool: *std.ArrayList(Transaction), allocator: std.mem.Allocator) !Block {
    var new_block = Block{
        .index = prevBlock.*.index + 1,
        .timestamp = @intCast(std.time.timestamp()),
        .prev_hash = prevBlock.*.hash,
        .transactions = std.ArrayList(Transaction).init(allocator),
        .nonce = 0,
        .data = "Mined via RPC",
        .hash = [_]u8{0} ** 32,
    };
    // mempool内の全取引をコピー
    for (mempool.items) |tx| {
        try new_block.transactions.append(tx);
    }
    mineBlock(&new_block, DIFFICULTY);
    // mempoolクリア（全取引をブロックに取り込んだため）
    mempool.*.items = mempool.*.items[0..0];
    return new_block;
}

//------------------------------------------------------------------------------
// ブロック送信
//------------------------------------------------------------------------------
fn sendBlock(block: Block, remote_addr: std.net.Address) !void {
    const json_data = serializeBlock(block) catch |err| {
        std.debug.print("Serialize error: {any}\n", .{err});
        return err;
    };
    var socket = try std.net.tcpConnectToAddress(remote_addr);
    var writer = socket.writer();
    try writer.writeAll("BLOCK:" ++ json_data);
}

//--------------------------------------
// P2P用ピア構造体
//--------------------------------------
const Peer = struct {
    address: std.net.Address,
    stream: std.net.Stream,
};

//--------------------------------------
// 簡易チェイン管理用: ブロック配列
//--------------------------------------
var chain_store = std.ArrayList(Block).init(std.heap.page_allocator);

fn verifyBlockPow(b: *const Block) bool {
    // 1) `calculateHash(b)` → meetsDifficulty
    const recalculated = calculateHash(b);
    if (!std.mem.eql(u8, recalculated[0..], b.hash[0..])) {
        return false; // hashフィールドと再計算が一致しない
    }
    if (!meetsDifficulty(recalculated, DIFFICULTY)) {
        return false; // PoWが難易度を満たしていない
    }
    return true;
}

// addBlock: 受け取ったブロックをチェインに追加（本当は検証なども入れる）
fn addBlock(new_block: Block) void {
    if (!verifyBlockPow(&new_block)) {
        std.log.err("Received block fails PoW check. Rejecting it.", .{});
        return;
    }
    chain_store.append(new_block) catch {};
    std.log.info("Added new block index={d}, nonce={d}, hash={x}", .{ new_block.index, new_block.nonce, new_block.hash });
}

//--------------------------------------
// メッセージ受信処理: ConnHandler
//--------------------------------------
const ConnHandler = struct {
    fn run(conn: std.net.Server.Connection) !void {
        defer conn.stream.close();
        std.log.info("Accepted: {any}", .{conn.address});

        var reader = conn.stream.reader();
        var line_buffer: [1024]u8 = undefined; // 充分なサイズのバッファを確保

        while (true) {
            // 改行文字まで読み込む（改行は含まれる）
            const maybe_line = try reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
            if (maybe_line == null) {
                std.log.info("Peer {any} disconnected.", .{conn.address});
                break;
            }
            // 改行文字を取り除く（必要なら）
            const line = maybe_line.?;
            const msg = std.mem.trim(u8, line, "\n");
            std.log.info("[Received complete message] {s}", .{msg});

            if (std.mem.startsWith(u8, msg, "BLOCK:")) {
                // "BLOCK:" の後ろの部分を JSON としてパース
                const json_part = msg[6..];
                const new_block = parseBlockJson(json_part) catch |err| {
                    std.log.err("Failed parseBlockJson: {any}", .{err});
                    continue;
                };
                addBlock(new_block);
            } else {
                std.log.info("Unknown message: {s}", .{msg});
            }
        }
    }
};

//--------------------------------------
// クライアント送信用スレッド
//--------------------------------------
const SendHandler = struct {
    fn run(peer: Peer) !void {
        defer peer.stream.close();
        std.log.info("Connected to peer {any}", .{peer.address});

        var stdin_file = std.io.getStdIn();
        const reader = stdin_file.reader();
        var line_buffer: [256]u8 = undefined;

        while (true) {
            std.debug.print("Type message (Ctrl+D to quit): ", .{});
            const maybe_line = try reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
            if (maybe_line == null) {
                std.log.info("EOF -> Stop sending loop.", .{});
                break;
            }
            const line_slice = maybe_line.?;
            var writer = peer.stream.writer();
            try writer.writeAll(line_slice);
        }
    }
};

//------------------------------------------------------------------------------
// RPCハンドラ (JSON-RPCでトランザクションとマイニングを処理)
//------------------------------------------------------------------------------
fn rpcHandler(conn: std.net.Server.Connection, mempool: *std.ArrayList(Transaction), lastBlock: *Block) !void {
    defer conn.stream.close();
    var reader = conn.stream.reader();
    var buf: [1024]u8 = undefined;
    const maybe_line = try reader.readUntilDelimiterOrEof(buf[0..], '\n');
    if (maybe_line == null) return;
    const req_line = std.mem.trim(u8, maybe_line.?, "\n");
    const allocator = std.heap.page_allocator;
    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, req_line, .{});
    defer parsed.deinit();
    const root = parsed.value;
    const obj = switch (root) {
        .object => |o| o,
        else => return ChainError.InvalidFormat,
    };
    const method_val = obj.get("method") orelse return ChainError.InvalidFormat;
    const method = switch (method_val) {
        .string => method_val.string,
        else => return ChainError.InvalidFormat,
    };
    if (std.mem.eql(u8, method, "sendTransaction")) {
        const params_val = obj.get("params") orelse return ChainError.InvalidFormat;
        const params = switch (params_val) {
            .array => params_val.array.items,
            else => return ChainError.InvalidFormat,
        };
        if (params.len != 3) return ChainError.InvalidFormat;
        const sender = switch (params[0]) {
            .string => params[0].string,
            else => return ChainError.InvalidFormat,
        };
        const receiver = switch (params[1]) {
            .string => params[1].string,
            else => return ChainError.InvalidFormat,
        };
        const amount = switch (params[2]) {
            .integer => params[2].integer,
            .float => @as(i64, @intFromFloat(params[2].float)),
            else => return ChainError.InvalidFormat,
        };
        const tx = Transaction{
            .sender = sender,
            .receiver = receiver,
            .amount = @intCast(amount),
        };
        try mempool.append(tx);
        const response = "{\"jsonrpc\":\"2.0\",\"result\":\"Transaction added\",\"id\":1}";
        try conn.stream.writer().writeAll(response);
    } else if (std.mem.eql(u8, method, "mine")) {
        var new_block = try createBlockFromMempool(lastBlock, mempool, allocator);
        chain_store.append(new_block) catch {};
        lastBlock.* = new_block;
        const hash_str = try hexEncode(new_block.hash[0..], allocator);
        const response = try std.fmt.allocPrintZ(allocator, "{{\"jsonrpc\":\"2.0\",\"result\":\"Block mined: {s}\",\"id\":1}}", .{hash_str});
        allocator.free(hash_str);
        try conn.stream.writer().writeAll(response);
    } else {
        const response = "{\"jsonrpc\":\"2.0\",\"error\":\"Unknown method\",\"id\":1}";
        try conn.stream.writer().writeAll(response);
    }
}

//--------------------------------------
// ブロックJSONパース (簡易実装例)
//--------------------------------------
/// hexDecode: 16進文字列をバイナリへ (返り値: 実際に変換できたバイト数)
fn hexDecode(src: []const u8, dst: *[256]u8) !usize {
    if (src.len % 2 != 0) return ChainError.InvalidHexLength;
    var i: usize = 0;
    while (i < src.len) : (i += 2) {
        const hi = parseHexDigit(src[i]) catch return ChainError.InvalidHexChar;
        const lo = parseHexDigit(src[i + 1]) catch return ChainError.InvalidHexChar;
        dst[i / 2] = (hi << 4) | lo;
    }
    return src.len / 2;
}

fn parseHexDigit(c: u8) !u8 {
    switch (c) {
        '0'...'9' => return c - '0',
        'a'...'f' => return 10 + (c - 'a'),
        'A'...'F' => return 10 + (c - 'A'),
        else => return error.InvalidHexChar,
    }
}

fn parseBlockJson(json_slice: []const u8) !Block {
    std.log.debug("parseBlockJson start", .{});
    const block_allocator = std.heap.page_allocator;
    std.log.debug("parseBlockJson start parsed", .{});
    const parsed = try std.json.parseFromSlice(std.json.Value, block_allocator, json_slice, .{});
    std.log.debug("parseBlockJson end parsed", .{});
    defer parsed.deinit();
    const root_value = parsed.value;

    const obj = switch (root_value) {
        .object => |o| o,
        else => return ChainError.InvalidFormat,
    };

    var b = Block{
        .index = 0,
        .timestamp = 0,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(Transaction).init(block_allocator),
        .nonce = 0,
        .data = "P2P Received Block",
        .hash = [_]u8{0} ** 32,
    };
    std.log.debug("parseBlockJson start parser", .{});
    // index の読み込み
    if (obj.get("index")) |idx_val| {
        const idx_num: i64 = switch (idx_val) {
            .integer => idx_val.integer,
            .float => @as(i64, @intFromFloat(idx_val.float)),
            else => return error.InvalidFormat,
        };
        if (idx_num < 0 or idx_num > @as(i64, std.math.maxInt(u32))) {
            return error.InvalidFormat;
        }
        b.index = @intCast(idx_num);
    }

    // timestamp の読み込み
    if (obj.get("timestamp")) |ts_val| {
        const ts_num: i64 = switch (ts_val) {
            .integer => if (ts_val.integer < 0) return error.InvalidFormat else ts_val.integer,
            .float => @intFromFloat(ts_val.float),
            else => return error.InvalidFormat,
        };
        b.timestamp = @intCast(ts_num);
    }

    // nonce の読み込み
    if (obj.get("nonce")) |nonce_val| {
        const nonce_num: i64 = switch (nonce_val) {
            .integer => nonce_val.integer,
            .float => @intFromFloat(nonce_val.float),
            else => return error.InvalidFormat,
        };
        if (nonce_num < 0 or nonce_num > @as(f64, std.math.maxInt(u64))) {
            return error.InvalidFormat;
        }
        b.nonce = @intCast(nonce_num);
    }

    // prev_hash の読み込み（追加）
    if (obj.get("prev_hash")) |ph_val| {
        const ph_str = switch (ph_val) {
            .string => ph_val.string,
            else => return error.InvalidFormat,
        };
        var ph_buf: [256]u8 = undefined;
        const ph_len = try hexDecode(ph_str, &ph_buf);
        if (ph_len != 32) return error.InvalidFormat;
        var tmp_ph: [32]u8 = undefined;
        var i: usize = 0;
        while (i < 32) : (i += 1) {
            tmp_ph[i] = ph_buf[i];
        }
        b.prev_hash = tmp_ph;
    }

    // hash の読み込み
    if (obj.get("hash")) |hash_val| {
        const hash_str = switch (hash_val) {
            .string => hash_val.string,
            else => return error.InvalidFormat,
        };
        var long_buf: [256]u8 = undefined;
        const actual_len = try hexDecode(hash_str, &long_buf);
        if (actual_len != 32) return error.InvalidFormat;
        var tmp_hash: [32]u8 = undefined;
        var i: usize = 0;
        while (i < 32) : (i += 1) {
            tmp_hash[i] = long_buf[i];
        }
        b.hash = tmp_hash;
    }

    // 5) data の読み込み（追加）
    if (obj.get("data")) |data_val| {
        const data_str = switch (data_val) {
            .string => data_val.string,
            else => return error.InvalidFormat,
        };
        b.data = try block_allocator.dupe(u8, data_str);
    }

    if (obj.get("transactions")) |tx_val| {
        switch (tx_val) {
            .array => {
                std.log.debug("Transactions field is directly an array. ", .{});
                const tx_items = tx_val.array.items;
                if (tx_items.len > 0) {
                    std.log.info("tx_items.len = {d}", .{tx_items.len});
                    for (tx_items, 0..tx_items.len) |elem, idx| {
                        std.log.info("Processing transaction element {d}", .{idx});
                        const tx_obj = switch (elem) {
                            .object => |o| o,
                            else => {
                                std.log.err("Transaction element {d} is not an object.", .{idx});
                                return error.InvalidFormat;
                            },
                        };

                        const sender = switch (tx_obj.get("sender") orelse {
                            std.log.err("Transaction element {d}: missing 'sender' field.", .{idx});
                            return error.InvalidFormat;
                        }) {
                            .string => |s| s,
                            else => {
                                std.log.err("Transaction element {d}: 'sender' field is not a string.", .{idx});
                                return error.InvalidFormat;
                            },
                        };
                        const sender_copy = try block_allocator.dupe(u8, sender);

                        const receiver = switch (tx_obj.get("receiver") orelse {
                            std.log.err("Transaction element {d}: missing 'receiver' field.", .{idx});
                            return error.InvalidFormat;
                        }) {
                            .string => |s| s,
                            else => {
                                std.log.err("Transaction element {d}: 'receiver' field is not a string.", .{idx});
                                return error.InvalidFormat;
                            },
                        };
                        const receiver_copy = try block_allocator.dupe(u8, receiver);

                        const amount: u64 = switch (tx_obj.get("amount") orelse {
                            std.log.err("Transaction element {d}: missing 'amount' field.", .{idx});
                            return error.InvalidFormat;
                        }) {
                            .integer => |val| if (val < 0) return error.InvalidFormat else @intCast(val),
                            .float => |val| if (val < 0) return error.InvalidFormat else @intFromFloat(val),
                            else => {
                                std.log.err("Transaction element {d}: 'amount' field is neither integer nor float.", .{idx});
                                return error.InvalidFormat;
                            },
                        };
                        std.log.info("Transaction element {d}: Parsed amount = {d}", .{ idx, amount });
                        try b.transactions.append(Transaction{
                            .sender = sender_copy,
                            .receiver = receiver_copy,
                            .amount = amount,
                        });
                    }
                    std.log.debug("Transactions field is directly an array. end", .{});
                }
                std.log.debug("Transactions field is directly an array. end transactions={any}", .{b.transactions});
            },
            .string => {
                std.log.info("Transactions field is a string. Value: {s}", .{tx_val.string});
                const tx_parsed = try std.json.parseFromSlice(std.json.Value, block_allocator, tx_val.string, .{});
                defer tx_parsed.deinit();
                switch (tx_parsed.value) {
                    .array => {
                        const tx_items = tx_parsed.value.array.items;
                        if (tx_items.len > 0) {
                            // 未実装：文字列からパースした配列の処理
                            return error.InvalidFormat;
                        }
                    },
                    else => return error.InvalidFormat,
                }
            },
            else => return error.InvalidFormat,
        }
    }
    std.log.debug("Block info: index={d}, timestamp={d}, prev_hash={any}, transactions={any} nonce={d}, data={s}, hash={any} ", .{ b.index, b.timestamp, b.prev_hash, b.transactions, b.nonce, b.data, b.hash });
    std.log.debug("parseBlockJson end", .{});
    return b;
}

//------------------------------------------------------------------------------
// クライアント送信用スレッド (P2P用)
//------------------------------------------------------------------------------
fn clientSendLoop(peer: Peer, lastBlock: *Block) !void {
    var stdin = std.io.getStdIn();
    var reader = stdin.reader();
    var line_buffer: [1024]u8 = undefined;
    while (true) {
        std.debug.print("Enter message for new block: ", .{});
        const maybe_line = try reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
        if (maybe_line == null) break;
        const user_input = maybe_line.?;
        var new_block = createBlock(user_input, lastBlock.*);
        mineBlock(&new_block, DIFFICULTY);
        var writer = peer.stream.writer();
        const block_json = serializeBlock(new_block) catch unreachable;
        const prefix = "BLOCK:";
        const prefix_len = prefix.len;
        var buf = try std.heap.page_allocator.alloc(u8, prefix_len + block_json.len + 1);
        defer std.heap.page_allocator.free(buf);
        @memcpy(buf[0..prefix_len].ptr, prefix);
        @memcpy(buf[prefix_len .. prefix_len + block_json.len].ptr, block_json);
        buf[prefix_len + block_json.len] = '\n';
        try writer.writeAll(buf);
        lastBlock.* = new_block;
    }
}

const ClientHandler = struct {
    fn run(peer: Peer) !void {
        // クライアントはローカルに Genesis ブロックを保持（本来はサーバーから同期する）
        var lastBlock = try createTestGenesisBlock(std.heap.page_allocator);
        clientSendLoop(peer, &lastBlock) catch unreachable;
    }
};

fn createTestGenesisBlock(allocator: std.mem.Allocator) !Block {
    var genesis = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(Transaction).init(allocator),
        .nonce = 0,
        .data = "Hello, Zig Blockchain!",
        .hash = [_]u8{0} ** 32,
    };
    genesis.transactions.append(Transaction{ .sender = "Alice", .receiver = "Bob", .amount = 100 }) catch {};
    mineBlock(&genesis, DIFFICULTY);
    return genesis;
}

//--------------------------------------
// main 関数
//--------------------------------------
pub fn main() !void {
    const gpa = std.heap.page_allocator;
    const args = try std.process.argsAlloc(gpa);
    defer std.process.argsFree(gpa, args);
    if (args.len < 3) {
        std.log.info("Usage:\n {s} --listen <port>\n or\n {s} --connect <host:port>\n or\n {s} --rpcListen <port>\n", .{ args[0], args[0], args[0] });
        return;
    }
    const mode = args[1];
    if (std.mem.eql(u8, mode, "--listen")) {
        const port_str = args[2];
        const port_num = try std.fmt.parseInt(u16, port_str, 10);
        var address = try std.net.Address.resolveIp("0.0.0.0", port_num);
        var listener = try address.listen(.{});
        defer listener.deinit();
        std.log.info("Listening on 0.0.0.0:{d}", .{port_num});
        while (true) {
            const conn = try listener.accept();
            _ = try std.Thread.spawn(.{}, ConnHandler.run, .{conn});
        }
    } else if (std.mem.eql(u8, mode, "--connect")) {
        const hostport = args[2];
        var tokenizer = std.mem.tokenizeScalar(u8, hostport, ':');
        const host_str = tokenizer.next() orelse {
            std.log.err("Please specify <host:port>", .{});
            return;
        };
        const port_str = tokenizer.next() orelse {
            std.log.err("No port after ':'", .{});
            return;
        };
        if (tokenizer.next() != null) {
            std.log.err("Too many ':' in {s}", .{hostport});
            return;
        }
        const port_num = try std.fmt.parseInt(u16, port_str, 10);
        std.log.info("Connecting to {s}:{d}...", .{ host_str, port_num });
        const remote_addr = try std.net.Address.resolveIp(host_str, port_num);
        var socket = try std.net.tcpConnectToAddress(remote_addr);
        const peer = Peer{
            .address = remote_addr,
            .stream = socket,
        };
        _ = try std.Thread.spawn(.{}, ClientHandler.run, .{peer});
        var reader = socket.reader();
        var buf: [256]u8 = undefined;
        while (true) {
            const n = try reader.read(&buf);
            if (n == 0) {
                std.log.info("Server disconnected.", .{});
                break;
            }
            const msg_slice = buf[0..n];
            std.log.info("[Recv] {s}", .{msg_slice});
            if (std.mem.startsWith(u8, msg_slice, "BLOCK:")) {
                const json_part = msg_slice[6..];
                const new_block = try parseBlockJson(json_part);
                addBlock(new_block);
            } else {
                std.log.info("Unknown msg: {s}", .{msg_slice});
            }
        }
    } else if (std.mem.eql(u8, mode, "--rpcListen")) {
        const port_str = args[2];
        const port_num = try std.fmt.parseInt(u16, port_str, 10);
        var address = try std.net.Address.resolveIp("0.0.0.0", port_num);
        var listener = try address.listen(.{});
        defer listener.deinit();
        std.log.info("RPC Listening on 0.0.0.0:{d}", .{port_num});
        // Initialize mempool for RPC
        var mempool = std.ArrayList(Transaction).init(gpa);
        // Initialize lastBlock for RPC from genesis block
        var lastBlock = try createTestGenesisBlock(gpa);
        while (true) {
            const conn = try listener.accept();
            _ = try std.Thread.spawn(.{}, rpcHandler, .{ conn, &mempool, &lastBlock });
        }
    } else {
        std.log.err("Invalid mode: {s}", .{mode});
    }
}

//------------------------------------------------------------------------------
// テストコード
//------------------------------------------------------------------------------
//
// 以下の test ブロックは、各関数の動作を検証するための単体テストです。
// Zig の標準ライブラリ std.testing を使ってテストが実行されます。

/// ブロックを初期化するヘルパー関数(テスト用)
fn createTestBlock(allocator: std.mem.Allocator) !Block {
    var block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(Transaction).init(allocator),
        .data = "Test Block",
        .nonce = 0,
        .hash = [_]u8{0} ** 32,
    };

    try block.transactions.append(Transaction{
        .sender = "TestSender",
        .receiver = "TestReceiver",
        .amount = 100,
    });

    return block;
}

test "トランザクション作成のテスト" {
    const tx = Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 50,
    };
    try std.testing.expectEqualStrings("Alice", tx.sender);
    try std.testing.expectEqualStrings("Bob", tx.receiver);
    try std.testing.expectEqual(@as(u64, 50), tx.amount);
}

test "ブロック作成のテスト" {
    const allocator = std.testing.allocator;
    var block = try createTestBlock(allocator);
    defer block.transactions.deinit();

    try std.testing.expectEqual(@as(u32, 0), block.index);
    try std.testing.expectEqual(@as(u64, 1672531200), block.timestamp);
    try std.testing.expectEqualStrings("Test Block", block.data);
}

test "バイト変換のテスト" {
    // u32 の変換テスト
    const u32_value: u32 = 0x12345678;
    const u32_bytes = toBytesU32(u32_value);
    try std.testing.expectEqual(u32_bytes[0], 0x78);
    try std.testing.expectEqual(u32_bytes[1], 0x56);
    try std.testing.expectEqual(u32_bytes[2], 0x34);
    try std.testing.expectEqual(u32_bytes[3], 0x12);

    // u64 の変換テスト
    const u64_value: u64 = 0x1234567890ABCDEF;
    const u64_bytes = toBytesU64(u64_value);
    try std.testing.expectEqual(u64_bytes[0], 0xEF);
    try std.testing.expectEqual(u64_bytes[7], 0x12);
}

test "ハッシュ計算のテスト" {
    const allocator = std.testing.allocator;
    var block = try createTestBlock(allocator);
    defer block.transactions.deinit();

    const hash = calculateHash(&block);
    // ハッシュの長さが 32 バイトであることを確認
    try std.testing.expectEqual(@as(usize, 32), hash.len);
    // ハッシュが全て 0 でないことを確認
    var all_zeros = true;
    for (hash) |byte| {
        if (byte != 0) {
            all_zeros = false;
            break;
        }
    }
    try std.testing.expect(!all_zeros);
}

test "マイニングのテスト" {
    const allocator = std.testing.allocator;
    var block = try createTestBlock(allocator);
    defer block.transactions.deinit();

    // 難易度 1 で採掘し、先頭1バイトが 0 になることを期待
    mineBlock(&block, 1);
    try std.testing.expectEqual(@as(u8, 0), block.hash[0]);
}

test "難易度チェックのテスト" {
    var hash = [_]u8{0} ** 32;
    // 全て 0 の場合、どの難易度でも true を返す
    try std.testing.expect(meetsDifficulty(hash, 0));
    try std.testing.expect(meetsDifficulty(hash, 1));
    try std.testing.expect(meetsDifficulty(hash, 32));

    // 先頭バイトが 0 以外の場合、難易度 1 では false を返す
    hash[0] = 1;
    try std.testing.expect(!meetsDifficulty(hash, 1));
}

test "トランザクションリストのテスト" {
    const allocator = std.testing.allocator;
    var block = try createTestBlock(allocator);
    defer block.transactions.deinit();

    // 追加のトランザクションを追加
    try block.transactions.append(Transaction{
        .sender = "Carol",
        .receiver = "Dave",
        .amount = 75,
    });

    try std.testing.expectEqual(@as(usize, 2), block.transactions.items.len);
    try std.testing.expectEqualStrings("TestSender", block.transactions.items[0].sender);
    try std.testing.expectEqualStrings("Carol", block.transactions.items[1].sender);
}

test "ブロック改ざん検出テスト" {
    const allocator = std.testing.allocator;
    var block = try createTestBlock(allocator);
    defer block.transactions.deinit();

    // 通常のハッシュ
    const originalHash = calculateHash(&block);

    // 改ざん(トランザクションの金額を100->999に変える)
    block.transactions.items[0].amount = 999;
    const tamperedHash = calculateHash(&block);

    // 改ざん前後のハッシュが異なることを期待
    try std.testing.expect(!std.mem.eql(u8, originalHash[0..], tamperedHash[0..]));
}
```

## 動作確認

サーバノードAを起動させる。

```bash
zig build run -- --listen 8080
```

クライアントノードBを起動させる。

```bash
zig build run -- --connect 127.0.0.1:8080
```

コンソールが表示されたら、適当な文字列を入力して送信。サーバ側には[Received]<文字列> のログが出る。

ブロック送信テスト
クライアントのコンソールから```BLOCK:{"index":2,"nonce":777}```のメッセージを送ってみます。

```bash
❯ zig build run -- --connect 127.0.0.1:8080
info: Connecting to 127.0.0.1:8081...
Enter message for new block: hi
```

```bash
❯ zig build run -- --listen 8080
❯ zig build run -- --listen 8081
info: Listening on 0.0.0.0:8081
info: Accepted: 127.0.0.1:60237
info: [Received complete message] BLOCK:{"index":1,"timestamp":1743378871,"nonce":1924,"data":"hi","prev_hash":"000057e288a7d6752e2a3ac81d2a4e9ae04630224e960db236b1e540641e4a1d","hash":"0000a0c6192e846fb8b7499c67c67ecf703045255795457130a7b57b4490567e","transactions":[]}
debug: parseBlockJson start
debug: parseBlockJson start parsed
debug: parseBlockJson end parsed
debug: parseBlockJson start parser
debug: Transactions field is directly an array.
debug: Transactions field is directly an array. end transactions=array_list.ArrayListAligned(main.Transaction,null){ .items = {  }, .capacity = 0, .allocator = mem.Allocator{ .ptr = anyopaque@0, .vtable = mem.Allocator.VTable{ .alloc = fn (*anyopaque, usize, mem.Alignment, usize) ?[*]u8@1023f7dd4, .resize = fn (*anyopaque, []u8, mem.Alignment, usize, usize) bool@1023f832c, .remap = fn (*anyopaque, []u8, mem.Alignment, usize, usize) ?[*]u8@1023f8604, .free = fn (*anyopaque, []u8, mem.Alignment, usize) void@1023f8658 } } }
debug: Block info: index=1, timestamp=1743378871, prev_hash={ 0, 0, 87, 226, 136, 167, 214, 117, 46, 42, 58, 200, 29, 42, 78, 154, 224, 70, 48, 34, 78, 150, 13, 178, 54, 177, 229, 64, 100, 30, 74, 29 }, transactions=array_list.ArrayListAligned(main.Transaction,null){ .items = {  }, .capacity = 0, .allocator = mem.Allocator{ .ptr = anyopaque@0, .vtable = mem.Allocator.VTable{ .alloc = fn (*anyopaque, usize, mem.Alignment, usize) ?[*]u8@1023f7dd4, .resize = fn (*anyopaque, []u8, mem.Alignment, usize, usize) bool@1023f832c, .remap = fn (*anyopaque, []u8, mem.Alignment, usize, usize) ?[*]u8@1023f8604, .free = fn (*anyopaque, []u8, mem.Alignment, usize) void@1023f8658 } } } nonce=1924, data=hi, hash={ 0, 0, 160, 198, 25, 46, 132, 111, 184, 183, 73, 156, 103, 198, 126, 207, 112, 48, 69, 37, 87, 149, 69, 113, 48, 167, 181, 123, 68, 144, 86, 126 }
debug: parseBlockJson end
info: Added new block index=1, nonce=1924, hash={ 0, 0, a0, c6, 19, 2e, 84, 6f, b8, b7, 49, 9c, 67, c6, 7e, cf, 70, 30, 45, 25, 57, 95, 45, 71, 30, a7, b5, 7b, 44, 90, 56, 7e }
```

### まとめ

- ここまでで、単体で動いていたブロックチェインに対し、TCPソケットを介したP2P通信を最小限に導入する方法を示しました。
- "BLOCK:" + JSONという形でブロックデータを送受し、受信側はチェインに追加する流れが確認できます。
- 実際のブロックチェインシステムは、さらにフォーク処理、署名検証、ピア探索など複雑な機能が加わりますが、まずは**「複数ノードでブロックを共有する」**という本質を押さえることが重要です。

次のステップでは、複数ノードの同時接続やブロックチェインのフル同期などを発展的に実装していきましょう。

基本の通信層ができたら、次に**ブロックチェイン固有のデータ**であるブロックとトランザクションの共有を実装します。各ノードが正しくブロックを受け取り検証・保存できれば、全体として一貫した分散型台帳が維持されます。ここでは、新しいブロックの伝搬と検証、未承認トランザクションのリレー、そしてそれらを効率良く行うためのZigのマルチスレッド/非同期処理について解説します。
