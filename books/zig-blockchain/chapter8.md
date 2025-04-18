---
title: "Zigを用いたP2Pブロックチェインの実装 ピアツーピアでのブロック同期"
free: true
---

これまでは、サーバー（受信専用）とクライアント（送信専用）に役割を分け、一方向にブロックを送信する仕組みを構築しました。しかし、この方式では各ノードが対等ではなく、真の分散型ネットワークとは言えません。第8章では、この制限を取り払いピアツーピア（P2P）通信を実装します。
各ノードが送信、受信も行う対等なピアとなり、相互にブロックを交換・同期できるネットワークを構築しましょう。

## この章の目標

- ピア情報の管理: 複数の接続先（ピア）の情報をノードが保持し、必要に応じて追加・削除できるようにします。
- 既知ピアへの自動接続: ノード起動時に、あらかじめ知っている複数のピアに対して自動的に接続を試み、ネットワークに参加します。
- ブロックのゴシップ配信: あるピアから新しいブロックを受信した際に、自分が接続している他の全てのピアへそのブロックを再送信し、ネットワーク全体にブロックを広めます（ゴシッププロトコル風の拡散）。
- チェイン全体の同期（RPCの実装）: 新規ノードがネットワークに参加した際、既存ピアに対して自分の持つブロックチェイン全体を要求・取得し、一気に同期できるようにします。
- 接続の維持と再接続: ノードはピアとの接続状態を監視し、切断された場合の再接続やタイムアウト処理を（簡易的に）行います。

## ピアの情報管理とネットワーク構成の変更

まず、ノードが複数のピアと接続を維持できるように、ピア情報を管理する仕組みを作ります。まず、P2P化にあたりピアのリストを持てるように拡張します。
具体的には、接続中の各ピアを表すデータ構造を用意します。types.Peer構造体を活用し、これをリストで管理しましょう。Zigの標準ライブラリのstd.ArrayListを使って可変長の配列としてピアを保存します。

```blockchain.zig
const std = @import("std");
const types = @import("types.zig");

// ピア一覧を保持するグローバルなリスト（ヒープ上に確保）。
var peer_list = std.ArrayList(types.Peer).init(std.heap.page_allocator);
```

上記のようにpeer_listを定義しておけば、新たなピアとの接続時にその情報をリストに追加し、切断時はリストから削除するといった管理が可能になります。各ピアにはIPアドレスとポート番号、そしてそのピアとの通信に使用するソケットストリームが含まれます。

ポイントは以下のとおりです。

- peer_listはグローバル変数として定義していますが、実装上は適切にスコープを管理するかシングルトン的に扱うのがよいでしょう。ここではシンプルさを優先しグローバルにしています。
- マルチスレッドでpeer_listを操作する際は排他制御が必要になりますが、本章では簡易的に扱い、深追いしません。必要であれば、Zigのstd.Thread.Mutexなどで保護してください。

## ノード起動時に複数のピアへ自動接続する

ピア一覧を管理できるようになったところで、既知のピアに自動接続する処理を実装します。ネットワークに新しいノードを参加させる際、あらかじめネットワーク内のいくつかのノードのアドレスを知っていれば、それらに接続することでブロックチェインの同期を開始できます。これはブロックチェインネットワークのブートストラップによくある手法です。

本実装では、プログラムの引数や設定に既知ピアのアドレス一覧を渡し、起動時に順次接続を試みるようにします。main.zigのエントリポイント付近を修正し、例えば以下のようにします。

```main.zig
pub fn main() !void {
    const args = try std.process.argsAlloc(std.heap.page_allocator);
    defer std.process.argsFree(std.heap.page_allocator, args);

    // コマンドライン引数からポート番号と既知ピアを取得
    const port = try std.fmt.parseInt(u16, args[1], 10);
    var known_peers: []const u8 = args[2..]; // 2番目以降の引数を "host:port" 形式のリストとみなす

    // 自ノードのサーバー（リスナー）を起動
    var address = try std.net.Address.resolveIp("0.0.0.0", port);
    var listener = try address.listen(.{});
    std.log.info("Listening on 0.0.0.0:{d}", .{port});
    _ = try std.Thread.spawn(.{}, listenLoop, .{listener}); // 別スレッドで受信ループ開始

    // 既知ピアに対して接続を開始
    for (known_peers) |peer_addr_str| {
        // "host:port" をパースして Address 構造体に変換
        const addr = try resolveHostPort(peer_addr_str);
        std.log.info("Connecting to {s}...", .{peer_addr_str});
        _ = try std.Thread.spawn(.{}, connectToPeer, .{addr});
    }

    // （以下、ユーザー入力やその他の処理）
}
```

上記では概略として、known_peersの各要素（host:port形式の文字列）についてconnectToPeerという関数を新たにスレッドとして起動し、ピアへの接続処理を行っています。listenLoopはサーバーとしての受け入れ処理（後述）を別スレッドで走らせています。これにより、単一のノードプロセスで同時に複数の接続を張りに行きつつ、自身もサーバーとして待ち受けるという並列処理が可能になります。

resolveHostPortは文字列からstd.net.Addressを作るユーティリティ関数だと考えます。
実装ではstd.net.Address.resolveIpとトークナイザでホストとポートを切り分ける処理を行います。

