---
title: "Zigを用いたP2Pブロックチェインの実装 ピアツーピアでのブロック同期"
free: true
---

これまでは、サーバー（受信専用）とクライアント（送信専用）に役割を分け、一方向にブロックを送信する仕組みを構築しました。しかし、この方式では各ノードが対等ではなく、真の分散型ネットワークとは言えません。第8章では、この制限を取り払いピアツーピア（P2P）通信を実装します。
各ノードが送信、受信も行う対等なピアとなり、相互にブロックを交換・同期できるネットワークを構築しましょう。

## この章の目標

- 既知ピアへの自動接続: ノード起動時に、あらかじめ知っている複数のピアに対して自動的に接続を試み、ネットワークに参加します。
- ブロックのゴシップ配信: あるピアから新しいブロックを受信した際に、自分が接続している他の全てのピアへそのブロックを再送信し、ネットワーク全体にブロックを広めます（ゴシッププロトコル風の拡散）。
- チェイン全体の同期（RPCの実装）: 新規ノードがネットワークに参加した際、既存ピアに対して自分の持つブロックチェイン全体を要求・取得し、一気に同期できるようにします。
- 接続の維持と再接続: ノードはピアとの接続状態を監視し、切断された場合の再接続やタイムアウト処理を（簡易的に）行います。

## チェインの現在の状態を表示できるようにする

blockchain.zigに現在のチェインの状態を表示する機能を加えます。

```blockchain.zig
pub var chain_store = std.ArrayList(types.Block).init(std.heap.page_allocator);


/// デバッグ用に現在のブロックチェイン状態を出力する
///
/// チェインの高さと最新ブロックに関する情報をログに記録します
pub fn printChainState() void {
    std.log.info("Current chain state:", .{});
    std.log.info("- Height: {d} blocks", .{chain_store.items.len});

    if (chain_store.items.len > 0) {
        const latest = chain_store.items[chain_store.items.len - 1];
        std.log.info("- Latest block: index={d}, hash={x}", .{ latest.index, latest.hash });
    } else {
        std.log.info("- No blocks in chain", .{});
    }
}
```

## P2P用の処理を作成する

ここからP2P通信に必要な機能を追加していきます。

## ピアとの通信処理とブロックの再伝播

それでは、実際にピア間でブロックやメッセージをやり取りする通信処理を実装しましょう。共通の通信処理は先ほどから出ているpeerCommunicationLoop関数にまとめます。これはどのピアとの接続であっても共通のロジックで動作し、受信メッセージの内容に応じて適切な処理を行います。第7章で実装したConnHandler.run（サーバー受信処理）やClientHandler.run（クライアント送信処理）の役割を統合したようなもの、と考えるておくとよいでしょう。

peerCommunicationLoopの概略コードは以下のようになります。

```blockchain.zig
fn peerCommunicationLoop(peer: types.Peer) !void {
    defer peer.stream.close(); // 通信終了時にソケットをクローズ

    // 接続してきた/接続したピアのストリームからリーダーを取得
    var reader = peer.stream.reader();
    var buf: [256]u8 = undefined;

    // チェイン要求: 接続直後に自分が新規ノードならチェイン全体を要求
    if (chain_store.items.len == 0 or chain_store.items.len == 1) {
        // 簡易判定: 自分のチェインがGenesisブロックしかない（もしくは空）場合
        var writer = peer.stream.writer();
        try writer.writeAll("GET_CHAIN\n");
    }

    // 無限ループで受信を待ち続ける
    while (true) {
        const n = try reader.read(&buf);
        if (n == 0) {
            std.log.info("Peer disconnected: {any}", .{peer.address});
            break;
        }
        const msg = buf[0..n];
        std.log.debug("Received from {any}: {s}", .{peer.address, msg});

        // メッセージ種別の判定
        if (std.mem.startsWith(u8, msg, "BLOCK:")) {
            const json_part = msg[6..]; // "BLOCK:" に続くJSONデータ部分
            const new_block = try parser.parseBlockJson(json_part);
            // 受信したブロックを自分のチェインに追加
            blockchain.addBlock(new_block);
            // 他のピアへ再伝播（ゴシップ）
            broadcastBlock(new_block, peer);
        } else if (std.mem.startsWith(u8, msg, "GET_CHAIN")) {
            // ピアからチェイン同期要求を受け取った場合
            std.log.info("Peer {any} requested chain. Sending copy...", .{peer.address});
            sendFullChain(peer);
        } else {
            std.log.warn("Unknown message from {any}: {s}", .{peer.address, msg});
        }
    }
}
```

