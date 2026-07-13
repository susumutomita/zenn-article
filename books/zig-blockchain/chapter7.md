---
title: "P2Pブロックチェイン（1）ブロック転送"
free: true
---

## ノード間のブロック共有

前章でP2Pがどのように動作するのかを理解し、ノード間でのメッセージ交換ができるようになりました。分散型のブロックチェインを構築するには、複数のノード間でブロック情報を共有する仕組みが不可欠です。これまでにローカルにブロックチェインを構築できましたが、このままでは各ノードが別々のチェインを持つだけで、ネットワーク全体で一貫した台帳を保つことができません。そのためここからは、ブロックチェインのデータをネットワーク全体で共有する仕組みを実装します。ノードが新しいブロックを生成した際、それを他のノードに伝え、全体で同じブロックチェインを維持することが重要です。このステップでは、ブロックのやり取りをするためのメッセージフォーマットを定義し、ノード間でブロックを共有する仕組みを構築します。

ポイントを整理すると、ネットワーク対応により以下が可能になります。

- ブロックの伝播: あるノードで生成（マイニング）されたブロックをネットワーク内の他ノードへ配信し、全ノードのブロックチェインを同期させる。これによりPoWで得たブロックにネットワーク上の意味を持たせます。
- RPCによる操作: 外部からノードへトランザクションを送信したり、マイニングを指示したりするリモート呼び出しを提供する。ユーザや他のノードがネットワーク経由でsendTransactionやmineといった操作をできるようにします。

以上の仕組みにより、複数ノードが協調して1つのブロックチェインネットワークを形成します。

### ブロックを共有する必要性とネットワーク同期

ブロックチェインは分散ネットワーク上の各ノードでデータを同期し、全員が最新のチェインを共有することで成り立っています。もし新しいブロックを生成したノードだけがそれを保持し、他のノードに知らせなければ、ノードごとに異なるブロックチェインが存在してしまい整合性が失われます。例えば、ノードAがPoWに成功してブロックを追加しても、それをノードBやCが知らなければ、ノードBやCの台帳は更新されず古いままです。そこでネットワーク通信によって「新しいブロックができたよ」と他のノードに伝え、ブロックを受け渡す仕組みが必要になります。

では、なぜネットワーク越しにブロックを共有する必要があるのでしょうか。主な理由は次のとおりです。

1. 全ノードで最新状態を保持するため – どれか1つのノードが新ブロックを追加したら、全員がそれを取り入れなければ台帳が食い違ってしまいます。共有することで全ノードが最新のブロックチェインを維持できます。
2. 合意形成（コンセンサス）の基盤 – 一般のブロックチェインでは、ノード同士がブロック情報を交換し検証します。これにより、不正なブロックを排除し、最長チェインへの合意を目指します。本章で扱う範囲は、PoW検証付きのブロック共有までです。最長チェインルールやフォーク解決は将来の課題として扱います。
3. ネットワークの信頼性向上 – ブロックを複製・共有しておけば、あるノードがダウンしても他のノードがチェインのコピーを持っているため、ネットワーク全体として台帳を損失しません。

このように、新規ブロックの共有はブロックチェインネットワークの根幹と言えます。そのためにはノード間の通信が不可欠です。単一のプログラム内で完結していたこれまでの処理を、今度はノード同士が通信してデータをやり取りする形に拡張していきましょう。

## RPC的アプローチによるブロック伝播の方針

```text
対象パス:   references/chapter7/src/types.zig、parser.zig、blockchain.zig、main.zig
開始地点:   ch06-sec02-msg-ack
今回の変更: BLOCK:<json>プロトコル、改行フレーム、PoW検証付きの受信・追加を実装
テスト:     zig fmt --check . && zig build test && zig build。章末に実TCPで受信追加を確認
実行:       zig build run -- --listen 8081 と zig build run -- --connect 127.0.0.1:8081
期待結果:   hiから採掘したブロックが受信側へ1件追加され、改ざんブロックは追加されない
```

本章で編集・テストする対象を第7章のスナップショットへ固定します。以降の`src/...`、`zig build`、`docker compose`は、特記がない限りこのディレクトリを基準に実行します。

```bash
cd "$(git rev-parse --show-toplevel)/references/chapter7"
```

ノード間でブロックを共有する方法はいくつか考えられますが、ここではシンプルな擬似RPC（Remote Procedure Call）の仕組みで実装します。各ノードは自分自身をサーバーとして他ノードからのリクエストを受け付け、決められた処理（ブロックの送受信など）を行います。同時に、他ノードに対してクライアントとしてリクエストを送り、必要な情報を取得します。全ノードが対等（ピアツーピア）にお互いへ問い合わせ合うことで、ネットワーク全体の同期を図ることができます。

