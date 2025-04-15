---
title: "Zigを用いたP2Pブロックチェインの実装"
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
2. 合意形成（コンセンサス）の基盤 – ブロックチェインでは分散したノードが単一の正しいチェインに合意する必要があります。他ノードとブロック情報を交換し、お互いに検証することで、不正なブロックの排除や最長チェインへの合意が可能になります。
3. ネットワークの信頼性向上 – ブロックを複製・共有しておけば、あるノードがダウンしても他のノードがチェインのコピーを持っているため、ネットワーク全体として台帳を損失しません。

このように、新規ブロックの共有はブロックチェインネットワークの根幹と言えます。そのためにはノード間の通信が不可欠です。単一のプログラム内で完結していたこれまでの処理を、今度はノード同士が通信してデータをやり取りする形に拡張していきましょう。

### RPC機能とブロック伝播の実装方針

ネットワーク上でノード同士がブロックを共有する方法はいくつか考えられますが、ここではシンプルなRPC（Remote Procedure Call）の仕組みを使って実装します。各ノードは自分自身をサーバーとして他ノードからのリクエストを受け付け、決められた処理（ブロックの送受信など）を行います。同時に、他のノードに対してクライアントとしてリクエストを送ることで情報を取得します。これにより、全ノードが対等（ピアツーピア）にお互いの情報を問い合わせ合い、同期を図ることができます。
ステップ3では、シンプルなP2Pネットワークを構築し、ノードが相互にブロックを交換できるようにします。具体的には以下のような機能を実装します。

1. トランザクション送信 (sendTransaction関数): ユーザ（または他ノード）からトランザクションを受け取り、ノード内のプールに追加します。将来このトランザクションはブロックに取り込まれます。
2. ブロック生成 (mine関数): 現在プールにあるトランザクションを含む新しいブロックを作成します。PoW（Proof of Work）は次章で本格的に実装しますが、ここではブロック生成とネットワークへの配信（ブロードキャスト）の流れを作ります。
3. チェイン情報取得 (getChain関数): ノードの持つブロックチェイン全体を取得するための関数です。他ノードからチェインを問い合わせて同期したり、デバッグ目的でチェイン内容を表示したりするのに利用します。
4. ブロック受信処理 (receiveBlock関数): 他ノードから新しいブロックを受け取った際に、そのブロックを検証し自分のチェインに取り込みます。必要に応じてさらに他のピアに転送（ブロックの再伝播）も行います。
5. 通信処理 (handleConnection関数): ノード同士（やクライアント）が接続した際のリクエストを読み取り、上記の関数（RPCコール）に振り分けます。sendTransactionやmineの呼び出し、ブロック受信などをコマンド別に処理します。

各ノードはTCP通信によって相互接続し、このRPCプロトコルに従ってメッセージをやり取りします。ネットワーク構成としては、ノード起動時に既知のピアのアドレスを指定し、必要なら接続・同期を行います。ブロックやトランザクションの情報は簡易的なテキスト形式で送受信し、パースとシリアライズも手動で実装します。
これらのRPCによって、ノードは相互に情報交換し同期 (synchronization) を行います。では、ブロック共有の流れを「ノードがどうやって同期するか」の観点から見てみましょう。

- ピアの登録: 新しいノードをネットワークに参加させるには、既存ノードのアドレスをaddPeerで登録します。これによりノード同士が互いの所在を認識し合い、通信経路が確立されます。
- ブロックの生成: どれかのノードでmine RPCを呼び出しPoWを実行すると、新しいブロックが生成されチェインに追加されます【PoWで実装したmineBlock関数を利用】。
- ブロックの伝達: ブロック生成ノードは、自身のピア一覧を参照し、各ピアに対して新ブロックができたことを通知します。シンプルな方法としては、他ノードのgetChain RPCを呼び出してもらう（もしくはこちらからチェインを送る）ことで最新ブロック情報を伝達します。
- ブロックの検証と保存: 通知を受け取った各ノードは、送り元ノードからチェイン情報（あるいはブロック情報）を取得し、自分の持つチェインと比較します。そして、新しく受け取ったブロックが正当なもの（整合性とPoWの確認）であり、かつ自分のチェインより先のものなら、自分のチェインにそのブロックを追加します。
- チェインの同期完了: このようにしてネットワーク内の他ノードにもブロックが行き渡り、全ノードが同じ最新ブロックを含むチェインを保持できました。もし一時的にチェインの不一致（フォーク）が起きても、最終的には全ノードが最長チェインを共有することで合意が取られます。