上記コードで順を追って解説します。

- 接続直後のチェイン要求 (GET_CHAIN送信):新しく接続したノードが自分よりも古い可能性を考慮し、接続直後に自ノードのブロックチェイン全体を要求しています。簡易的に、保持ブロック数が0または1（ジェネシスのみ）の場合を「新規ノード」とみなしてGET_CHAINメッセージを送っています。本来であれば、各ピアに対して送るか、特定の信頼するピア1台に送るかなど戦略が必要ですが、ここではシンプルに接続先ごとにチェインを問い合わせてしまいます。メッセージ末尾に改行を付けているのは、人間がncコマンド等で手動接続した際に見やすくするためで、実装上は無くても構いません。
- メッセージ受信ループ:reader.read(&buf) でデータ受信を待ちます。何らかのデータが届いた場合はバイト列をmsgスライスに変換し、その内容をログ出力しています。n == 0のときはストリームがクローズした（相手が切断した）ことを意味するので、ループを抜けます。
- メッセージ種別ごとの処理:ブロック受信 ("BLOCK:" プレフィックス):メッセージが "BLOCK:" で始まっていれば、新しいブロックの通知です。"BLOCK:"以降のJSON文字列をパースしてtypes.Block構造体に復元し、自分のチェインに追加します（blockchain.addBlock）。その後、そのブロックをさらに他のピアへ中継します。ここではbroadcastBlock(new_block, peer) として関数に切り出しています。中身は接続中の全ピア（送信元のpeerを除く）に対して "BLOCK:" メッセージを送信する処理です。

```blockchain.zig
fn broadcastBlock(block: types.Block, from_peer: types.Peer) void {
    const json_data = parser.serializeBlock(block) catch |_| {
        return; // シリアライズ失敗時は何もしない
    };
    var msg_buffer = "BLOCK:" ++ json_data;
    // 全ピアに送信
    for (peer_list.items) |peer| {
        if (std.mem.eql(u8, peer.address.toSlice(), from_peer.address.toSlice())) {
            // 送信元のピアには送り返さない（重複送信防止）。
            continue;
        }
        // 各ピアのソケットライターを取得し送信
        var writer = peer.stream.writer();
        _ = writer.writeAll(msg_buffer) catch {};
    }
    std.log.info("Broadcasted block index={d} to {d} peers.",
                 .{ block.index, peer_list.items.len - 1 });
}
```

上記のbroadcastBlock関数では、受信元のfrom_peerを除いた全ピアに対し、新規ブロックを配信しています。同じブロックをぐるぐる送り合って無限ループにならないよう、送信元ピアへの送信はスキップする処理を入れている点に注目してください（単純にアドレスが同じかで判定しています）。実際には、既に持っているブロックは無視するなど高度な判断が必要ですが、本実装ではそこまで踏み込まず「自分が受け取った相手以外全員に流す」という拡散をします。

## チェイン要求受信 ("GET_CHAIN" プレフィックス)

他のピアから "GET_CHAIN" メッセージを受け取った場合、相手は我々の持つブロックチェインを要求しています。そこで、sendFullChain(peer) を呼び出し、自ノードが保持する全ブロックを順番に相手ピアへ送信します。

```blockchain.zig
fn sendFullChain(peer: types.Peer) !void {
    var writer = peer.stream.writer();
    for (blockchain.chain_store.items) |block| {
        const json_data = try parser.serializeBlock(block);
        // ブロックごとに送信（"BLOCK:"プレフィックスを付加）。
        try writer.writeAll("BLOCK:" ++ json_data);
    }
    std.log.info("Sent entire chain (height: {d}) to {any}.",
                 .{ blockchain.chain_store.items.len, peer.address });
}
```

