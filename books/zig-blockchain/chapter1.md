---
title: "Zigで始めるブロックチェイン構築: 基本実装チュートリアル"
free: true
---

ブロックチェインの基本概念を学びながら、Zig言語を使って最小限のブロックチェイン・プロトタイプを実装してみましょう。**環境セットアップ**から始めて、**ブロックとトランザクションの構造**、**Proof of Work (PoW)** の簡単な実装、そして**動作確認とデバッグ**まで、手を動かしながら順を追って解説します。最終的に、Zigでブロックチェインの基礎が動作するプログラムを完成させ、ブロックチェインの仕組みを体験することが目標です。

このチュートリアルの進め方は次の通りです。

> 1. **ブロックの構造**や**ハッシュ計算**、**PoW** など、ブロックチェインの「核」となる部分をシンプルに実装し、まずは**改ざん検出**や**チェイン構造**を理解します。
> 2. 次章以降で**複数ブロックの追加**や**デジタル署名**、**P2Pネットワーク**などを順次取り上げ、実際のビットコインなどの実装に近づけていきます。
> 3. 参考文献として、ビットコインのホワイトペーパーや「Mastering Bitcoin」などを参照しながら、実際の大規模ブロックチェインの仕組みや、より高度な設計を学んでいきましょう。

## ブロックチェインの基本構造

それでは、ブロックチェインのコアである「ブロック」の構造を実装していきます。まずはブロックチェインの基本を簡単におさらいしましょう。

### なぜブロックという単位か

ブロックチェインでは、膨大な取引情報をそのまま連続的に記録すると、改ざん検出や管理が非常に困難になる。そこで「ブロック」という単位に複数の取引や関連情報（タイムスタンプ、前ブロックのハッシュ値など）をまとめることで、各ブロックごとに一意の「指紋」を生成する仕組みになっています。

