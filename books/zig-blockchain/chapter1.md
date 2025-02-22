---
title: "Zigで始めるブロックチェイン構築: 基本実装チュートリアル"
free: true
---

ブロックチェインの基本概念を学びながら、Zig言語を使って最小限のブロックチェイン・プロトタイプを実装してみましょう。**環境セットアップ**から始めて、**ブロックとトランザクションの構造**、**Proof of Work (PoW)** の簡単な実装、そして**動作確認とデバッグ**まで、手を動かしながら順を追って解説します。最終的に、Zigでブロックチェインの基礎が動作するプログラムを完成させ、ブロックチェインの仕組みを体験することが目標です。

このチュートリアルの進め方は次の通りです。

> 1. **ブロックの構造**や**ハッシュ計算**、**PoW** など、ブロックチェインの「核」となる部分をシンプルに実装し、まずは**改ざん検出**や**チェーン構造**を理解します。
> 2. 次章以降で**複数ブロックの追加**や**デジタル署名**、**P2Pネットワーク**などを順次取り上げ、実際のビットコインなどの実装に近づけていきます。
> 3. 参考文献として、ビットコインのホワイトペーパーや「Mastering Bitcoin」などを参照しながら、実際の大規模ブロックチェーンの仕組みや、より高度な設計を学んでいきましょう。

## はじめに

ZigはC言語に近い構文と性能を持ちながらも、メモリセーフティやエラーハンドリングなどの機能を備えています。ブロックチェインのような**高い信頼性が求められるアプリケーション**にも適しており、本チュートリアルではその特性を活かしてブロックチェインの基本構造を実装していきます。
本チュートリアルでは、Zigを使って**ブロックチェインの基本要素**（ブロック、トランザクション、ハッシュ計算、Proof of Work）を実装し、最終的には**シンプルなブロックチェイン**を完成させます。ブロックチェインの仕組みやZigの基本的な使い方についても解説しますので、Zigやブロックチェインに興味がある方はぜひお試しください。