blockchain.chain_storeはノード内に保持しているブロックのリストです（ジェネシスブロックから最新ブロックまで格納）。その各ブロックをシリアライズして「BLOCK:…」として送り出しています。この処理により、新規参加ノードはまとめてチェインを受信できるわけです。なお、チェインが長くなるとこの方法は非効率ですが、学習用の簡易実装ということでご了承ください。

出来上がったモジュール全体のコードは以下になります。

このモジュールは、ノード間の接続・通信・同期処理を担います。

```p2p.zig
//! ピアツーピアネットワーキングモジュール
//!
//! このモジュールはブロックチェインアプリケーションのピアツーピアネットワーク層を実装します。
//! 他のノードとの接続確立、着信接続の待ち受け、ノード間の通信プロトコルの
//! 処理機能を提供します。このモジュールはネットワーク全体にブロックチェインデータを
//! ブロードキャストし、同期することを可能にします。

const std = @import("std");
const blockchain = @import("blockchain.zig");
const types = @import("types.zig");
const parser = @import("parser.zig");

/// 接続済みピアのグローバルリスト
/// ネットワーク内の他のノードへのアクティブな接続を維持します
pub var peer_list = std.ArrayList(types.Peer).init(std.heap.page_allocator);

/// リッスンソケットを開始し、着信接続を受け入れる
///
/// 指定されたポートで着信接続を待機するTCPサーバーを作成します。
/// 新しい接続ごとに、専用の通信スレッドを生成します。
///
/// 引数:
///     port: リッスンするポート番号
///
/// 注意:
///     この関数は独自のスレッドで無期限に実行されます
pub fn listenLoop(port: u16) !void {
    var addr = try std.net.Address.resolveIp("0.0.0.0", port);
    var listener = try addr.listen(.{});
    defer listener.deinit();

    std.log.info("listen 0.0.0.0:{d}", .{port});

    while (true) {
        const conn = try listener.accept();
        const peer = types.Peer{ .address = conn.address, .stream = conn.stream };
        try peer_list.append(peer);
        std.log.info("Accepted connection from: {any}", .{conn.address});

        // ピアとの通信を処理するスレッドを生成
        _ = try std.Thread.spawn(.{}, peerCommunicationLoop, .{peer});
    }
}

/// 指定されたピアアドレスに接続する
///
/// 指定されたアドレスで別のノードとの接続を確立しようとします。
/// 接続に失敗した場合、遅延後に再試行します。接続が確立されると、
/// チェイン同期をリクエストします。
///
/// 引数:
///     addr: 接続するピアのネットワークアドレス
///
/// 注意:
///     この関数は独自のスレッドで無期限に実行され、再接続を処理します
pub fn connectToPeer(addr: std.net.Address) !void {
    while (true) {
        const sock = std.net.tcpConnectToAddress(addr) catch |err| {
            std.log.warn("Connection failed to {any}: {any}", .{ addr, err });
            std.time.sleep(5 * std.time.ns_per_s); // 5秒待機してから再試行
            continue;
        };

        std.log.info("Connected to peer: {any}", .{addr});
        const peer = types.Peer{ .address = addr, .stream = sock };
        try peer_list.append(peer);

        // 新しく接続されたピアからチェイン同期をリクエスト
        try requestChain(peer);

        // ピアとの通信ループを開始
        peerCommunicationLoop(peer) catch |e| {
            std.log.err("Peer communication error: {any}", .{e});
        };
    }
}

/// ピアからブロックチェインデータをリクエストする
///
/// ピアのブロックチェインデータをリクエストするためにGET_CHAINメッセージを送信します。
///
/// 引数:
///     peer: チェインをリクエストするピア
///
/// エラー:
///     ストリーム書き込みエラー
fn requestChain(peer: types.Peer) !void {
    try peer.stream.writer().writeAll("GET_CHAIN\n");
    std.log.info("Requested chain from {any}", .{peer.address});
}

/// ピアとの通信を処理する
///
/// ピア接続から継続的に読み取り、メッセージを処理し、
/// 切断を処理します。
///
/// 引数:
///     peer: 通信するピア
///
/// 注意:
///     この関数は終了時に接続をクリーンアップします
fn peerCommunicationLoop(peer: types.Peer) !void {
    defer {
        removePeerFromList(peer);
        peer.stream.close();
    }

    var reader = peer.stream.reader();
    var buf: [4096]u8 = undefined; // 受信メッセージ用のバッファ
    var total_bytes: usize = 0;

    while (true) {
        const n = try reader.read(buf[total_bytes..]);
        if (n == 0) break; // 接続が閉じられた

        total_bytes += n;
        var search_start: usize = 0;

        // バッファ内の完全なメッセージを処理
        while (search_start < total_bytes) {
            // メッセージ区切り文字（改行）を探す
            var newline_pos: ?usize = null;
            var i: usize = search_start;
            while (i < total_bytes) : (i += 1) {
                if (buf[i] == '\n') {
                    newline_pos = i;
                    break;
                }
            }

            if (newline_pos) |pos| {
                // 完全なメッセージを処理
                const msg = buf[search_start..pos];
                try handleMessage(msg, peer);
                search_start = pos + 1;
            } else {
                // メッセージがまだ完全ではない
                break;
            }
        }

        // 処理済みメッセージをバッファから削除
        if (search_start > 0) {
            if (search_start < total_bytes) {
                std.mem.copyForwards(u8, &buf, buf[search_start..total_bytes]);
            }
            total_bytes -= search_start;
        }

        // バッファがいっぱいで完全なメッセージがない場合はエラー
        if (total_bytes == buf.len) {
            std.log.err("Message too long, buffer full from peer {any}", .{peer.address});
            break;
        }
    }

    std.log.info("Peer {any} disconnected.", .{peer.address});
}

/// 種類に基づいて受信メッセージを処理する
///
/// BLOCKやGET_CHAINメッセージなど、ピアからの異なるメッセージタイプを
/// 解析して処理します。
///
/// 引数:
///     msg: 改行区切りのない、メッセージの内容
///     from_peer: メッセージを送信したピア
///
/// エラー:
///     解析エラーまたは処理エラー
fn handleMessage(msg: []const u8, from_peer: types.Peer) !void {
    if (std.mem.startsWith(u8, msg, "BLOCK:")) {
        // BLOCKメッセージを処理
        const blk = parser.parseBlockJson(msg[6..]) catch |err| {
            std.log.err("Error parsing block from {any}: {any}", .{ from_peer.address, err });
            return;
        };

        // チェインにブロックを追加
        blockchain.addBlock(blk);

        // 他のピアにブロックをブロードキャスト
        broadcastBlock(blk, from_peer);
    } else if (std.mem.startsWith(u8, msg, "GET_CHAIN")) {
        // GET_CHAINメッセージを処理
        std.log.info("Received GET_CHAIN from {any}", .{from_peer.address});
        try sendFullChain(from_peer);
    } else {
        // 不明なメッセージを処理
        std.log.info("Unknown message from {any}: {s}", .{ from_peer.address, msg });
    }
}

/// ソース以外のすべてのピアにブロックをブロードキャストする
///
/// ブロックをシリアル化し、接続されているすべてのピアに送信します。
/// オプションで、送信元のピアを除外することができます。
///
/// 引数:
///     blk: ブロードキャストするブロック
///     from_peer: ブロードキャストから除外するオプションのソースピア
pub fn broadcastBlock(blk: types.Block, from_peer: ?types.Peer) void {
    const payload = parser.serializeBlock(blk) catch return;

    for (peer_list.items) |peer| {
        // 指定された場合、送信元のピアをスキップ
        if (from_peer) |sender| {
            if (peer.address.getPort() == sender.address.getPort()) continue;
        }

        var writer = peer.stream.writer();
        _ = writer.writeAll("BLOCK:") catch |err| {
            std.log.err("Error broadcasting to peer {any}: {any}", .{ peer.address, err });
            continue;
        };
        _ = writer.writeAll(payload) catch |err| {
            std.log.err("Error broadcasting to peer {any}: {any}", .{ peer.address, err });
            continue;
        };
        _ = writer.writeAll("\n") catch |err| {
            std.log.err("Error broadcasting to peer {any}: {any}", .{ peer.address, err });
            continue;
        };
    }
}

/// 完全なブロックチェインをピアに送信する
///
/// ローカルチェイン内のすべてのブロックをシリアル化し、
/// 適切なメッセージフレーミングで1つずつ指定されたピアに送信します。
///
/// 引数:
///     peer: チェインを送信するピア
///
/// エラー:
///     シリアル化またはネットワークエラー
pub fn sendFullChain(peer: types.Peer) !void {
    std.log.info("Sending full chain (height={d}) to {any}", .{ blockchain.chain_store.items.len, peer.address });

    var writer = peer.stream.writer();

    for (blockchain.chain_store.items) |block| {
        const block_json = try parser.serializeBlock(block);
        try writer.writeAll("BLOCK:");
        try writer.writeAll(block_json);
        try writer.writeAll("\n"); // メッセージフレーミングのための改行
    }
}

/// ピアリストからピアを削除する
///
/// 切断された場合に、グローバルピアリストからピアを検索して削除します。
///
/// 引数:
///     target: 削除するピア
fn removePeerFromList(target: types.Peer) void {
    var i: usize = 0;
    while (i < peer_list.items.len) : (i += 1) {
        if (peer_list.items[i].address.getPort() == target.address.getPort()) {
            _ = peer_list.orderedRemove(i);
            break;
        }
    }
}

/// ユーザー入力からブロックを作成してブロードキャストするインタラクティブループ
///
/// コンソールからテキスト入力を読み取り、それからブロックを作成し、
/// マイニングして、ネットワークにブロードキャストします。
///
/// 注意:
///     この関数は独自のスレッドで無期限に実行されます
pub fn textInputLoop() !void {
    var reader = std.io.getStdIn().reader();
    var buf: [256]u8 = undefined;

    while (true) {
        std.debug.print("msg> ", .{});
        const maybe_line = reader.readUntilDelimiterOrEof(buf[0..], '\n') catch null;

        if (maybe_line) |line| {
            // チェインが空の場合は最新のブロックを取得するか、ジェネシスを作成
            const last_block = if (blockchain.chain_store.items.len == 0)
                try blockchain.createTestGenesisBlock(std.heap.page_allocator)
            else
                blockchain.chain_store.items[blockchain.chain_store.items.len - 1];

            // 新しいブロックを作成してマイニング
            var new_block = blockchain.createBlock(line, last_block);
            blockchain.mineBlock(&new_block, 2); // 難易度2でマイニング
            blockchain.addBlock(new_block);

            // 作成したブロックをブロードキャスト
            broadcastBlock(new_block, null);
        } else break;
    }
}
```

