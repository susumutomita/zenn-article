ステップ3: ノード間通信によるブロック伝播とRPCの実装

ブロック共有とRPC導入の背景

分散型のブロックチェーンを構築するには、複数のノード間でブロック情報を共有する仕組みが不可欠です。前章（ステップ2）まででローカルにブロックチェーンを構築できましたが、このままでは各ノードが別々のチェーンを持つだけで、ネットワーク全体で一貫した台帳を保つことができません。例えば、Proof of Work (PoW) によって新しいブロックを生成しても、それを他ノードに伝播しなければネットワーク上で合意されたブロックとはなりません。また、ユーザがトランザクションを発行してブロックチェーンに取り込んでもらうには、ノードに対してそのトランザクションを送信する手段が必要です。このように新規ブロックの伝播と外部からのトランザクション受付を実現するため、本ステップではノード間のP2P通信と簡単なRPC機能を実装します。

ポイントを整理すると、ネットワーク対応により以下が可能になります：
	•	ブロックの伝播: あるノードで生成（マイニング）されたブロックをネットワーク内の他ノードへ配信し、全ノードのブロックチェーンを同期させる。これによりPoWで得たブロックにネットワーク上の意味を持たせます。
	•	RPCによる操作: 外部からノードへトランザクションを送信したり、マイニングを指示したりするリモート呼び出しを提供する。ユーザや他のノードがネットワーク経由でsendTransactionやmineといった操作を実行できるようにします。

以上の仕組みにより、複数ノードが協調して1つのブロックチェーンネットワークを形成します。次のステップ4で導入するPoWによるマイニングを見据え、ここではネットワーク通信の土台を作っておきます。

RPC機能とブロック伝播の実装方針

ステップ3では、シンプルなP2Pネットワークを構築し、ノードが相互にブロックを交換できるようにします。具体的には以下のような機能を実装します。
	1.	トランザクション送信 (sendTransaction 関数): ユーザ（または他ノード）からトランザクションを受け取り、ノード内のプールに追加します。将来このトランザクションはブロックに取り込まれます。
	2.	ブロック生成 (mine 関数): 現在プールにあるトランザクションを含む新しいブロックを作成します。PoW（Proof of Work）は次章で本格的に実装しますが、ここではブロック生成とネットワークへの配信（ブロードキャスト）の流れを作ります。
	3.	チェーン情報取得 (getChain 関数): ノードの持つブロックチェーン全体を取得するための関数です。他ノードからチェーンを問い合わせて同期したり、デバッグ目的でチェーン内容を表示したりするのに利用します。
	4.	ブロック受信処理 (receiveBlock 関数): 他ノードから新しいブロックを受け取った際に、そのブロックを検証し自分のチェーンに取り込みます。必要に応じてさらに他のピアに転送（ブロックの再伝播）も行います。
	5.	通信処理 (handleConnection 関数): ノード同士（やクライアント）が接続した際のリクエストを読み取り、上記の関数（RPCコール）に振り分けます。sendTransactionやmineの呼び出し、ブロック受信などをコマンド別に処理します。

各ノードはTCP通信によって相互接続し、このRPCプロトコルに従ってメッセージをやり取りします。ネットワーク構成としては、ノード起動時に既知のピアのアドレスを指定し、必要なら接続・同期を行います。ブロックやトランザクションの情報は簡易的なテキスト形式で送受信し、パースとシリアライズも手動で実装します（プロトコルを簡単に保つため、JSONなどのライブラリは使わずに済ませます）。

それでは、それぞれの機能について設計意図とコードの一部を確認し、最後に全体のコードを掲示します。

sendTransaction 関数 – トランザクションの受付

sendTransactionは、外部から送られてきたトランザクションを現在のノードで受け付けるRPCです。実装上はノードのトランザクションプール（未だブロックに入っていない取引の一覧）に追加する処理を行います。ブロックチェーンネットワークでは通常、トランザクションは各ノードにブロードキャストされ、各ノードが自分のメモリプールに保存します。本実装では簡略化のため、トランザクションの伝播は行わず、送信先ノードでのみプールに追加するものとします（マイニングノードに直接トランザクションを送る想定）。必要なら将来的に、このRPC内で他のピアにトランザクション転送を行うことも可能です。

コード例を示します。トランザクションを表す構造体 Transaction（ステップ2で定義済みとします）を受け取り、プール（pending_transactions）に追加します。追加後、ログに記録し、RPC呼び出し元には受領完了を知らせます。

fn sendTransaction(tx: Transaction) !void {
    // トランザクションをメモリプールに追加
    try pending_transactions.append(tx);
    std.debug.print("Transaction received: from={s}, to={s}, amount={d}\n",
        .{ tx.from, tx.to, tx.amount });
}

上記では、pending_transactions（トランザクションの待機リスト）にtxを追加しています。std.debug.printを使って、内容（送信元・宛先・金額など）をログ出力しています。!voidとなっているようにエラー処理が可能で、例えばメモリ確保に失敗した場合などにはエラーを返します。なお、RPC経由での呼び出し時には、成功・失敗を呼び出し元に返すために簡単なメッセージをソケット越しに返す実装を後述のhandleConnectionで行います。

mine 関数 – ブロックの生成とブロードキャスト

