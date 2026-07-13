---
title: "P2Pブロック同期（2）複数ピアと3ノード検証"
free: true
---

前半で作ったゴシップとチェイン同期を、複数ノードの起動フローへ接続します。作業ディレクトリは引き続き`references/chapter8`です。本章の最後に、採掘時間へ依存しない固定ブロックを注入し、3ノードの収束、重複排除、改ざん拒否を自動確認します。

## ノード起動時に複数のピアへ自動接続する

ピア一覧を管理できるようになったところで、既知のピアに自動接続する処理を実装します。ネットワークに新しいノードを参加させる際、あらかじめネットワーク内のいくつかのノードのアドレスを知っていれば、それらに接続することでブロックチェインの同期を開始できます。これはブロックチェインネットワークのブートストラップによくある手法です。

本実装では、プログラムの引数や設定に既知ピアのアドレス一覧を渡し、起動時に順次接続を試みるようにします。main.zigを修正します。

```zig
//! ブロックチェーンアプリケーション エントリーポイント
//!
//! このファイルはブロックチェーンアプリケーションのメインエントリーポイントです。
//! コマンドライン引数の処理、ブロックチェーンの初期化、
//! ネットワーキングとユーザー操作用のスレッドの起動を行います。
//! また、適合性テストを実行するためのサポートも提供します。

const std = @import("std");
const blockchain = @import("blockchain.zig");
const types = @import("types.zig");
const parser = @import("parser.zig");
const p2p = @import("p2p.zig");

/// アプリケーションエントリーポイント
///
/// コマンドライン引数を解析し、P2Pネットワークをセットアップし、
/// リスナーとユーザー操作用のバックグラウンドスレッドを起動して
/// ブロックチェーンアプリケーションを初期化します。
/// また、適合性テストの実行もサポートします。
///
/// コマンドライン形式:
///   実行ファイル <ポート> [ピアアドレス...]
///   実行ファイル --listen <ポート> [--connect <ホスト:ポート>...]
///   実行ファイル --conformance <テスト名> [--update]
///
/// 引数:
///     <ポート>: このノードが待ち受けるポート番号
///     [ピア...]: オプションの既知ピアアドレスのリスト（"ホスト:ポート"形式）
///     --listen <ポート>: このノードが待ち受けるポート番号
///     --connect <ホスト:ポート>: オプションの既知ピアアドレス
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
        std.log.err("使用法: {s} <ポート> [ピアアドレス...]", .{args[0]});
        std.log.err("または: {s} --listen <ポート> [--connect <ホスト:ポート>...]", .{args[0]});
        std.log.err("       {s} --conformance <テスト名> [--update]", .{args[0]});
        return;
    }

    var self_port: u16 = 0;
    var known_peers = std.ArrayList([]const u8).init(gpa);
    defer known_peers.deinit();

    var i: usize = 1;
    while (i < args.len) : (i += 1) {
        const arg = args[i];
        if (std.mem.eql(u8, arg, "--listen")) {
            i += 1;
            if (i >= args.len) {
                std.log.err("--listen フラグの後にポート番号が必要です", .{});
                return;
            }
            self_port = try std.fmt.parseInt(u16, args[i], 10);
        } else if (std.mem.eql(u8, arg, "--connect")) {
            i += 1;
            if (i >= args.len) {
                std.log.err("--connect フラグの後にホスト:ポートが必要です", .{});
                return;
            }
            try known_peers.append(args[i]);
        } else if (self_port == 0) {
            // 従来の方式（最初の引数はポート番号）
            self_port = try std.fmt.parseInt(u16, arg, 10);
        } else {
            // 従来の方式（追加の引数はピアアドレス）
            try known_peers.append(arg);
        }
    }

    if (self_port == 0) {
        std.log.err("ポート番号が指定されていません。--listen フラグまたは最初の引数として指定してください。", .{});
        return;
    }

    // 初期ブロックチェーン状態の表示
    blockchain.printChainState();

    // 着信接続用のリスナースレッドを開始
    _ = try std.Thread.spawn(.{}, p2p.listenLoop, .{self_port});

    // すべての既知のピアに接続
    for (known_peers.items) |spec| {
        const peer_addr = try p2p.resolveHostPort(spec);
        _ = try std.Thread.spawn(.{}, p2p.connectToPeer, .{peer_addr});
    }

    // インタラクティブなテキスト入力スレッドを開始
    _ = try std.Thread.spawn(.{}, p2p.textInputLoop, .{});

    // メインスレッドを生かし続ける
    while (true) std.time.sleep(60 * std.time.ns_per_s);
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

## Docker Compose の修正

docker-compose.ymlを修正して、サーバーノードとクライアントノードの両方を起動できるようにします。以下のように修正します。

```yaml
# Docker Compose構成ファイル - ブロックチェーンノードネットワーク
#
# 使い方:
# 1. 起動: docker compose up -d
# 2. ログ確認: docker compose logs -f
# このComposeは3ノードの接続だけを作ります。acceptance.shは採掘時間に依存しない
# 固定済みPoWブロックを実TCPでnode1、node3の順に送り、同期と重複拒否を検証します。