主なポイントは以下の通りです。

- listenLoop: 指定ポートで接続待ち受け。新しい接続ごとにスレッドを生成し、通信を管理します。
- connectToPeer: 指定アドレスのノードに接続し、チェイン同期をリクエスト。接続が切れた場合は自動再接続。
- peerCommunicationLoop: 各ピアとの通信を継続的に処理。受信したメッセージを解析し、ブロック追加やチェイン送信などを行います。
- broadcastBlock: 新しいブロックを全ピアに送信し、ネットワーク全体で同期を図ります。
- sendFullChain: チェイン全体をピアに送信。新規ノードの同期やチェイン比較に利用します。
- textInputLoop: ユーザー入力から新しいブロックを作成し、ネットワークにブロードキャストします。

## ノード起動時に複数のピアへ自動接続する

ピア一覧を管理できるようになったところで、既知のピアに自動接続する処理を実装します。ネットワークに新しいノードを参加させる際、あらかじめネットワーク内のいくつかのノードのアドレスを知っていれば、それらに接続することでブロックチェインの同期を開始できます。これはブロックチェインネットワークのブートストラップによくある手法です。

本実装では、プログラムの引数や設定に既知ピアのアドレス一覧を渡し、起動時に順次接続を試みるようにします。main.zigのエントリポイント付近を修正します。