本章で実装する具体的な機能は次のとおりです。

- ブロックの伝播: あるノードで新しいブロックが生成（マイニング）されたら、そのブロックをネットワーク内の他ノードへ配信し、全ノードのチェインを最新状態に同期させます。これによりPoWで得たブロックにネットワーク上の意味を持たせます。
- RPCによる操作: 外部からノードへリクエストを送り、特定の操作をリモート実行できるようにします。たとえばユーザや他ノードがネットワーク経由でトランザクション送信やマイニング指示（sendTransactionやmineといった操作）を行えるインタフェースを提供します。

以上の仕組みにより、複数ノードが協調して1つのブロックチェインネットワークを形成します。
今回の実装ではまずブロック伝播にフォーカスし、簡易的な方法で「複数ノードでブロックを共有する」ことを実現します。高度なフォーク処理やピア探索などは後続章で扱う予定ですが、まずは基本となるブロック共有の流れを押さえましょう。

## ネットワーク接続相手（Peer）を表す構造体の定義

まず、ノード間通信における接続相手（ピア）の情報を保持する構造体を用意します。各ピアのIPアドレスとTCPストリームを保持し、送受信処理で使い回せるようにします。types.zigに以下のような構造体を追加します。

```zig
pub const Peer = struct {
    address: std.net.Address,
    stream: std.net.Stream,
};
```

このPeer構造体は単にネットワーク接続相手を表すための入れ物です。各ノードは通信する相手ノードのAddress（IPとポート）と、その接続に対応するStream（ソケットストリーム）をペアで保持します。こうしておくことで、後述する送受信処理において、どの相手に対して通信しているかを管理しやすくなります。

## サーバーモード：受信スレッドを追加

次に、ノードをサーバーとして動作させ、他ノードからの接続を受け入れてメッセージを処理する仕組みを実装します。基本的な流れは**listen()待ち受け→accept()接続受理→新規スレッドで受信処理を開始**という手順です。

特に受信処理では、受け取ったデータがブロック情報かどうかを判別し、ブロックであればチェインに取り込みます。簡易的なプロトコルとして、メッセージが"BLOCK:"で始まる場合にその後ろの部分をブロックのJSONデータとみなすことにします。それ以外のメッセージは現時点では特に意味を持たないものとして無視します。

### 接続受信ハンドラの作成

まず、サーバーが受理した各接続ごとに新しいスレッドで動作する受信ハンドラを実装します。以下のConnHandler構造体は接続を処理するスレッドのエントリポイントを持ち、クライアントから届いたメッセージを読み取って適切に対応します。

```zig
//--------------------------------------
// メッセージ受信処理: ConnHandler
//--------------------------------------
pub const ConnHandler = struct {
    fn handleMessage(message: []const u8) void {
        std.log.info("[Received complete message] {s}", .{message});

        if (!std.mem.startsWith(u8, message, "BLOCK:")) {
            std.log.info("Unknown message: {s}", .{message});
            return;
        }

        var new_block = parser.parseBlockJson(message[6..]) catch |err| {
            std.log.err("Failed parseBlockJson: {any}", .{err});
            return;
        };
        if (!addBlock(new_block)) parser.deinitParsedBlock(&new_block);
    }

    pub fn run(conn: std.net.Server.Connection) !void {
        defer conn.stream.close();
        std.log.info("Accepted: {any}", .{conn.address});

        var reader = conn.stream.reader();
        var buf: [4096]u8 = undefined;
        var buffered: usize = 0;

        while (true) {
            const n = try reader.read(buf[buffered..]);
            if (n == 0) {
                std.log.info("Peer {any} disconnected.", .{conn.address});
                break;
            }
            buffered += n;
            var consumed: usize = 0;
            while (std.mem.indexOfScalarPos(u8, buf[0..buffered], consumed, '\n')) |newline| {
                const message = std.mem.trimRight(u8, buf[consumed..newline], "\r");
                handleMessage(message);
                consumed = newline + 1;
            }

            if (consumed > 0) {
                const remaining = buffered - consumed;
                std.mem.copyForwards(u8, buf[0..remaining], buf[consumed..buffered]);
                buffered = remaining;
            }

            if (buffered == buf.len) {
                std.log.err("Message too long; rejecting connection from {any}", .{conn.address});
                break;
            }
        }
    }
};
```

上記コードでは、ConnHandler.run関数が新しい接続ごとにスレッド内で呼び出され、無限ループでデータを受信し続けます。ポイントをまとめると以下になります。

