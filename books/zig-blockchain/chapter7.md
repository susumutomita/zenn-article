---
title: "Zigを用いたP2Pブロックチェインの実装その2"
free: true
---

### 新しいブロックの受信・検証とチェインへの追加

**ブロックの構造:** ブロックチェインのブロックは通常、前ブロックのハッシュ、タイムスタンプ、含まれるトランザクション一覧、ナンス(Nonce)などをフィールドに持ちます。ここでは簡略化したブロック構造体を想定します。

```zig
const MAX_TX_PER_BLOCK = 100;

const Block = struct {
    index: u32,                                   // ブロック高（第何番目か）
    prev_hash: [32]u8,                            // 前のブロックのハッシュ
    timestamp: u64,
    transactions: [MAX_TX_PER_BLOCK]Transaction,  // トランザクション配列（固定長とする）
    tx_count: u16,                                // transactionsに実際に入っている件数
    hash: [32]u8,                                 // このブロックのハッシュ
};
```

ノード間ではこの`Block`構造のインスタンスをシリアライズ（バイト列に変換）して送受信します。シリアライズには、JSONやMessagePack、あるいは単純にバイナリで詰めるなど方法がありますが、まずは理解を優先し**JSON文字列**でやりとりしてもよいでしょう。例えばZig標準ライブラリのJSONエンコーダ/デコーダを使ってBlockをJSONに変換し送信し、受け取った側でパースしてBlock構造体に復元します。

**ブロック受信から追加までの流れ:**

1. **受信**: 他ノードからブロックデータを受け取る。例えば、先頭に`"BLOCK"`という種別を付けて`"BLOCK:{...json...}"`のようなメッセージを送る設計にすれば、受信側はメッセージ内容を見てブロックデータだと判断できます。

2. **検証**: 受信したブロックが自分のチェインにとって正当か確認します。基本的なチェック事項:
   - 前のブロックのハッシュ(`prev_hash`)が自分の最新ブロックのハッシュと一致するか（チェインに連結できるか）。
   - ブロック内のトランザクションが既に承認済みでないか、二重支出がないか（ここでは簡略化）。
   - （Proof of Work等のコンセンサス検証がある場合）ハッシュ値が難易度目標を満たしているか。

   例えば`block.prev_hash == self.latest_block.hash`で繋がりを確認し、不整合であれば拒否します。

3. **追加**: 検証OKであれば、自ノードのブロックチェインにそのブロックを追加します。ブロックチェインを表す構造（例えば`[]Block`の動的配列や、ブロックハッシュをキーとしたマップなど）に末尾要素として保存し、自身の最新ブロックを更新します。