各connectToPeerスレッド内では、与えられたアドレスに対しstd.net.tcpConnectToAddressを呼んでTCP接続し、接続成功したらそのソケットを使って通信を始めます。
また、接続したらpeer_listに新規ピアを追加しておきます。

```blockchain.zig
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

## ピアとの通信処理とブロックの再伝播

それでは、実際にピア間でブロックやメッセージをやり取りする通信処理を実装しましょう。共通の通信処理は先ほどから出ているpeerCommunicationLoop関数にまとめます。これはどのピアとの接続であっても共通のロジックで動作し、受信メッセージの内容に応じて適切な処理を行います。第7章で実装したConnHandler.run（サーバー受信処理）やClientHandler.run（クライアント送信処理）の役割を統合したようなもの、と考えるておくとよいでしょう。

peerCommunicationLoopの概略コードは以下のようになります。

```blockchain.zig
fn peerCommunicationLoop(peer: types.Peer) !void {
    defer peer.stream.close(); // 通信終了時にソケットをクローズ

    // 接続してきた/接続したピアのストリームからリーダーを取得
    var reader = peer.stream.reader();
    var buf: [256]u8 = undefined;

    // チェーン要求: 接続直後に自分が新規ノードならチェーン全体を要求
    if (chain_store.items.len == 0 or chain_store.items.len == 1) {
        // 簡易判定: 自分のチェーンがGenesisブロックしかない（もしくは空）場合
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
            // 受信したブロックを自分のチェーンに追加
            blockchain.addBlock(new_block);
            // 他のピアへ再伝播（ゴシップ）
            broadcastBlock(new_block, peer);
        } else if (std.mem.startsWith(u8, msg, "GET_CHAIN")) {
            // ピアからチェーン同期要求を受け取った場合
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

**ここまでで、**ノード間で以下の通信シーケンスが実現できました。

### ノード起動時

- 既知の複数ピアに対し接続を確立しに行く（アウトバウンド接続）。
- リスナーを立ち上げ、他ピアからの接続も受け入れる（インバウンド接続）。
- 新規ノードであれば、接続直後にチェイン同期要求（GET_CHAIN）を送る。

### 平常時

- 各ノードは接続中の全ピアとの間でpeerCommunicationLoopを回し、メッセージのやり取りをする。
- 新しいブロックがユーザ入力などで生成されると（次項で説明）、BLOCK: メッセージとして全ピアに送信する。
- ブロックを受信したノードは即座に自分のチェインへ追加し、他のピアへとそのブロックを転送（ゴシップ拡散）する。
- チェイン同期要求が来れば、自分の持つ全ブロックを相手に送信する。

## ブロック生成と送信の実装（双方向通信の完成）

ピアツーピアネットワークの通信基盤が整ったところで、各ノードがブロックを生成し、それをネットワーク上に広める処理を組み込みます。第7章ではクライアント側でユーザー入力からブロックを作成しサーバーに送信していました。同様の機能を全ノードで使えるようにしましょう。具体的には、ユーザーのコンソール入力を監視するループを設け、新しい取引メッセージを入力することでブロックを生成・採掘し、直ちに接続中の全ピアにブロックを配信します。

これは、第7章のClientHandler.clientSendLoopとほぼ同じ処理ですが、今回のP2Pノードでは**「自分が任意のタイミングでブロックを生成して全員に送信する」**役割を担います。実装上は専用のスレッドを起こすか、あるいはmain関数内で無限ループを回して標準入力を待ち受けても構いません。ここでは簡単のためmainの最後で行います。

```main.zig
// 標準入力から新規ブロックデータを読み取り、ブロック生成・送信するループ
var stdin = std.io.getStdIn();
var input_reader = stdin.reader();
var line_buffer:[256]u8 = undefined;

while (true) {
    std.debug.print("\nEnter message for new block: ", .{});
    const line = try input_reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
    if (line == null) break; // EOF（入力終了）時はループ脱出

    const message = line.?; // 入力文字列
    // 最新ブロックを取得（チェーンが空ならジェネシスを生成）
    const last_block = if (blockchain.chain_store.items.len > 0)
        blockchain.chain_store.items[blockchain.chain_store.items.len - 1]
        else try blockchain.createTestGenesisBlock(std.heap.page_allocator);

    // 新規ブロックを生成してPoWマイニング
    var new_block = blockchain.createBlock(message, last_block);
    blockchain.mineBlock(&new_block, blockchain.DIFFICULTY);
    std.log.info("Mined new block index={d}, nonce={d}, hash={x}",
                 .{ new_block.index, new_block.nonce, new_block.hash });

    // 自分のチェーンに追加し、全ピアに送信
    blockchain.addBlock(new_block);
    broadcastBlock(new_block, undefined);
}
```

このコードでは、まずユーザーに対し「新しいブロックのメッセージ」をコンソールから入力するよう促しています。何か文字列を入力してEnterを押すと、その内容を含むブロックを作成し、マイニング（mineBlock）してPoWが成立するnonceとハッシュを計算します。ブロックが完成したら、自分のチェインに即追加し、先ほど実装したbroadcastBlock関数を使って全ピアに通知します。
broadcastBlockと第2引数にundefinedを渡していますが、これは「送信元のピアが特定の相手によるものではない」ことを示すためです。

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