- 接続の受理とログ: listener.accept()で得られたconn（接続）が渡され、スレッド開始時にAccepted: とログ出力します。defer conn.stream.close();により関数終了時（接続終了時）にソケットを閉じます。
- 受信ループ: `read`で届いた断片を4096バイトのバッファへ蓄積します。TCPの`read`回数はメッセージ境界と一致しないため、改行が見つかった完全なメッセージだけを処理し、残りは次の`read`まで保持します。
- メッセージ判別: 復元した1行が`BLOCK:`で始まる場合、その6バイト後ろをブロック情報のJSON文字列とみなします。
- ブロックJSONの解析: parser.parseBlockJson(json_part)を呼び出してJSON文字列をパースし、新しいブロック構造体new_blockを生成します。この際にエラーが起きた場合（JSON形式が不正など）はログにエラー内容を出力し、そのメッセージは飛ばします（continueで次の受信ループへ）。
- ブロックの追加: パースに成功した場合はaddBlock(new_block)を呼び出し、受け取ったブロックを自ノードのブロックチェインに取り込みます（addBlockの実装は後述します）。追加成功時はチェインへ所有権を移し、検証で拒否された場合だけ`deinitParsedBlock`でパース結果を解放します。
- その他のメッセージ: 先頭が"BLOCK:"でない場合（現時点ではブロックデータ以外のメッセージ）は、とりあえず内容をUnknown messageとしてログに表示するだけにしています。

現状では、受信するコマンドは"BLOCK:"のみを想定しており、それ以外の文字列は特に処理していません（将来的にトランザクション送信要求など別のコマンドを追加する余地があります）。このようにサーバーノード側では、新しい接続ごとにスレッドを立ち上げ、ブロックメッセージが届いたら即座にパースしてチェインを更新するという流れを実現しています。

### ブロックデータのシリアライズとパース処理

上記のConnHandler内では、受信したJSON文字列をparser.parseBlockJson関数でブロック構造体に変換していました。このparseBlockJsonを含むパーサーモジュールを実装します。
また、ネットワークでブロックをやり取りするためには、ブロック構造体をJSON文字列に変換するシリアライズ処理も必要です。そこで、ここでは以下の機能を実装します。

- ハッシュ値のエンコード/デコード: ブロックのhashやprev_hashは32バイトのバイナリデータ（SHA-256）なので、そのままではJSONに含められません。そこでバイナリを16進文字列に変換・復元する関数を用意します（例: バイト列{0×1A, 0×2B}→文字列"1a2b"）。
- トランザクション配列のJSON変換: ブロック内のトランザクション一覧（transactions）をJSON文字列にシリアライズする関数を作ります。逆にJSONからトランザクション配列を構築する処理も行います。
- ブロック全体のシリアライズ: ブロック構造体→JSON文字列への変換関数を実装します。
- ブロックJSONのパース: JSON文字列→ブロック構造体への変換関数（parseBlockJson）を実装します。

それでは、parser.zigにこれらの関数群を実装していきます。まずはヘルパーとなる16進変換とトランザクション配列のシリアライズ関数です。

```zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;
const types = @import("types.zig");
const logger = @import("logger.zig");
const utils = @import("utils.zig");
const chainError = @import("errors.zig").ChainError;
const DIFFICULTY: u8 = 2;
var chain_store = std.ArrayList(types.Block).init(std.heap.page_allocator);

pub fn hexEncode(slice: []const u8, allocator: std.mem.Allocator) ![]const u8 {
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

/// hexDecode: 16進文字列をバイナリへ (返り値: 実際に変換できたバイト数)
fn hexDecode(src: []const u8, dst: *[256]u8) !usize {
    // 書き込みを始める前に入力全体が固定長バッファへ収まるか確認する。
    // P2P入力は信頼できないため、偶数長でも256バイトを超えるhexを
    // dstへ書くとprocessがpanicしてしまう。
    if (src.len % 2 != 0 or src.len / 2 > dst.len) return chainError.InvalidHexLength;
    var i: usize = 0;
    while (i < src.len) : (i += 2) {
        const hi = parseHexDigit(src[i]) catch return chainError.InvalidHexChar;
        const lo = parseHexDigit(src[i + 1]) catch return chainError.InvalidHexChar;
        dst[i / 2] = (hi << 4) | lo;
    }
    return src.len / 2;
}

test "hex decoder rejects input larger than its destination" {
    var destination: [256]u8 = undefined;
    const oversized = [_]u8{'0'} ** 514;
    try std.testing.expectError(chainError.InvalidHexLength, hexDecode(&oversized, &destination));
}

test "block parser rejects non-integer or out-of-range consensus numbers" {
    try std.testing.expectError(error.InvalidFormat, parseBlockJson("{\"index\":1.5}"));
    try std.testing.expectError(error.InvalidFormat, parseBlockJson("{\"index\":4294967296}"));
    try std.testing.expectError(error.InvalidFormat, parseBlockJson("{\"timestamp\":-1.5}"));
    try std.testing.expectError(error.InvalidFormat, parseBlockJson("{\"nonce\":1.5}"));
}

fn parseHexDigit(c: u8) !u8 {
    switch (c) {
        '0'...'9' => return c - '0',
        'a'...'f' => return 10 + (c - 'a'),
        'A'...'F' => return 10 + (c - 'A'),
        else => return error.InvalidHexChar,
    }
}

fn deinitOwnedTransaction(allocator: std.mem.Allocator, tx: *types.Transaction) void {
    allocator.free(tx.sender);
    allocator.free(tx.receiver);
    tx.* = undefined;
}

fn deinitOwnedBlock(allocator: std.mem.Allocator, block: *types.Block) void {
    for (block.transactions.items) |*tx| deinitOwnedTransaction(allocator, tx);
    block.transactions.deinit();
    allocator.free(block.data);
    block.* = undefined;
}

/// `parseBlockJson` が返したブロックをチェーンへ移譲しなかった場合に解放する。
pub fn deinitParsedBlock(block: *types.Block) void {
    deinitOwnedBlock(std.heap.page_allocator, block);
}

fn cloneOwnedTransaction(allocator: std.mem.Allocator, tx: types.Transaction) !types.Transaction {
    const sender = try allocator.dupe(u8, tx.sender);
    errdefer allocator.free(sender);
    const receiver = try allocator.dupe(u8, tx.receiver);
    errdefer allocator.free(receiver);
    return .{ .sender = sender, .receiver = receiver, .amount = tx.amount };
}

fn appendClonedTransaction(
    transactions: *std.ArrayList(types.Transaction),
    allocator: std.mem.Allocator,
    tx: types.Transaction,
) !void {
    var cloned = try cloneOwnedTransaction(allocator, tx);
    errdefer deinitOwnedTransaction(allocator, &cloned);
    try transactions.append(cloned);
}

fn cloneOwnedBlock(allocator: std.mem.Allocator, block: types.Block) !types.Block {
    var cloned = types.Block{
        .index = block.index,
        .timestamp = block.timestamp,
        .prev_hash = block.prev_hash,
        .transactions = std.ArrayList(types.Transaction).init(allocator),
        .nonce = block.nonce,
        .data = try allocator.dupe(u8, block.data),
        .hash = block.hash,
    };
    errdefer deinitOwnedBlock(allocator, &cloned);
    for (block.transactions.items) |tx| {
        try appendClonedTransaction(&cloned.transactions, allocator, tx);
    }
    return cloned;
}

fn serializeTransactions(transactions: std.ArrayList(types.Transaction), allocator: std.mem.Allocator) ![]const u8 {
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
        const sender_json = try std.json.stringifyAlloc(allocator, tx.sender, .{});
        defer allocator.free(sender_json);
        const receiver_json = try std.json.stringifyAlloc(allocator, tx.receiver, .{});
        defer allocator.free(receiver_json);
        const tx_json = try std.fmt.allocPrintZ(allocator, "{{\"sender\":{s},\"receiver\":{s},\"amount\":{d}}}", .{ sender_json, receiver_json, tx.amount });
        defer allocator.free(tx_json);
        try list.appendSlice(tx_json);
    }

    try list.appendSlice("]");
    return list.toOwnedSlice();
}

```

上記コードの概要は以下のとおりです。

- hexEncode: 与えられたバイトスライスをヒープ上に確保したバッファへ16進文字列としてエンコードし、その文字列スライスを返します。例えば[0×0F, 0×A0]が入力なら"0fa0"という文字列を返すイメージです。
- hexDecode: 16進文字列を元のバイナリデータにデコードします。2文字で1バイトを表すため、文字列長が奇数の場合と、変換結果が固定長バッファを超える場合は`InvalidHexLength`になります。書き込み前に全体長を検証するので、ネットワークから巨大なhexが届いても範囲外アクセスでpanicしません。
- parseHexDigit: 1文字の16進文字を4ビット相当の数値に変換します。0-9は0〜9、a-f/A-Fは10〜15にマップし、それ以外はInvalidHexCharエラーを返します。
- 所有権ヘルパー: JSONパーサー用arena内の文字列をそのまま返さず、`cloneOwnedBlock`で独立した領域へ複製します。追加拒否時は`deinitParsedBlock`、追加成功時はチェインが同じ領域を所有します。
- serializeTransactions: ブロック内のtransactions（トランザクション配列）をJSONの文字列にシリアライズします。トランザクションが空の場合は空配列[]の文字列を返します。送信者と受信者は`std.json.stringifyAlloc`でJSON文字列へ変換してから埋め込むため、引用符やバックスラッシュを含んでも構文を壊しません。

次に、ブロック全体をシリアライズ・パースする関数を実装します。先ほどのヘルパーを活用して、Block構造体<->JSONの変換をします。

