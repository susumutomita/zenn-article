---
title: "Azure Blobの詳細画面を作る：古い応答で上書きしないための実装と検証"
emoji: "☁️"
type: "tech"
topics: [Azure, React, TLAPlus, Go, OSS]
published: true
---

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)では、クラウドの操作をローカルで練習できる環境を作っています。[前回](https://zenn.dev/bull/articles/tenkacloud-simulator-devlog-20261104)は、CloudFormationからREST APIとLambdaをつなぐ実装を紹介しました。

今回はAzure Blob Storageの詳細画面です。Blobやコンテナーのプロパティを開いたとき、一覧に残っている古い値を表示せず、APIから取り直すようにしました。そのうえで、画面を閉じたあとに届く応答や、同名のリソースの取り違えを検査しています。

対象は2026年11月5日にmainへ入った[PR #417](https://github.com/susumutomita/TenkaCloudSimulator/pull/417)と[PR #418](https://github.com/susumutomita/TenkaCloudSimulator/pull/418)です。以下は[コミット4f4d0f9](https://github.com/susumutomita/TenkaCloudSimulator/tree/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c)の実装に基づきます。

## 一覧の値と、詳細を開いたときの値は違う

以前のBlob Propertiesは、最後に取得した一覧の情報を表示していました。

たとえば、一覧を表示したあと、別のクライアントから同じBlobを置き換える場合を考えます。一覧の行をそのまま詳細画面に渡すと、古いETagやサイズが表示されます。画面は正常に開くので、利用者には古い情報だと分かりません。

今回の変更では、詳細を開くたびに対象のHEADリクエストを送り、その応答ヘッダーを表示します。取得中と失敗時は、前のプロパティを消します。403や404のときに一覧の値で穴埋めすることもしません。

これで表示できるのは、HEADで取得した時点の情報です。その後の更新まで追い続ける仕組みではありません。

## プロパティだけを読み、本文は取得しない

Azureの[Get Blob Properties](https://learn.microsoft.com/en-us/rest/api/storageservices/get-blob-properties)はHEADを使い、プロパティとメタデータを応答ヘッダーで返します。Blobの本文は返しません。

シミュレーターの画面も、既存のローカルAPIへHEADを送ります。表示するのはETag、最終更新日時、Blobの種類、サイズ、Content-Type、対応するユーザーメタデータです。ダウンロード用のGETは呼びません。

コンテナーのプロパティも追加しました。一覧で対象を選び、MoreからContainer propertiesを開きます。[Get Container Properties](https://learn.microsoft.com/en-us/rest/api/storageservices/get-container-properties)に沿って、`restype=container`を付けたHEADを使います。

ここで、Blobとコンテナーを同じ表示項目にそろえることはしません。

| 対象 | 表示する情報 |
| --- | --- |
| Blob | 名前、ETag、最終更新日時、メタデータ、種類、サイズ、Content-Type |
| コンテナー | 名前、ETag、最終更新日時、メタデータ |

コンテナーのHEADには、BlobのサイズやContent-Typeという契約がありません。HTTPのContent-Lengthをコンテナー内のデータ量と解釈したり、一覧から足りない値を補ったりせず、対応する項目だけを表示します。

[実装のshowProperties](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/tools/console/src/azure-blob.jsx#L84-L104)では、共通項目を組み立てたあと、Blobの場合だけ3つの項目を追加しています。

## 通信の中止と、画面を更新してよい条件を分ける

HEADを追加すると、通信中に画面を閉じる操作も考える必要があります。

1. 詳細画面を開き、リクエストAを送る
2. 応答を待たずに閉じる
3. 詳細画面を開き直し、リクエストBを送る
4. Aに関する非同期処理が終わる

このとき、Aの結果でBの画面を上書きしてはいけません。

実装ではAbortControllerで中止を要求するとともに、画面更新の直前にも条件を確認します。リクエスト開始時に、そのコンポーネントの管理オブジェクトと世代番号を捕まえます。

```js
const life = lifecycle.current;
const epoch = ++life.epoch;
const controller = new AbortController();

const current = () =>
  life.active &&
  life.epoch === epoch &&
  !controller.signal.aborted;
```

このコードは、[perform関数](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/tools/console/src/azure-blob.jsx#L58-L69)から関連部分を抜粋し、整形・省略したものです。

- `active`で、そのコンポーネントがまだ有効かを確認する
- `epoch`で、現在のリクエストと同じ世代かを確認する
- `signal.aborted`で、中止されていないかを確認する

閉じる操作では世代を進め、通信を中止し、表示済みのプロパティを消します。コンポーネントの破棄時にも無効化します。応答を表示するのは、`current()`が真の場合だけです。

見落としやすいのは、成功時の表示更新だけでなく、`finally`も同じ画面を操作することです。

```js
finally {
  clearTimeout(timer);
  if (life.active && life.epoch === epoch) {
    life.busy = false;
    life.controller = null;
    setBusy(false);
  }
}
```

Aの後処理が無条件に`setBusy(false)`を呼ぶと、Bが通信中なのにローディング表示が消えてしまいます。プロパティを更新しなくても、画面の状態は壊れます。このため、後処理にも有効性と世代の確認を入れています。

## 名前が同じでも、同じリソースとは限らない

コンテナーとBlobの両方を扱うので、対象の区別にも注意が必要です。

- `same`というコンテナー
- `same`コンテナー内の`same`というBlob
- `other`コンテナー内の`same`というBlob

名前だけを比較すると、すべて`same`です。種類と親コンテナーを含めて区別します。

実装では、対象の種類に応じてHEADのURLを作り分けます。返す詳細にも種類を持たせ、描画時にプロパティ画面の種類と一致するかを確認します。なお、アカウントや操作主体を切り替える境界は、親側のコンポーネント再生成で扱っています。

この関係を検査する[AzurePropertiesTargetモデル](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/formal/AzurePropertiesTarget.tla)では、対象を「種類・親コンテナー・名前」の組として表しています。コンテナーとBlobの経路が混ざらないこと、コンテナーにBlob専用の項目が付かないことなどを確認します。

## ブラウザーで動かす検証と、順序を調べる検証

今回は実ブラウザーのE2Eと、TLA+で書いた有限モデルの検査を組み合わせています。

### E2Eでは、実際のローカルAPIの値と比較する

[Blobのテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/test/e2e/azure_live_properties.py)では、一覧を表示してからAPI経由でBlobを置き換えます。そのあと詳細を開き、HEADで返る新しいETagやメタデータと画面の値を比較します。

さらに、次の操作も含めています。

- 詳細を開いても、Blob本文のGETが発生しない
- 403や404になったとき、前の詳細を残さない
- 閉じて開き直したとき、新しい応答を待つ画面に古い値が出ない
- 日本語と英語を切り替えても、メタデータの値を変えたり再取得したりしない
- 別のシミュレータープロセスにあるデータを変更しない

応答順序のテストでは、ローカルサーバーの実応答を一時的に保留します。古い応答を先に解放し、新しい応答は待たせたまま、ローディングと空の詳細が維持されるかを確認します。

ただし、このテストではブラウザーがAbortControllerによって先に古いfetchを拒否する場合があります。そのため「中止後のJavaScriptコールバックが必ず実行され、そのガードで止まった」とまでは言えません。

[コンテナーのテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/test/e2e/azure_container_properties.py)も別に用意し、Blobと同じ名前の場合や、エラーからの再取得を確認しています。両方ともデスクトップ幅とスマートフォン幅で実行します。

### TLA+では、守りたい条件を明示する

[AzurePropertiesEpochモデル](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/formal/AzurePropertiesEpoch.tla)では、画面を開く操作や閉じる操作、コンポーネントの破棄、応答の到着を遷移として定義しています。中止を要求したあとにも、保留中の応答が完了する順序を扱います。

このモデルは、2つのコンポーネント世代、各2つのリクエスト世代、2つの対象リソースに限定しています。

TLCで検査する条件には、次のものがあります。

- 成功した現在のリクエストだけが、プロパティを表示できる
- 閉じた状態、読み込み中、取得失敗時に、前の詳細を残さない
- 古いリクエストの後処理で、新しいリクエストの読み込み状態を消さない

モデルが常に成功するだけでは、欲しい性質を検査できているか分かりません。そこでモデルの条件を意図的に壊し、想定した不変条件の反例が出ることも確認しています。たとえば、古いリクエストの後処理を無条件に許す変更では、読み込み状態の不変条件に対する反例の検出を成功条件にしています。

構文エラーやタイムアウトは、この確認の成功には数えません。検査の範囲と変更内容は[モデルの説明](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/docs/formal-azure-properties.md)に記録しています。

## 今回確認できた範囲

対象コミットの[CI](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42003886974)と[形式検証](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42003886990)の成功を確認し、実装とテストを読み合わせました。この記事のためにE2Eを別途再実行したわけではありません。

TLA+の検査は、範囲を限定したモデルについてのものです。JavaScriptやGoの実装がモデルに一致することや、Azureの全仕様を証明したものではありません。HTTPヘッダーの解釈や認可、実際のブラウザーでの動作は、別のテストで確認します。

また、今回作ったのはローカルAPIに対する読み取り専用の詳細画面です。Azure Portalへログインした画面との完全な一致は確認していません。コンテナーのメタデータ編集、SAS、Azure RBAC、リースなどは、この画面の対応範囲に含まれません。[対応範囲](https://github.com/susumutomita/TenkaCloudSimulator/blob/4f4d0f9bdb5cf76e3b5f4e9e9d9dbc247c22750c/docs/azure-console.md)を分けて公開しています。

詳細画面を増やすときは、表示項目に加えて、値を取得する時点と、どの応答が画面を更新してよいかを決める必要があります。今回は、その条件を実装、ブラウザーテスト、有限モデルのそれぞれで確認できる形にしました。