学習ソースとしては[Zig Book](https://github.com/pedropark99/zig-book)がオススメです。

## Zigの環境セットアップ

まずはZigの開発環境を整えます。

### Zigのインストール方法

Zig公式サイトから各プラットフォーム向けのバイナリをダウンロードし、パスを通すのが最も手軽な方法です ([Getting Started⚡Zig Programming Language](https://ziglang.org/learn/getting-started/))。Zigはインストールがシンプルで、単一の実行ファイルを好きな場所に置いてパスを設定すれば利用できます。
インストール後、ターミナル/コマンドプロンプトで `zig version` を実行し、バージョンが表示されれば成功です。Mac + Homebrewの場合は`brew install zig`でインストールできます。

```bash
❯ zig version
0.13.0
```

### ビルドツールとエディタの準備

Zigは独自のビルドシステムを備えており、`zig build`コマンドでプロジェクトのコンパイルや実行が可能です。プロジェクトを開始するには、空のディレクトリで `zig init` コマンドを実行すると、ビルド用の設定ファイルとサンプルのソースコードが生成されます。生成された`build.zig`と`src/main.zig`を使って、`zig build run`とするだけでHello Worldプログラムをビルド&実行できます。Zig製の実行ファイルはネイティブなバイナリで、特別なVMは不要です。
エディタはお好みのものを使用できますが、**VSCode**には公式のZig拡張機能がありシンタックスハイライトや補完が利用できます。また、Zig用の言語サーバー (Zig Language Server, *ZLS*) も提供されており、より高度なエディタ連携が可能です。主要なテキストエディタにはZigのシンタックスハイライトが用意されていますので、まずはコードが見やすい環境を整えましょう。

### プロジェクトの作成

```bash
❯ zig init
info: created build.zig
info: created build.zig.zon
info: created src/main.zig
info: created src/root.zig
info: see `zig build --help` for a menu of options
```

### 簡単なHello Worldプログラムの実行

環境確認のため、簡単なZigプログラムを作成してみます。src/main.zigを更新して、以下のコードを書いてください。

```zig
const std = @import("std");

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();
    try stdout.print("Hello, {s}\n", .{"world"});
}
```

次に、準備したターミナルで次のコマンドを実行してみましょう。

```bash
zig run src/main.zig
```

`zig run`コマンドはソースをビルドして即座に実行してくれます。正しく環境構築できていれば、コンソールに **Hello, world** と表示されるはずです。これでZigの開発環境は準備完了です。

## ブロックチェインの基本構造

それでは、ブロックチェインのコアである「ブロック」の構造を実装していきます。まずはブロックチェインの基本を簡単におさらいしましょう。

### なぜブロックという単位か

ブロックチェインでは、膨大な取引情報をそのまま連続的に記録すると、改ざん検出や管理が非常に困難になる。そこで「ブロック」という単位に複数の取引や関連情報（タイムスタンプ、前ブロックのハッシュ値など）をまとめることで、各ブロックごとに一意の「指紋」を生成する仕組みになっています。

**ブロックとは**: ブロックチェインにおけるブロックは、**いくつかのトランザクションの集合**と**タイムスタンプ（日時）**、そして**ひとつ前のブロックのハッシュ値**などを含むデータ構造です。
 ([Hash Functions and the Blockchain Ledger](https://osl.com/academy/article/hash-functions-and-the-blockchain-ledger/#:~:text=Each%20block%20in%20a%20blockchain,network%20can%20trust%20the%20data))。
 各ブロックは前のブロックのハッシュを自分の中に取り込むことで過去との連続性（チェイン）を持ち、これによってブロック同士が鎖状にリンクしています。

**改ざん耐性**: ブロックに含まれるハッシュ値のおかげで、もし過去のブロックのデータが少しでも書き換えられるとそのブロックのハッシュ値が変わります。すると後続のブロックに保存された「前のブロックのハッシュ」と一致しなくなるため、チェイン全体の整合性が崩れてしまいます。この仕組みにより、1つのブロックを改ざんするにはそのブロック以降のすべてのブロックを書き換えなければならず、改ざんは非常に困難になります。

### ブロック構造体だけを定義し、単一ブロックを作成する

上記の概念を踏まえて、Zigでブロックを表現する構造体を作ってみましょう。ブロックに含める主な情報は以下の通りです。

- `index`: ブロック番号（第何番目のブロックかを示す整数）
- `timestamp`: ブロックが作られた時刻（UNIXエポック秒などで保存）
- `prev_hash`: 直前のブロックのハッシュ値
- `data`: ブロックに格納する任意のデータ（まずはシンプルに文字列など）
- `hash`: ブロック自身のハッシュ値（このブロックの`index`や`data`等から計算された値）

Zigでは以下のように`struct`を使ってブロックの型を定義できます。

```src/main.zig
const std = @import("std");

// ブロックを表す構造体
const Block = struct {
    index: u32,             // ブロック番号
    timestamp: u64,         // 作成時刻（Unix時間など）
    prev_hash: [32]u8,      // 前のブロックのハッシュ値（32バイト＝256ビット）
    data: []const u8,       // ブロックに含めるデータ（今回はバイト列）
    hash: [32]u8,           // このブロックのハッシュ値（32バイト）
};
```

上記ではハッシュ値を256ビット（32バイト）長の配列 `[32]u8` で表しています。これはSHA-256などの暗号学的ハッシュ関数で得られるハッシュのサイズに合わせたものです。`data`フィールドは`[]const u8`（バイト列）としており、簡単のためブロックに格納するデータを文字列やバイナリ列で扱えるようにしています。

```src/main.zig
const std = @import("std");

// ブロック構造体の定義
const Block = struct {
    index: u32, // ブロック番号
    timestamp: u64, // 作成時刻（Unix時間など）
    prev_hash: [32]u8, // 前のブロックのハッシュ値（32バイト）
    data: []const u8, // ブロックに含めるデータ（今回はバイト列）
    hash: [32]u8, // このブロックのハッシュ値（32バイト）
};

pub fn main() !void {
    // 出力用ライター
    const stdout = std.io.getStdOut().writer();

    // ブロックのサンプルインスタンスを作成
    const sample_block = Block{
        .index = 1,
        .timestamp = 1672531200, // 例: 適当なUNIXタイム
        .prev_hash = [_]u8{0} ** 32, // とりあえず0で埋める
        .data = "Hello, Zig Blockchain!", // 文字列をバイト列として扱う
        .hash = [_]u8{0} ** 32, // まだハッシュ値計算はしない
    };

    // 作成したブロックの情報を表示
    try stdout.print("Block index: {d}\n", .{sample_block.index});
    try stdout.print("Timestamp  : {d}\n", .{sample_block.timestamp});
    try stdout.print("Data       : {s}\n", .{sample_block.data});
}
```

実行してみると、ブロックの情報が表示されるはずです。

```bash
❯ zig run src/main.zig
Block index: 1
Timestamp  : 1672531200
Data       : Hello, Zig Blockchain!
```

### ハッシュ計算を追加し、hashフィールドを埋める

ブロックチェインの肝は**ハッシュの計算**です。ブロックの`hash`フィールドは、ブロック内容全体（index, タイムスタンプ, prev_hash, dataなど）から計算されるハッシュ値です。Zigの標準ライブラリにはSHA-256などのハッシュ関数実装が含まれているので、それを利用してハッシュ計算をします。

ZigでSHA-256を使うには、`std.crypto.hash.sha2`名前空間の`Sha256`型を利用します。以下にブロックのハッシュ値を計算する関数の例を示します。

```arc/main.zig
const std = @import("std");
const crypto = std.crypto.hash;  // ハッシュ用の名前空間
const Sha256 = crypto.sha2.Sha256;

fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});        // SHA-256ハッシュ計算器を初期化
    // ハッシュに含める要素を順次与える（順序も固定）
    hasher.update(std.mem.bytesOf(block.index));       // indexをバイト列として追加
    hasher.update(std.mem.bytesOf(block.timestamp));   // timestampを追加
    hasher.update(&block.prev_hash);                   // 前ブロックのハッシュを追加
    hasher.update(block.data);                         // データ本体を追加
    const result = hasher.finalResult();              // 最終的なハッシュ値を取得（32バイト配列）
    return result;
}
```

上記の`calculateHash`関数では、`Sha256.init(.{})`でハッシュ計算用のコンテキストを作成します。その後`hasher.update(...)`でブロックの各フィールドをバイト列として順次ハッシュ計算に入力しています。
`std.mem.bytesOf(value)`は与えた値をバイト列として扱うためのヘルパーで、整数型の値などをハッシュに含められて便利です。
最後に`hasher.finalResult()`を呼ぶと、これまでに与えたデータのSHA-256ハッシュが計算され、32バイトの配列として得られます。

**ハッシュ計算のポイント**: ブロックの`hash`値は **ブロック内のすべての重要データから計算** されます。この例では `index, timestamp, prev_hash, data` を含めていますが、後で追加するトランザクションやnonceといった要素も含める必要があります。一度ハッシュを計算して`block.hash`に保存した後で、ブロックの中身（例えば`data`）が変われば当然ハッシュ値も変わります。つまり、`hash`はブロック内容の一種の指紋となっており、内容が変われば指紋も一致しなくなるため改ざんを検出できます。

コード全体は次のようになります。

``````arc/main.zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

// --- ステップ2: ハッシュ計算を導入 ---

const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    data: []const u8,
    hash: [32]u8,
};

fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update(std.mem.bytesOf(block.index));
    hasher.update(std.mem.bytesOf(block.timestamp));
    hasher.update(&block.prev_hash);
    hasher.update(block.data);
    return hasher.finalResult();
}

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();

    // ブロック作成
    var genesis_block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .data = "Hello, Zig Blockchain!",
        .hash = [_]u8{0} ** 32,
    };

    // ハッシュを計算してセット
    genesis_block.hash = calculateHash(&genesis_block);

    // 出力確認
    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Hash       : ", .{});
    for (genesis_block.hash) |byte| {
        // ハッシュを16進数で表示
        try stdout.print("{02x}", .{byte});
    }
    try stdout.print("\n", .{});
}
```


ここまでで、ブロックの基本構造とハッシュ計算方法が定義できました。次に、このブロックに取引（トランザクション）の情報を組み込んでいきましょう。

## トランザクションを導入し、ブロックに複数の取引情報を持たせる

ブロックチェインは通常、通貨の送受信などの**トランザクション（取引記録）**をブロックにまとめています。

トランザクションとは「**送信者**」「**受信者**」「**金額**」などの送受信の詳細を含むデータ構造です。
しばしば**デジタル署名**によって改ざんされていないことを保証します。 ([link](https://medium.com/@mehmet.tosun/building-a-simple-blockchain-in-c-with-net-cf91f1026b2f))。

本チュートリアルではシンプルに、送信者・受信者を文字列、金額を数値で扱う構造体としてトランザクションを定義します（署名については概念のみ紹介し、実装は省略します）。
ZigでTransaction構造体を定義し、Block構造体にトランザクションのリストを持たせましょう。

```zig
const Transaction = struct {
    sender: []const u8,    // 送信者アドレス（文字列で表現）
    receiver: []const u8,  // 受信者アドレス
    amount: u64,           // 取引金額（今回は整数で表現）
    // 本来は署名フィールドなども必要
};

const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    /// トランザクションのリスト（動的配列）
    transactions: std.ArrayList(Transaction),
    nonce: u64,           // (後述のPoWで使うnonce、ここで定義だけ追加)
    hash: [32]u8,
};
```

上記のように、Block構造体に`transactions`フィールドを追加しました。ここではZig標準ライブラリの `std.ArrayList` を利用してトランザクションのリストを表現しています。`std.ArrayList(T)`はC++の`std::vector<T>`やRustの`Vec<T>`に相当し、動的にサイズが変えられる配列です ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=The%20std,%60.items))。Zigでは動的配列を扱う際に明示的なメモリ割り当てが必要ですが、`ArrayList`型は内部でメモリ管理をするので、使い方は比較的簡単です。

**トランザクションをブロックへ追加する**: 新しいブロックを作る際には、まず空の`ArrayList(Transaction)`を初期化し、取引を`append`メソッドで追加していきます。例えば1件のトランザクションを追加するコードは以下のようになります。

```zig
const std = @import("std");
const allocator = std.heap.page_allocator; // 簡易的にページアロケータを使用