```zig
pub fn serializeBlock(block: types.Block) ![]const u8 {
    const allocator = std.heap.page_allocator;
    const hash_str = hexEncode(block.hash[0..], allocator) catch unreachable;
    const prev_hash_str = hexEncode(block.prev_hash[0..], allocator) catch unreachable;
    const tx_str = try serializeTransactions(block.transactions, allocator);
    const data_json = try std.json.stringifyAlloc(allocator, block.data, .{});
    defer allocator.free(data_json);
    const json = try std.fmt.allocPrintZ(allocator, "{{\"index\":{d},\"timestamp\":{d},\"nonce\":{d},\"data\":{s},\"prev_hash\":\"{s}\",\"hash\":\"{s}\",\"transactions\":{s}}}", .{ block.index, block.timestamp, block.nonce, data_json, prev_hash_str, hash_str, tx_str });
    allocator.free(hash_str);
    allocator.free(prev_hash_str);
    allocator.free(tx_str);
    return json;
}

test "block JSON round trip escapes quoted text" {
    var transactions = std.ArrayList(types.Transaction).init(std.testing.allocator);
    defer transactions.deinit();
    try transactions.append(.{
        .sender = "Alice \\\"A\\\"",
        .receiver = "Bob\\\\B",
        .amount = 42,
    });
    const block = types.Block{
        .index = 1,
        .timestamp = 1_672_531_201,
        .prev_hash = [_]u8{0x11} ** 32,
        .transactions = transactions,
        .nonce = 7,
        .data = "say \\\"hello\\\" \\\\ path",
        .hash = [_]u8{0x22} ** 32,
    };

    const json = try serializeBlock(block);
    defer std.heap.page_allocator.free(json);
    var decoded = try parseBlockJson(json);
    defer deinitParsedBlock(&decoded);

    try std.testing.expectEqualStrings(block.data, decoded.data);
    try std.testing.expectEqualStrings(block.transactions.items[0].sender, decoded.transactions.items[0].sender);
    try std.testing.expectEqualStrings(block.transactions.items[0].receiver, decoded.transactions.items[0].receiver);
}

pub fn parseBlockJson(json_slice: []const u8) !types.Block {
    std.log.debug("parseBlockJson start", .{});
    const output_allocator = std.heap.page_allocator;
    var arena = std.heap.ArenaAllocator.init(output_allocator);
    defer arena.deinit();
    const block_allocator = arena.allocator();
    std.log.debug("parseBlockJson start parsed", .{});
    const parsed = try std.json.parseFromSlice(std.json.Value, block_allocator, json_slice, .{});
    std.log.debug("parseBlockJson end parsed", .{});
    defer parsed.deinit();
    const root_value = parsed.value;

    const obj = switch (root_value) {
        .object => |o| o,
        else => return chainError.InvalidFormat,
    };

    var b = types.Block{
        .index = 0,
        .timestamp = 0,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(block_allocator),
        .nonce = 0,
        .data = "P2P Received Block",
        .hash = [_]u8{0} ** 32,
    };
    std.log.debug("parseBlockJson start parser", .{});
    // index の読み込み
    if (obj.get("index")) |idx_val| {
        const idx_num: i64 = switch (idx_val) {
            .integer => idx_val.integer,
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
            else => return error.InvalidFormat,
        };
        b.timestamp = @intCast(ts_num);
    }

    // nonce の読み込み
    if (obj.get("nonce")) |nonce_val| {
        const nonce_num: i64 = switch (nonce_val) {
            .integer => nonce_val.integer,
            else => return error.InvalidFormat,
        };
        // nonce_numはi64なので、u64への変換で追加確認が必要なのは負数だけ。
        if (nonce_num < 0) {
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
                            else => {
                                std.log.err("Transaction element {d}: 'amount' field is not an integer.", .{idx});
                                return error.InvalidFormat;
                            },
                        };
                        std.log.info("Transaction element {d}: Parsed amount = {d}", .{ idx, amount });
                        try b.transactions.append(types.Transaction{
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
    return cloneOwnedBlock(output_allocator, b);
}
```

serializeBlockでは、ブロック構造体内の各フィールドを文字列化してから、JSONフォーマットの文字列を組み立てています。具体的にはhashとprev_hashはhexEncodeで16進文字列にし、transactionsはserializeTransactionsでJSON文字列化します。それらをstd.fmt.allocPrintZでフォーマット文字列に埋め込んでいます。最後に確保したバッファを解放しつつ完成したJSON文字列を返しています。

parseBlockJsonは、逆にJSON文字列からブロック構造体を作る処理です。std.json.parseFromSliceを使って一旦汎用のstd.json.Value（JSON値）にパースし、それを期待する各フィールドに読み替えています。主な処理の流れは以下の通りです。