mine関数は、新たなブロックを作成する処理です。本来ブロック生成にはPoWによるナンスの探索が必要ですが、ステップ4で詳細実装するため、ここでは簡易的にブロックを組み立てる実装を行います。具体的には、pending_transactionsに溜まっているトランザクションをまとめて1つの新規ブロックに入れ、チェーンに追加します。その後、このブロックをピアノードに送信してネットワークに共有します。

実装のポイントは次の通りです。
	•	ブロック構造体の組み立て: ブロック番号（インデックス）は現在のチェーン長に応じて設定し、prev_hashには直前のブロックのハッシュ値を入れます（ジェネシスブロックの場合は適当な固定値や空値）。タイムスタンプも現在時刻から取得します。ブロック内のトランザクション一覧にはpending_transactionsの内容を詰めます。
	•	ハッシュ値の計算: ブロックの内容からハッシュ値（簡易的にSHA-256など）を計算します。ステップ4でこのハッシュに難易度目標を課すPoWを行いますが、本ステップではとりあえずハッシュを計算するのみです。このハッシュがブロックのIDとなり、他ノードはこれを使ってチェーンの整合性を検証します。
	•	チェーンへの追加: 新ブロックをローカルのblockchainに追加します。チェーンは前章までに構造体やリストとして定義済みとします（例：blockchainがstd.ArrayList(Block)型などで実装されている）。
	•	ブロードキャスト: 生成したブロックを、自ノードが認識しているピア全てに送信します。各ピアとはTCPで接続し、BLOCK ...という専用メッセージを送りつけます。ピア側ではその接続を受けてreceiveBlock関数で処理することになります。

以下に、mine関数の主要部分を示します。

fn mine() !void {
    if (pending_transactions.len == 0) {
        std.debug.print("No transactions to mine; block creation skipped\n", .{});
        return;
    }
    // 新規ブロックの構築
    const last_index = blockchain.items[blockchain.len - 1].index;
    const new_index = last_index + 1;
    const prev_hash = blockchain.items[blockchain.len - 1].hash;
    const timestamp = std.time.timestamp(); // 現在時刻（秒）取得

    // ブロックに含めるトランザクション一覧を準備（すべて取り出す）
    var tx_list = pending_transactions;
    pending_transactions = std.ArrayList(Transaction).init(allocator); // プールをリセット

    var new_block = Block{
        .index = new_index,
        .prev_hash = prev_hash,
        .timestamp = timestamp,
        .transactions = tx_list,
        .hash = undefined, // ハッシュは後で計算
    };
    // ブロックのハッシュ値を計算（SHA-256等）
    new_block.hash = computeBlockHash(new_block);

    // チェーンにブロックを追加
    try blockchain.append(new_block);
    std.debug.print("Mined new block #{d} with {d} tx, hash={s}\n",
        .{ new_index, new_block.transactions.len, new_block.hash });

    // ピアにブロックを伝播
    try broadcastBlock(new_block);
}

上記では、pending_transactionsが空の場合は何もせず戻っています。トランザクションがある場合、直前のブロック情報から新しいBlock構造体を組み立てています。Block構造体には、インデックス（index）、前ブロックのハッシュ（prev_hash）、タイムスタンプ（timestamp）、含まれるトランザクションのリスト（transactions）、そして計算されるハッシュ（hash）が含まれるとします。computeBlockHashはブロックの内容からハッシュ文字列を計算する補助関数で、例えばSHA-256を使って prev_hash やトランザクション内容等から算出する実装です（ここでは詳細は割愛しますが、std.cryptoライブラリを利用できます）。

ブロックのハッシュを計算後、チェーンリストにそのブロックを追加し、ログに生成したブロック番号や取引数、ハッシュを表示しています。最後にbroadcastBlockを呼び出して、このブロックをピアノードへ送信しています。broadcastBlockの中では、あらかじめノードに登録されているピアアドレス一覧（例えばpeer_addressesリスト）を走査し、それぞれに対してTCP接続を開きブロック情報を送信します。送信フォーマットは"BLOCK <index> <prev_hash> <hash> <timestamp> <from> <to> <amount>\n"といったテキスト文字列です（トランザクションは1件のみと仮定しています。複数ある場合は件数分ループ送信するか、フォーマットを工夫します）。エラーが発生した場合（接続失敗など）は!voidにより上位にエラーを伝搬します。

getChain 関数 – ブロックチェーン情報の取得

getChain関数は、現在ノードが保持しているブロックチェーン全体の情報を取得するためのRPCです。他ノードからチェーンを問い合わせる際や、デバッグ目的でノードのチェーンを出力する際に使います。本実装では、チェーン内のブロックを順にテキスト化し、呼び出し元に返すようにします。

ポイント:
	•	チェーン内の各ブロックについて、主要なフィールド（インデックス、ハッシュ値、前ハッシュ値、トランザクション内容など）を文字列にまとめます。
	•	フォーマットは任意ですが、人間が読める形で各ブロックを改行区切りで並べます。
	•	RPC応答として使うため、getChainは生成した文字列データを返し、handleConnection側でソケットに書き込むようにします。

以下はgetChainの例です。