// 新しいブロックを作成する例（prev_hashは引数でもらう想定）
fn createBlock(index: u32, prev_hash: [32]u8) !Block {
    var block = Block{
        .index = index,
        .timestamp = @intCast(u64, std.time.timestamp()), // 現在時刻を取得
        .prev_hash = prev_hash,
        .transactions = undefined, // 後で初期化
        .nonce = 0,
        .hash = undefined,
    };
    // トランザクションリストを初期化（メモリ割り当て）
    block.transactions = std.ArrayList(Transaction).init(allocator);
    // トランザクションを追加
    try block.transactions.append(Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 100,
    });
    try block.transactions.append(Transaction{
        .sender = "Charlie",
        .receiver = "Dave",
        .amount = 50,
    });
    // （必要に応じてさらにトランザクション追加）
    // ブロックのハッシュを計算（トランザクションも含める）
    block.hash = calculateHash(&block);
    return block;
}
```

上記のコードでは、新規ブロックを生成する際に`std.heap.page_allocator`という簡易的なアロケータを使って`transactions`リストを初期化します。
その後、2件のTransactionを`append`しています。
`append`はリスト末尾に要素を追加するメソッドで、内部で必要に応じてメモリを確保しサイズを拡張してくれます ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=var%20list%20%3D%20ArrayList%28u8%29,World))。最後に、以前定義した`calculateHash`関数を使ってブロックのハッシュ値を計算し、`block.hash`にセットしています。

コード全体は次のようになります。
```src/main.zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