```main.zig
const p2p = @import("p2p.zig");

/// アプリケーションエントリーポイント
///
/// コマンドライン引数を解析し、P2Pネットワークをセットアップし、
/// リスナーとユーザー操作用のバックグラウンドスレッドを起動して
/// ブロックチェインアプリケーションを初期化します。
/// また、適合性テストの実行もサポートします。
///
/// コマンドライン形式:
///   実行ファイル <ポート> [ピアアドレス...]
///   実行ファイル --conformance <テスト名> [--update]
///
/// 引数:
///     <ポート>: このノードが待ち受けるポート番号
///     [ピア...]: オプションの既知ピアアドレスのリスト（"ホスト:ポート"形式）
///     --conformance <テスト名>: 指定された適合性テストを実行
///     --update: 適合性テスト実行時にゴールデンファイルを更新
///
/// 戻り値:
///     void - 関数は無期限に実行されるか、エラーが発生するまで実行
pub fn main() !void {
    // アロケータの初期化
    const gpa = std.heap.page_allocator;
    const args = try std.process.argsAlloc(gpa);
    defer std.process.argsFree(gpa, args);

    if (args.len < 2) {
        std.log.err("使用法: {s} <ポート> [ピア...]", .{args[0]});
        std.log.err("       {s} --conformance <テスト名> [--update]", .{args[0]});
        return;
    }

    // ポートとピアのためのコマンドライン引数の解析
    const self_port = try std.fmt.parseInt(u16, args[1], 10);
    const known_peers = args[2..];

    // 初期ブロックチェイン状態の表示
    blockchain.printChainState();

    // 着信接続用のリスナースレッドを開始
    _ = try std.Thread.spawn(.{}, p2p.listenLoop, .{self_port});

    // すべての既知のピアに接続
    for (known_peers) |spec| {
        const peer_addr = try resolveHostPort(spec);
        _ = try std.Thread.spawn(.{}, p2p.connectToPeer, .{peer_addr});
    }

    // インタラクティブなテキスト入力スレッドを開始
    _ = try std.Thread.spawn(.{}, p2p.textInputLoop, .{});

    // メインスレッドを生かし続ける
    while (true) std.time.sleep(60 * std.time.ns_per_s);
}

/// ホスト:ポート文字列をネットワークアドレスに解決
///
/// "hostname:port"形式の文字列を受け取り、接続に使用できる
/// ネットワークアドレスに解決します。
///
/// 引数:
///     spec: "hostname:port"形式の文字列
///
/// 戻り値:
///     std.net.Address - 解決されたネットワークアドレス
///
/// エラー:
///     error.Invalid: 文字列フォーマットが無効な場合
///     std.net.Address.resolveIpからのその他のエラー
fn resolveHostPort(spec: []const u8) !std.net.Address {
    var it = std.mem.tokenizeScalar(u8, spec, ':');
    const host = it.next() orelse return error.Invalid;
    const port_s = it.next() orelse return error.Invalid;
    const port = try std.fmt.parseInt(u16, port_s, 10);
    return std.net.Address.resolveIp(host, port);
}

```