- JSONのトップレベルがオブジェクトかチェックし、オブジェクトなら各キーにアクセスします。トップレベルがオブジェクト以外（配列や値単体）ならフォーマット不正としてエラーにします。
- 新しいブロックBを初期化します。このときb.dataに仮で"P2P Received Block"という文字列を入れています。
- index、タイムスタンプ、nonce、amountは合意対象の整数値です。JSON上も整数だけを受理し、小数、負数、または型の上限を超える値は`InvalidFormat`にします。暗黙の丸めを許すと、同じ入力をノードごとに異なる値として扱う余地が生まれるためです。
- prev_hashとhashについては、JSONでは16進文字列として渡されているので、一旦文字列を取り出してからhexDecodeでバイナリに戻します。それを長さ32の配列にコピーしてb.prev_hashおよびb.hashに設定します。長さが32バイトでなければフォーマット不正です。
- dataは文字列として取得し、その内容をそのままb.dataに複製します（block_allocator.dupeでヒープにコピー）。通常、データフィールドはブロック生成者が自由に入れるものなので、ここでは送信側が埋めた値をそのまま使います。
- transactionsは少し入り組んでいます。送信元（シリアライズ側）の実装によっては、JSON内でトランザクション配列が直接配列として埋め込まれる場合と、文字列としてエンコードされている場合があります。今回serializeTransactionsでは常に配列リテラル文字列（例えば[]や[{"sender":...}]という文字列）を生成しています。serializeBlockでそれをそのまま埋め込んでいるため、受信側でtransactionsフィールドはJSON上配列そのものになっています。そのため、まず.arrayの場合を処理しています。
- .arrayの場合: 配列要素を順に取り出し、それぞれがオブジェクトであることを確認してからsender, receiver, amountフィールドを取り出します。文字列と数値に適切にキャストし、types.Transaction構造体を作ってブロックのb.transactionsリストに追加しています。全要素処理後に配列が空の場合や要素が不正な場合も考慮し、エラーなら即座に返しています。
- .stringの場合: 文字列で与えられた場合、一度中の文字列を再度std.json.parseFromSliceでパースします。上記コードでは.stringの場合にそれを試みています。ただし、このシナリオは本実装では発生しないため、「未実装」とコメントしてerror.InvalidFormatを返すようにしています。

以上でパースが完了すると、最後に構造体Bを`cloneOwnedBlock`へ渡します。JSON解析用arenaは関数終了時に破棄されるため、戻り値の文字列、トランザクション配列、送受信者名は`page_allocator`へ複製した所有データです。長い関数でしたが、要するに受信したブロックJSON文字列を解析・検証し、呼び出し元が安全に保持できるブロックへ詰め直す処理です。

補足: 現段階では、先頭が"BLOCK:"のメッセージしか処理しておらず、それ以外はすべて「不明なメッセージ」として無視しています。今後もし "TX:" や "GETBLOCKS" など新たなコマンドを増やしたい場合は、ConnHandler.run内の判定を拡張します。具体的には、それぞれに対応する処理（トランザクション追加処理やチェイン要求処理など）を実装していくことになります。

作成したパーサー機能を使用するために、サーバー側（blockchain.zigなど）でparser.zigをインポートするのを忘れないでください。例えばファイルの上部で以下のように宣言します。

作成したパーサーを呼び出すために、parser.zigをインポートします。

```zig
const parser = @import("parser.zig");
```

### クライアントモード：ブロック送信処理の実装

次に、ノードをクライアントとして動作させ、既存のネットワークに接続してブロックを送信する処理を実装します。クライアントノードは他ノードに接続し、自身でブロックを生成して送信する役割を担います（マイナーに相当する動きです）。ここでは、ユーザがコンソールに入力したデータを使って新規ブロックを作り、ネットワーク越しに送信する流れを作ります。

#### 接続＆送信用スレッドの作成

サーバーモードと同様、クライアントノードもスレッドを用いて送信処理を並行して行います。--connectモードでプログラムを起動した際には、指定した相手に対してTCP接続を確立し、以下の2つの動作をします。

- ユーザ入力の送信ループ: 新規スレッド上で、ユーザがコンソールに入力したテキストを取得し、それを元にブロックを作成して相手ノードへ送信します。
- 受信ループ: メインスレッド上で、接続からのデータを受信し、サーバーモード同様にメッセージを解析して処理します（こちらは後でmain関数内で記述します）。

まずは、クライアントの送信用スレッド（ClientHandler）と、ユーザ入力を処理するループ（clientSendLoop）を実装します。