**ブロックとは**: ブロックチェインにおけるブロックは、**いくつかのトランザクションの集合**と**タイムスタンプ（日時）**、そして**ひとつ前のブロックのハッシュ値**などを含むデータ構造です。
 ([Hash Functions and the Blockchain Ledger](https://osl.com/academy/article/hash-functions-and-the-blockchain-ledger/#:~:text=Each%20block%20in%20a%20blockchain,network%20can%20trust%20the%20data))。
 各ブロックは前のブロックのハッシュを自分の中に取り込むことで過去との連続性（チェイン）を持ち、これによってブロック同士が鎖状にリンクしています。

**改ざん耐性**: ブロックに含まれるハッシュ値のおかげで、もし過去のブロックのデータが少しでも書き換えられるとそのブロックのハッシュ値が変わります。すると後続のブロックに保存された「前のブロックのハッシュ」と一致しなくなるため、チェイン全体の整合性が崩れてしまいます。この仕組みにより、1つのブロックを改ざんするにはそのブロック以降のすべてのブロックを書き換えなければならず、改ざんは非常に困難になります。

### ステップ1: ブロック構造体だけを定義し、単一ブロックを作成する

上記の概念を踏まえて、Zigでブロックを表現する構造体を作ってみましょう。ブロックに含める主な情報は以下の通りです。

- `index`: ブロック番号（第何番目のブロックかを示す整数）
- `timestamp`: ブロックが作られた時刻（UNIXエポック秒などで保存）
- `prev_hash`: 直前のブロックのハッシュ値
- `data`: ブロックに格納する任意のデータ（まずはシンプルに文字列など）
- `hash`: ブロック自身のハッシュ値（このブロックの`index`や`data`等から計算された値）

Zigでは以下のように`struct`を使ってブロックの型を定義できます。

```zig
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

```zig
const std = @import("std");

/// ブロックチェインの1ブロックを表す構造体
/// - index: ブロック番号（u32）
/// - timestamp: ブロック生成時のタイムスタンプ（u64）
/// - prev_hash: 前ブロックのハッシュ（32バイトの固定長配列）
/// - data: ブロックに含まれるデータ（可変長スライス）
/// - hash: このブロックのハッシュ（SHA-256の結果、32バイト固定長配列）
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    data: []const u8,
    hash: [32]u8,
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

### ステップ2: ハッシュ計算を追加し、`hash`フィールドを埋める

ブロックチェインの肝は**ハッシュの計算**です。ブロックの`hash`フィールドは、ブロック内容全体（index, タイムスタンプ, prev_hash, dataなど）から計算されるハッシュ値です。Zigの標準ライブラリにはSHA-256などのハッシュ関数実装が含まれているので、それを利用してハッシュ計算をします。

ZigでSHA-256を使うには、`std.crypto.hash.sha2`名前空間の`Sha256`型を利用します。以下にブロックのハッシュ値を計算する関数の例を示します。

```zig
const std = @import("std");
const crypto = std.crypto.hash;  // ハッシュ用の名前空間
const Sha256 = crypto.sha2.Sha256;

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    // 左辺で返り値の型を [@sizeOf(T)]u8 として指定する
    const bytes: [@sizeOf(T)]u8 = @bitCast(value);
    // 固定長配列を全体スライスとして返す
    return bytes[0..@sizeOf(T)];
}

/// calculateHash関数は、ブロックの各フィールドからバイト列を生成し、
/// それらを順次ハッシュ計算コンテキストに入力して最終的なSHA-256ハッシュを得る関数です。
fn calculateHash(block: *const Block) [32]u8 {
    // SHA-256のハッシュ計算コンテキストを初期化する
    var hasher = Sha256.init(.{});

    // ブロックのindex (u32) をバイト列に変換してハッシュに追加
    hasher.update(toBytes(u32, block.index));

    // ブロックのtimestamp (u64) をバイト列に変換してハッシュに追加
    hasher.update(toBytes(u64, block.timestamp));

    // 前ブロックのハッシュ（固定長配列）は既にスライスになっているのでそのまま追加
    hasher.update(block.prev_hash[0..]);

    // ブロック内のデータ（可変長スライス）もそのまま追加
    hasher.update(block.data);

    // これまでの入力からSHA-256ハッシュを計算して返す（32バイト配列）
    return hasher.finalResult();
}
```

上記の`calculateHash`関数では、`Sha256.init(.{})`でハッシュ計算用のコンテキストを作成します。その後`hasher.update(...)`でブロックの各フィールドをバイト列として順次ハッシュ計算に入力しています。
`toBytes`は与えた値をバイト列として扱うためのヘルパーで、整数型の値などをハッシュに含められて便利です。
最後に`hasher.finalResult()`を呼ぶと、これまでに与えたデータのSHA-256ハッシュが計算され、32バイトの配列として得られます。

## なぜ`toBytes`関数を定義しているのか

Zigでは、**整数型をそのまま「バイト列 (slice of bytes)」としてハッシュ関数へ渡す**場合、以下のような方法が考えられます。

1. **`std.mem.bytesOf(T)`** を使う（Zigのバージョンによっては存在しない場合がある／非推奨となる可能性がある）。
2. **`@bitCast()`** を使って独自に「生のバイト列」へ変換する処理を書く。

今回のコードでは **`@bitCast()`** を活用し、**`toBytes`** という小さな関数を定義しています。これは「**任意の型 `T` の値を、メモリ上の生のビット列として `[@sizeOf(T)]u8` の固定長配列に再解釈し、それをスライス（`[]const u8`）として返す**」処理です。具体的には以下のフローになります。

1. **`comptime T: type`**

   これはZigの引数に「型を受け取る」機能で、コンパイル時に確定する型 `T` を受け取ります。

2. **`@sizeOf(T)`**

   `T` のメモリサイズをコンパイル時に取得します。例えば `u32` なら `4` バイト、`u64` なら `8` バイトです。

3. **ローカルな固定長配列 `const bytes: [@sizeOf(T)]u8 = @bitCast(value);`**

   Zigの組み込み関数 `@bitCast(FromType, ToType)` は、**「メモリ内容を一切変換せずに型だけを再解釈する」**処理です。
   ここでは `value`（整数など）を「同じサイズのバイト配列」に再解釈しています。

4. **`return bytes[0..@sizeOf(T)];`**

   固定長配列を `[]u8` スライスにして返しています。これは、呼び出し元で `hasher.update(...)` に渡すためです。

つまり、**`toBytes`** は「任意の型 `T` を**生のバイト表現**に落として、ハッシュ関数へそのまま投入できる形」に変換するための補助関数です。
バージョンの異なるZigや将来的な変更を考えると、こうした**独自のbitCastラッパ**を作っておくのは柔軟な対応策となります。

**ハッシュ計算のポイント**: ブロックの`hash`値は **ブロック内のすべての重要データから計算** されます。この例では `index, timestamp, prev_hash, data` を含めていますが、後で追加するトランザクションやnonceといった要素も含める必要があります。一度ハッシュを計算して`block.hash`に保存した後で、ブロックの中身（例えば`data`）が変われば当然ハッシュ値も変わります。つまり、`hash`はブロック内容の一種の指紋となっており、内容が変われば指紋も一致しなくなるため改ざんを検出できます。

コード全体は次のようになります。

```bash
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

/// ブロックチェインの1ブロックを表す構造体
/// - index: ブロック番号（u32）
/// - timestamp: ブロック生成時のタイムスタンプ（u64）
/// - prev_hash: 前ブロックのハッシュ（32バイトの固定長配列）
/// - data: ブロックに含まれるデータ（可変長スライス）
/// - hash: このブロックのハッシュ（SHA-256の結果、32バイト固定長配列）
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    data: []const u8,
    hash: [32]u8,
};

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    // 左辺で返り値の型を [@sizeOf(T)]u8 として指定する
    const bytes: [@sizeOf(T)]u8 = @bitCast(value);
    // 固定長配列を全体スライスとして返す
    return bytes[0..@sizeOf(T)];
}

/// calculateHash関数は、ブロックの各フィールドからバイト列を生成し、
/// それらを順次ハッシュ計算コンテキストに入力して最終的なSHA-256ハッシュを得る関数です。
fn calculateHash(block: *const Block) [32]u8 {
    // SHA-256のハッシュ計算コンテキストを初期化する
    var hasher = Sha256.init(.{});

    // ブロックのindex (u32) をバイト列に変換してハッシュに追加
    hasher.update(toBytes(u32, block.index));

    // ブロックのtimestamp (u64) をバイト列に変換してハッシュに追加
    hasher.update(toBytes(u64, block.timestamp));

    // 前ブロックのハッシュ（固定長配列）は既にスライスになっているのでそのまま追加
    hasher.update(block.prev_hash[0..]);

    // ブロック内のデータ（可変長スライス）もそのまま追加
    hasher.update(block.data);

    // これまでの入力からSHA-256ハッシュを計算して返す（32バイト配列）
    return hasher.finalResult();
}

/// main関数：ブロックの初期化、ハッシュ計算、及び結果の出力を行います。
pub fn main() !void {
    const stdout = std.io.getStdOut().writer();

    // genesis_block（最初のブロック）を作成
    var genesis_block = Block{
        .index = 0,
        .timestamp = 1672531200, // 例としてUnixタイムスタンプを指定
        .prev_hash = [_]u8{0} ** 32, // 初回は前ブロックのハッシュは全0
        .data = "Hello, Zig Blockchain!",
        .hash = [_]u8{0} ** 32, // 初期値は全0。後で計算結果で上書きする
    };

    // calculateHash()でブロックの全フィールドからハッシュを計算し、hashフィールドに保存する
    genesis_block.hash = calculateHash(&genesis_block);

    // 結果を出力
    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Data       : {s}\n", .{genesis_block.data});
    try stdout.print("Hash       : ", .{});
    // 32バイトのハッシュを1バイトずつ16進数（小文字）で出力する
    for (genesis_block.hash) |byte| {
        try stdout.print("{x}", .{byte});
    }
    try stdout.print("\n", .{});
}
```

実行してみるとハッシュが追加されているのがわかります。

```bash
❯ zig run src/main.zig
Block index: 0
Timestamp  : 1672531200
Data       : Hello, Zig Blockchain!
Hash       : 502713c91775223a2e2b3876c8d273766e90df0c0d8114c5ea786e353c532
```

ここまでで、ブロックの基本構造とハッシュ計算方法が定義できました。次に、このブロックに取引（トランザクション）の情報を組み込んでいきましょう。

## ステップ3: トランザクションを導入し、ブロックに複数の取引情報を持たせる

ブロックチェインは本来、多くの取引（トランザクション）をひとつのブロックに束ねて扱います。これによって改ざんを検出しやすくしたり、ネットワーク全体の負荷を抑えたりしています。ここでは、前章までに作った「**単一ブロックとそのハッシュ計算**」を拡張し、**複数のトランザクションを持てるブロック**を作る流れを **段階的** に進めていきましょう。

### トランザクション用の構造体を定義する

まずは、取引を表すデータ構造 `Transaction` を作ります。実際の暗号通貨では「送信者の署名」「入力と出力のリスト」など複雑な形を取ります。ここでは最低限として「送信者（sender）」「受信者（receiver）」「金額（amount）」だけを持つシンプルな構造にします。

```bash
/// トランザクション構造体
const Transaction = struct {
    sender: []const u8,    // 送信者(文字列)
    receiver: []const u8,  // 受信者(文字列)
    amount: u64,           // 金額(整数)
    // (実際は署名など必要)
};
```

これをファイルに追加し、**ブロック**との関連付けはまだ行いません。とりあえず「トランザクションとはこういうもの」という定義を作る段階です。

### ブロックに可変長トランザクションのリストを追加

次に、`Block` 構造体へ**複数のトランザクションを持つフィールド**を追加します。Zigには `std.ArrayList(T)` があり、C++の `std::vector` に相当する可変長配列です。以下のように `transactions: std.ArrayList(Transaction)` を導入しましょう。

```bash
/// ブロック構造体
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction), // 複数のトランザクションを保持
    // ここは前章で定義したもの
    data: []const u8,
    hash: [32]u8,
};
```

これで、**ブロックが1つのリストを持ち、そこに任意数のトランザクションを追加**できるようになります。

### 初期化時に動的配列を使う

Zigの `std.ArrayList(T)` は使用前に必ず `init(allocator)` で初期化する必要があります。また、使い終わったら `deinit()` を呼び出してメモリを解放しなければなりません。

```bash
const allocator = std.heap.page_allocator;

// ブロック作成時
var block = Block{
    .index = 0,
    .timestamp = 1672531200,
    .prev_hash = [_]u8{0} ** 32,
    .transactions = undefined, // 後で初期化
    .data = "Sample Data",
    .hash = [_]u8{0} ** 32,
};

// 動的配列を初期化
block.transactions = std.ArrayList(Transaction).init(allocator);
// 終了時または使い終わりに解放
defer block.transactions.deinit();
```

**`defer block.transactions.deinit();`** という書き方にすると、スコープを抜けたとき自動で解放されるため便利です。

### トランザクションを追加する

初期化が済んだら、**`append` メソッド**を使ってトランザクションを追加できます。
以下の例では2件追加し、```Alice→Bob 100, Charlie→Dave 50``` の取引を作っています。

```bash
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
```

appendに失敗するとエラーが返るため、`try` を付けてエラー処理を行っています。

### ハッシュ計算にトランザクションを組み込む

すでに作った `calculateHash(block: *const Block) [32]u8` 関数を**少し修正**し、ブロックのハッシュ計算時に**各トランザクション**も含めるようにします。
**ブロックの ```index, timestamp, prev_hash, そして全トランザクション(sender, receiver, amount)``` を順にハッシュ**に投入します。
トランザクションをブロックに含めたことで、ハッシュ計算時に考慮すべきデータも増えます。`calculateHash`関数では、ブロック内の全トランザクションの内容もハッシュ入力に追加する必要があります。

```bash
/// calculateHash関数
/// ブロックの各フィールドを順番にハッシュ計算へ渡し、最終的なSHA-256ハッシュを得る。
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // indexとtimestampをバイト列へ変換
    hasher.update(toBytes(u32, block.index));
    hasher.update(toBytes(u64, block.timestamp));

    // 前のブロックのハッシュは配列→スライスで渡す
    hasher.update(block.prev_hash[0..]);

    // ブロックに保持されているトランザクション一覧をまとめてハッシュ
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(toBytes(u64, tx.amount));
    }

    // 既存コードとの互換を保つため、dataもハッシュに含める
    hasher.update(block.data);

    return hasher.finalResult();
}
```

`block.transactions.items`はArrayList内の生のスライス（配列）データです。ループで各`tx`にアクセスし、その中の`sender`文字列、`receiver`文字列、`amount`数値を順次ハッシュに投入しています。こうすることで**ブロック内の全トランザクションデータがハッシュ値計算に反映**されます。トランザクションの追加や変更があればハッシュ値も変化するため、ブロックの改ざん検知において重要な役割を果たします。

> **メモ:** 実際のブロックチェインでは、各トランザクションは送信者の秘密鍵による**デジタル署名**が含まれます。署名によって取引の正当性（送信者本人が承認した取引であること）が保証されますが、署名の作成と検証には公開鍵暗号が必要で実装が複雑になるため、本チュートリアルでは扱いません。概念として、ブロックに署名付きのトランザクションを入れることで不正な取引が混入しないようにしている点だけ押さえておきましょう。

これで、**ブロックの全トランザクションがハッシュ値に反映**されます。
ブロックを改ざんしようとしても、このハッシュが再計算されると合わなくなるため、改ざんが検出できるというわけです。

> **発展：マークルツリー**
> トランザクション数が大幅に増えると、各トランザクションをすべて直接ハッシュ計算するのではなく、**マークルツリー**を使って1つのルートハッシュにまとめる手法が一般的です。ビットコインなどでは、このマークルルートだけをブロックヘッダーに入れ、ブロック全体を効率的に検証できる仕組みにしています。
> 本チュートリアルではまず“すべてのトランザクションを順にハッシュ”して仕組みを理解し、後の章でマークルツリーを導入する流れをとると良いでしょう。

最後に、すべてを**`main`関数内**にまとめた例を示します。これで「ブロックに複数の取引をまとめ、ブロックのハッシュを求める」ひととおりの流れが完結します。

コード全体は次のようになります。(src/main.zig)

```bash
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

/// トランザクションの構造体
/// 送信者(sender), 受信者(receiver), 金額(amount) の3つだけを持つ。
const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
    // 本来は署名やトランザクションIDなどの要素が必要
};

/// ブロックの構造体
/// - index: ブロック番号
/// - timestamp: 作成時刻
/// - prev_hash: 前ブロックのハッシュ（32バイト）
/// - transactions: 動的配列を使って複数のトランザクションを保持
/// - data: 既存コードとの互換を保つために残す(省略可)
/// - hash: このブロックのSHA-256ハッシュ(32バイト)
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    data: []const u8, // (必要に応じて省略可能)
    hash: [32]u8,
};

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    // 左辺で返り値の型を [@sizeOf(T)]u8 として指定する
    const bytes: [@sizeOf(T)]u8 = @bitCast(value);
    // 固定長配列を全体スライスとして返す
    return bytes[0..@sizeOf(T)];
}

/// calculateHash関数
/// ブロックの各フィールドを順番にハッシュ計算へ渡し、最終的なSHA-256ハッシュを得る。
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // indexとtimestampをバイト列へ変換
    hasher.update(toBytes(u32, block.index));
    hasher.update(toBytes(u64, block.timestamp));

    // 前のブロックのハッシュは配列→スライスで渡す
    hasher.update(block.prev_hash[0..]);

    // ブロックに保持されているトランザクション一覧をまとめてハッシュ
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(toBytes(u64, tx.amount));
    }

    // 既存コードとの互換を保つため、dataもハッシュに含める
    hasher.update(block.data);

    return hasher.finalResult();
}

/// main関数：ブロックの初期化、ハッシュ計算、及び結果の出力を行います。
pub fn main() !void {
    // メモリ割り当て用アロケータを用意（ページアロケータを簡易使用）
    const allocator = std.heap.page_allocator;
    const stdout = std.io.getStdOut().writer();

    // ジェネシスブロック(最初のブロック)を作成
    var genesis_block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32, // 前ブロックが無いので全0にする
        // アロケータの初期化は後で行うため、いったんundefinedに
        .transactions = undefined,
        .data = "Hello, Zig Blockchain!",
        .hash = [_]u8{0} ** 32,
    };

    // transactionsフィールドを動的配列として初期化
    genesis_block.transactions = std.ArrayList(Transaction).init(allocator);
    defer genesis_block.transactions.deinit();

    // トランザクションを2件追加
    try genesis_block.transactions.append(Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 100,
    });
    try genesis_block.transactions.append(Transaction{
        .sender = "Charlie",
        .receiver = "Dave",
        .amount = 50,
    });

    // calculateHash()でブロックの全フィールドからハッシュを計算し、hashフィールドに保存する
    genesis_block.hash = calculateHash(&genesis_block);

    // 結果を出力
    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Data       : {s}\n", .{genesis_block.data});
    try stdout.print("Transactions:\n", .{});
    for (genesis_block.transactions.items) |tx| {
        try stdout.print("  {s} -> {s} : {d}\n", .{ tx.sender, tx.receiver, tx.amount });
    }
    try stdout.print("Hash       : ", .{}); // ← ここはプレースホルダなし、引数なし
    // 32バイトのハッシュを1バイトずつ16進数で出力
    for (genesis_block.hash) |byte| {
        try stdout.print("{x}", .{byte});
    }
    try stdout.print("\n", .{});
}
```

こうして**「複数のトランザクションをブロックにまとめる」**実装ができました。実際にコードを動かすと、**ブロックのハッシュがトランザクションに依存**しており、新たに取引を追加してからハッシュを再計算すると、ハッシュ値も変わっています。

```bash
❯ zig run src/main.zig
Block index: 0
Timestamp  : 1672531200
Data       : Hello, Zig Blockchain!
Transactions:
  Alice -> Bob : 100
  Charlie -> Dave : 50
Hash       : d7928f7e56537c9e97ce858e7c8fbc211c2336f32b32d8edc707cdda271142b
```

次のステップでは、**PoW（Proof of Work）** を導入し、`nonce`を使ってブロックハッシュが特定条件を満たすまで試行錯誤する「マイニング」処理を追加してみましょう。そこまで実装すると、「トランザクションをいじればブロックのハッシュが合わなくなり、PoWもやり直しになる」という改ざん耐性が、より強固に体験できます。

## ステップ4: 簡単なPoW（Proof of Work）の実装

次に、ブロックチェインの**Proof of Work (PoW)** をシンプルに再現してみます。PoWはブロックチェイン（特にビットコイン）で採用されている**合意形成アルゴリズム**で、不正防止のために計算作業（=仕事, Work）を課す仕組みです。

**PoWの仕組み**: ブロックにナンス値（`nonce`）と呼ばれる余分な数値を付加し、その`nonce`を色々変えながらブロック全体のハッシュ値を計算します。
ナンスはNumber Used Onceの略で、一度しか使わない数値という意味です。

特定の条件（例えば「ハッシュ値の先頭nビットが0になる」など）を満たす`nonce`を見つけるまで、試行錯誤でハッシュ計算を繰り返す作業がPoWです。 ([Understanding Proof of Work in Blockchain - DEV Community](https://dev.to/blessedtechnologist/understanding-proof-of-work-in-blockchain-l2k#:~:text=difficult%20to%20solve%20but%20straightforward,000000abc))。

この条件を満たすハッシュ値を見つけるには運試し的に大量の計算をする必要がありますが、**一度条件を満たしたブロックが見つかればその検証（ハッシュを再計算して条件を満たすか確認）は非常に容易**です。つまり、「解くのは難しいが答え合わせは簡単」なパズルを各ブロックに課しているわけです。

**難易度 (difficulty)**: 条件の厳しさは「ハッシュ値の先頭に何個の0が並ぶか」などで表現され、必要な先頭の0が多いほど計算量（難易度）が指数関数的に増大します。
 ([Understanding Proof of Work in Blockchain - DEV Community](https://dev.to/blessedtechnologist/understanding-proof-of-work-in-blockchain-l2k#:~:text=Difficulty%20is%20quantified%20by%20the,increases%20the%20computational%20effort%20needed))。

 ネットワーク全体のマイニング速度に応じて、この難易度は適宜調整されるようになっています。ビットコインでは約2週間ごとにブロック生成速度が10分/blockになるよう難易度調整。

それでは、このPoWのアイデアを使って、ブロックに**マイニング（nonce探し）**の処理を追加しましょう。

### nonceフィールドの追加

Block構造体に`nonce`（ナンス）を追加します。

```zig
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    data: []const u8, // (必要に応じて省略可能)
    nonce: u64, // PoW用のnonce
    hash: [32]u8,
};
```

ブロックのハッシュ計算時に、この`nonce`も入力データに含めるよう`calculateHash`関数を修正しておきます。

```zig
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // index と timestamp
    hasher.update(toBytes(u32, block.index));
    hasher.update(toBytes(u64, block.timestamp));

    // 前のブロックのハッシュ
    hasher.update(block.prev_hash[0..]);

    // ここで nonce を加える
    hasher.update(toBytes(u64, block.nonce));

    // トランザクションの各要素をまとめてハッシュ
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(toBytes(u64, tx.amount));
    }

    // 既存コードとの互換を保つため、data もハッシュに含める
    hasher.update(block.data);

    return hasher.finalResult();
}
```

コード全体は以下のようになります。

```zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

/// トランザクションの構造体
/// 送信者(sender), 受信者(receiver), 金額(amount) の3つだけを持つ。
const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
    // 本来は署名やトランザクションIDなどの要素が必要
};

/// ブロックの構造体
/// - index: ブロック番号
/// - timestamp: 作成時刻
/// - prev_hash: 前ブロックのハッシュ（32バイト）
/// - transactions: 動的配列を使って複数のトランザクションを保持
/// - nonce: PoW用のnonce
/// - data: 既存コードとの互換を保つために残す(省略可)
/// - hash: このブロックのSHA-256ハッシュ(32バイト)
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    data: []const u8, // (必要に応じて省略可能)
    nonce: u64, // PoW用のnonce
    hash: [32]u8,
};

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    // 左辺で返り値の型を [@sizeOf(T)]u8 として指定する
    const bytes: [@sizeOf(T)]u8 = @bitCast(value);
    // 固定長配列を全体スライスとして返す
    return bytes[0..@sizeOf(T)];
}

/// calculateHash関数
/// ブロックの各フィールドを順番にハッシュ計算へ渡し、最終的なSHA-256ハッシュを得る。
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // indexとtimestampをバイト列へ変換
    hasher.update(toBytes(u32, block.index));
    hasher.update(toBytes(u64, block.timestamp));

    // 前のブロックのハッシュは配列→スライスで渡す
    hasher.update(block.prev_hash[0..]);

    // ブロックに保持されているトランザクション一覧をまとめてハッシュ
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(toBytes(u64, tx.amount));
    }

    // 既存コードとの互換を保つため、dataもハッシュに含める
    hasher.update(block.data);

    return hasher.finalResult();
}

/// main関数：ブロックの初期化、ハッシュ計算、及び結果の出力を行います。
pub fn main() !void {
    // メモリ割り当て用アロケータを用意（ページアロケータを簡易使用）
    const allocator = std.heap.page_allocator;
    const stdout = std.io.getStdOut().writer();

    // ジェネシスブロック(最初のブロック)を作成
    var genesis_block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32, // 前ブロックが無いので全0にする
        // アロケータの初期化は後で行うため、いったんundefinedに
        .transactions = undefined,
        .data = "Hello, Zig Blockchain!",
        .nonce = 0, //nonceフィールドを初期化(0から始める)
        .hash = [_]u8{0} ** 32,
    };

    // transactionsフィールドを動的配列として初期化
    genesis_block.transactions = std.ArrayList(Transaction).init(allocator);
    defer genesis_block.transactions.deinit();

    // トランザクションを2件追加
    try genesis_block.transactions.append(Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 100,
    });
    try genesis_block.transactions.append(Transaction{
        .sender = "Charlie",
        .receiver = "Dave",
        .amount = 50,
    });
    // calculateHash()でブロックの全フィールドからハッシュを計算し、hashフィールドに保存する
    genesis_block.hash = calculateHash(&genesis_block);

    // 結果を出力
    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Nonce      : {d}\n", .{genesis_block.nonce});
    try stdout.print("Data       : {s}\n", .{genesis_block.data});
    try stdout.print("Transactions:\n", .{});
    for (genesis_block.transactions.items) |tx| {
        try stdout.print("  {s} -> {s} : {d}\n", .{ tx.sender, tx.receiver, tx.amount });
    }
    try stdout.print("Hash       : ", .{}); // ← ここはプレースホルダなし、引数なし
    // 32バイトのハッシュを1バイトずつ16進数で出力
    for (genesis_block.hash) |byte| {
        try stdout.print("{x}", .{byte});
    }
    try stdout.print("\n", .{});
}
```

実行してみると以下のようにnounceが0から始まっていることが確認できます。現状のコードでは、nonceを追加してハッシュ計算に含めるだけです。マイニング（nonceを変えながら特定条件を満たすまで試行錯誤する処理）をまだ実装していないので、nonce = 0がずっと使われているだけになります。ただし、ハッシュ計算時にnonceも投入しているので、後ほどマイニングを実装したときにnonceを変化させるとハッシュ値も変化するようになっています。

```bash
❯ zig run src/main.zig
Block index: 0
Timestamp  : 1672531200
Nonce      : 0
Data       : Hello, Zig Blockchain!
Transactions:
  Alice -> Bob : 100
  Charlie -> Dave : 50
Hash       : d7928f7e56537c9e97ce858e7c8fbc211c2336f32b32d8edc707cdda271142b
```

### マイニング(nonceの探索）

今のコード状態では、nonceを増やす処理は無いので、いつ見てもnonce=0です。
次に、実際のPoWマイニングを簡単に再現するには以下のような関数を導入します。
マイニングでは、`nonce`の値を0から始めて1ずつ増やしながら繰り返しハッシュを計算し、条件に合致するハッシュが出るまでループします。
条件とは今回は簡単のため「ハッシュ値の先頭のバイトが一定数0であること」と定義しましょう。例えば難易度を`difficulty = 2`とした場合、「ハッシュ値配列の先頭2バイトが0×00であること」とします。
（これは16進数で「0000....」と始まるハッシュという意味で、先頭16ビットがゼロという条件です）。

#### マイニング関数の追加

ブロックの**PoWマイニング**を実装するには、以下の2つの関数を用意します。

1. **`meetsDifficulty(hash: [32]u8, difficulty: u8) bool`**
   - ハッシュ配列の先頭 `difficulty` バイトがすべて `0x00` かを確認する関数。
   - 先頭Nバイトが0なら「条件を満たした」と判断し、`true`を返します。
   - 例えば `difficulty = 2`なら、`hash[0] == 0`かつ`hash[1] == 0`であればOK（=先頭16ビットが0）。

2. **`mineBlock(block: *Block, difficulty: u8) void`**
   - 無限ループの中で`calculateHash`を呼び出し、`meetsDifficulty`で合格か判定。
   - 見つからなければ`block.nonce += 1;`で`nonce`を増やし、再びハッシュ計算を繰り返す。
   - 条件を満たせば`block.hash`に最終ハッシュを設定し、ループを抜ける。

```zig
fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    // 難易度チェック：先頭 difficulty バイトがすべて 0 であれば成功
    const limit = if (difficulty <= 32) difficulty else 32;
    for (hash[0..limit]) |byte| {
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

- `difficulty` は先頭に何バイト `0x00` が並んでいれば良いかを指定します。
- `difficulty = 2` でも場合によっては何万回とハッシュ計算が繰り返されるため、テスト時は**値を小さめ**にするのがおすすめです。

`meetsDifficulty`はハッシュ配列の先頭から指定バイト数をチェックし、すべて`0x00`ならtrueを返す関数です。`mineBlock`では無限ループの中で`calculateHash`を呼び出し、難易度条件を満たしたらループを抜けます。見つからなければ`nonce`を増やして再度ハッシュ計算、という流れです。

難易度`difficulty`は調整可能ですが、大きな値にすると探索に非常に時間がかかるため、ローカルで試す場合は小さな値に留めましょう（例えば1や2程度）。`difficulty = 2`でも場合によっては数万回以上のループが必要になることがあります。PoWは計算量をわざと大きくすることで、ブロック生成にコストを課す仕組みだということを念頭に置いてください。

以上で、ブロックに対してPoWを行いハッシュ値の条件を満たすようにする「マイニング」処理が完成しました。これにより、新しいブロックを正式にチェインに繋げることができます。改ざんしようとする者は、このPoWを再度解かなければならないため、改ざんのコストも非常に高くなります。

### マイニング処理の追加

toBytes関数も見直します。以下のように変換関数を追加して、u32やu64の値をリトルエンディアンのバイト列に変換するヘルパー関数を用意します。

```zig
/// u32 から u8 への安全な変換ヘルパー関数
fn truncateU32ToU8(x: u32) u8 {
    if (x > 0xff) {
        @panic("u32 value out of u8 range");
    }
    return @truncate(x);
}

/// u64 から u8 への安全な変換ヘルパー関数
fn truncateU64ToU8(x: u64) u8 {
    if (x > 0xff) {
        @panic("u64 value out of u8 range");
    }
    return @truncate(x);
}

/// u32 値をリトルエンディアンのバイト列に変換
fn toBytesU32(value: u32) []const u8 {
    var bytes: [4]u8 = undefined;
    bytes[0] = truncateU32ToU8(value & @as(u32, 0xff));
    bytes[1] = truncateU32ToU8((value >> 8) & @as(u32, 0xff));
    bytes[2] = truncateU32ToU8((value >> 16) & @as(u32, 0xff));
    bytes[3] = truncateU32ToU8((value >> 24) & @as(u32, 0xff));
    return &bytes;
}

/// u64 値をリトルエンディアンのバイト列に変換
fn toBytesU64(value: u64) []const u8 {
    var bytes: [8]u8 = undefined;
    bytes[0] = truncateU64ToU8(value & @as(u64, 0xff));
    bytes[1] = truncateU64ToU8((value >> 8) & @as(u64, 0xff));
    bytes[2] = truncateU64ToU8((value >> 16) & @as(u64, 0xff));
    bytes[3] = truncateU64ToU8((value >> 24) & @as(u64, 0xff));
    bytes[4] = truncateU64ToU8((value >> 32) & @as(u64, 0xff));
    bytes[5] = truncateU64ToU8((value >> 40) & @as(u64, 0xff));
    bytes[6] = truncateU64ToU8((value >> 48) & @as(u64, 0xff));
    bytes[7] = truncateU64ToU8((value >> 56) & @as(u64, 0xff));
    return &bytes;
}

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    if (T == u32) {
        return toBytesU32(@as(u32, value));
    } else if (T == u64) {
        return toBytesU64(@as(u64, value));
    } else {
        const bytes: [@sizeOf(T)]u8 = @bitCast(value);
        return bytes[0..];
    }
}
```

---

## 全体コード例

これまでのコードに加え、`mineBlock`を呼び出して実際にマイニングを行う例を下記に示します。

```zig
const std = @import("std");
const crypto = std.crypto.hash;
const Sha256 = crypto.sha2.Sha256;

/// トランザクションの構造体
/// 送信者(sender), 受信者(receiver), 金額(amount) の3つだけを持つ。
const Transaction = struct {
    sender: []const u8,
    receiver: []const u8,
    amount: u64,
};

/// ブロックの構造体
/// - index: ブロック番号
/// - timestamp: 作成時刻
/// - prev_hash: 前ブロックのハッシュ（32バイト）
/// - transactions: 動的配列を使って複数のトランザクションを保持
/// - nonce: PoW用のnonce
/// - data: 既存コードとの互換を保つために残す(省略可)
/// - hash: このブロックのSHA-256ハッシュ(32バイト)
const Block = struct {
    index: u32,
    timestamp: u64,
    prev_hash: [32]u8,
    transactions: std.ArrayList(Transaction),
    nonce: u64,
    data: []const u8,
    hash: [32]u8,
};

/// u32 から u8 への安全な変換ヘルパー関数
fn truncateU32ToU8(x: u32) u8 {
    if (x > 0xff) {
        @panic("u32 value out of u8 range");
    }
    return @truncate(x);
}

/// u64 から u8 への安全な変換ヘルパー関数
fn truncateU64ToU8(x: u64) u8 {
    if (x > 0xff) {
        @panic("u64 value out of u8 range");
    }
    return @truncate(x);
}

/// u32 値をリトルエンディアンのバイト列に変換
fn toBytesU32(value: u32) []const u8 {
    var bytes: [4]u8 = undefined;
    bytes[0] = truncateU32ToU8(value & @as(u32, 0xff));
    bytes[1] = truncateU32ToU8((value >> 8) & @as(u32, 0xff));
    bytes[2] = truncateU32ToU8((value >> 16) & @as(u32, 0xff));
    bytes[3] = truncateU32ToU8((value >> 24) & @as(u32, 0xff));
    return &bytes;
}

/// u64 値をリトルエンディアンのバイト列に変換
fn toBytesU64(value: u64) []const u8 {
    var bytes: [8]u8 = undefined;
    bytes[0] = truncateU64ToU8(value & @as(u64, 0xff));
    bytes[1] = truncateU64ToU8((value >> 8) & @as(u64, 0xff));
    bytes[2] = truncateU64ToU8((value >> 16) & @as(u64, 0xff));
    bytes[3] = truncateU64ToU8((value >> 24) & @as(u64, 0xff));
    bytes[4] = truncateU64ToU8((value >> 32) & @as(u64, 0xff));
    bytes[5] = truncateU64ToU8((value >> 40) & @as(u64, 0xff));
    bytes[6] = truncateU64ToU8((value >> 48) & @as(u64, 0xff));
    bytes[7] = truncateU64ToU8((value >> 56) & @as(u64, 0xff));
    return &bytes;
}

/// toBytes関数は、任意の型Tの値をそのメモリ表現に基づく固定長のバイト配列に再解釈し、
/// その全要素を含むスライス([]const u8)として返します。
fn toBytes(comptime T: type, value: T) []const u8 {
    if (T == u32) {
        return toBytesU32(@as(u32, value));
    } else if (T == u64) {
        return toBytesU64(@as(u64, value));
    } else {
        const bytes: [@sizeOf(T)]u8 = @bitCast(value);
        return bytes[0..];
    }
}

/// calculateHash関数
/// ブロックの各フィールドを順番にハッシュ計算へ渡し、最終的なSHA-256ハッシュを得る。
fn calculateHash(block: *const Block) [32]u8 {
    var hasher = Sha256.init(.{});

    // indexとtimestampをバイト列へ変換
    hasher.update(toBytes(u32, block.index));
    hasher.update(toBytes(u64, block.timestamp));

    // 前のブロックのハッシュは配列→スライスで渡す
    hasher.update(block.prev_hash[0..]);
    hasher.update(toBytes(u64, block.nonce));
    for (block.transactions.items) |tx| {
        hasher.update(tx.sender);
        hasher.update(tx.receiver);
        hasher.update(toBytes(u64, tx.amount));
    }

    // 既存コードとの互換を保つため、dataもハッシュに含める
    hasher.update(block.data);

    return hasher.finalResult();
}

fn meetsDifficulty(hash: [32]u8, difficulty: u8) bool {
    // 難易度チェック：先頭 difficulty バイトがすべて 0 であれば成功
    const limit = if (difficulty <= 32) difficulty else 32;
    for (hash[0..limit]) |byte| {
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

/// main関数：ブロックの初期化、ハッシュ計算、及び結果の出力を行います。
pub fn main() !void {
    // メモリ割り当て用アロケータを用意（ページアロケータを簡易使用）
    const allocator = std.heap.page_allocator;
    const stdout = std.io.getStdOut().writer();

    // ジェネシスブロック(最初のブロック)を作成
    var genesis_block = Block{
        .index = 0,
        .timestamp = 1672531200,
        .prev_hash = [_]u8{0} ** 32, // 前ブロックが無いので全0にする
        .transactions = undefined, // アロケータの初期化は後で行うため、いったんundefinedに
        .data = "Hello, Zig Blockchain!",
        .nonce = 0, //nonceフィールドを初期化(0から始める)
        .hash = [_]u8{0} ** 32,
    };

    // transactionsフィールドを動的配列として初期化
    genesis_block.transactions = std.ArrayList(Transaction).init(allocator);
    defer genesis_block.transactions.deinit();

    // トランザクションを2件追加
    try genesis_block.transactions.append(Transaction{
        .sender = "Alice",
        .receiver = "Bob",
        .amount = 100,
    });
    try genesis_block.transactions.append(Transaction{
        .sender = "Charlie",
        .receiver = "Dave",
        .amount = 50,
    });

    // calculateHash()でブロックの全フィールドからハッシュを計算し、hashフィールドに保存する
    genesis_block.hash = calculateHash(&genesis_block);
    // 難易度 2：先頭2バイトが 0 であるかをチェック
    mineBlock(&genesis_block, 2);

    try stdout.print("Block index: {d}\n", .{genesis_block.index});
    try stdout.print("Timestamp  : {d}\n", .{genesis_block.timestamp});
    try stdout.print("Nonce      : {d}\n", .{genesis_block.nonce});
    try stdout.print("Data       : {s}\n", .{genesis_block.data});
    try stdout.print("Transactions:\n", .{});
    for (genesis_block.transactions.items) |tx| {
        try stdout.print("  {s} -> {s} : {d}\n", .{ tx.sender, tx.receiver, tx.amount });
    }
    try stdout.print("Hash       : ", .{});
    for (genesis_block.hash) |byte| {
        try stdout.print("{x}", .{byte});
    }
    try stdout.print("\n", .{});
}
```

---

## 実行結果

実行すると、`nonce`が0から始まり、**ハッシュが先頭2バイト「00 00」になるまで**試行します。見つかればそこで終了し、`nonce`が大きな値になることもあります。

```bash
❯ zig run src/main.zig
Block index: 0
Timestamp  : 1672531200
Nonce      : 238145
Data       : Hello, Zig Blockchain!
Transactions:
  Alice -> Bob : 100
  Charlie -> Dave : 50
Hash       : 0084749b85d8ba63c2e4124fc7f748735768ce57eb9750e3cdbacbd1937b
```

- ビットコインでは**先頭の0ビット**を難易度として扱い、だいたい毎回10分で見つかるぐらいに調整しています。
- この例のようにバイト単位で先頭2バイトを0にするだけでも、運が悪いと何十万～何百万回と試行することがあり得ます。
- 難易度を1や2程度にしておけば比較的すぐにハッシュが見つかるはずです。

---

## まとめ

- **`nonce`を0から増やす**ことで、ブロックのハッシュ値が大きく変化します。
- 先頭数バイトが0になる（または先頭Nビットが0）などの**難易度設定**に合致したら**ループ終了**。これが簡単なPoWの仕組みです。
- 一度見つかったブロックを改ざんしようとすると、`nonce`を再度見つけ直さなければならないため、改ざんコストが跳ね上がります。

これで**マイニング**の基本（nonce探索ループ）が完成しました。難易度を変化させれば、探索にかかる試行回数も変動します。これを**複数のブロック**に適用し、前のブロックのハッシュを`prev_hash`に設定しながら連結すれば、いよいよ「チェイン」としての改ざん耐性を試せるようになります。

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