# 共通設定
x-common-config: &common-config
  volumes:
    - ./:/app
    - ${ZIG_BOOK_CACHE_DIR:-./.book-cache}:/book-cache
  build: .

services:
  node1:
    <<: *common-config
    ports:
      - "3001:3000"
    environment:
      - NODE_ID=1
    command: >-
      sh -c "zig build
      --cache-dir /book-cache/$$NODE_ID/local
      --global-cache-dir /book-cache/global
      --prefix /book-cache/$$NODE_ID/out
      && exec /book-cache/$$NODE_ID/out/bin/chapter8 --listen 3000"

  node2:
    <<: *common-config
    depends_on:
      - node1
    ports:
      - "3002:3000"
    environment:
      - NODE_ID=2
    command: >-
      sh -c "zig build
      --cache-dir /book-cache/$$NODE_ID/local
      --global-cache-dir /book-cache/global
      --prefix /book-cache/$$NODE_ID/out
      && exec /book-cache/$$NODE_ID/out/bin/chapter8 --listen 3000 --connect node1:3000"

  node3:
    <<: *common-config
    depends_on:
      - node2
    ports:
      - "3003:3000"
    environment:
      - NODE_ID=3
    command: >-
      sh -c "zig build
      --cache-dir /book-cache/$$NODE_ID/local
      --global-cache-dir /book-cache/global
      --prefix /book-cache/$$NODE_ID/out
      && exec /book-cache/$$NODE_ID/out/bin/chapter8 --listen 3000
      --connect node1:3000 --connect node2:3000"
```

## 動作確認

### 単体ゲート

まず、コードを写した直後にコンパイルとユニットテストを通します。

```bash
zig fmt --check .
zig build test
zig build
```

ここで1つでも失敗した状態では、複数ノード試験へ進みません。

標準入力の`line`は256バイトの入力バッファを借用しているため、次の入力で上書きされます。`createMinedInputBlock`が複製を忘れると、採掘済みhashは最初の入力のまま、保存済み`data`だけが次の入力へ変わります。次の回帰テストで、入力元を書き換えてもブロックが`alpha`を保持し、PoW検証に成功することを確認します。

```zig
test "locally mined block owns input after the source buffer is reused" {
    var source = [_]u8{ 'a', 'l', 'p', 'h', 'a' };
    var genesis = try blockchain.createTestGenesisBlock(std.testing.allocator);
    defer genesis.transactions.deinit();

    var block = try createMinedInputBlock(source[0..], genesis);
    defer block.transactions.deinit();
    defer std.heap.page_allocator.free(block.data);

    @memcpy(source[0..], "bravo");
    try std.testing.expectEqualStrings("alpha", block.data);
    try std.testing.expect(blockchain.verifyBlockPow(&block));
}
```

### 3ノード受入試験

難易度2のマイニングは、実行するたびにノンスの探索時間が変わります。CIの成否がその偶然に左右されないように、受入試験では採掘済みの2ブロックを固定fixtureとして使います。ただし、ノードへは実際のTCP経由で送り、各ノードが通常どおりhashとPoWを再計算して検証します。

まず、fixture用のディレクトリを作成します。

```bash
mkdir -p fixtures
```

`references/chapter8/fixtures/block1.frame`は、決定的genesisに連結するindex=1のブロックです。

```text
BLOCK:{"index":1,"timestamp":1783932844,"nonce":18735,"data":"seed","prev_hash":"000009fd818a1c6a6577cfda48a44f72d5c3e7359fe9bf808b959e4b56a06f13","hash":"00003cac4bec61e16e133baf96b551646347bc140604913a774a270c7c03afc0","transactions":[]}
```

`references/chapter8/fixtures/block2.frame`は、block1に連結するindex=2のブロックです。

```text
BLOCK:{"index":2,"timestamp":1783932851,"nonce":106813,"data":"gossip","prev_hash":"00003cac4bec61e16e133baf96b551646347bc140604913a774a270c7c03afc0","hash":"00007975a5a016274f85fdd0cd9fbd774aafe5d5c305d74003dcaa4e958258b2","transactions":[]}
```

どちらのファイルも、表示した1行の末尾に改行を入れて保存します。

目視で「それらしいログ」を探すだけでは、3つのチェインが本当に一致したか、重複追加が止まったかを判定できません。そこで `references/chapter8/scripts/acceptance.sh` を次の内容で作成します。

```bash
#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