```zig
//--------------------------------------
// クライアント処理
//--------------------------------------
pub const ClientHandler = struct {
    pub fn run(peer: types.Peer) !void {
        // クライアントはローカルに Genesis ブロックを保持（本来はサーバーから同期する）
        var lastBlock = try createTestGenesisBlock(std.heap.page_allocator);
        clientSendLoop(peer, &lastBlock) catch unreachable;
    }
};

fn clientSendLoop(peer: types.Peer, lastBlock: *types.Block) !void {
    var stdin = std.io.getStdIn();
    var reader = stdin.reader();
    var line_buffer: [256]u8 = undefined;
    while (true) {
        std.debug.print("Enter message for new block: ", .{});
        const maybe_line = try reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
        if (maybe_line == null) break;
        const user_input = maybe_line.?;
        var new_block = createBlock(user_input, lastBlock.*);
        mineBlock(&new_block, DIFFICULTY);
        var writer = peer.stream.writer();
        const block_json = parser.serializeBlock(new_block) catch unreachable;
        defer std.heap.page_allocator.free(block_json);
        try writer.writeAll("BLOCK:");
        try writer.writeAll(block_json);
        try writer.writeAll("\n");
        lastBlock.* = new_block;
    }
}
```

ClientHandler.runは、--connectモードで接続が確立した際に新規スレッドで呼ばれます。内部でまずcreateTestGenesisBlockを呼んでジェネシスブロックを1つ作成し、lastBlockとして保持します。本来であればサーバー側から最新ブロックをもらって同期すべきですが、簡易実装のため各クライアントはローカルにジェネシスブロックを持つところから始めています。その後、clientSendLoopを呼び出してユーザ入力の処理に入ります。

clientSendLoopではコンソール入力から1行ずつテキストを読み取り、それをブロックに仕立てて送信する処理を無限ループで行います。

- 入力待ちと取得: readUntilDelimiterOrEofを使って標準入力から改行区切りで1行を読み取ります。ユーザが何も入力せずEOF（Ctrl+Dなど）を送った場合はmaybe_line == nullとなり、ループを終了します。
- ブロックの生成と採掘: createBlock(user_input, lastBlock.*)で、直前のブロックを前ブロックとし、入力文字列をデータとした新規ブロックを生成します。次にmineBlock(&new_block, DIFFICULTY)を呼んで、新ブロックのProof of Work計算をします。mineBlock関数は前章までに実装済みで、ブロックのhashフィールドを埋め、ナンスを更新する処理です。
- メッセージの組み立て: 新たに生成・採掘したブロックをシリアライズし、ネットワーク送信用のメッセージを作ります。まずparser.serializeBlock(new_block)でブロックをJSON文字列block_jsonに変換します。そして"BLOCK:"プレフィックスを付与したバッファbufを確保し、先頭に"BLOCK:"、続いてblock_jsonの内容をコピーします。
- 送信: `BLOCK:`、JSON、区切りの改行を順に`writeAll`します。受信側は改行までを1メッセージとして復元するため、JSONが複数のTCPパケットに分かれても処理できます。
- ブロック履歴の更新: 送信済みのnew_blockをlastBlockに保存し、次回ブロック生成時の「前のブロック」として使います。これにより、ユーザが続けて何度も入力すると、チェインがローカルでも繋がっていくようになります。

このクライアント送信ループにより、ユーザからの入力をトリガーとしてブロックが次々と作られ、ネットワークに流れていく仕組みができました。

### ブロック生成とチェイン更新の補助関数

次に、新しく受信したブロックをチェインに取り込む処理や、ブロックを作成する関数群を実装・確認します。サーバー側で受信したブロックをaddBlockする際、ブロックの検証（PoWが正しいかなど）を行う必要があります。また、クライアント側でも新規ブロック生成時にチェイン情報を更新できるようにしておきます。

以下の関数を実装または確認します。

- verifyBlockPow: 受け取ったブロックが正しく採掘されたもの（ハッシュが内容に一致し、難易度を満たす）か検証します。
- addBlock: ブロックを受信した際、自ノードのブロックチェインに追加する処理です。不正ブロックは弾きます。
- sendBlock: 任意のブロックを指定したアドレスのノードに直接送信する関数です（今回はあまり使いませんが、外部からブロックをプッシュする用途などを想定しています）。
- createBlock: 入力データと直前のブロックから、新しいブロック構造体を作成します（ハッシュ計算前の雛形生成）
- createTestGenesisBlock: テスト用に最初のブロック（ジェネシスブロック）を作成します。