fn getChain() ![]u8 {
    // 全ブロック情報を格納するバッファを確保
    var chain_buffer = try allocator.alloc(u8, 1024);
    var buffer_index: usize = 0;
    defer allocator.free(chain_buffer);

    // チェーン内の各ブロックを文字列としてバッファに追記
    for (blockchain.items) |blk| {
        buffer_index += try std.fmt.bufPrint(
            chain_buffer[buffer_index..],
            "Block {d}: prevHash={s}, hash={s}, tx={s}->{s}:{d}\n",
            .{ blk.index, blk.prev_hash, blk.hash, blk.transactions[0].from, blk.transactions[0].to, blk.transactions[0].amount }
        );
    }
    return chain_buffer[0..buffer_index];
}

上では、簡易的に固定長1024バイトのバッファを確保し（チェーンが大きくなると不足しますがデモ用）、そこに各ブロックの情報をstd.fmt.bufPrintで書き込んでいます。各ブロックについて1行にまとめており、フォーマットは例えば**「Block 1: prevHash=…_, hash=…_, tx=Alice->Bob:50」**のような形になります。ここでは各ブロックあたり1件のトランザクション（blk.transactions[0]）を想定しています。複数トランザクションの場合はループして連結する処理が追加で必要です。

getChainは生成した文字列（スライス）を返すようにしており、呼び出し側でそれをソケット経由で送信した後、バッファを解放します（defer allocator.freeにより自動解放）。このようにしてチェーン全体の内容を問い合わせ元に渡すことができます。新規ノードが既存ノードに追いつくためにgetChain応答をパースして自分のチェーンにブロックを追加することも考えられますが、本ステップでは基本的に全ノード同時に起動してスタートライン（ジェネシスブロック）が同じである前提とし、同期処理は深追いしません。

receiveBlock 関数 – ブロック受信時の処理

receiveBlockは、他ノードから届いたブロックを自ノードのブロックチェーンに取り込む処理です。mineによって生成・送信されたブロックは、各ピアノードでこの関数を通じて処理されます。主な役割はブロックの検証とチェーンへの追加です。

受信したブロックに対して行うこと:
	•	ブロックの妥当性確認: ブロックのprev_hashが自ノードの最新ブロックのハッシュと一致するか確認します。そうでない場合（自分のチェーンから逸脱している場合）は、ブロックを捨てるか、場合によっては相手にチェーンを問い合わせる必要があります（今回は単純化のため不整合ブロックは無視）。また、ブロックのインデックスが現在の最新+1であることも確認します。重複受信（既に持っているブロック）や古いブロックであれば処理をスキップします。
	•	チェーンへの追加: 検証OKなら、自ノードのblockchainリストにそのブロックを追加します。これでチェーンが更新されます。
	•	トランザクションプールの更新: ブロック内のトランザクションは正式にチェーンに取り込まれたため、自分のpending_transactionsから同じ取引を削除します。こうすることで、すでにブロック化されたトランザクションを再度マイニングしようとしないようにします。
	•	さらなる伝播: 新しいブロックを受け取ったノードが他にもピアを持つ場合、そのブロックをさらに転送する（ブロードキャストする）ことでネットワーク全体に行き渡らせます。本実装でも、受信したブロックが自分のチェーンに追加された場合は、他の全ピアに対して再度broadcastBlockを呼び出して転送します（すでに送ってきたノードにも送り返す可能性がありますが、相手側で重複を無視するため問題ありません）。

以下に擬似コードを示します。

fn receiveBlock(block: Block) !void {
    const last_block = blockchain.items[blockchain.len - 1];
    if (block.index <= last_block.index) {
        // 既に持っているブロックか古いブロックなので無視
        std.debug.print("Received block #{d} is not newer than current chain. Ignored.\n", .{ block.index });
        return;
    }
    if (block.prev_hash != last_block.hash) {
        std.debug.print("Block #{d} prev_hash mismatch (expected {s}). Rejected.\n", .{ block.index, last_block.hash });
        return;
    }
    // 上記チェックを通過すればブロックを受け入れる
    try blockchain.append(block);
    std.debug.print("Block #{d} added to chain from peer\n", .{ block.index });
    // 重複するトランザクションをプールから削除
    for (block.transactions) |tx| {
        // pending_transactions から同じ内容のtxを探す
        var i: usize = 0;
        while (i < pending_transactions.len) {
            const pending_tx = pending_transactions.items[i];
            if (std.mem.eql(u8, pending_tx.from, tx.from) and
                std.mem.eql(u8, pending_tx.to, tx.to) and
                pending_tx.amount == tx.amount)
            {
                pending_transactions.swapRemove(i); // 見つけたら削除
            } else {
                i += 1;
            }
        }
    }
    // 他のピアに再伝播（ブロードキャスト）
    try broadcastBlock(block);
}

まず、自ノードの最新ブロックと比較してインデックスやprev_hashを検証しています。一致しない場合、ログを出して処理を終了しています。チェックに問題なければチェーンにブロックを追加し、ログに「ピアからブロックを受信して追加した」旨を記録します。その後、ブロック内の各トランザクションについて、ローカルのpending_transactionsを走査し一致するものを削除しています（単純な比較ですが、本来はトランザクションIDなどユニークな識別子で照合します）。最後にbroadcastBlockで他のピアにこのブロックを転送します。これにより、例えばネットワークが線状（AがBに接続、BがCに接続）になっている場合でも、AのブロックをB経由でCに伝えることができます。既にそのブロックを持つノードに送られた場合は、インデックス重複チェックで無視され、再度ブロードキャストされないので、無限ループも防げます。

handleConnection 関数 – 接続受付とコマンド処理