4. **転送**: 新ブロックを他のピアにも知らせます。自分が最初に受信したノード以外の全ての接続ピアに向けて、そのブロックデータを再送信します。これによりネットワーク内にブロックが徐々に伝搬していきます ([ethereum - Nodes in blockchain - Stack Overflow](https://stackoverflow.com/questions/76839249/nodes-in-blockchain#:~:text=))。

以上により、1つのノードがブロックを受け取ると全ノードへ広まる仕組み（ブロードキャスト）が実現されます。**重要なのは検証**で、不正なブロック（チェインに繋がらない等）はここで弾くことで、ネットワーク全体の整合性が保たれます。

### 未承認トランザクションの共有とリレー

ブロックに入る前の取引（トランザクション）も、各ノード間で事前に共有します。未承認トランザクションのプール（メモリプール、mempool）は各ノードが持っています。新しい取引がクライアントからノードに提出された場合、まずそのノードが検証し（署名の妥当性や二重支出でないかなど）、問題なければ**他のノードへ転送**します。これも基本的にはブロックの場合と同様に、**ピア接続を通じてトランザクションデータを送信**するだけです。

例えばメッセージ種別 `"TX:{...}"` としてJSON化したTransactionデータを送るようにしておけば、受信側はそのトランザクションを自分のmempoolに追加します。さらにそれを他のピアへ中継（リレー）します。結果的に、ネットワーク内の全ノードがその未承認トランザクションを保有することになり、いずれマイナーがそれをブロックに取り込みます。 ([link](https://www.alchemy.com/overviews/transaction-propagation))

この**トランザクション伝搬**もブロック伝搬と同じく効率や信頼性が問題になります。本実装では全てのピアに即時転送する簡単な方法を取りますが、実際のBitcoinでは「トランザクションのトリクル中継」というアルゴリズムで不要な重複転送を抑制しています ([link](https://bitcoin.stackexchange.com/questions/80876/how-do-block-explorers-determine-propagation-through-nodes-p2p-protocol))。しかし基本的な目的は同じで、**各ノードが持つ未承認トランザクションプールを同期させる**ことにあります。こうすることで、仮に特定のノードにだけトランザクションが届いても他のノードに広まり、ネットワーク全体として次のブロックに含める取引集合が共有されるわけです。

> **参考:** Ethereumネットワークでも、ノード同士が接続するとお互いの持つ未処理トランザクション（メモプール）内容を交換し合い、各ノードが**全ての保留中トランザクションのリスト**を持つようになります ([How are Ethereum transactions propagated (broadcast)?](https://www.alchemy.com/overviews/transaction-propagation#:~:text=Pooled%20transactions%20are%20pending%20transactions,storage%20of%20a%20single%20node))。これにより一部ノードにしか届かなかった取引も、ネットワーク全体で共有されます。

### Zigのマルチスレッド・非同期処理によるネットワーク通信

P2Pノードは同時に複数の相手と通信をする必要があるため、1つのスレッドで順番に処理しているだけでは効率が悪くなります。Zigにはスレッドを生成する仕組みや、非同期I/Oを扱うイベントループの仕組みがあります ([GitHub - lithdew/rheia: A blockchain written in Zig.](https://github.com/lithdew/rheia#:~:text=concurrency))。適切に活用することで並行処理が可能です。

**マルチスレッドによる実装:**
最も分かりやすいのは**接続ごとにスレッドを分ける**方法です。新しい接続を`accept()`したら、新規スレッドを起動し、その中でメッセージ受信処理を行います。本体（メインスレッド）は引き続き次の`accept()`待ちに戻ります。こうすれば複数クライアントから同時にメッセージが来ても並行して処理できます。ただし共有データ（ブロックチェインやmempool、ノードリストなど）にアクセスするときは適切な同期（Mutex等）が必要です。

Zigでスレッドを作るには、`std.Thread.spawn`関数を使う方法があります。または、`std.Thread`構造体を生成して手動で開始できます。例えば以下のようになります。

```zig
const handle_conn = struct {
    fn run(conn: std.net.Server.Connection) !void {
        // 別スレッドで実行される処理
        std.log.info("新しいスレッドで接続処理開始", .{});
        const reader = conn.stream.reader();
        while (true) {
            var buf: [1024]u8 = undefined;
            const n = try reader.read(&buf);
            if (n == 0) break; // 相手が切断
            // 受信データbuf[0..n]を処理...
        }
    }
};

...

// accept後に:
_ = try std.Thread.spawn(handle_conn.run, .{connection});
```

上記のように、`handle_conn.run`関数を別スレッドで実行することで、メインスレッドから独立した通信処理ができます。なお、スレッド終了後に`connection.stream.close()`を呼ぶように注意します（`defer`でスレッド内に書くか、Main側でjoinして後処理）。

**非同期I/Oとイベントループ:**
Zigのもう1つのアプローチは、**async/await**を用いた非同期処理です。Zigのasyncはカラーブラインド(colorblind)アプローチと呼ばれ、通常の関数と同様に扱える軽量なスレッドのようなものです。 ([Concurrency and Asynchronous Programming in Zig - xeg io](https://www.xeg.io/shared-searches/concurrency-and-asynchronous-programming-in-zig-a-comprehensive-guide-667c337ef22facffcd14f63d#:~:text=Concurrency%20and%20Asynchronous%20Programming%20in,loop%20to%20manage%20asynchronous%20tasks))。Zig標準ライブラリには`async`に対応したI/Oイベントループ (`std.async.Loop`) があり、同一スレッド内で複数の非同期タスクを実行できます。 ([Concurrency and Asynchronous Programming in Zig - xeg io](https://www.xeg.io/shared-searches/concurrency-and-asynchronous-programming-in-zig-a-comprehensive-guide-667c337ef22facffcd14f63d#:~:text=Concurrency%20and%20Asynchronous%20Programming%20in,loop%20to%20manage%20asynchronous%20tasks))。

例えば、各接続ごとに非同期タスクを開始し、`reader.read`を`async`で待機しつつ他の接続処理と並行させる、といったことが可能です。現在(zig 0.14)の標準ではまだ一部機能が発展途上ですが、Linux環境であればio_uringを使った効率的な非同期I/Oも実験的に利用できます。 ([GitHub - lithdew/rheia: A blockchain written in Zig.](https://github.com/lithdew/rheia#:~:text=concurrency))。

> **参考:** Zig製の高度なブロックチェイン実装例として**Rheia**があります。このプロジェクトでは各CPUコアごとにスレッドを割り当てつつ、ネットワークI/Oはio_uringによるシングルスレッドのイベントループで処理する設計を採用しています ([GitHub - lithdew/rheia: A blockchain written in Zig.](https://github.com/lithdew/rheia#:~:text=concurrency))。このように用途に応じてスレッドと非同期I/Oを組み合わせ、性能と並行性を引き出すことができます。

本チュートリアルの範囲では、まずは実装が容易な**スレッドごとの接続処理**で十分でしょう。同時接続数が数個程度であればシンプルに各接続を独立処理しても問題ありません。より多数のピアを扱う場合や高負荷環境では、イベントループ方式に移行することも検討してください。

## 3. フルノード・軽量ノードの違いと実装

ブロックチェインネットワークには、すべてのデータを保持し完全に検証するフルノードと、必要最低限のデータのみ保持し簡易的な検証する軽量ノードが存在します。
それぞれ役割と動作が異なるため、実装上のアプローチも異なります。この章ではフルノードと軽量ノード（特にビットコインで言うSPV: Simplified Payment Verificationノード）の違いを理解する。軽量ノードが限られた情報でブロックを検証する方法。そしてフルノードとして動作する場合のデータ管理について解説します。

### フルノードと軽量ノードの役割の違い

#### フルノード

ネットワーク上の全トランザクションとブロックのコピーを保持し、コンセンサスルールに則って**すべての取引とブロックを検証**します。不正なブロックやトランザクションがあれば拒否し、正しいブロックチェインを維持することでネットワークの安全性と完全性に貢献しています。フルノードは完全な台帳を持つため、新規ノードへのデータ提供元としても機能し、分散ネットワークの根幹を支えます。

#### 軽量ノード (SPVノード)

全ブロックデータは持たず、各ブロックのヘッダ情報（ブロックハッシュやMerkleルートなど**ブロックのメタデータ**）だけを保持します。 ([Blockchain Workings
and Fundamentals | QuickNode Guides](https://www.quicknode.com/guides/web3-fundamentals-security/how-blockchains-work#:~:text=,for%20more%20detailed%20transaction%20data))。

個々のトランザクションデータは必要に応じてフルノードから取得し、簡易な検証のみ行います。SPVノードは常時起動して全データを追う必要がなく、リソース消費が少ないため、モバイルウォレットなどに利用されます。 ([Simplified Payment Verification (SPV) Meaning | Ledger](https://www.ledger.com/academy/glossary/simplified-payment-verification-spv#:~:text=To%20clarify%2C%C2%A0%20a%20light%20client,or%20running%20a%20full%20node))。

上記のQuickNodeによる定義にもあるように、ライトノードはブロックヘッダのみをダウンロードし、それを使ってトランザクションの真正性を確認します。ただし、**フルノードに依存**する部分も大きく、詳細な取引内容や未承認トランザクションの取得などはフルノードから提供してもらう必要があります。

表にまとめると以下になります。

| ノード種別      | 保持データ                       | 検証内容                     | 利点                     | 欠点                           |
| --------------- | ------------------------------- | --------------------------- | ------------------------ | ------------------------------ |
| **フルノード**  | 全ブロック＆全トランザクション   | 全ての取引とブロックを完全検証 | 信頼性高、独立検証可能    | ストレージ・帯域幅を多く消費    |
| **軽量ノード**  | ブロックヘッダ（数十バイト/ブロック） | ブロックチェイン長の追跡、必要時のみ一部検証 | 動作が軽量、同期が高速    | 一部検証をフルノードに依存、若干信頼が必要 |

### 軽量ノードが最小限の情報でブロックを検証する方法

軽量ノード（SPV）は、主に**ブロックヘッダ列**を追跡することでネットワークのブロックチェインを追いかけます。具体的には以下の手順で動作します ([Bitcoinwiki](http://bitcoinwiki.org/wiki/simplified-payment-verification#:~:text=As%20noted%20in%20Nakamoto%20%E2%80%98s,it%20further%20establish%20the%20confirmation)) ([Simplified Payment Verification (SPV) Meaning | Ledger](https://www.ledger.com/academy/glossary/simplified-payment-verification-spv#:~:text=transactions)):

1. **ブロックヘッダのみ取得**:ネットワークのフルノードに接続し、最新のブロックヘッダを順次ダウンロードします。例えばビットコインでは`getheaders`メッセージを送り、何万件ものブロックヘッダ一覧を取得します。ヘッダには前のブロックのハッシュとMerkleルートが含まれます。

2. **最長チェインの把握**: 受け取ったヘッダの連結リストから、現在の最長ブロックチェイン（およびその長さ＝ブロック高）を把握します。SPVノードはこの**ブロックヘッダの連なり**だけでチェインの長さとPoW累積難易度を確認し、もっとも信頼できるチェインを追跡します。

3. **トランザクションの検証要求**: ユーザが自分の関心あるトランザクション（例えば自分のウォレットの受取TXなど）を検証したいとき、該当TXのID（ハッシュ）を使って**Merkleブランチの照会**します。 ([link](http://bitcoinwiki.org/wiki/simplified-payment-verification#:~:text=As%20noted%20in%20Nakamoto%20%E2%80%98s,the%20active%20chain%20demonstrates%20that))。 具体的には、そのTXが含まれているブロックを特定し、そのMerkleパスを使って自分でMerkleルートを計算します。

4. **Merkleルートの照合**: フルノードから提供されたそのトランザクションのMerkleパスを使い、自分で計算したMerkleルートと、ブロックヘッダ中のMerkleルート値を比較します。一致すれば、そのトランザクションは確かにそのブロックに含まれており、さらにそのブロック自体は最長チェインに載っている（=承認済み）ことが保証されます。SPVノードはこれによって**自分に関係する取引だけ**の検証を簡易に行います。

SPVのポイントは、「ブロック全体は見ずとも、そのブロックが確かに正当なチェインの一部であり、特定の取引が含まれている事実を確認できる」点です。ただし、SPVは**完全な検証ではない**ことにも注意しましょう。例えば、SPVノードは各トランザクションの署名有効性や二重支出検出を自力では行いません。それらは**ネットワーク（マイナーやフルノード）を信頼**する形になります。一応、最長チェイン原則（もっとも多くのPoWを積んだチェインを信用）によって、改竄された取引が含まれるチェインは最長になり得ないため、現実的には安全と考えられています。しかし100％ではなく、理論上は権悪なマイナーが多数存在するとSPVノードは欺かれる可能性もあります。このトレードオフを理解した上で、用途に応じてSPVノードは活用されています。

**実装面の工夫:**
SPVノードを実装する場合、フルノードとの通信プロトコルが重要です。ブロックヘッダだけ大量に取得する手段や、特定トランザクションのMerkleブランチを問い合わせるメッセージなどを設計します。Bitcoinでは`getheaders`や`getdata (merkleblock)`メッセージでこれらを実現しています。簡単な実装では、「ライトノードモード」のフラグを用意し、それが有効なら起動時に**ヘッダのみ同期**するようなロジックを入れることになります。フルノードではブロック全体を要求する処理（例えば`getblocks`を送って全ブロックダウンロード）を、ライトノード時には`getheaders`だけ送る、といった分岐です。

### フルノード動作時のデータ管理とストレージ

フルノードは膨大なブロックチェインデータを保持するため、効率的なストレージ戦略が必要です。実装段階では、まず**シンプルに動作させる**ことを優先し、メモリ上のデータ構造でチェインを保持しても構いません。しかし本格的には以下の点を検討します。

- **永続ストレージ**: ノードを再起動してもブロックチェインを再同期し直さなくて済むよう、ディスク上にデータベースを持つことが多いです。Bitcoin CoreではLevelDB、EthereumではLMDBなどのkey-valueストアにブロックやトランザクションインデックスを保存しています。Zigからは`std.fs`でファイル操作が可能なので、シリアライズしたブロックをファイルに追記する簡易実装や、SQLiteなど外部データベースを利用する方法も取れます。

- **インデックス管理**: 単にブロックをチェイン順に保存するだけでなく、特定のトランザクションを探すためのインデックス（例えばTxID→ブロック番号）の構築もフルノードでは必要になります。小規模実装では全ブロックを線形検索しても問題ないですが、実際のブロックチェインは何十万～何百万ブロックにもなるため、効率化が課題です。

- **プルーニング**: ストレージ節約のため、一定より古いブロックデータは削除（プルーニング）するオプションもあります。Bitcoin Coreにはブロック高288以上前のブロック本体を消去し、ヘッダや一部情報だけ残す「プルーニングモード」があります。これはある意味、フルノードとSPVノードの中間的な存在です。実装としてはディスク上の古いブロックファイルを削除するだけですが、一度消したブロックを要求された場合は他のノードに頼る必要があります。

今回の実装では、**まずメモリ上でチェインを保持する**簡単な方法で十分です。例えば、`var blockchain: std.ArrayList(Block)` をグローバルに持ち、ブロック追加時に`blockchain.append(new_block)`していく形です。またノード終了時にシリアライズしてファイルに保存し、次回起動時に読み込む、という手順を加えれば簡易的な永続化にもなります。

> **参考情報:** 実際のブロックチェインでは、データ量が莫大です。例えばEthereumのフルノードは最新状態だけでも1.2TB以上、過去全状態を含めたアーカイブノードは15TBにも達します ([ethereum - Nodes in blockchain - Stack Overflow](https://stackoverflow.com/questions/76839249/nodes-in-blockchain#:~:text=The%20current%20state%20currently%20takes,amount%20of%20data%20fairly%20easily))。普通のPCでは扱えないため、多くのユーザは自前でフルノードを動かさず、信頼できるノード（インフラ）にRPCで接続するケースも多いです ([ethereum - Nodes in blockchain - Stack Overflow](https://stackoverflow.com/questions/76839249/nodes-in-blockchain#:~:text=Running%20your%20own%20node%20is,js))。一方ビットコインは約500GB程度(2025年時点)で家庭用PCでもギリギリ保持可能なサイズです。あなたが扱うオリジナルブロックチェインでも、将来的にサイズが肥大化することを念頭に置き、ストレージ戦略を考えてみましょう。

## 4. 動作確認とデバッグ

実装が一通りできたら、複数ノードを実際に起動して**ブロック共有が正しく行われるかテスト**しましょう。また、新しいノードを既存ネットワークに追加してブロックチェインを同期できるか確認します。さらに、開発中によく使うデバッグ手法やログの活用、簡単なパフォーマンス計測についても触れます。

### 複数ノード間でのブロック共有テスト

まずはローカル環境で2つのノードを起動し、相互に通信できるかを試します。以下の手順でテストしてみましょう。

1. **ノードA起動**: 端末を2つ用意し、一方でノードAプログラムを起動します（例えばポート8080番でlisten）。ノードAは起動時にブロックチェインの初期状態（ジェネシスブロックのみ）を持つフルノードとします。

2. **ノードB起動**: もう一方の端末でノードBプログラムを起動します。引数にノードAのアドレス(`127.0.0.1:8080`)を与えて接続させます。ノードBがAに接続成功すると、ハンドシェイクを行った後、ノードAから最新ブロック（ジェネシスブロック）が送られてくるはずです。ノードB側でそれを受け取り、自分のチェインに追加します。**この時点でノードAとBは同期**し、同じブロック高になっていることを確認してください。

3. **ブロックの共有確認**: ノードAにブロック生成イベントを発生させます。例えば簡易的に、ノードAコンソールでエンターキー押下時に新規ブロックを生成する処理を仕込んでおくとよいでしょう（あるいは一定時間ごとにダミーブロック生成するタイマを実装してもOKです）。ノードAが新しいブロックをチェインに追加したら、それを直ちにノードBに送信します。ノードB側で受信ログを確認し、ブロックが追加されたか、チェインが伸びたかをチェックします。両ノードの最新ブロックハッシュやブロック高を表示するようにしておくと検証が容易です。

4. **双方向の検証**: 今度は逆にノードB側でブロックを生成し、ノードAに伝搬するか試します。手動テストが難しければ、コード上で「一定番号のブロック高のときのみマイナー役になる」みたいな条件を入れておき、ノードBが新規ブロックを作るようにしてもよいでしょう。ノードBでブロックができ、それがノードAへ届いてチェインに組み込まれれば成功です。

このように、**複数ノード間でブロックが漏れなく共有され、一貫したチェインが維持されている**ことが確認できれば、P2Pネットワークとして基本的に動作していると言えます。さらに余裕があればノードC、D...と増やして3台以上で試し、ブロック伝搬の様子を観察してください。ノードAからB、BからCへと**伝言ゲームのようにブロックが渡っていく様子**がログで確認できるでしょう。

### 既存ネットワークへ新規ノードを追加し、ブロック同期を確認

次に、稼働中のネットワークに後からノードを参加させるケースを試します。例えば上記テストでノードAとBが既に10ブロック程度進んだ状態に、新しくノードCを起動して参加させるシナリオです。

手順は以下です。

1. **ノードA・B稼働中**: ノードAとBは引き続き動かしておきます（ブロック高10くらいまで成長しているとします）。

2. **ノードC起動**: ノードCを起動し、起動時に既知ノードとしてAかBのアドレスを指定します。ノードCは接続後、まず自分のチェインが空（もしくはジェネシスのみ）であることを認識し、ネットワークからブロックを貰う必要があります。そこで**同期要求**を送ります。簡単な実装では、接続直後に自分の最新ブロックハッシュ（あるいは高さ）を相手に送り、相手はその次のブロック以降を順次送ってくれる、というプロトコルが考えられます。Bitcoinでは新規ノードは`getheaders`を送り、ブロックのヘッダ一覧を取得した後、`getdata`で実際のブロック本体を要求するという流れになっています。

6. **ブロック同期**: ノードCはノードA(B)から送られてくるブロックを受信し、自身のチェインに追加していきます。例えばジェネシス以降の10ブロックを順番に受け取って検証・追加する処理を実装します。一度で大量に送るのではなく、1ブロック受信・追加完了したら次を要求する形にすると安全です。全てのブロックを取り込んだら、ノードCのブロック高も10に追いつき、他のノードと同期完了です。

7. **動作確認**: ノードCが同期後、今後ネットワークで新規に発生するブロック（例えばノードAやBで生成）が正しくCにも配信されるかを確認します。これで、新規参加ノードも含めた3ノード全てが引き続き同じチェインを保って進んでいけばOKです。

この新規ノード同期処理は、実装上は**ブロックの一括要求/送信**になるため、抜け漏れがないよう注意します。特に、自分の持っている最新ブロックと、ネットワーク側最新ブロックとの間に**分岐**がないか（フォークしていないか）もチェックが必要です。もし何らかの理由でチェインにフォークが発生していたら、どちらを採用するか（通常はPoW長い方）を決め、もう一方のブロックは破棄する処理も入ります。今回は単純な直線的成長を前提としています。

> **メモ:** ノード起動直後の同期処理はP2Pネットワークの基本機能です。既知ピアから他のピアを紹介してもらい（ピア発見）、次にブロックチェイン履歴を取得するという順序になります ([What is a P2P Network? - Peer-to-Peer Networks | Horizen Academy](https://www.horizen.io/academy/peer-to-peer-networks-p2p/#:~:text=Imagine%20you%20just%20set%20up,getheaders%20message%20to%20your%20peers)) ([ethereum - Nodes in blockchain - Stack Overflow](https://stackoverflow.com/questions/76839249/nodes-in-blockchain#:~:text=,offline%20when%20a%20transaction%20happens))。ネットワーク参加から最新同期まで時間がかかる場合（ビットコインではフルノード同期に数時間～日）は、進行状況をログに出力したりプログレスバー表示するなどの配慮も実装上重要です。

### デバッグ・ロギングの実装とパフォーマンス調査

複数ノードの通信プログラムは、単体で動かしているとき以上に**デバッグが難しく**なります。そこで、適切なログ出力やテスト方法を用意しておくと開発がスムーズです。

**ロギングの活用:**
Zigの`std.log`を使えば、情報レベルごとにログを出し分けることができます。例えば接続時、受信時、送信時などに`std.log.info`や`std.log.debug`で内容を出力しておけば、どのノードで何が起きたか後から追跡可能です。先ほどのコード例でも、メッセージ受信時にログを記録していました ([how to set up a zig tcp server socket - Stack Overflow](https://stackoverflow.com/questions/78125709/how-to-set-up-a-zig-tcp-server-socket#:~:text=while%28true%29%20,free%28msg))。実際に3ノードを立ち上げてみて、各ノードのコンソールに流れるログを見比べれば、「ノードAからBに送信→Bで受信確認→BからCに転送→Cで受信」といった一連の流れを人間が追えるわけです。ログにはタイムスタンプやノードIDを付与しておくとさらにわかりやすくなります。

ログレベルをコマンドライン引数で切り替えられるようにしておくと、平常時は重要な情報のみ、デバッグ時は詳細なトレースを出す、といった柔軟な運用ができます。Zigではビルドオプションや環境変数でログフィルタを設定する仕組みも提供されています。

**デバッグテクニック:**
ネットワークプログラムのデバッグには、ログ以外にも以下のような手段が有効です。

- **ユニットテスト**: ブロック検証関数やメッセージシリアライズ/パース関数など、ネットワークに依存しないロジックはユニットテストを書いて検証します。Zigは組み込みのテストフレームワークがあり、`zig test`コマンドで実行できます。

- **シミュレーション**: ネットワーク越しでなく、同一プロセス内で複数ノードオブジェクトを立ち上げて疑似的にメソッド呼び出しで通信させる、というシミュレーションもデバッグに便利です。例えばPeerクラスを作って`peer.send(msg)`を呼ぶと直接相手Peerの受信関数を呼ぶようにし、並行性や遅延の問題をひとまず抜きにしてロジック検証できます。

- **ネットワークツール**: 実際にソケット通信している様子を外部から観察するには、`tcpdump`やWiresharkといったパケットキャプチャを使う方法があります。自作プロトコルのメッセージが期待通り流れているか、バイト列を解析して確認できます。

**パフォーマンスと負荷検証:**
最後に、簡単に性能を見てみましょう。といっても高度なベンチマークは不要です。まず確認したいのは**ブロック伝搬の速さ**です。ログにタイムスタンプを付けておき、あるノードでブロック生成した時刻と、他のノードでそれを受信した時刻を比較すれば、おおよその伝搬遅延が分かります。ローカル環境では数ミリ秒～数十ミリ秒程度で届くでしょう。ノード数を増やしたり、意図的に数MBサイズのブロックにしてみて遅延や帯域使用量を測るのも勉強になります。

CPU使用率やメモリ使用量も観察ポイントです。特にフルノードではブロックを何千も保持するとメモリを圧迫する可能性があります。Zigは低レベル言語なので、メモリ使用量の最適化は開発者の責務です。必要に応じて古いブロックをファイルに逃がす（スワップする）実装や、そもそも節約したデータ構造に変えることも検討してください。

**まとめ:**
ここまで、Zigを用いたP2Pブロックチェインネットワークの基本実装について解説しました。ソケット通信から始まり、ブロック/トランザクションの共有、フルノードvs軽量ノードの概念、そして実際の動作テストとデバッグ方法まで、一通りの流れを追いました。最終的に重要なのは、各ノードが協調しあって**一つの一貫した台帳（ブロックチェイン）を維持する**ことです。そのためのネットワーク基盤として、今回実装したP2Pの仕組みが機能します。ぜひ自身でもコードを動かし、ノードを増やしたりネットワークを不安定にしてみたりして、分散システムならではの挙動を観察してみてください。これによりブロックチェインの分散性と信頼モデルへの理解が深まるでしょう。