```zig
const DIFFICULTY: u8 = 2;
var chain_store = std.ArrayList(types.Block).init(std.heap.page_allocator);

/// verifyBlockPow:
/// ブロックのProof of Work検証を行う関数
pub fn verifyBlockPow(b: *const types.Block) bool {
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

// addBlock: 受け取ったブロックをチェインに追加（検証付き）
pub fn addBlock(new_block: types.Block) bool {
    if (!verifyBlockPow(&new_block)) {
        std.log.warn("Received block fails PoW check. Rejecting it.", .{});
        return false;
    }
    chain_store.append(new_block) catch return false;
    std.log.info("Added new block index={d}, nonce={d}, hash={x:0>2}", .{ new_block.index, new_block.nonce, new_block.hash });
    return true;
}

pub fn sendBlock(block: types.Block, remote_addr: std.net.Address) !void {
    const json_data = parser.serializeBlock(block) catch |err| {
        std.debug.print("Serialize error: {any}\n", .{err});
        return err;
    };
    defer std.heap.page_allocator.free(json_data);

    var socket = try std.net.tcpConnectToAddress(remote_addr);
    defer socket.close();

    var writer = socket.writer();
    try writer.writeAll("BLOCK:");
    try writer.writeAll(json_data);
    try writer.writeAll("\n");
}

/// createBlock: 新しいブロックを生成
pub fn createBlock(input: []const u8, prevBlock: types.Block) types.Block {
    return types.Block{
        .index = prevBlock.index + 1,
        .timestamp = @intCast(std.time.timestamp()),
        .prev_hash = prevBlock.hash,
        .transactions = std.ArrayList(types.Transaction).init(std.heap.page_allocator),
        .nonce = 0,
        .data = input,
        .hash = [_]u8{0} ** 32,
    };
}

/// createTestGenesisBlock: テスト用のジェネシスブロックを生成
pub fn createTestGenesisBlock(allocator: std.mem.Allocator) !types.Block {
    var genesis = types.Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(allocator),
        .nonce = 0,
        .data = "Hello, Zig Blockchain!",
        .hash = [_]u8{0} ** 32,
    };
    try genesis.transactions.append(types.Transaction{ .sender = "Alice", .receiver = "Bob", .amount = 100 });
    mineBlock(&genesis, DIFFICULTY);
    return genesis;
}
```

各関数の説明は以下の通りです。

- verifyBlockPow: ブロックが正当かチェックする関数です。calculateHash(b)でブロック全体からハッシュ値を再計算し、ブロックに記録されているb.hashと一致するか確認します。一致しなければ内容が改ざんされている可能性があるのでfalseを返します。さらにmeetsDifficulty(recalculated, DIFFICULTY)でこのハッシュが難易度条件を満たすかをチェックし、満たしていなければfalseを返します。両方クリアした場合のみtrue（検証OK）となります。
- addBlock: 受信した新規ブロックnew_blockを自ノードのチェインストレージ（ここではchain_storeというArrayList）に追加します。追加前にverifyBlockPowでPoW検証をします。もし、不正なブロックならログにエラーを出して追加処理を終了します。問題なければchain_store.append(new_block)でチェインの末尾に加え、ログにブロックが追加された旨（インデックスやナンス、ハッシュの一部）を出力します。
- sendBlock: 手元にあるblockを、指定したremote_addr（IPアドレスとポート）へ送信するユーティリティ関数です。実行時に作る`json_data`へ`++`は使えないため、`BLOCK:`、JSON、改行を`writeAll`で順に書き込みます。受信側は改行までを1メッセージとして復元するので、TCPの1回の`read`とメッセージ境界を混同しません。
- createBlock: 新しいBlock構造体を作ります。prevBlockを引数に取り、そこからindex（前ブロックのindex+1）とprev_hash（前ブロックのハッシュ）を継承します。dataには引数inputをそのまま使います。transactionsリストは空で初期化し、nonceは0、hashもとりあえずゼロクリアした32バイトの配列で作っています。返り値はまだハッシュ計算やPoWを行っていないブロックの雛形です。
- createTestGenesisBlock: テスト用のジェネシスブロックを生成します。index=0、prev_hashは0埋め32バイト、任意のデータ、そしてサンプルで1件のトランザクションを入れています。最後にmineBlockで難易度2のPoWを実行し、nonceとhashを計算してからジェネシスブロックを完成させています。この関数は主にClientHandler開始時に呼び出し、各クライアントに初期ブロックを持たせる目的で使っています。

以上の補助関数によって、ネットワーク越しに受け取ったブロックの検証・追加や、新規ブロックの生成・送信が適切に行われるようになりました。とくにverifyBlockPowとaddBlockによって、不正なブロック（PoW不一致など）がチェインに混入しないよう防いでいます。

## 前半の到達点

ここまでで、改行区切りの`BLOCK:<json>`を受信し、PoWとハッシュを検証してチェインへ追加するところまで実装しました。続く「P2Pブロックチェイン（2）ノード起動と実通信」では、同じ`references/chapter7`の作業を継続し、CLI、Docker、実TCPの受け入れ確認を完成させます。