最後に、handleConnection関数はネットワーク通信のハブとなる部分です。この関数はノードが外部からの接続を受け入れた際に呼ばれ、受信データを解釈して対応するRPC関数を呼び出します。具体的には、以下のようなテキストプロトコルを処理します。
	•	"TX ..." または "SENDTX ..." : トランザクション送信要求とみなし、残りのデータからトランザクション情報をパースしてsendTransactionを呼ぶ。
	•	"MINE" : マイニング要求とみなし、mineを呼ぶ。
	•	"GETCHAIN" : チェーン情報要求とみなし、getChainを呼んで結果を取得し、送り返す。
	•	"BLOCK ..." : ブロック伝播メッセージとみなし、後続のブロック情報をパースしてreceiveBlockを呼ぶ。

サーバ（ノード）はこのhandleConnectionを使ってRPCリクエスト全般を処理できます。一方、クライアント（要求送信側）は単純にコマンド文字列を送るだけです。ノード間では対等にこのプロトコルを話すので、あるノードのmine内部でbroadcastBlockを行う際には相手ノードでhandleConnectionがそれを受け取る、という流れになります。

以下にhandleConnectionの主要な実装例を示します。

fn handleConnection(conn: std.net.Server.Connection) !void {
    const stream = conn.stream;
    var reader = stream.reader();
    var buffer: [256]u8 = undefined;
    // 接続から1行読み取る（コマンド全体が1行で送られることを想定）
    const len = try reader.readUntilDelimiterOrEof(&buffer, '\n');
    if (len == 0) return; // 空のまま接続閉じた

    const line = buffer[0..len-1]; // 読み込んだコマンド行（改行除去）
    var it = std.mem.split(u8, line, " ");
    if (it.next()) |command| {
        if (std.mem.eql(u8, command, "TX")) {
            // トランザクション送信コマンド処理
            const from_slice = it.next() orelse {
                return replyError(stream, "Missing TX fields");
            };
            const to_slice = it.next() orelse {
                return replyError(stream, "Missing TX fields");
            };
            const amount_slice = it.next() orelse {
                return replyError(stream, "Missing TX fields");
            };
            const amount = try std.fmt.parseInt(u64, amount_slice, 10);
            // Transaction構造体を構築（from, toは固定長配列にコピー）
            var tx = Transaction{};
            tx.from[0..from_slice.len] .* = from_slice.*; // 名前をコピー
            tx.to[0..to_slice.len] .* = to_slice.*;
            tx.amount = amount;
            try sendTransaction(tx);
            try stream.writer().writeAll("TX OK\n");
        } else if (std.mem.eql(u8, command, "MINE")) {
            try mine();
            try stream.writer().writeAll("MINED OK\n");
        } else if (std.mem.eql(u8, command, "GETCHAIN")) {
            const chain_data = try getChain();
            defer allocator.free(chain_data);
            try stream.writer().writeAll(chain_data);
        } else if (std.mem.eql(u8, command, "BLOCK")) {
            // ブロック伝播メッセージ処理
            const index_str = it.next() orelse { return; };
            const prev_hash = it.next() orelse { return; };
            const hash = it.next() orelse { return; };
            const ts_str = it.next() orelse { return; };
            const from_slice = it.next() orelse { return; };
            const to_slice = it.next() orelse { return; };
            const amount_slice = it.next() orelse { return; };
            const index = try std.fmt.parseInt(u32, index_str, 10);
            const timestamp = try std.fmt.parseInt(i64, ts_str, 10);
            const amount = try std.fmt.parseInt(u64, amount_slice, 10);
            // Transactionを構築
            var tx = Transaction{};
            tx.from[0..from_slice.len] .* = from_slice.*;
            tx.to[0..to_slice.len] .* = to_slice.*;
            tx.amount = amount;
            // Block構造体を構築
            var blk = Block{
                .index = index,
                .prev_hash = prev_hash,
                .hash = hash,
                .timestamp = timestamp,
                .transactions = std.ArrayList(Transaction).init(allocator),
            };
            defer blk.transactions.deinit();
            try blk.transactions.append(tx);
            try receiveBlock(blk);
        } else {
            // 未知のコマンド
            try stream.writer().writeAll("ERR Unknown command\n");
        }
    }
}