上記では概略として、known_peersの各要素（host:port形式の文字列）についてconnectToPeerという関数を新たにスレッドとして起動し、ピアへの接続処理を行っています。listenLoopはサーバーとしての受け入れ処理（後述）を別スレッドで走らせています。これにより、単一のノードプロセスで同時に複数の接続を張りに行きつつ、自身もサーバーとして待ち受けるという並列処理が可能になります。

resolveHostPortは文字列からstd.net.Addressを作るユーティリティ関数だと考えます。
実装ではstd.net.Address.resolveIpとトークナイザでホストとポートを切り分ける処理を行います。

各connectToPeerスレッド内では、与えられたアドレスに対しstd.net.tcpConnectToAddressを呼んでTCP接続し、接続成功したらそのソケットを使って通信を始めます。
また、接続したらpeer_listに新規ピアを追加しておきます。

```p2p.zig
fn connectToPeer(remote_addr: std.net.Address) !void {
    var socket = try std.net.tcpConnectToAddress(remote_addr);
    const peer = types.Peer{ .address = remote_addr, .stream = socket };
    // ピアリストに追加
    _ = peer_list.append(peer);
    std.log.info("Connected to peer: {any}", .{remote_addr});
    try peerCommunicationLoop(peer);
}
```

ここでpeerCommunicationLoopは、接続したピアとの間でメッセージの送受信を行うループ処理です。この中で受信メッセージの解析や、送信処理（後述するチェイン同期要求など）を実装します。