ZIG_BOOK_CACHE_DIR=${ZIG_BOOK_CACHE_DIR:-"$HOME/.cache/zig-blockchain-book/chapter8"}
export ZIG_BOOK_CACHE_DIR
mkdir -p "$ZIG_BOOK_CACHE_DIR"
chmod 0777 "$ZIG_BOOK_CACHE_DIR"

tmp_dir=$(mktemp -d)
fixture1=/app/fixtures/block1.frame
fixture2=/app/fixtures/block2.frame

cleanup() {
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

fail() {
  echo "P2P_ACCEPTANCE FAIL: $*" >&2
  docker compose logs --no-color >&2 || true
  exit 1
}

query_chain() {
  service=$1
  output=$2
  docker compose exec -T "$service" sh -c \
    "printf 'GET_CHAIN\\n' | nc -w 2 127.0.0.1 3000" \
    >"$output" 2>/dev/null || true
}

send_fixture() {
  service=$1
  fixture=$2
  docker compose exec -T "$service" sh -ec \
    'cat "$1" | nc -w 2 127.0.0.1 3000 || true' \
    sh "$fixture" >/dev/null 2>&1
}

wait_for_topology() {
  attempt=0
  while [ "$attempt" -lt 45 ]; do
    node2_connections=$(docker compose logs --no-color node2 2>/dev/null |
      grep -c 'Connected to peer:' || true)
    node3_connections=$(docker compose logs --no-color node3 2>/dev/null |
      grep -c 'Connected to peer:' || true)
    if [ "$node2_connections" -ge 1 ] && [ "$node3_connections" -ge 2 ]; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done
  fail "three-node peer topology did not become ready"
}

wait_for_convergence() {
  expected=$1
  attempt=0
  while [ "$attempt" -lt 45 ]; do
    query_chain node1 "$tmp_dir/node1.chain"
    query_chain node2 "$tmp_dir/node2.chain"
    query_chain node3 "$tmp_dir/node3.chain"

    node1_blocks=$(grep -c '^BLOCK:' "$tmp_dir/node1.chain" || true)
    node2_blocks=$(grep -c '^BLOCK:' "$tmp_dir/node2.chain" || true)
    node3_blocks=$(grep -c '^BLOCK:' "$tmp_dir/node3.chain" || true)

    if [ "$node1_blocks" -eq "$expected" ] &&
      [ "$node2_blocks" -eq "$expected" ] &&
      [ "$node3_blocks" -eq "$expected" ] &&
      cmp -s "$tmp_dir/node1.chain" "$tmp_dir/node2.chain" &&
      cmp -s "$tmp_dir/node1.chain" "$tmp_dir/node3.chain"; then
      return 0
    fi

    attempt=$((attempt + 1))
    sleep 1
  done
  fail "three chains did not converge at height $expected"
}

docker compose up --build -d

# Mining difficulty 2 has unbounded wall-clock time. The acceptance gate sends
# fixed, already-mined frames so CI verifies networking and consensus rules
# without depending on how quickly a particular runner finds a nonce.
wait_for_topology
send_fixture node1 "$fixture1"
wait_for_convergence 1
send_fixture node3 "$fixture2"
wait_for_convergence 2

for service in node1 node2 node3; do
  for index in 1 2; do
    added=$(docker compose logs --no-color "$service" |
      grep -c "Added new block index=$index" || true)
    if [ "$added" -ne 1 ]; then
      fail "$service added index=$index $added times"
    fi
  done
done

if ! docker compose logs --no-color | grep -q 'BLOCK_REJECTED reason=duplicate'; then
  fail "triangular gossip did not exercise duplicate rejection"
fi

cp "$tmp_dir/node1.chain" "$tmp_dir/before-invalid.chain"

docker compose exec -T node1 sh -ec '
  oversized=$(awk '\''BEGIN { for (i = 0; i < 514; i++) printf "0" }'\'')
  printf '\''BLOCK:{"prev_hash":"%s"}\n'\'' "$oversized" | nc -w 1 127.0.0.1 3000 || true
  printf '\''BLOCK:{"timestamp":-1.5}\n'\'' | nc -w 1 127.0.0.1 3000 || true
' >/dev/null 2>&1
sleep 1
if ! docker compose ps --status running --services | grep -Fxq node1; then
  echo "P2P_ACCEPTANCE FAIL: node1 exited after malformed P2P input" >&2
  docker compose logs --no-color node1 >&2
  exit 1
fi
query_chain node1 "$tmp_dir/after-malformed.chain"
if ! cmp -s "$tmp_dir/before-invalid.chain" "$tmp_dir/after-malformed.chain"; then
  echo "P2P_ACCEPTANCE FAIL: malformed P2P input changed node1 chain" >&2
  docker compose logs --no-color node1 >&2
  exit 1
fi

tampered=$(tail -n 1 "$tmp_dir/node1.chain" | sed 's/"data":"gossip"/"data":"tampered"/')
if [ "$tampered" = "$(tail -n 1 "$tmp_dir/node1.chain")" ]; then
  echo "P2P_ACCEPTANCE FAIL: could not construct the tampered block" >&2
  exit 1
fi

docker compose exec -T node1 sh -c \
  "printf '%s\\n' '$tampered' | nc -w 1 127.0.0.1 3000" \
  >/dev/null 2>&1 || true
sleep 1
query_chain node1 "$tmp_dir/after-invalid.chain"

if ! cmp -s "$tmp_dir/before-invalid.chain" "$tmp_dir/after-invalid.chain"; then
  echo "P2P_ACCEPTANCE FAIL: tampered block changed node1 chain" >&2
  docker compose logs --no-color node1 >&2
  exit 1
fi

if ! docker compose logs --no-color node1 | grep -q 'BLOCK_REJECTED reason=invalid_pow'; then
  echo "P2P_ACCEPTANCE FAIL: node1 did not report invalid PoW/hash" >&2
  docker compose logs --no-color node1 >&2
  exit 1
fi

echo "P2P_ACCEPTANCE PASS"
echo "P2P_MALFORMED_INPUT_REJECTION PASS"
echo "height=2"
grep '^BLOCK:' "$tmp_dir/node1.chain" | sed -n 's/.*"hash":"\([0-9a-f]*\)".*/hash=\1/p'
```

実行します。

```bash
chmod +x scripts/acceptance.sh
sh scripts/acceptance.sh
```

このスクリプトは次の順序を実際に実行し、条件を満たさなければ非0で終了します。

1. node1、node2、node3を起動し、node2が1接続、node3が2接続を確立するまで待つ。
2. 採掘済みの `block1.frame` をnode1の実TCPポートへ送る。
3. 3ノードへ `GET_CHAIN` を送り、高さ1かつhash列が完全一致することを `cmp` で確認する。
4. 採掘済みの `block2.frame` をnode3の実TCPポートへ送る。
5. 3ノードが高さ2かつ同じ2本のhash列へ収束することを `cmp` で確認する。
6. index=1とindex=2が各ノードで1回だけ追加され、三角トポロジーを戻ったブロックは重複として拒否されることを確認する。
7. 固定長バッファを超えるhexと小数のタイムスタンプを送り、node1が生存し、チェインも変わらないことを確認する。
8. `data`だけを書き換えたブロックを送り、node1のチェインが変わらず `invalid_pow` になることを確認する。
9. 成否にかかわらず `docker compose down --remove-orphans` を実行する。

成功時は、固定fixtureに対応する次のhashとともに終了します。

```text
P2P_ACCEPTANCE PASS
P2P_MALFORMED_INPUT_REJECTION PASS
height=2
hash=00003cac4bec61e16e133baf96b551646347bc140604913a774a270c7c03afc0
hash=00007975a5a016274f85fdd0cd9fbd774aafe5d5c305d74003dcaa4e958258b2
```

### 手動で通信を追う場合

ここは固定fixtureを使う自動試験とは別です。3つのターミナルでA、B、Cの順に起動します。Bを起動してAで `seed` を入力した後、Cを後発起動すると `GET_CHAIN`による追いつきを観察できます。Cで `gossip` を入力すると、B経由とAへの直接経路の両方が生まれます。この手順では入力ごとに難易度2のマイニングを実際に行うため、完了までの時間は実行ごとに変わります。

```bash
# Terminal A
zig build run -- --listen 8080

# Terminal B
zig build run -- --listen 8081 --connect 127.0.0.1:8080

# Terminal C（Aでseedを作った後に起動）
zig build run -- --listen 8082 \
  --connect 127.0.0.1:8080 \
  --connect 127.0.0.1:8081
```

別ターミナルから各チェインを取得します。3つの出力に同じ順序の `BLOCK:` 行が2本あれば収束しています。

```bash
printf 'GET_CHAIN\n' | nc -w 2 127.0.0.1 8080 > /tmp/node-a.chain
printf 'GET_CHAIN\n' | nc -w 2 127.0.0.1 8081 > /tmp/node-b.chain
printf 'GET_CHAIN\n' | nc -w 2 127.0.0.1 8082 > /tmp/node-c.chain
cmp /tmp/node-a.chain /tmp/node-b.chain
cmp /tmp/node-a.chain /tmp/node-c.chain
```

手動確認後も、最終判定には必ず `sh scripts/acceptance.sh` を使ってください。

## まとめ

本章では、ブロックチェインネットワークをピアツーピア通信へと発展させ、ノード同士が対等にブロックを交換・同期できるようにしました。これにより、一方向だった通信が双方向かつ分散的になり、新しいノードのチェイン同期やブロックのネットワーク全体への伝播がスムーズに行われるようになります。

この章で実装した主な機能は以下のとおりです。

- ピアリストによる複数接続管理と、自動接続処理。
- 受信したブロックの他ピアへの再伝播（ゴシッププロトコル的拡散）。
- 新規ノードが既存ネットワークからブロックチェイン全体を取得するGET_CHAIN処理。
- 簡易的な再接続による接続維持。

これで本書が扱う基本的なP2Pネットワークは完成です。実用的なブロックチェインには、認証済みメッセージ、不正データの排除、フォーク選択、トランザクションプールの同期などが必要です。これらは本書の実装範囲外であり、今回のノードを信頼できないネットワークへ公開してはいけません。

---

### 【補足】P2Pネットワークの全体像とゴシップ伝播のイメージ

ここで、P2Pネットワークの全体像と、ブロックがどのようにネットワーク全体へ伝播するかを図で整理しておきます。

#### P2P型とサーバ/クライアント型の違い

```text
+-------------------+        +-------------------+
|   サーバ/クライアント型   |        |   P2P型（本章実装）   |
+-------------------+        +-------------------+
      |      ^                       ^     ^
      v      |                       |     |
   クライアント                ノードA<--->ノードB
                                    |     |
                                    v     v
                                 ノードC<--->ノードD
```

P2P型では、各ノードが対等な立場で相互に接続し、どのノードからもブロックの送受信が可能です。

#### メッセージ処理とゴシップ伝播

`handleMessage`関数は、P2Pネットワーク上でのコマンド処理の中核です。受信したメッセージの先頭部分を見て、処理を振り分けています。

1. BLOCK: メッセージの処理
   - JSONからブロック構造体に復元し、チェインに追加
   - 同じブロックを送信元に戻さないよう `from_peer` を指定して再伝播する
   - これにより、ネットワーク全体に効率的にブロックが広がる「ゴシップ伝播」を実現

2. GET_CHAIN: メッセージの処理
   - 現在保持している全ブロックを要求元ピアへ送信
   - 主に新規参加ノードの初期同期に使用

以下の図は、あるノードで作成されたブロックがどのようにゴシップ伝播によってネットワーク全体に広がる様子を示しています。

```text
    [Node A]            [Node A]              [Node A]
       │                   │                     │
       │ BLOCK:...         │                     │
       ▼                   │                     │
    [Node B]            [Node B]              [Node B]
       │                   │ BLOCK:...          │
       │                   ▼                     │
    [Node C]            [Node C]              [Node C]
       │                   │                     │ BLOCK:...
       │                   │                     ▼
    [Node D]            [Node D]              [Node D]

   初期状態         B→Cへ伝播           C→Dへ伝播
```

この仕組みにより、中央サーバーがなくてもネットワーク全体でブロックが共有されます。また、`from_peer`パラメータによって送信元を除外することで、同じメッセージが無限にループすることを防いでいます。
