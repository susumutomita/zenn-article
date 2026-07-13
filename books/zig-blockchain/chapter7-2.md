---
title: "P2Pブロックチェイン（2）ノード起動と実通信"
free: true
---

前半で実装したブロック転送処理を、実際に起動できるノードへまとめます。作業ディレクトリは引き続き`references/chapter7`です。本章ではCLIのlisten/connectモード、Docker構成、改ざん拒否を含む実TCPテストを順に完成させます。

## main関数の修正：サーバー/クライアントモードの起動

最後に、main関数を改良して、コマンドライン引数によってノードをサーバーモードかクライアントモードに切り替えます。具体的には以下の2つのオプションを受け付けます。

- --listen port: 指定ポートでサーバーノードとして待ち受けを開始します。
- --connect host:port: 指定ホスト・ポートへ接続するクライアントノードとして動作します。

これらの動作は、前述のConnHandlerやClientHandlerを組み合わせて実現します。修正後のmain関数は次のようになります。

```zig
const std = @import("std");
const blockchain = @import("blockchain.zig");
const types = @import("types.zig");
const parser = @import("parser.zig");
const net = std.net;

fn handlePeerMessage(message: []const u8) void {
    std.log.info("[Recv complete] {s}", .{message});

    if (!std.mem.startsWith(u8, message, "BLOCK:")) {
        std.log.info("Unknown msg: {s}", .{message});
        return;
    }

    var new_block = parser.parseBlockJson(message["BLOCK:".len..]) catch |err| {
        std.log.err("Failed parseBlockJson: {any}", .{err});
        return;
    };
    if (!blockchain.addBlock(new_block)) parser.deinitParsedBlock(&new_block);
}

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

        // ホスト名を解決する (IPアドレスまたはホスト名の両方に対応)
        var remote_addr: net.Address = undefined;
        if (std.mem.indexOf(u8, host_str, ".") != null) {
            // IPアドレスと思われる場合は直接解決
            remote_addr = try net.Address.resolveIp(host_str, port_num);
        } else {
            // ホスト名の場合はDNS解決を使用
            var list = try net.getAddressList(gpa, host_str, port_num);
            defer list.deinit();

            if (list.addrs.len == 0) {
                std.log.err("Could not resolve hostname: {s}", .{host_str});
                return error.HostNotFound;
            }

            remote_addr = list.addrs[0];
        }

        var socket = try net.tcpConnectToAddress(remote_addr);
        const peer = types.Peer{
            .address = remote_addr,
            .stream = socket,
        };
        _ = try std.Thread.spawn(.{}, blockchain.ClientHandler.run, .{peer});
        var reader = socket.reader();
        var buf: [4096]u8 = undefined;
        var buffered: usize = 0;

        while (true) {
            const n = try reader.read(buf[buffered..]);
            if (n == 0) {
                if (buffered > 0) {
                    std.log.warn("Ignoring unterminated message from {s}:{d}", .{ host_str, port_num });
                }
                std.log.info("Server disconnected.", .{});
                break;
            }

            buffered += n;
            var consumed: usize = 0;
            while (std.mem.indexOfScalarPos(u8, buf[0..buffered], consumed, '\n')) |newline| {
                const message = std.mem.trimRight(u8, buf[consumed..newline], "\r");
                handlePeerMessage(message);
                consumed = newline + 1;
            }

            if (consumed > 0) {
                const remaining = buffered - consumed;
                std.mem.copyForwards(u8, buf[0..remaining], buf[consumed..buffered]);
                buffered = remaining;
            }

            if (buffered == buf.len) {
                std.log.err("Message too long from {s}:{d}; closing connection", .{ host_str, port_num });
                break;
            }
        }
    }
}

//------------------------------------------------------------------------------
// テスト
//------------------------------------------------------------------------------
test "トランザクションの初期化テスト" {
    const tx = types.Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 42,
    };
    try std.testing.expectEqualStrings("Alice", tx.sender);
    try std.testing.expectEqualStrings("Bob", tx.receiver);
    try std.testing.expectEqual(@as(u64, 42), tx.amount);
}

test "ブロックにトランザクションを追加" {
    var block = types.Block{
        .index = 0,
        .timestamp = 1234567890,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(std.testing.allocator),
        .nonce = 0,
        .data = "Test block",
        .hash = [_]u8{0} ** 32,
    };
    defer block.transactions.deinit();

    try block.transactions.append(types.Transaction{
        .sender = "Taro",
        .receiver = "Hanako",
        .amount = 100,
    });
    try std.testing.expectEqual(@as(usize, 1), block.transactions.items.len);
}

test "マイニングが先頭1バイト0のハッシュを生成できる" {
    var block = types.Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(types.Transaction).init(std.testing.allocator),
        .nonce = 0,
        .data = "For Mining test",
        .hash = [_]u8{0} ** 32,
    };
    defer block.transactions.deinit();

    // 適当にトランザクションを追加
    try block.transactions.append(types.Transaction{ .sender = "A", .receiver = "B", .amount = 100 });

    // 初期ハッシュ
    block.hash = blockchain.calculateHash(&block);

    // 難易度1(先頭1バイトが0)を満たすまでマイニング
    blockchain.mineBlock(&block, 1);
    try std.testing.expectEqual(@as(u8, 0), block.hash[0]);
}
```