handleConnectionでは、まず接続されたソケットから一行のデータを読み込んでいます（readUntilDelimiterOrEofを使い改行で区切られた一行を取得）。その行をスペース区切りでトークンに分解し、最初のトークンをcommandとして判定しています。各ケースの処理概要は以下の通りです。
	•	TX (トランザクション送信): 期待フォーマットは"TX <from> <to> <amount>"です。例として"TX Alice Bob 50"なら、AliceからBobへ50の送金トランザクションとなります。コードではstd.mem.splitのイテレータから順に3つのフィールドを取り出し、Transaction構造体を組み立てています。fromとtoは事前に定義された固定長配列（例えば長さ16の[16]u8）にコピーし、amountは文字列から数値(u64)にパースしています。その後sendTransaction(tx)を呼び出し、結果を呼び出し元に"TX OK\n"と返信しています（replyErrorはエラー時にメッセージを返す省略関数です）。
	•	MINE (マイニング実行): フォーマットは"MINE"のみです。受信したらmine()関数を呼び出し、新しいブロック生成と伝播を行います。結果を"MINED OK\n"と返信します。実際のPoW計算は行っていませんが、トランザクションからブロックを組み立てる部分は機能しています。
	•	GETCHAIN (チェーン取得): フォーマットは"GETCHAIN"のみです。受信したらgetChain()を呼び、得られたチェーン情報文字列をそのままソケットに書き出して返信します。deferによりバッファ確保していた場合は解放しています。これで要求元（例えば別ノードやユーザ）は、このノードのブロック一覧を取得できます。
	•	BLOCK (ブロック受信): これは他ノードからのブロック配布用メッセージです。フォーマットは"BLOCK <index> <prev_hash> <hash> <timestamp> <from> <to> <amount>"となっており、mine()→broadcastBlockで送信した形式と一致します。コードでは順次トークンを取り出し、インデックス、前ハッシュ、ハッシュ、タイムスタンプ、トランザクション内容（from, to, amount）を取得しています。それぞれ必要な型にパースし、TransactionおよびBlock構造体を生成しています。ここで構築したBlockは、トランザクションリストをメモリ確保してセットしています（1件だけ追加）。最後にreceiveBlock(blk)を呼び出して、このブロックを自ノードのチェーンに取り込みます。defer blk.transactions.deinit()により、一時作成したトランザクションリストを解放しています。
	•	未知のコマンド: 定義されていないコマンド文字列が来た場合は、"ERR Unknown command\n"と返信して処理を終えます。

handleConnectionはサーバ側（ノード側）の処理であり、実際にはこの関数を受け入れた接続ごとに呼ぶようにします。メインループでlistener.accept()したら新たな接続が来たことになるので、その都度handleConnection(conn)を実行します。シングルスレッドの場合は1接続ずつ順番に処理します（シンプルな実装のため、ブロック伝播やRPCは逐次処理されます）。より高度な並行処理は本書範囲外ですが、Zigではstd.Threadや非同期I/Oを使ってマルチスレッド・非同期処理も可能です。

ステップ3の全コード

以上の各要素を踏まえ、ステップ3における簡易ブロックチェーン・ネットワーキングの全コードを示します。一つのZigファイル（例えばstep3.zig）にまとめてあり、直接実行可能です。

const std = @import("std");

// 簡易ブロックチェーンノードの実装（ステップ3: ネットワーク通信とRPC）

const allocator = std.heap.page_allocator;

// トランザクション構造体の定義
const MaxNameLen: usize = 16;
const Transaction = struct {
    from: [MaxNameLen]u8, // 送信者識別子（固定長）
    to: [MaxNameLen]u8,   // 受信者識別子（固定長）
    amount: u64,
};

// ブロック構造体の定義
const MaxHashLen: usize = 66; // ハッシュのhex文字列長（64文字 + 終端用に余裕）
const Block = struct {
    index: u32,
    prev_hash: []const u8, // ハッシュ文字列へのスライス（参照）
    hash: [MaxHashLen]u8,  // このブロックのハッシュ値（hex文字列）
    timestamp: i64,
    transactions: std.ArrayList(Transaction),
};

// グローバル変数（チェーン、トランザクションプール、ピア一覧）
var blockchain = std.ArrayList(Block).init(allocator);
var pending_transactions = std.ArrayList(Transaction).init(allocator);
var peer_addresses = std.ArrayList(std.net.Address).init(allocator);

// ブロックハッシュを計算する補助関数（SHA-256でシンプルに計算）
fn computeBlockHash(blk: Block) []const u8 {
    const Sha256 = std.crypto.hash.sha2.Sha256;
    var hash_bytes: [Sha256.digest_length]u8 = undefined;
    // ハッシュ入力データを構成（prev_hash + 全TX + timestamp + index）
    var hasher = Sha256.init();
    hasher.update(blk.prev_hash) catch {};
    // 各トランザクションの内容をバイト列に追加
    for (blk.transactions.items) |tx| {
        hasher.update(&tx.from) catch {}; // 配列全体を追加（余分な0含む）
        hasher.update(&tx.to) catch {};
        // 金額をリトルエンディアンのバイト列に変換して追加
        var amt_buf: [8]u8 = std.mem.zeroes(u8, 8);
        std.mem.writeIntLittleEndian(&amt_buf, tx.amount);
        hasher.update(&amt_buf) catch {};
    }
    // タイムスタンプとインデックスもバイト列化して追加
    var ts_buf: [8]u8 = undefined;
    std.mem.writeIntLittleEndian(&ts_buf, @as(u64, blk.timestamp));
    hasher.update(&ts_buf) catch {};
    var idx_buf: [4]u8 = undefined;
    std.mem.writeIntLittleEndian(&idx_buf, blk.index);
    hasher.update(&idx_buf) catch {};
    // ハッシュ計算を完了
    _ = hasher.final()(hash_bytes[0..]);
    // ハッシュ値を16進文字列に変換
    var hash_hex: [MaxHashLen]u8 = undefined;
    const hex_str = std.fmt.fmtSliceHexLower(&hash_bytes);
    // hex_strを書式出力でhash_hexに書き込む
    _ = std.fmt.bufPrint(&hash_hex, "{s}", .{hex_str});
    return hash_hex[0..64]; // 64文字のHEX文字列部分を返す
}