ポイントは以下のとおりです。

- std.Thread.spawnを使ってスレッドを起動する際、第1引数にスレッドへ渡すデータ（ここでは.{listener}や.{addr}）を与えています。それぞれ別スレッドで処理することで、ノード起動時に同時並行で複数の接続処理が行えるようになります。
- スレッドを起動した後にmain関数がすぐ終了してしまうとプロセス自体が終了してしまうため、通常であればスレッドのjoinを待ったり、無限ループやチャンネルで待機する処理を入れます。本実装では簡略化のため、たとえば最後に標準入力を待ち受けるループを置くなどしてプロセスが継続するようにするとよいでしょう。

## P2Pノードの受信処理（サーバーとして接続受け入れ）

次に、ノードがサーバーとして動作し、他のピアからの接続を受け入れる処理を実装します。第7章では --listenモードの場合に1対1で接続を受け入れていましたが、第8章ではノードが常にリスナーとして待ち受けるようにします（上記コードではlistenLoopを起動）。

listenLoopスレッドでは以下のような処理を行います。

```blockchain.zig
fn listenLoop(listener: std.net.Server) !void {
    defer listener.deinit(); // 関数終了時にリスナーを閉じる

    while (true) {
        const conn = try listener.accept(); // 新しい接続を受け入れ
        std.log.info("Accepted connection from {any}", .{conn.address});
        // Peer構造体に変換してリストに追加
        const peer = types.Peer{ .address = conn.address, .stream = conn.stream };
        _ = peer_list.append(peer);
        // このピアとの通信処理を別スレッドで開始
        _ = try std.Thread.spawn(.{}, peerCommunicationLoop, .{peer});
    }
}
```

listener.accept() により外部からの接続要求を受け付けると、新たにconn（std.net.Server.Connection型）が得られます。これには相手のアドレス情報とソケットストリームが含まれています。ここでそれを我々のtypes.Peer構造体に詰め替え、peer_listに追加します。そして、新規ピアとの通信処理（peerCommunicationLoop）をこれまた別スレッドで開始しています。これにより受信専用スレッド（listenLoop）はすぐ次のaccept()待ちに戻り、同時に通信処理スレッドが追加されたピアごとに走るマルチスレッド構成となります。

### ノード起動時

- 既知の複数ピアに対し接続を確立しに行く（アウトバウンド接続）。
- リスナーを立ち上げ、他ピアからの接続も受け入れる（インバウンド接続）。
- 新規ノードであれば、接続直後にチェイン同期要求（GET_CHAIN）を送る。

### 平常時

- 各ノードは接続中の全ピアとの間でpeerCommunicationLoopを回し、メッセージのやり取りをする。
- 新しいブロックがユーザ入力などで生成されると（次項で説明）、BLOCK: メッセージとして全ピアに送信する。
- ブロックを受信したノードは即座に自分のチェインへ追加し、他のピアへとそのブロックを転送（ゴシップ拡散）する。
- チェイン同期要求が来れば、自分の持つ全ブロックを相手に送信する。

### 重要な注意

ここで各ノードがジェネシスブロックを持っている場合、異なるノードが異なるジェネシスブロックを生成するとチェインに不整合が生じます。
本実装では、最初にネットワークへ参加したノードがジェネシスブロックを生成し、それ以降に参加するノードはGET_CHAINによってそのジェネシスを含むチェインを受け取ることで揃います。従って、新規ノードでは上記コードでcreateTestGenesisBlockを呼ぶことは基本的に無く、既存ネットワークからチェインを取得する想定です。