ポイント: クライアントモードでは送信処理と受信処理を分けて、送信は別スレッド(ClientHandler)で行います。受信はメインスレッドで同時並行に動かしています。TCPの1回の`read`は1メッセージとは限らないため、受信バイトを蓄積して改行ごとに完成フレームを取り出します。最後の未完成部分は次の`read`まで残し、改行のない4096バイトが埋まった場合は過大フレームとして接続を閉じます。これによって、ユーザが入力をしている間もサーバーからの`BLOCK:`メッセージを正しく復元して受け取れます。

以上で、サーバー・クライアント両モードの動作がmain関数に組み込まれました。アプリケーションとして、起動時の引数によってP2Pノードとしての役割を変えられるようになっています。

## Dockerfileの修正

Dockerfileを修正して、サーバーモードとクライアントモードの両方を実行できるようにします。以下のように修正します。

```dockerfile
# ベースイメージに Alpine Linux を使用
FROM alpine:latest

# zig の公式バイナリをダウンロードするために必要なツールをインストール
# xz パッケージを追加して tar が .tar.xz を解凍できるようにする
RUN apk add --no-cache curl tar xz

# ZigとコンテナのCPUアーキテクチャを指定する
ARG ZIG_VERSION=0.14.0
ARG TARGETARCH
ENV ZIG_VERSION=${ZIG_VERSION}

# amd64とarm64のどちらでも、対応する公式バイナリを展開する
RUN case "${TARGETARCH}" in \
      amd64) ZIG_ARCH=x86_64 ;; \
      arm64) ZIG_ARCH=aarch64 ;; \
      *) echo "unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac && \
    ZIG_DIST="zig-linux-${ZIG_ARCH}-${ZIG_VERSION}" && \
    curl -fLO "https://ziglang.org/download/${ZIG_VERSION}/${ZIG_DIST}.tar.xz" && \
    mkdir -p /opt/zig && \
    tar -xf "${ZIG_DIST}.tar.xz" -C /opt/zig --strip-components=1 && \
    rm "${ZIG_DIST}.tar.xz"
ENV PATH="/opt/zig:${PATH}"

# 一般ユーザー appuser を作成し、作業用ディレクトリを設定
RUN addgroup -S appgroup && \
  adduser -S appuser -G appgroup && \
  mkdir -p /app && chown -R appuser:appgroup /app

# 作業ディレクトリを /app に設定
WORKDIR /app

# ホスト側のファイルをコンテナ内にコピーし、所有者を appuser に設定
COPY --chown=appuser:appgroup . .

# 一般ユーザーに切り替え
USER appuser

# コンテナ起動時に Zig ビルドシステムを使って run を実行
CMD ["zig", "build"]
```

## Docker Compose の修正

docker-compose.ymlを修正して、サーバーノードとクライアントノードの両方を起動できるようにします。以下のように修正します。

```yaml
# Docker Compose構成ファイル - ブロックチェーンノードネットワーク
#
# 使い方:
# 1. 起動: docker compose up -d
# 2. コンテナでコマンド実行: docker exec -it <container_name> <command>
#    例: docker exec -it node2 /tmp/zig-out/bin/chapter7 --connect node1:3000
#
# 注意: 新しいコンテナを起動するには docker compose run ではなく docker exec を使用してください

# 共通設定
x-common-config: &common-config
  volumes:
    - ./:/app
  build: .

services:
  node1:
    <<: *common-config
    container_name: node1
    ports:
      - "3001:3000"
    environment:
      - NODE_ID=1
    command: >-
      sh -c "zig build
      --cache-dir /tmp/zig-cache
      --global-cache-dir /tmp/zig-global-cache
      --prefix /tmp/zig-out
      && /tmp/zig-out/bin/chapter7 --listen 3000"

  node2:
    <<: *common-config
    container_name: node2
    ports:
      - "3002:3000"
    environment:
      - NODE_ID=2
    tty: true
    stdin_open: true
    command: >-
      sh -c "zig build
      --cache-dir /tmp/zig-cache
      --global-cache-dir /tmp/zig-global-cache
      --prefix /tmp/zig-out
      && tail -f /dev/null"

  node3:
    <<: *common-config
    container_name: node3
    ports:
      - "3003:3000"
    environment:
      - NODE_ID=3
    tty: true
    stdin_open: true
    command: >-
      sh -c "zig build
      --cache-dir /tmp/zig-cache
      --global-cache-dir /tmp/zig-global-cache
      --prefix /tmp/zig-out
      && tail -f /dev/null"
```