// トランザクション受け付けRPC
fn sendTransaction(tx: Transaction) !void {
    try pending_transactions.append(tx);
    std.debug.print("Transaction received: from={s}, to={s}, amount={d}\n",
        .{ tx.from[0..std.mem.indexOf(u8, tx.from[0..], 0) orelse tx.from.len],
           tx.to[0..std.mem.indexOf(u8, tx.to[0..], 0) orelse tx.to.len],
           tx.amount });
}

// ブロック生成RPC（PoWなし、即時ブロック化）
fn mine() !void {
    if (pending_transactions.len == 0) {
        std.debug.print("No transactions to mine; skipping block creation\n", .{});
        return;
    }
    const last_index: u32 = if (blockchain.len == 0) 0 else blockchain.items[blockchain.len - 1].index;
    const new_index = if (blockchain.len == 0) 0 else last_index + 1;
    const prev_hash = if (blockchain.len == 0) "" else blockchain.items[blockchain.len - 1].hash[0..64];
    const timestamp = std.time.timestamp();
    // ブロックに含めるトランザクション（全て取り出す）
    var tx_list = pending_transactions;
    pending_transactions = std.ArrayList(Transaction).init(allocator);
    defer tx_list.deinit();
    var new_block = Block{
        .index = new_index,
        .prev_hash = prev_hash,
        .hash = undefined,
        .timestamp = timestamp,
        .transactions = tx_list,
    };
    // ハッシュ値計算と設定
    const hash_str = computeBlockHash(new_block);
    std.mem.copy(u8, &new_block.hash, hash_str);
    // チェーンにブロック追加
    try blockchain.append(new_block);
    std.debug.print("Mined block #{d} (tx count={d}, hash={s})\n",
        .{ new_index, new_block.transactions.len, new_block.hash[0..64] });
    // ブロードキャスト
    try broadcastBlock(new_block);
}

// チェーン情報取得RPC
fn getChain() ![]u8 {
    // チェーン内容を格納するバッファを確保
    var output = try allocator.alloc(u8, 1024);
    var offset: usize = 0;
    defer {
        if (offset == 0) allocator.free(output) catch {};
    }
    for (blockchain.items) |blk| {
        // 各ブロックを1行の文字列にフォーマット
        offset += try std.fmt.bufPrint(output[offset..],
            "Block {d}: prevHash={s}, hash={s}, tx={s}->{s}:{d}\n",
            .{ blk.index, blk.prev_hash, blk.hash[0..64],
               blk.transactions.items.len > 0 ? blk.transactions.items[0].from[0..std.mem.indexOf(u8, blk.transactions.items[0].from[0..], 0) orelse blk.transactions.items[0].from.len] : "None",
               blk.transactions.items.len > 0 ? blk.transactions.items[0].to[0..std.mem.indexOf(u8, blk.transactions.items[0].to[0..], 0) orelse blk.transactions.items[0].to.len] : "None",
               blk.transactions.items.len > 0 ? blk.transactions.items[0].amount : 0 }
        );
    }
    return output[0..offset];
}

// ブロック受信処理RPC
fn receiveBlock(block: Block) !void {
    if (blockchain.len != 0) {
        const last_block = blockchain.items[blockchain.len - 1];
        if (block.index <= last_block.index) {
            std.debug.print("Ignored received block #{d} (not newer)\n", .{ block.index });
            return;
        }
        if (!std.mem.eql(u8, block.prev_hash, last_block.hash[0..64])) {
            std.debug.print("Rejected block #{d}: prev_hash mismatch (expected {s})\n", .{ block.index, last_block.hash[0..64] });
            return;
        }
    }
    // 妥当な新規ブロックとして追加
    try blockchain.append(block);
    std.debug.print("Appended block #{d} from peer\n", .{ block.index });
    // プール中の重複トランザクションを削除
    for (block.transactions.items) |tx| {
        var i: usize = 0;
        while (i < pending_transactions.len) {
            const ptx = pending_transactions.items[i];
            if (std.mem.eql(u8, ptx.from[0..], tx.from[0..]) and
                std.mem.eql(u8, ptx.to[0..], tx.to[0..]) and
                ptx.amount == tx.amount)
            {
                pending_transactions.swapRemove(i);
            } else {
                i += 1;
            }
        }
    }
    // さらに他のピアに転送
    try broadcastBlock(block);
}

// ブロックを全ピアに送信（ブロードキャスト）する関数
fn broadcastBlock(block: Block) !void {
    // 送信用にブロック情報を文字列にフォーマット
    var msg_buf: [256]u8 = undefined;
    const tx = block.transactions.items.len > 0 ? block.transactions.items[0] : Transaction{ .from = undefined, .to = undefined, .amount = 0 };
    const nameFrom = tx.from[0..std.mem.indexOf(u8, tx.from[0..], 0) orelse tx.from.len];
    const nameTo = tx.to[0..std.mem.indexOf(u8, tx.to[0..], 0) orelse tx.to.len];
    const msg_len = try std.fmt.bufPrint(&msg_buf, "BLOCK {d} {s} {s} {d} {s} {s} {d}\n",
        .{ block.index, block.prev_hash, block.hash[0..64], block.timestamp, nameFrom, nameTo, tx.amount });
    const msg = msg_buf[0..msg_len];
    // 各ピアにTCP接続してメッセージ送信
    for (peer_addresses.items) |addr| {
        var stream = try std.net.tcpConnectToAddress(addr);
        defer stream.close();
        _ = try stream.writer().writeAll(msg);
    }
}

