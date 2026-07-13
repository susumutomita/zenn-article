---
title: "ZigでP2P通信の土台を作る"
free: true
---

## ZigでP2P通信の土台を作る

この章では、後続章でブロックやトランザクションを共有するためのTCP通信層を作ります。まず1対1の送受信を実装し、次にメッセージ種別を付けた文字列を交換します。
ブロックのJSON化と伝播は第7章、チェイン全体の同期は第8章で実装します。本章の到達点は、ZigのソケットAPIで2プロセスが接続し、メッセージを往復できることです。

### ノードについて

「ノード」とはブロックチェインネットワークに参加するコンピュータやプログラムを指します。一般的なフルノードは、ネットワーク上のデータを保持し検証することで、単一障害点を減らします。
本章では、固定したピアへ接続するTCP通信だけを扱います。SPV/軽量ノードは実装対象外です。

目標は以下のとおりです。

- ZigでTCPの待受、接続、読み書きを実装する
- 2プロセス間でメッセージ種別とペイロードを交換する
- 第7章のブロック伝播へ進める通信の土台を完成させる

執筆スタイルとして、各セクションで実装のコード例と詳細な解説を交えます。読者の皆さんが実際に手を動かして試しやすいよう、段階的に説明していきます。

## ステップ1: 基本的なP2P通信の実装

```text
対象パス:   references/chapter6/step1/nodeA/src/main.zig、references/chapter6/step1/nodeB/src/main.zig
開始地点:   それぞれ空のディレクトリで zig init を実行した状態
今回の変更: nodeAをTCPサーバー、nodeBを1回送信するTCPクライアントとして実装
テスト:     両ディレクトリで zig fmt --check . && zig build test && zig build
実行:       nodeAで zig build run、その後nodeBで zig build run
期待結果:   nodeAのログに Hello from NodeB が1回表示される
```

まずはブロックチェインネットワークの土台となる、ノード同士の直接通信を実装します。P2Pネットワークでは各ノードがサーバ、クライアントになりえます。そのため、お互いに接続してメッセージをやりとりできる仕組みが必要です。ここではZig標準ライブラリのソケット機能を使い、TCP通信によるノード間の接続とメッセージ交換をします。また、どのノードと接続済みかを把握するためのノードリスト管理も実装します。

### ZigでのTCPソケット通信のセットアップ

Zigには低レベルのソケットAPIが用意されており、`std.net`モジュールを使って比較的簡潔にTCPサーバ/クライアントを作成できます。以下に、ローカルホスト上で動作する簡単なサーバとクライアントの例を示します。

- サーバ側 (ノード): 指定したポートでソケットを開き、接続を待ち受けます。`std.net.Address`でアドレスを決め、`listen()`関数でサーバソケットを生成し、`accept()`でクライアントからの接続を受け付けます。