## 動作確認

まず改ざん拒否を自動テストします。採掘後に`data`だけを書き換え、`addBlock`が`false`を返し、チェイン長が0のまま変わらないことを確認します。

```zig
test "tampered block is rejected without changing chain height" {
    chain_store.clearRetainingCapacity();
    defer chain_store.clearRetainingCapacity();

    var genesis = try createTestGenesisBlock(std.testing.allocator);
    defer genesis.transactions.deinit();

    var block = createBlock("valid", genesis);
    defer block.transactions.deinit();
    mineBlock(&block, DIFFICULTY);
    block.data = "tampered";

    try std.testing.expect(!addBlock(block));
    try std.testing.expectEqual(@as(usize, 0), chain_store.items.len);
}
```

```bash
zig fmt --check .
zig build test
zig build
```

この3コマンドが成功してから、別プロセス間の送受信へ進みます。

同じ第7章ディレクトリから、改ざん拒否テストと実TCPのブロック送信を続けて自動確認できます。

```bash
sh scripts/acceptance.sh
```

成功時は次の3行が表示されます。

- `CHAPTER7_TCP_ACCEPTANCE PASS`
- `CHAPTER7_TAMPER_TEST PASS`
- `CHAPTER7_MALFORMED_INPUT_REJECTION PASS`

3行が揃った場合だけ合格です。正常ブロックの受信と改ざん拒否に加え、過大なhexと小数のタイムスタンプを送ってもプロセスが生存することを確認します。

サーバノードを起動させる。

```bash
zig build run -- --listen 8080
```

クライアントノードを起動させる。

```bash
zig build run -- --connect 127.0.0.1:8080
```

コンソールが表示されたら、適当な文字列を入力して送信します。サーバ側には`[Received] BLOCK:<json>`のログが出ます。

ブロック送信テスト
クライアントのコンソールで入力した文字列は、そのままプロトコルメッセージとして送られるのではありません。新しいブロックの`data`フィールドに入り、プログラムが自動で採掘して`BLOCK:<json>`として送信します。

```bash
❯ zig build run -- --connect 127.0.0.1:8081
info: Connecting to 127.0.0.1:8081...
Enter message for new block: hi
```

`data`は`std.json.stringifyAlloc`を通すため、ダブルクォートやバックスラッシュを含めてもJSON往復後に同じ文字列へ戻ります。改行はJSONの問題ではなく1行1フレームの区切りなので、対話入力では送信確定として扱われます。

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

上記ログの意味を簡単に説明します。

- Accepted: 127.0.0.1:60354はサーバーがクライアントからの接続を受け入れたことを表しています（ポート60354はクライアント側の一時ポートです）。
- `[Received] BLOCK:{...}`の行で、クライアントから受信したメッセージの中身を表示しています。"data":"hi"となっており、確かにクライアントで入力した文字列がブロックに含まれていることが確認できます。また"index":1や計算された"hash":"0000..."なども表示されています。
- `Added new block index=1, nonce=1924, hash={0,0,a0,c6...}`のログで、そのブロックがチェインに追加されたことが示されています。nonce=1924はPoW採掘で得られたナンス値であり、この値によってハッシュ先頭に0000が並ぶ難易度条件を確認しています。
- ブロックが共有されたことの確認: サーバーノードがブロックを受け取ってチェインに追加できたので、同じブロックがネットワークで共有されたことになります。

このため、クライアントのコンソールに`BLOCK:{"index":2,"nonce":777,"data":"manual"}`のような文字列を入力しても、生のプロトコルメッセージにはなりません。入力文字列は、`data`に入った新ブロックとして採掘されます。生の`BLOCK:<json>`を送る検証は、第8章で扱う`nc`などを使って行います。なお、hash未設定のJSONを送ってもPoW検証に通らないため、受信側では追加されません。

Docker Composeを使って、複数のノードを立ち上げてみます。例えば、node1とnode2を起動し、node1からnode2に接続することで、P2Pネットワークの動作を確認できます。

なお、P2Pのブロックは採掘時に実時刻（`std.time`）を用いるため、`timestamp`・`nonce`・`hash`は実行するたびに変わります。先ほどのローカル実行例とこのDocker実行例で値が異なるのはそのためで、読者の環境でも本書とは異なる値になります（先頭に`0000`が並ぶ難易度条件は共通です）。