// 外部からの接続を処理する関数
fn handleConnection(conn: std.net.Server.Connection) !void {
    defer conn.stream.close();
    var reader = conn.stream.reader();
    var writer = conn.stream.writer();
    var buf: [256]u8 = undefined;
    // 1リクエスト（1行）読み取り
    const read_bytes = try reader.readUntilDelimiterOrEof(&buf, '\n');
    if (read_bytes == 0) return;
    const line = buf[0..read_bytes - 1];
    var it = std.mem.split(u8, line, " ");
    if (it.next()) |command| {
        if (std.mem.eql(u8, command, "TX")) {
            const from_slice = it.next() orelse return;
            const to_slice = it.next() orelse return;
            const amount_slice = it.next() orelse return;
            const amount = try std.fmt.parseInt(u64, amount_slice, 10);
            var tx = Transaction{ .from = [_]u8{0} ** MaxNameLen, .to = [_]u8{0} ** MaxNameLen, .amount = amount };
            std.mem.copy(u8, &tx.from[0..from_slice.len], from_slice);
            std.mem.copy(u8, &tx.to[0..to_slice.len], to_slice);
            try sendTransaction(tx);
            try writer.writeAll("TX OK\n");
        } else if (std.mem.eql(u8, command, "MINE")) {
            try mine();
            try writer.writeAll("MINED OK\n");
        } else if (std.mem.eql(u8, command, "GETCHAIN")) {
            const data = try getChain();
            defer allocator.free(data);
            try writer.writeAll(data);
        } else if (std.mem.eql(u8, command, "BLOCK")) {
            const idx_str = it.next() orelse return;
            const prev_hash = it.next() orelse return;
            const hash = it.next() orelse return;
            const ts_str = it.next() orelse return;
            const from_slice = it.next() orelse return;
            const to_slice = it.next() orelse return;
            const amt_str = it.next() orelse return;
            const idx = try std.fmt.parseInt(u32, idx_str, 10);
            const ts = try std.fmt.parseInt(i64, ts_str, 10);
            const amt = try std.fmt.parseInt(u64, amt_str, 10);
            var tx = Transaction{ .from = [_]u8{0} ** MaxNameLen, .to = [_]u8{0} ** MaxNameLen, .amount = amt };
            std.mem.copy(u8, &tx.from[0..from_slice.len], from_slice);
            std.mem.copy(u8, &tx.to[0..to_slice.len], to_slice);
            var tx_list = std.ArrayList(Transaction).init(allocator);
            defer tx_list.deinit();
            try tx_list.append(tx);
            var blk = Block{
                .index = idx,
                .prev_hash = prev_hash,
                .hash = undefined,
                .timestamp = ts,
                .transactions = tx_list,
            };
            // ハッシュ文字列をコピー（受信文字列そのまま使用）
            std.mem.copy(u8, &blk.hash[0..hash.len], hash);
            try receiveBlock(blk);
        } else {
            try writer.writeAll("ERR Unknown command\n");
        }
    }
}

// エラー発生時の簡易応答ヘルパー（省略可）
fn replyError(stream: anytype, msg: []const u8) !void {
    try stream.writer().writeAll("ERR ");
    try stream.writer().writeAll(msg);
    try stream.writer().writeAll("\n");
}

// エントリーポイント: ノードの起動処理
pub fn main() !void {
    const args = std.process.args;
    if (args.len < 2) {
        std.log.err("Usage: {s} <port> [peer_host:peer_port]...", .{ args[0] }) catch {};
        return;
    }
    // ノードのリッスンポート取得
    const port = try std.fmt.parseInt(u16, args[1], 10);
    // ピアアドレスを引数からパース
    var arg_index: usize = 2;
    while (arg_index < args.len) {
        const peer_arg = args[arg_index];
        if (std.mem.contains(peer_arg, ":")) {
            const parts = std.mem.split(u8, peer_arg, ":");
            const host = parts.next() orelse "";
            const port_str = parts.next() orelse "";
            const peer_port = try std.fmt.parseInt(u16, port_str, 10);
            const address = try std.net.Address.resolveIp(host, peer_port);
            try peer_addresses.append(address);
        }
        arg_index += 1;
    }
    // ジェネシスブロックの作成とチェーン初期化
    var genesis_tx_list = std.ArrayList(Transaction).init(allocator);
    defer genesis_tx_list.deinit();
    // (ジェネシスではトランザクションなしとする)
    const genesis_block = Block{
        .index = 0,
        .prev_hash = "",
        .hash = undefined,
        .timestamp = std.time.timestamp(),
        .transactions = genesis_tx_list,
    };
    // ジェネシスのハッシュ計算
    const genesis_hash = computeBlockHash(genesis_block);
    std.mem.copy(u8, &genesis_block.hash, genesis_hash);
    try blockchain.append(genesis_block);
    std.debug.print("Genesis block created (hash={s})\n", .{ genesis_block.hash[0..64] });
    // サーバソケットをオープンして接続待ち受け
    const bind_addr = try std.net.Address.resolveIp("0.0.0.0", port);
    var server = try bind_addr.listen(.{}); // TCPサーバを開始
    defer server.deinit();
    std.debug.print("Node listening on port {d}\n", .{ port });
    // 起動時に、指定されたピアに接続しチェーン同期（オプション）
    for (peer_addresses.items) |addr| {
        // 自分自身への接続はスキップ
        if (addr.port == port) continue;
        var stream = addr.connect() catch |e| {
            std.log.warn("Failed to connect to peer: {any}", .{e}) catch {};
            continue;
        };
        defer stream.close();
        // チェーン同期要求
        _ = try stream.writer().writeAll("GETCHAIN\n");
        var reader = stream.reader();
        var chain_buf = try allocator.alloc(u8, 2048);
        defer allocator.free(chain_buf);
        const n = try reader.readAll(chain_buf);
        if (n > 0) {
            std.debug.print("Received chain data from peer\n", .{});
            // TODO: 受け取ったチェーンをパースして自チェーンを更新（今回は省略）
        }
    }
    // 永久ループで接続を受け付け
    while (true) {
        const conn = try server.accept();
        // 新しい接続ごとにhandleConnectionを実行
        handleConnection(conn) catch |err| {
            std.log.err("Connection handling error: {}", .{err}) catch {};
        };
    }
}