// --- ステップ3: トランザクションを導入 ---

/// 取引の構造体
const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
};

/// ブロック構造体
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction), // トランザクションのリスト
    data: []const u8, // （以前のdataも残しておくならOK, 省略してもよい）
    hash: [32]u8,
};

fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update(std.mem.bytesOf(block.index));
    hasher.update(std.mem.bytesOf(block.timestamp));
    hasher.update(&block.prev_hash);

    // トランザクションをまとめてハッシュ
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(std.mem.bytesOf(tx.amount));
    }

    // 旧dataも含めるなら:
    hasher.update(block.data);

    return hasher.finalResult();
}

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var stdout = std.io.getStdOut().writer();

    // ブロックを用意
    var block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(Transaction).init(allocator),
        .data = "Sample Data",
        .hash = [_]u8{0} ** 32,
    };
    defer block.transactions.deinit();

    // トランザクションを追加
    try block.transactions.append(Transaction{
        .sender = "Alice", .receiver = "Bob", .amount = 100,
    });
    try block.transactions.append(Transaction{
        .sender = "Charlie", .receiver = "Dave", .amount = 50,
    });

    // ハッシュ計算
    block.hash = calculateHash(&block);

    // 出力
    try stdout.print("Block index: {d}\n", .{block.index});
    try stdout.print("Timestamp  : {d}\n", .{block.timestamp});
    try stdout.print("Transactions:\n", .{});
    for (block.transactions.items) |tx| {
        try stdout.print("  {s} -> {s} : {d}\n", .{tx.sender, tx.receiver, tx.amount});
    }
    try stdout.print("Block Hash : ", .{});
    for (block.hash) |b| {
        try stdout.print("{02x}", .{b});
    }
    try stdout.print("\n", .{});
}
```


### ハッシュ計算へのトランザクションの組み込み

トランザクションをブロックに含めたことで、ハッシュ計算時に考慮すべきデータも増えます。`calculateHash`関数では、ブロック内の全トランザクションの内容もハッシュ入力に追加する必要があります。例えば以下のように、トランザクションの各フィールドを順番にハッシュへ投入します。

```zig
    // ...（他のフィールドのハッシュ計算）...
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(std.mem.bytesOf(tx.amount));
        // （署名フィールドがあればそれも含める）
    }