以上で、各ノードがお互いにブロックをやりとりし、同じブロックチェインを同期できるP2Pネットワークが完成しました。試しにターミナルを複数開いてノードを起動し、ブロックを作成してます。

### Node A（ポート8000）を起動

```bash
zig build run -- --listen 8000
```

### Node B（ポート8001）を起動（Node Aを既知ピアとして指定）

```bash
zig build run -- --listen 8001 127.0.0.1:8000
```

### Node C（ポート8002）を起動（Node AとBを既知ピアとして指定）

```bash
zig build run -- --listen 8002 127.0.0.1:8000
```

それぞれのノードで起動メッセージが表示されたら、どれか1つのノードでブロックメッセージを入力してみてください。例えばNode CのコンソールでHello P2Pと入力すると、マイニングが行われた後、他のNode AやNode Bのログにも新しいブロックを受信・追加した旨が表示されるはずです。これがピアツーピア同期の効果です。

## 接続の維持と再接続の処理

最後に、ネットワークの接続維持について簡単に触れておきます。ノード同士の接続は永続的に保ちたいものですが、ネットワーク障害や相手ノードのダウンなどでソケット切断が発生する可能性こともあります。本章の実装では、ソケットが切れた場合に受信ループが終了しログに通知を出しています。このままでは接続が途切れたままになってしまうため、再接続処理を入れてみましょう。

シンプルな方法は、接続処理自体をループで囲むことです。たとえば先ほどのconnectToPeer関数を次のように変更します。

```blockchain.zig
fn connectToPeer(remote_addr: std.net.Address) !void {
    while (true) {
        // ピアに接続を試みる
        const result = std.net.tcpConnectToAddress(remote_addr);
        if (result) |socket| {
            // 接続成功
            const peer = types.Peer{ .address = remote_addr, .stream = socket };
            if (peer_list.append(peer)) |_| {}; // 既に存在する場合の考慮は省略
            std.log.info("Connected to peer: {any}", .{remote_addr});
            // 通信ループを実行（終了すると切断）。
            peerCommunicationLoop(peer) catch |err| std.log.err("Error: {s}", .{err});
            std.log.warn("Connection lost. Will retry in 5 seconds...");
            socket.close();
        } else |err| {
            std.log.err("Failed to connect: {any}. Retrying in 5 seconds...", .{err});
        }
        std.time.sleep(5 * std.time.second);
        // 5秒待って再トライ（ループ継続）
    }
}
```

このようにすることで、接続に失敗した場合や、一度成功しても後で切断された場合に、一定の待ち時間をおいて自動的に再接続を繰り返すようになります。とても簡易的ですが、ネットワークの安定性を高める効果があります。インバウンド接続に関しては、相手側が再度接続してくるのを待つしかありませんが、自ノードがリスナーとして常に待ち受けている限り特別な処理は不要でしょう（リスナーは止めないこと）。

注意: 再接続処理を入れると、プログラム終了時にもループを抜けないため終了できなくなる可能性があります。終了シグナル（Ctrl+C等）を受け取ったらループをbreakする、といった仕組みも本格的には必要ですが、ここでは割愛します。

## まとめ

本章では、ブロックチェインネットワークをピアツーピア通信へと発展させ、ノード同士が対等にブロックを交換・同期できるようにしました。これにより、一方向だった通信が双方向かつ分散的になり、新しいノードのチェイン同期やブロックのネットワーク全体への伝播がスムーズに行われるようになります。

この章で実装した主な機能は以下のとおりです。

- ピアリストによる複数接続管理と、自動接続処理。
- 受信したブロックの他ピアへの再伝播（ゴシッププロトコル的拡散）。
- 新規ノードが既存ネットワークからブロックチェイン全体を取得するGET_CHAIN処理。
- 簡易的な再接続による接続維持。

これで基本的なP2Pネットワークは完成ですが、実際のブロックチェインでは不正なデータの排除やフォークの解決、トランザクションプールの同期など、更なる課題が存在します。次章以降では、これらの発展的トピックについても触れていきます。