以上がネットワーク上でブロックを共有しチェインを同期させる大まかな流れです。それでは、これを踏まえて実際のコードに落とし込んでみましょう。

## ネットワーク接続相手に関する構造体を定義

まず、ネットワーク接続相手(ピア)に関する情報を扱う構造体を用意します。IPアドレスやTCPストリームを保持し、送受信で使い回します。
types.zigに次のような構造体を追加します。

```types.zig
pub const Peer = struct {
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

```blockchain.zig
//--------------------------------------
// メッセージ受信処理: ConnHandler
//--------------------------------------
pub const ConnHandler = struct {
    pub fn run(conn: std.net.Server.Connection) !void {
        defer conn.stream.close();
        std.log.info("Accepted: {any}", .{conn.address});

        var reader = conn.stream.reader();
        var buf: [256]u8 = undefined;

        while (true) {
            const n = try reader.read(&buf);
            if (n == 0) {
                std.log.info("Peer {any} disconnected.", .{conn.address});
                break;
            }
            const msg_slice = buf[0..n];
            std.log.info("[Received] {s}", .{msg_slice});

            // 簡易メッセージ解析
            if (std.mem.startsWith(u8, msg_slice, "BLOCK:")) {
                // "BLOCK:" の後ろを取り出してJSONパースする
                const json_part = msg_slice[6..];
                const new_block = parser.parseBlockJson(json_part) catch |err| {
                    std.log.err("Failed parseBlockJson: {any}", .{err});
                    continue;
                };
                // チェインに追加
                addBlock(new_block);
            } else {
                // それ以外はログだけ
                std.log.info("Unknown message: {s}", .{msg_slice});
            }
        }
    }
};
```

次にメッセージをパースする関数を実装します。

```parser.zig
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
    if (src.len % 2 != 0) return chainError.InvalidHexLength;
    var i: usize = 0;
    while (i < src.len) : (i += 2) {
        const hi = parseHexDigit(src[i]) catch return chainError.InvalidHexChar;
        const lo = parseHexDigit(src[i + 1]) catch return chainError.InvalidHexChar;
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
        const tx_json = try std.fmt.allocPrintZ(allocator, "{{\"sender\":\"{s}\",\"receiver\":\"{s}\",\"amount\":{d}}}", .{ tx.sender, tx.receiver, tx.amount });
        defer allocator.free(tx_json);
        try list.appendSlice(tx_json);
    }

    try list.appendSlice("]");
    return list.toOwnedSlice();
}

pub fn serializeBlock(block: types.Block) ![]const u8 {
    const allocator = std.heap.page_allocator;
    const hash_str = hexEncode(block.hash[0..], allocator) catch unreachable;
    const prev_hash_str = hexEncode(block.prev_hash[0..], allocator) catch unreachable;
    const tx_str = try serializeTransactions(block.transactions, allocator);
    const json = try std.fmt.allocPrintZ(allocator, "{{\"index\":{d},\"timestamp\":{d},\"nonce\":{d},\"data\":\"{s}\",\"prev_hash\":\"{s}\",\"hash\":\"{s}\",\"transactions\":{s}}}", .{ block.index, block.timestamp, block.nonce, block.data, prev_hash_str, hash_str, tx_str });
    allocator.free(hash_str);
    allocator.free(prev_hash_str);
    allocator.free(tx_str);
    return json;
}