```

`block.transactions.items`はArrayList内の生のスライス（配列）データです。ループで各`tx`にアクセスし、その中の`sender`文字列、`receiver`文字列、`amount`数値を順次ハッシュに投入しています。こうすることで**ブロック内の全トランザクションデータがハッシュ値計算に反映**されます。トランザクションの追加や変更があればハッシュ値も変化するため、ブロックの改ざん検知において重要な役割を果たします。

> **メモ:** 実際のブロックチェインでは、各トランザクションは送信者の秘密鍵による**デジタル署名**が含まれます。署名によって取引の正当性（送信者本人が承認した取引であること）が保証されますが、署名の作成と検証には公開鍵暗号が必要で実装が複雑になるため、本チュートリアルでは扱いません。概念として、ブロックに署名付きのトランザクションを入れることで不正な取引が混入しないようにしている点だけ押さえておきましょう。

## 簡単なPoW（Proof of Work）の実装

次に、ブロックチェインの**Proof of Work (PoW)** をシンプルに再現してみます。PoWはブロックチェイン（特にビットコイン）で採用されている**合意形成アルゴリズム**で、不正防止のために計算作業（=仕事, Work）を課す仕組みです。

**PoWの仕組み**: ブロックにナンス値（`nonce`）と呼ばれる余分な数値を付加し、その`nonce`を色々変えながらブロック全体のハッシュ値を計算します。

特定の条件（例えば「ハッシュ値の先頭nビットが0になる」など）を満たす`nonce`を見つけるまで、試行錯誤でハッシュ計算を繰り返す作業がPoWです。 ([Understanding Proof of Work in Blockchain - DEV Community](https://dev.to/blessedtechnologist/understanding-proof-of-work-in-blockchain-l2k#:~:text=difficult%20to%20solve%20but%20straightforward,000000abc))。

この条件を満たすハッシュ値を見つけるには運試し的に大量の計算をする必要がありますが、**一度条件を満たしたブロックが見つかればその検証（ハッシュを再計算して条件を満たすか確認）は非常に容易**です。つまり、「解くのは難しいが答え合わせは簡単」なパズルを各ブロックに課しているわけです。

**難易度 (difficulty)**: 条件の厳しさは「ハッシュ値の先頭に何個の0が並ぶか」などで表現され、必要な先頭の0が多いほど計算量（難易度）が指数関数的に増大します。
 ([Understanding Proof of Work in Blockchain - DEV Community](https://dev.to/blessedtechnologist/understanding-proof-of-work-in-blockchain-l2k#:~:text=Difficulty%20is%20quantified%20by%20the,increases%20the%20computational%20effort%20needed))。

 ネットワーク全体のマイニング速度に応じて、この難易度は適宜調整されるようになっています。ビットコインでは約2週間ごとにブロック生成速度が10分/blockになるよう難易度調整。

それでは、このPoWのアイデアを使って、ブロックに**マイニング（nonce探し）**の処理を追加しましょう。

### nonceフィールドの活用

先ほどBlock構造体に追加した`nonce`（ナンス）を利用します。ブロックのハッシュ計算時に、この`nonce`も入力データに含めるよう`calculateHash`関数を修正しておきます。
（`hasher.update(std.mem.bytesOf(block.nonce))`を追加）。

マイニングでは、`nonce`の値を0から始めて1ずつ増やしながら繰り返しハッシュを計算し、条件に合致するハッシュが出るまでループします。

条件とは今回は簡単のため「ハッシュ値の先頭のバイトが一定数0であること」と定義しましょう。例えば難易度を`difficulty = 2`とした場合、「ハッシュ値配列の先頭2バイトが0×00であること」とします。
（これは16進数で「0000....」と始まるハッシュという意味で、先頭16ビットがゼロという条件です）。

### PoWマイニングのコード実装

以下に、与えられたブロックに対してマイニングを行い、条件を満たすハッシュとnonceを見つける関数`mineBlock`の例を示します。

```zig
fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    // 先頭difficultyバイトがすべて0か確認
    for (hash[0..difficulty]) |byte| {
        if (byte != 0) return false;
    }
    return true;
}