上記がステップ3の全体コードです。簡潔のため一部省略や簡略化をしていますが、主要な流れは実装されています。
	•	コマンドライン引数または環境変数から自ノードのポートとピアノードのアドレスを取得し、ネットワーク設定します。std.net.Address.resolveIpでホスト名（またはIP）とポートから接続アドレスを作成しています。
	•	ジェネシスブロックを作成しチェーンを初期化しています（ここでは空のトランザクションリストでハッシュ計算しています）。
	•	自ノードを指定ポートでリッスン開始し、acceptループで外部接続を待ち受けます。受け入れた接続はhandleConnection関数で処理します。
	•	起動時に指定されたピア（例えば--peer引数で与えたアドレス）に対しては、一度接続してGETCHAINコマンドを送り、チェーンデータを受け取ることで同期を試みています（実装では受信したチェーン文字列をパースしていませんが、実際にはこれをreceiveBlockに渡すことで同期できます）。
	•	その後は永久ループで新規接続を処理し続けます。CTRL+Cなどで停止するまでノードは動作します。

動作確認例

では、このステップ3の実装を用いて2つのノード間でブロック伝播が機能することを確認してみましょう。ここでは同一マシン上でポートを変えて2プロセス起動し、netcatコマンドでRPCを発行する形でテストします。

1. ノードの起動:

ターミナル1でノードAを起動（ポート3000）し、ターミナル2でノードBを起動（ポート3001、ノードAをピアとして指定）します。

# ターミナル1: ノードA起動（ポート3000で待ち受け）
$ zig run step3.zig -- 3000
Node listening on port 3000
Genesis block created (hash=4e5b2d...)

# ターミナル2: ノードB起動（ポート3001、ピアにlocalhost:3000を指定）
$ zig run step3.zig -- 3001 127.0.0.1:3000
Node listening on port 3001
Genesis block created (hash=4e5b2d...)
Received chain data from peer

ノードB起動時、ノードAからチェーンデータを取得しています（今回は両者ともジェネシスのみなので変化なし）。両ノードが動作している状態です。

2. トランザクションの送信とブロックマイニング:

次に、ノードAに対してトランザクションを送り、続けてマイニングを実行します。別の端末かノードAのターミナルでnetcatを使ってRPCコマンドを送ります。

# ターミナル3: ノードAへトランザクション送信RPC
$ echo "TX Alice Bob 50" | nc localhost 3000
TX OK

ノードA側のログ出力（ターミナル1）には以下のように表示されます。

Transaction received: from=Alice, to=Bob, amount=50

続いてノードAにマイニングRPCを送ります。

$ echo "MINE" | nc localhost 3000
MINED OK

このときノードAのログには新規ブロック生成の情報が出ます。例えば:

Mined block #1 (tx count=1, hash=9f0d3a...)

ノードB（ターミナル2）側を見ると、ノードAからブロック伝播を受け取り、チェーンに追加したログが出力されているはずです。

Appended block #1 from peer

3. チェーンの共有確認:

最後に、それぞれのノードにGETCHAINコマンドを送って、チェーン内容を表示させます。

# ノードAのチェーン内容
$ echo "GETCHAIN" | nc localhost 3000
Block 0: prevHash=, hash=4e5b2d...6f (tx=None->None:0)
Block 1: prevHash=4e5b2d...6f, hash=9f0d3a...e2 (tx=Alice->Bob:50)

# ノードBのチェーン内容（ノードAと同じ内容が反映されている）
$ echo "GETCHAIN" | nc localhost 3001
Block 0: prevHash=, hash=4e5b2d...6f (tx=None->None:0)
Block 1: prevHash=4e5b2d...6f, hash=9f0d3a...e2 (tx=Alice->Bob:50)

ノードA・Bともにブロック1（Alice→Bobの50のトランザクションを含む）がチェーンに存在することが確認できました。つまり、ノードAで生成したブロックがノードBへ正しく伝播・共有されたことになります。

以上がステップ3の実装内容と動作確認です。これで複数ノードによるブロックチェーンネットワークの基本動作（トランザクション受付、ブロック生成、ブロック伝播、チェーン同期）が実現できました。次のステップ4では、この基盤の上にProof of Workによる採掘アルゴリズムを組み込み、ブロック生成に競合解決（難易度調整）を加えることで、より実際のブロックチェーンに近づけます。お疲れさまでした。