pub fn parseBlockJson(json_slice: []const u8) !types.Block {
    std.log.debug("parseBlockJson start", .{});
    const block_allocator = std.heap.page_allocator;
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
    return b;
}
```

- ここでは "BLOCK:" メッセージを唯一のコマンドと仮定し、それ以外はすべて「不明なメッセージ」として扱っています。
- parseBlockJsonは簡易的なJSONパース（または文字列処理）でBlockを生成する関数です。
- addBlock(new_block) は受け取ったブロックを自ノードのチェインに取り込みます。

ポイント:他に "TX:" や "GETBLOCKS" などのコマンドを増やしたい場合は、ここ拡張します。

作成したパーサーを呼び出すために、parser.zigをインポートします。

```blockchain.zig
const parser = @import("parser.zig");
```

### クライアントモード：接続＆送信専用スレッドを追加

- --connect <host:port> の引数を処理し、tcpConnectToAddress() でサーバーノードに接続
- 送信用スレッドを立ち上げ、ユーザがコンソールに入力した文字列をそのまま送る
- メインスレッドで受信ループを回し、同様にparseMessageを呼び出して処理する

接続＆送信用スレッドを次のように作成します。

```blockchain.zig
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
        // 必要なサイズのバッファを用意して "BLOCK:" と block_json を連結する
        var buf = try std.heap.page_allocator.alloc(u8, "BLOCK:".len + block_json.len);
        defer std.heap.page_allocator.free(buf);

        // バッファに連結
        @memcpy(buf[0.."BLOCK:".len], "BLOCK:");
        @memcpy(buf["BLOCK:".len..], block_json);

        // 1回の書き出しで送信
        try writer.writeAll(buf);
        lastBlock.* = new_block;
    }
}
```

ブロックの作成処理も追加します。

```blockchain.zig
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
pub fn addBlock(new_block: types.Block) void {
    if (!verifyBlockPow(&new_block)) {
        std.log.err("Received block fails PoW check. Rejecting it.", .{});
        return;
    }
    chain_store.append(new_block) catch {};
    std.log.info("Added new block index={d}, nonce={d}, hash={x}", .{ new_block.index, new_block.nonce, new_block.hash });
}

pub fn sendBlock(block: types.Block, remote_addr: std.net.Address) !void {
    const json_data = parser.serializeBlock(block) catch |err| {
        std.debug.print("Serialize error: {any}\n", .{err});
        return err;
    };
    var socket = try std.net.tcpConnectToAddress(remote_addr);
    var writer = socket.writer();
    try writer.writeAll("BLOCK:" ++ json_data);
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

最後に、main関数を修正して、サーバーモードとクライアントモードを切り替えられるようにします。

```main.zig
const std = @import("std");
const blockchain = @import("blockchain.zig");
const types = @import("types.zig");
const parser = @import("parser.zig");

//------------------------------------------------------------------------------
// メイン処理およびテスト実行
//------------------------------------------------------------------------------
//
// main 関数では、以下の手順を実行しています：
// 1. ジェネシスブロック(最初のブロック)を初期化。
// 2. 取引リスト(トランザクション)の初期化と追加。
// 3. ブロックのハッシュを計算し、指定難易度に到達するまで nonce を探索(採掘)。
// 4. 最終的なブロック情報を標準出力に表示。
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
            _ = try std.Thread.spawn(.{}, blockchain.ConnHandler.run, .{conn});
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
        const peer = types.Peer{
            .address = remote_addr,
            .stream = socket,
        };
        _ = try std.Thread.spawn(.{}, blockchain.ClientHandler.run, .{peer});
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
                const new_block = try parser.parseBlockJson(json_part);
                blockchain.addBlock(new_block);
            } else {
                std.log.info("Unknown msg: {s}", .{msg_slice});
            }
        }
    }
}
```

- ユーザがコンソールに打ち込んだ文字列がそのままサーバーノードへ送られます。
- BLOCK:{"index":1,"nonce":999} のように手動でJSONテキストを送れば、サーバーモードで受信時に "BLOCK:" として認識します。
- 将来的には、ユーザ入力ではなく、プログラム側が自動で "BLOCK:" + jsonを作成して送信します。

ポイント:
テスト時は、サーバー側で --listen 8080 → クライアント側を--connect 127.0.0.1:8080と起動し、クライアントコンソールで文字列を入力→送信できます。
サーバーコンソールにはReceived from ...: <文字列>というログが表示されるはずです。

## 動作確認

サーバノードを起動させる。

```bash
zig build run -- --listen 8080
```

クライアントノードを起動させる。

```bash
zig build run -- --connect 127.0.0.1:8080
```

コンソールが表示されたら、適当な文字列を入力して送信。サーバ側には[Received]<文字列> のログが出る。

ブロック送信テスト
クライアントのコンソールから```BLOCK:{"index":2,"nonce":777}```のメッセージを送ってみます。

```bash
❯ zig build run -- --connect 127.0.0.1:8081
info: Connecting to 127.0.0.1:8081...
Enter message for new block: hi
```

```bash
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