fn mineBlock(block: *Block, difficulty: u8) void {
    while (true) {
        const new_hash = calculateHash(block);
        if (meetsDifficulty(new_hash, difficulty)) {
            // 条件を満たすハッシュが見つかったらブロックに設定して終了
            block.hash = new_hash;
            break;
        }
        // 条件未達ならnonceをインクリメントして再度ループ
        block.nonce += 1;
    }
}
```

`meetsDifficulty`はハッシュ配列の先頭から指定バイト数をチェックし、すべて`0x00`ならtrueを返す関数です。`mineBlock`では無限ループの中で`calculateHash`を呼び出し、難易度条件を満たしたらループを抜けます。見つからなければ`nonce`を増やして再度ハッシュ計算、という流れです。

難易度`difficulty`は調整可能ですが、大きな値にすると探索に非常に時間がかかるため、ローカルで試す場合は小さな値に留めましょう（例えば1や2程度）。`difficulty = 2`でも場合によっては数万回以上のループが必要になることがあります。PoWは計算量をわざと大きくすることで、ブロック生成にコストを課す仕組みだということを念頭に置いてください。

以上で、ブロックに対してPoWを行いハッシュ値の条件を満たすようにする「マイニング」処理が完成しました。これにより、新しいブロックを正式にチェインに繋げることができます。改ざんしようとする者は、このPoWを再度解かなければならないため、改ざんのコストも非常に高くなります。

## 動作確認とデバッグ

ここまでで、**ブロックチェインの基本要素**（ブロック構造、トランザクション、ハッシュ計算、PoW）が揃いました。最後に、これらを組み合わせて実際にブロックチェインを動かし、正しく機能するか確認しましょう。また、Zigでのデバッグ方法やテストコードの書き方についても触れておきます。

### ブロックチェインの連結と検証

まず、簡単にブロックチェインを連結する処理をおさらいします。新しいブロックをチェインに追加する際は、**前のブロックのハッシュ値**を新ブロックの`prev_hash`にセットし、PoWマイニング（`mineBlock`）によってハッシュを確定させてからチェインに繋ぎます。最初のブロック（ジェネシスブロック）は前のブロックが存在しないため、`prev_hash`には32バイト全て`0`の値（ゼロハッシュ）を入れておくとよいでしょう。

チェイン全体の検証は各ブロックについて以下をチェックします。

- `prev_hash`が直前のブロックの`hash`と一致しているか
- ブロックの`hash`がブロック内容（含`nonce`）から正しく計算されているか
- PoWの難易度条件を満たしているか

上記を各ブロックについて確認し、ひとつでも不整合があればチェインは無効（改ざんされている）と判断できます。

### Zigでのデバッグ方法（printデバッグやコンパイラオプション）

Zigでデバッグを行う方法としては、**printデバッグ**（プログラム中に変数値を出力して追跡する）や、組み込みのテストフレームワークを使う方法があります。`std.debug.print`や`std.log.info`を使って適宜値を表示すれば、ブロック生成の過程やハッシュ計算結果を確認できます。例えばマイニング中に`nonce`の値を一定間隔で表示したり、ブロック完成時に`hash`を16進数で表示したりすると、処理の様子が掴みやすいでしょう。

Zigコンパイラにはデフォルトで**デバッグモード**（安全チェック有効）と**最適化モード**（安全チェック無効で高速化）のビルドオプションがあります。

何も指定しなければデフォルトでデバッグ用ビルドになります。

コンパイル時に`-O ReleaseFast`や`-O ReleaseSafe`といったフラグを付けると最適化ビルドが可能です。ただし、デバッグ時には省略して実行し、エラー発生箇所のスタックトレースや、オーバーフロー・メモリアクセス違反検出などZigの安全機能を活用すると良いでしょう。

コード全体は次のようになります。
```src/main.zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

// --- ステップ4: PoWによるマイニングを追加 ---

const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
};

const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    nonce: u64, // PoW用
    hash: [32]u8,
};

fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update(std.mem.bytesOf(block.index));
    hasher.update(std.mem.bytesOf(block.timestamp));
    hasher.update(&block.prev_hash);
    hasher.update(std.mem.bytesOf(block.nonce));
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(std.mem.bytesOf(tx.amount));
    }
    return hasher.finalResult();
}

fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    for (hash[0..difficulty]) |byte| {
        if (byte != 0) return false;
    }
    return true;
}

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

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var stdout = std.io.getStdOut().writer();

    // ブロックを作成
    var block = Block{
        .index = 0,
        .timestamp = std.time.timestamp(),
        .prev_hash = [_]u8{0} ** 32,
        .transactions = std.ArrayList(Transaction).init(allocator),
        .nonce = 0,
        .hash = [_]u8{0} ** 32,
    };
    defer block.transactions.deinit();

    // トランザクションを2件追加
    try block.transactions.append(Transaction{
        .sender = "Alice", .receiver = "Bob", .amount = 100,
    });
    try block.transactions.append(Transaction{
        .sender = "Charlie", .receiver = "Dave", .amount = 50,
    });

    // 難易度を2(先頭2バイトが0)に設定してマイニング
    mineBlock(&block, 2);

    // 結果表示
    try stdout.print("Block index: {d}\n", .{block.index});
    try stdout.print("Timestamp  : {d}\n", .{block.timestamp});
    try stdout.print("Nonce      : {d}\n", .{block.nonce});
    try stdout.print("Hash       : ", .{});
    for (block.hash) |b| {
        try stdout.print("{02x}", .{b});
    }
    try stdout.print("\n", .{});
    try stdout.print("Transactions:\n", .{});
    for (block.transactions.items) |tx| {
        try stdout.print("  {s} -> {s} : {d}\n", .{tx.sender, tx.receiver, tx.amount});
    }
}
```

### 簡単なテストコードを書く

Zigには組み込みのテスト機能があり、`test "名前"`ブロックの中にテストコードを書くことができます ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=test%20,World))。テストブロック内では`std.testing.expect`マクロを使って式が期待通りの結果かチェックできます ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=test%20,World))。ブロックチェインの動作検証として、一例として「ブロックが改ざんを検出できること」をテストしてみます。

```zig
const std = @import("std");
const allocator = std.testing.allocator; // テスト用アロケータ
test "ブロック改ざんの検出" {
    // 1件のトランザクションを持つブロックを作成（ジェネシスブロック想定）
    var tx_list = std.ArrayList(Transaction).init(allocator);
    defer tx_list.deinit();  // テスト終了時にメモリ解放 ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=var%20list%20%3D%20ArrayList%28u8%29,World))
    try tx_list.append(Transaction{ .sender = "Alice", .receiver = "Bob", .amount = 100 });
    var block = Block{
        .index = 0,
        .timestamp = 0,
        .prev_hash = [_]u8{0} ** 32,  // 前ブロックがないのでゼロで初期化
        .transactions = tx_list,
        .nonce = 0,
        .hash = undefined,
    };
    block.hash = calculateHash(&block); // ハッシュ計算

    // ブロックを書き換えてみる（トランザクションの金額を改ざん）
    block.transactions.items[0].amount = 200;
    const new_hash = calculateHash(&block);
    // 改ざん前後でハッシュ値が異なることを確認
    std.testing.expect(std.mem.eql(u8, block.hash[0..], new_hash[0..]) == false);
}
```

このテストでは、最初にAliceからBobへ100の送金トランザクションを含むブロックを作り、そのブロックのハッシュを求めています。次にブロック内の取引金額を100から200に改ざんし、再度ハッシュを計算します。`std.testing.expect(... == false)`によって、改ざん前後でハッシュが一致しない（つまり改ざんを検出できる）ことを検証しています。実行時にこの期待が満たされない場合（もし改ざんしてもハッシュが変わらなかった場合など）はテストが失敗し、エラーが報告されます。

テストコードは、ファイル内に記述して`zig test ファイル名.zig`で実行できます。`zig build test`を使えばビルドシステム経由でプロジェクト内のすべてのテストを実行できます。上記テストを走らせて**パスすれば、ブロックの改ざん検知ロジックが正しく機能している**ことになります。

### その他のデバッグヒント

- **ログ出力**: Zigの標準ライブラリにはログ機能（`std.log`）もあります。必要に応じて`std.log.info`などを使えば、ログレベルごとの出力が可能です。
- **メモリ管理のチェック**: Zigは低レベル言語なのでメモリ管理に注意が必要です。今回`std.ArrayList`を使いましたが、使用後に`deinit()`で確保したメモリを解放することを忘れないようにしましょう ([ArrayList | zig.guide](https://zig.guide/standard-library/arraylist/#:~:text=var%20list%20%3D%20ArrayList%28u8%29,World))。Zigのテストでは`std.testing.allocator`を使うことで、テスト終了時にメモリリークがないか自動チェックできます。
- **スタックトレース**: 実行時エラーが発生すると、Zigはデフォルトでスタックトレースを表示します。どの関数のどの行でエラーが起きたか追跡できるので、バグ修正に役立ちます。

## おわりに

本チュートリアルでは、Zigを用いてブロックチェインの最も基本的な部分を実装しました。**ブロック構造の定義**から始まり、**トランザクションの取り扱い**、**ハッシュによるブロックの連結**、そして**Proof of Workによるマイニング**まで、一通りの流れを体験できたはずです。完成したプログラムはシンプルながら、ブロックチェインの改ざん耐性やワークロード証明の仕組みを備えています。

実際のブロックチェインシステムでは、この他にも様々な要素があります。

- **ピアツーピアネットワーク**による分散ノード間の通信
- **トランザクションのデジタル署名と検証**
- **コンセンサスアルゴリズムの調整**
- **ブロックサイズや報酬の管理**

などです。

まずは今回構築したプロトタイプを土台に、徐々にそういった機能を拡張してみるのも良いでしょう。

Zigは高性能で安全性の高いシステムプログラミング言語です。その特徴を活かしてブロックチェインを実装・改良していくことで、低レベルからブロックチェインの動作原理を深く理解できるはずです。ぜひ引き続き手を動かしながら、Zigでの開発とブロックチェインの探求を楽しんでください。 ([Hash Functions and the Blockchain Ledger](https://osl.com/academy/article/hash-functions-and-the-blockchain-ledger/#:~:text=Each%20block%20in%20a%20blockchain,network%20can%20trust%20the%20data))。 ([Understanding Proof of Work in Blockchain - DEV Community](https://dev.to/blessedtechnologist/understanding-proof-of-work-in-blockchain-l2k#:~:text=difficult%20to%20solve%20but%20straightforward,000000abc))。

### まとめプログラムの実装例

ファイル名を **main.zig** として作成する。

```zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