```bash
docker compose up
[+] Running 3/3
 ✔ Container node1  Recreated                                                                                 0.0s
 ✔ Container node3  Recreated                                                                                 0.1s
 ✔ Container node2  Recreated                                                                                 0.1s
Attaching to node1, node2, node3
node1  | info: Listening on 0.0.0.0:3000
```

Node2に接続して、メッセージを送ります。

```bash
docker exec -it node2 /tmp/zig-out/bin/chapter7 --connect node1:3000
info: Connecting to node1:3000...
Enter message for new block: hi
```

すると、node1側に以下のようなログが出力されます。

```bash
node1  | info: Accepted: 172.18.0.4:46888
node1  | info: [Received] BLOCK:{"index":1,"timestamp":1746057682,"nonce":73344,"data":"hi","prev_hash":"0000d00f99225cd2adb3085631456a8ea362d233aa965cb48c0d8f8b488a9022","hash":"0000a3b631a2a32add03bb973470e24a85f2ff94601121d940d4be720176872f","transactions":[]}
node1  | debug: parseBlockJson start
node1  | debug: parseBlockJson start parsed
node1  | debug: parseBlockJson end parsed
node1  | debug: parseBlockJson start parser
node1  | debug: Transactions field is directly an array.
node1  | debug: Transactions field is directly an array. end transactions=array_list.ArrayListAligned(types.Transaction,null){ .items = {  }, .capacity = 0, .allocator = mem.Allocator{ .ptr = anyopaque@0, .vtable = mem.Allocator.VTable{ .alloc = fn (*anyopaque, usize, mem.Alignment, usize) ?[*]u8@1164a00, .resize = fn (*anyopaque, []u8, mem.Alignment, usize, usize) bool@1164fd0, .remap = fn (*anyopaque, []u8, mem.Alignment, usize, usize) ?[*]u8@1165200, .free = fn (*anyopaque, []u8, mem.Alignment, usize) void@1165250 } } }
node1  | debug: Block info: index=1, timestamp=1746057682, prev_hash={ 0, 0, 208, 15, 153, 34, 92, 210, 173, 179, 8, 86, 49, 69, 106, 142, 163, 98, 210, 51, 170, 150, 92, 180, 140, 13, 143, 139, 72, 138, 144, 34 }, transactions=array_list.ArrayListAligned(types.Transaction,null){ .items = {  }, .capacity = 0, .allocator = mem.Allocator{ .ptr = anyopaque@0, .vtable = mem.Allocator.VTable{ .alloc = fn (*anyopaque, usize, mem.Alignment, usize) ?[*]u8@1164a00, .resize = fn (*anyopaque, []u8, mem.Alignment, usize, usize) bool@1164fd0, .remap = fn (*anyopaque, []u8, mem.Alignment, usize, usize) ?[*]u8@1165200, .free = fn (*anyopaque, []u8, mem.Alignment, usize) void@1165250 } } } nonce=73344, data=hi, hash={ 0, 0, 163, 182, 49, 162, 163, 42, 221, 3, 187, 151, 52, 112, 226, 74, 133, 242, 255, 148, 96, 17, 33, 217, 64, 212, 190, 114, 1, 118, 135, 47 }
node1  | debug: parseBlockJson end
node1  | info: Added new block index=1, nonce=73344, hash={ 0, 0, a3, b6, 31, a2, a3, 2a, dd, 3, bb, 97, 34, 70, e2, 4a, 85, f2, ff, 94, 60, 11, 21, d9, 40, d4, be, 72, 1, 76, 87, 2f }
```

確認後は固定名のコンテナを残さないように終了します。

```bash
docker compose down --remove-orphans
```

### まとめ

- 本章では、単体で動いていたブロックチェインプログラムに対し、TCPソケットを介した簡易P2P通信機能を導入しました。ノード間でブロックを共有する基本的な流れを実装し、あるノードで生成したブロックをネットワーク上の他ノードへ伝達できるようになりました。
- 具体的には、"BLOCK:" + JSONというシンプルなメッセージ形式でブロックデータを送受信し、受信側ではただちにそのJSONをパースして自身のチェインに追加する処理を確認しました。最低限のプロトコル実装ですが、「データの共有と同期」ができています。
- 実際のブロックチェインシステムでは、ここにさらに複雑な機能が加わります（フォーク発生時のチェイン選択アルゴリズム、データ改ざん防止のためのデジタル署名検証、新しいピアの探索と接続管理など）。しかしまずは今回実装したように複数ノードでブロックを共有し同期することが基盤となります。この基盤が正しく動作することで、次の段階でこれら発展的な機能を組み込むことが可能になります。