- クライアント側 (別のノード): 接続したい相手のIPアドレスとポートを指定し、`std.net.tcpConnectToAddress()`でサーバに接続します ([Zig Common Tasks](https://renatoathaydes.github.io/zig-common-tasks/#:~:text=pub%20fn%20main%28%29%20%21void%20,%7D))。接続が確立したら、ソケットに対してデータの読み書きができます。

```zig
const std = @import("std");

pub fn main() !void {
    // 1. サーバノードとしてソケットを開く (ポート8080で待ち受け)
    var server_addr = try std.net.Address.resolveIp("0.0.0.0", 8080);
    var listener = try server_addr.listen(.{}); // リッスン開始 ([how to set up a zig tcp server socket - Stack Overflow](https://stackoverflow.com/questions/78125709/how-to-set-up-a-zig-tcp-server-socket#:~:text=const%20addr%20%3D%20std.net.Address.initIp4%28.,listen))
    defer listener.deinit(); // プログラム終了時にクローズ

    std.log.info("ノードA: ポート8080で待機中...", .{});

    // 2. 新規接続を受け付ける
    const connection = try listener.accept();
    defer connection.stream.close(); // 接続ストリームをクローズ
    std.log.info("ノードA: 新しい接続を受け付けました: {any}", .{connection.address});

    // 3. 相手からのメッセージを読み取る
    const reader = connection.stream.reader();
    var buffer: [256]u8 = undefined;
    const bytes_read = try reader.readAll(&buffer);
    std.log.info("ノードA: 受信したメッセージ: {} バイト", .{bytes_read});

    // 受信したメッセージの内容を表示
    const message = buffer[0..bytes_read];
    std.log.info("ノードA: メッセージ内容: {s}", .{message});
}
```

上記は一例ですが、このコードをノードAとして起動すると、自分の8080ポートで接続を待ち受けます。`listener.accept()`により外部からの接続要求を1件受け付け、`connection.stream.reader()`で入力ストリームを取得しています。 このように、Zigでは`stream`経由で読み書きをができるラッパーが提供されており、`reader()`や`writer()`メソッドでバッファを扱うことができます。

```bash
❯ zig build run
info: ノードA: ポート8080で待機中...
```

クライアント（ノードB側）からは例えば以下のように接続と送信をします。

```zig
const std = @import("std");

pub fn main() !void {
    // ノードB: ノードA（localhost:8080）へ接続しメッセージ送信
    const remote_addr = try std.net.Address.resolveIp("127.0.0.1", 8080);
    var socket = try std.net.tcpConnectToAddress(remote_addr); // 接続 ([Zig Common Tasks](https://renatoathaydes.github.io/zig-common-tasks/#:~:text=pub%20fn%20main%28%29%20%21void%20,%7D))
    defer socket.close();

    const message = "Hello from NodeB\n";
    const writer = socket.writer();
    std.log.info("ノードB: 送信メッセージ: {s}", .{message});
    try writer.writeAll(message);
    std.log.info("ノードB: メッセージの送信が完了しました", .{});
}
```

ノードBを実行すると、ノードAで待ち受けている8080番ポートに接続し、「Hello from NodeB」という文字列を送ります。ノードA側ではそのメッセージを受け取り、ログに表示する、という流れです。

```bash
❯ zig build run
info: ノードB: 送信メッセージ: Hello from NodeB

info: ノードB: メッセージの送信が完了しました
```

```bash
❯ zig build run
info: ノードA: ポート8080で待機中...
info: ノードA: 新しい接続を受け付けました: 127.0.0.1:58650
info: ノードA: 受信したメッセージ: 17 バイト
info: ノードA: メッセージ内容: Hello from NodeB
```

ポイント解説は以下のとおりです。

- ソケットの生成とバインド:
`Address.resolveIp("0.0.0.0", port)`で待ち受け用のアドレス構造体を作成し、`listen()`を呼ぶことでサーバソケット（リスナー）を生成します。
`0.0.0.0`は「全てのインタフェースで待つ」ことを意味し、ローカルPC上どのIPでも接続可能になります。
`listen()`にはオプションとしてバックログサイズなどを指定できますが、ここではデフォルト設定`.{}`を使用しています。

- 接続の受け入れ: `accept()`はブロッキング呼び出しで、クライアントから接続要求が来るまで待機します（別スレッドや非同期処理で受け入れることも可能です）。戻り値は新たに確立した接続を表すオブジェクトで、`connection.stream`プロパティに読み書き用のストリームが含まれています。

- データ送受信: Zigでは`stream.reader()`と`stream.writer()`からリーダー/ライタを取得できます。文字列などの送信:`writeAll()`, 受信:`readAll()`や`readUntilDelimiterOrEofAlloc()`と便利関数が利用できます。上記の例では簡単のため、一度に全て読み取る`readAll()`を使っています。

- クリーンアップ: 通信が終わったら`connection.stream.close()`でソケットを閉じます。また、サーバソケット自体も`listener.deinit()`で閉じる必要があります（上記では`defer`で自動クローズ指定）。適切にクローズしないと、プログラム終了後もしばらくポートが「使用中」となり再起動時に接続エラーが発生します。

## ステップ2: ノード同士の接続と基本メッセージ交換

```text
対象パス:   references/chapter6/step2/nodeA/src/main.zig
開始地点:   ch06-sec01-one-way-tcp
今回の変更: 1つの実行ファイルへlisten/connectモード、MSG/ACKの往復を追加
テスト:     zig fmt --check . && zig build test && zig build。章末に実TCPで往復確認
実行:       zig build run -- --listen 8080 と zig build run -- --connect 127.0.0.1:8080
期待結果:   HELLO Aを送ると、サーバーにHELLO A、クライアントにACK:HELLO Aが表示される
```

先ほど紹介したサーバ(A)・クライアント(B)という一対のやり取りを、ブロックチェインのP2Pネットワークではより柔軟な相互接続に拡張します。実際のブロックチェインP2Pネットワークでは、各ノード（ピア）が複数の隣接ノードと接続し合い、ブロックやトランザクションなどのデータを中継・共有します。そのため、ノードの実装には以下の2つの機能が必要になります。
1.受信用のサーバ機能
他ノードからの接続を受け付けるリスナーソケット。これはステップ1で紹介したようにlisten()とaccept()を用いて実装します。
2.送信用のクライアント機能
自分から既知のノードに対し接続を開く機能。tcpConnectToAddress() を使い、手動で指定したアドレスへ接続を開始します。

ノードを起動する際、コマンドライン引数で接続先（既に稼働中のノードのIPアドレス）を受け取り、指定があればそれに接続を試みる、という流れを考えられます。新しくネットワークに参加するノードは、少なくとも1台のブートストラップノード（既知のアドレス）に繋がることで、そこからネットワークに加わる仕組みです。今回は単純に、ユーザーが起動時にIPアドレスとポートを入力して手動接続する方式を例示します。

基本的なメッセージ交換プロトコルについて。

ノード間でやりとりするデータ形式は、最初は文字列ベースで問題ありません。たとえば初期ハンドシェイクとして、以下のような簡易プロトコルを想定できます。
•接続開始時、ノードA → Bに "HELLO A" と送信し、ノードB → Aに "HELLO B" と返す。
•これにより互いに相手のIDを認識したら、その後はブロックやトランザクションの同期メッセージをやりとりする。

実際のBitcoinプロトコルでも、接続直後にversionメッセージを交換し、続いてverack（承認応答）のやりとりを行う「ハンドシェイク」があります（詳しくは[こちら](https://learnmeabitcoin.com/technical/networking/)参照）。ここではあくまでもシンプルな例として、「HELLO」で始める方法を示しているだけです。

以下のコードでは、サーバーモードとクライアントモードを起動引数で切り替えます。クライアントは`MSG:<payload>`を送り、サーバーは`ACK:<payload>`を返します。これにより、片方向の送信ログだけでなく同じTCP接続上の往復まで確認できます。

```zig
const std = @import("std");

/// ノード情報を表す構造体
/// - address: 相手ノードのIPアドレスとポート
/// - stream: 接続済みのTCPストリーム
const Peer = struct {
    address: std.net.Address,
    stream: std.net.Stream,
};

/// ピアリスト
/// ここでは最大10ノードまで接続する簡易実装
const MAX_PEERS = 10;
var peers: [MAX_PEERS]?Peer = [_]?Peer{null ** MAX_PEERS};

/// 受信を処理するスレッド関数 (スレッドに渡すためにstruct + run関数を定義)
const ConnHandler = struct {
    fn handleMessage(conn: std.net.Server.Connection, message: []const u8) !void {
        if (!std.mem.startsWith(u8, message, "MSG:")) {
            std.log.warn("Unknown message from {any}: {s}", .{ conn.address, message });
            return;
        }

        const payload = message[4..];
        std.log.info("[Received from {any}] {s}", .{ conn.address, payload });

        var writer = conn.stream.writer();
        try writer.writeAll("ACK:");
        try writer.writeAll(payload);
        try writer.writeAll("\n");
        std.log.info("[Sent to {any}] ACK:{s}", .{ conn.address, payload });
    }

    fn run(conn: std.net.Server.Connection) !void {
        defer conn.stream.close(); // 接続が終わったらクローズ
        var reader = conn.stream.reader();

        std.log.info("Accepted a new connection from {any}", .{conn.address});
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
                try handleMessage(conn, message);
                consumed = newline + 1;
            }

            if (consumed > 0) {
                const remaining = buffered - consumed;
                std.mem.copyForwards(u8, buf[0..remaining], buf[consumed..buffered]);
                buffered = remaining;
            }

            if (buffered == buf.len) {
                std.log.warn("Message too long from {any}; closing connection", .{conn.address});
                break;
            }
        }
    }
};

/// 相手への送信専用スレッド (クライアントとしての送信用)
/// ユーザーがコンソールに入力した文字列を送信する
const SendHandler = struct {
    fn run(peer: Peer) !void {
        // 読み取りはメインスレッドが担当するため、終了時は送信側だけを閉じる。
        defer std.posix.shutdown(peer.stream.handle, .send) catch {};
        std.log.info("Connected to peer {any}", .{peer.address});

        var stdin_file = std.io.getStdIn();
        const reader = stdin_file.reader();

        while (true) {
            std.log.info("Type message (Ctrl+D to exit): ", .{});
            var line_buffer: [256]u8 = undefined;
            const maybe_line = try reader.readUntilDelimiterOrEof(line_buffer[0..], '\n');
            if (maybe_line == null) {
                std.log.info("EOF reached. Exiting sending loop.", .{});
                break;
            }
            const line_slice = maybe_line.?; // オプショナルをアンラップして実際のスライスを取得

            // 書き込み(送信)
            var writer = peer.stream.writer();
            try writer.writeAll("MSG:");
            try writer.writeAll(line_slice);
            try writer.writeAll("\n");
            std.log.info("Message sent to {any}: {s}", .{ peer.address, line_slice });
        }
    }
};

pub fn main() !void {
    const gpa = std.heap.page_allocator;

    // 簡易的な引数パース:
    // e.g.   --listen 8080      でサーバ
    //        --connect 127.0.0.1:8080   でクライアント
    const args = std.process.argsAlloc(gpa) catch |err| {
        std.log.err("Failed to allocate args: {any}", .{err});
        return;
    };
    defer std.process.argsFree(gpa, args);

    if (args.len < 3) {
        std.log.info("Usage:\n  {s} --listen <port>\nOR\n  {s} --connect <host:port>", .{ args[0], args[0] });
        return;
    }

    const mode = args[1];
    if (std.mem.eql(u8, mode, "--listen")) {
        // ============== サーバーモード ==============
        const port_string = args[2];
        const port_num = std.fmt.parseInt(u16, port_string, 10) catch {
            std.debug.print("Invalid port number: {s}\n", .{port_string});
            return;
        };
        // ソケットをバインドして listen
        var address = try std.net.Address.resolveIp("0.0.0.0", port_num);
        var listener = try address.listen(.{});
        defer listener.deinit();

        std.log.info("Listening on port {d}...", .{port_num});

        // acceptループ(同期的)
        while (true) {
            const connection = try listener.accept();
            // 受信処理を別スレッドで開始
            // Updated to use the new Thread.spawn API with config parameter
            _ = try std.Thread.spawn(.{}, ConnHandler.run, .{connection});
            // note: spawnしたスレッドはデタッチされる(自動的に終了時破棄)
        }
    } else if (std.mem.eql(u8, mode, "--connect")) {
        // ============== クライアントモード ==============
        const hostport = args[2];
        // e.g. hostport = "127.0.0.1:8080"
        var parse_it = std.mem.tokenizeScalar(u8, hostport, ':');
        const host_str = parse_it.next() orelse {
            std.log.err("Please specify host:port", .{});
            return;
        };
        const port_str = parse_it.next() orelse {
            std.log.err("Please specify port after :", .{});
            return;
        };
        if (parse_it.next() != null) {
            std.log.err("Too many ':' in address", .{});
            return;
        }
        const port_num = std.fmt.parseInt(u16, port_str, 10) catch {
            std.log.err("Invalid port: {s}", .{port_str});
            return;
        };

        std.log.info("Connecting to {s}:{d}...", .{ host_str, port_num });
        const remote_addr = try std.net.Address.resolveIp(host_str, port_num);
        var socket = try std.net.tcpConnectToAddress(remote_addr);
        defer socket.close();
        // 送信用のスレッドをspawn
        const peer = Peer{
            .address = remote_addr,
            .stream = socket,
        };
        // ノンブロッキングで送信ループ
        // Updated to use the new Thread.spawn API with config parameter
        _ = try std.Thread.spawn(.{}, SendHandler.run, .{peer});
        std.log.info("Launched send-loop thread. Now reading from peer {s}:{d}...", .{ host_str, port_num });

        // メインスレッドで受信ループ
        var reader = socket.reader();
        var buf: [4096]u8 = undefined;
        var buffered: usize = 0;

        while (true) {
            const n = try reader.read(buf[buffered..]);
            if (n == 0) {
                if (buffered > 0) {
                    std.log.warn("Ignoring unterminated message from {s}:{d}", .{ host_str, port_num });
                }
                std.log.info("Peer {s}:{d} disconnected.", .{ host_str, port_num });
                break;
            }

            buffered += n;
            var consumed: usize = 0;
            while (std.mem.indexOfScalarPos(u8, buf[0..buffered], consumed, '\n')) |newline| {
                const message = std.mem.trimRight(u8, buf[consumed..newline], "\r");
                std.log.info("[Received from {s}:{d}] {s}", .{ host_str, port_num, message });
                consumed = newline + 1;
            }

            if (consumed > 0) {
                const remaining = buffered - consumed;
                std.mem.copyForwards(u8, buf[0..remaining], buf[consumed..buffered]);
                buffered = remaining;
            }

            if (buffered == buf.len) {
                std.log.warn("Message too long from {s}:{d}; closing connection", .{ host_str, port_num });
                break;
            }
        }
    } else {
        std.log.err("Unsupported mode: {s}", .{mode});
        return;
    }
}
```

TCPはメッセージ境界を保持しないバイトストリームです。そのため、サーバーが`ACK:`、ペイロード、改行を順に書いても、クライアント側の1回の`read()`で全体を受け取れるとは限りません。上の受信ループは未完了のバイト列を`buf`に残し、改行が届いた時点で初めて1つの応答として表示します。1回の`read()`に複数の応答が入った場合も改行ごとに処理します。切断まで改行が届かなかった断片は警告して無視し、4096バイトを超えても改行がない入力は接続を閉じます。

### 実行例

ターミナルを2つ用意し、それぞれ以下のように実行します。

```bash
ノードA (サーバーモード):
❯ zig build run -- --listen 8080
info: Listening on port 8080...
info: Accepted a new connection from 127.0.0.1:50115
info: [Received from 127.0.0.1:50115] HELLO A
info: [Sent to 127.0.0.1:50115] ACK:HELLO A
```

```bash
ノードB (クライアントモード):

❯ zig build run -- --connect 127.0.0.1:8080
info: Connecting to 127.0.0.1:8080...
info: Launched send-loop thread. Now reading from peer 127.0.0.1:8080...
info: Connected to peer 127.0.0.1:8080
info: Type message (Ctrl+D to exit):
HELLO A
info: Message sent to 127.0.0.1:8080: HELLO A
info: [Received from 127.0.0.1:8080] ACK:HELLO A
info: Type message (Ctrl+D to exit):
```

サーバー側の`[Received ...] HELLO A`とクライアント側の`ACK:HELLO A`を両方確認してください。後者が表示されなければ、接続はできてもメッセージの往復はまだ成立していません。

リポジトリルートからステップ1の片方向送信と、ステップ2の往復を続けて自動確認できます。固定したZig 0.14.0のコンテナ内で各プロセスを起動し、要求と応答のログを検査します。

```bash
cd "$(git rev-parse --show-toplevel)"
sh references/chapter6/step2/nodeA/scripts/acceptance.sh
```

`CHAPTER6_STEP1_ACCEPTANCE PASS`に続き、末尾の`CHAPTER6_TCP_ACCEPTANCE PASS`まで終了コード0で到達した場合だけ、この章のTCP実装は完了です。

ノードリストの管理について。

複数のノードが存在するとき、どの相手と接続しているかの情報を管理するために、各ノードはピアリスト（例:[]Peer）を持ちます。新しいノードとの接続が確立した際にピアリストへ追加し、切断時には削除するといった操作をします。さらに、既に接続したピアから別のノードのアドレスを教えてもらうことで、ネットワーク参加者を徐々に増やしていく仕組み（ピア発見）を導入できます。たとえばBitcoinではaddrメッセージで、既知のノード一覧をお互いに交換し合い、新たなピアを見つけられるようにしています。

このコードではそこまで実装していませんが、将来的に拡張したい場合は、ノードが起動したタイミングで「あなたが知っている他のノードのアドレスを教えてほしい」と問い合わせるプロトコルを追加。こうした仕組みがあると、ネットワーク参加がスムーズに行えるようになります。

参考: ピア発見はブロックチェインのP2Pネットワークで重要なステップです。たとえばBitcoinやEthereumでは、あらかじめブートストラップノードのアドレスをソフトウェアに組み込み、そこに接続しながら新しいアドレスを取得します。その後、最終的には数十～数百のノードと接続できるように作られています。