/// 取引（トランザクション）の構造体
const Transaction = struct {
    sender: []const u8,    // 送信者アドレス（文字列）
    receiver: []const u8,  // 受信者アドレス
    amount: u64,           // 送金額
};

/// ブロックを表す構造体
const Block = struct {
    index: u32,                        // ブロック番号
    timestamp: u64,                    // 作成時刻（Unixエポック秒）
    prev_hash: [32]u8,                 // 直前のブロックのハッシュ（32バイト）
    transactions: std.ArrayList(Transaction), // 取引リスト
    nonce: u64,                        // マイニング用ナンス
    hash: [32]u8,                      // このブロックのハッシュ
};

/// ブロック内の各フィールドを順次ハッシュへ投入し、SHA-256ハッシュを返す
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});
    hasher.update(std.mem.bytesOf(block.index));
    hasher.update(std.mem.bytesOf(block.timestamp));
    hasher.update(&block.prev_hash);
    hasher.update(std.mem.bytesOf(block.nonce));
    // 各取引について、フィールドを順にハッシュへ投入
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(std.mem.bytesOf(tx.amount));
    }
    return hasher.finalResult();
}

/// ハッシュ値の先頭 'difficulty' バイトが全て0かどうかチェックする関数
fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    for (hash[0..difficulty]) |byte| {
        if (byte != 0) return false;
    }
    return true;
}

/// PoWによるマイニング処理：条件を満たすハッシュとnonceを見つける
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

/// ハッシュ値を16進数で出力する補助関数
fn printHash(writer: anytype, hash: [32]u8) !void {
    for (hash) |byte| {
        try writer.print("{02x}", .{byte});
    }
    try writer.print("\n", .{});
}

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var stdout = std.io.getStdOut().writer();

    // 取引リストを初期化
    var tx_list = std.ArrayList(Transaction).init(allocator);
    defer tx_list.deinit();

    // 例として2件の取引を追加
    try tx_list.append(Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 100,
    });
    try tx_list.append(Transaction{
        .sender = "Charlie",
        .receiver = "Dave",
        .amount = 50,
    });

    // ジェネシスブロックの作成（最初のブロックなので、prev_hashは全0）
    var genesis_block = Block{
        .index = 0,
        .timestamp = std.time.timestamp(),
        .prev_hash = [_]u8{0} ** 32, // 32バイトのゼロハッシュ
        .transactions = tx_list,
        .nonce = 0,
        .hash = undefined,
    };

    // 難易度を2（先頭2バイトが0）とし、ブロックをマイニング
    mineBlock(&genesis_block, 2);

    // ブロック情報を出力
    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Nonce      : {d}\n", .{genesis_block.nonce});
    try stdout.print("Hash       : ");
    try printHash(stdout, genesis_block.hash);
    try stdout.print("Prev Hash  : ");
    try printHash(stdout, genesis_block.prev_hash);
    try stdout.print("Transactions:\n", .{});
    for (genesis_block.transactions.items) |tx| {
        try stdout.print("  Sender: {s}, Receiver: {s}, Amount: {d}\n",
            .{tx.sender, tx.receiver, tx.amount});
    }
}
```
