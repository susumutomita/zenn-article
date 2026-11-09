---
title: "シミュレーター開発日記：S3の分割アップロードを完了と中止まで試す"
emoji: "🧩"
type: "tech"
topics: [AWS, S3, Go, SQLite, OSS]
published: true
---

S3でファイルを分割して送るとき、各部分の送信が成功しても、まだ1つのオブジェクトとしては完成していません。送信した部分を選んで結合するか、不要になったアップロードを中止する操作が残っています。

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)に、S3のmultipart uploadを追加しました。実AWSへ接続せず、途中のpartを保存し、内容を差し替え、最後に結合・中止する流れを試せます。

この記事は、S3のPutObjectとGetObjectを使ったことがある開発者に向けた記録です。「送信が終わった」と「完成した」をどこで区別するか、partを差し替えたあとに何を記録し直すかを、Pythonのboto3で追います。

対象は公開済みの[v0.1.2](https://github.com/susumutomita/TenkaCloudSimulator/releases/tag/v0.1.2)、コミット[3d575ac](https://github.com/susumutomita/TenkaCloudSimulator/tree/3d575ac645de4f1b36d644879a714374f5f6d9d4)です。[PR #440](https://github.com/susumutomita/TenkaCloudSimulator/pull/440)の実装を含みます。v0.1.0とv0.1.1には、このmultipart機能はありません。

## partの保存とオブジェクトの完成を分ける

multipart uploadは、ファイルを複数のpartに分けて送る仕組みです。基本の流れは次のとおりです。

1. CreateMultipartUploadで開始し、UploadIdを受け取る。
2. UploadPartでpart番号とデータを送る。応答のETagを番号と組にして記録する。
3. CompleteMultipartUploadへ、採用するpart番号とETagを昇順で渡す。

Completeに成功すると、選んだpartが番号順に結合され、GetObjectで読めるオブジェクトになります。途中でやめるときはAbortMultipartUploadを呼びます。

[AWSのmultipart概要](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)も、この開始・送信・完了の流れを説明しています。Completeに渡す一覧は、UploadPartの応答から自分で保持するのが基本です。ListPartsは保存状態の確認に使えますが、AWSはその結果をComplete用の一覧の代わりに使わないよう案内しています。

今回のSimulatorでも、保存済みpartと完成オブジェクトは別の状態です。同じキーに新しいアップロードを開始しても、それだけで既存オブジェクトを書き換えることはありません。

## 手元のSimulatorへ接続する

以下は、固定版の実装とテストに基づく説明用コードです。結果は期待値であり、この記事の作成時に実行して取得したログではありません。

v0.1.2のソースまたは公開バイナリーを取得したうえで、[固定版の起動手順](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/docs/start.md)に従い、学習専用の状態ファイルでSimulatorを起動してください。例では127.0.0.1:4566を使い、Python環境にはboto3が必要です。以下のコード片は、同じPythonプロセスで上から順に実行する前提です。

```python
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

endpoint = "http://127.0.0.1:4566"
token = Path("simulator-token").read_text().strip()
s3 = boto3.client(
    "s3", endpoint_url=endpoint, region_name="us-east-1",
    aws_access_key_id="TCSIMMULTIPART", aws_secret_access_key="dummy",
    config=Config(
        s3={"addressing_style": "path"},
        retries={"max_attempts": 0},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    ),
)

def local_token(request, **_):
    target = urlsplit(request.url)
    if (target.scheme, target.netloc) != ("http", "127.0.0.1:4566"):
        raise RuntimeError("Unexpected endpoint")
    request.headers.add_header("X-Simulator-Token", token)

s3.meta.events.register("before-sign.s3", local_token)
```

`simulator-token`は起動時に作られたファイルです。コードを別の場所から実行するなら、そのファイルへのパスを指定します。値を表示したり、Gitや画面共有へ載せたりしないでください。ダミーのSDK認証情報だけでは接続できません。

接続方法は[既存のSDKテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/test/e2e/s3_multipart.py)と同じです。このS3経路はローカルトークンと限定的なIAM評価を使い、実AWSの署名検証やアカウント分離を再現するものではありません。データもダミーだけを使います。

## 2つのpartを送り、2つ目だけ差し替える

他のデータと混ざらない新しいバケットを作ります。この例ではバージョニングを有効にしません。

```python
bucket = "article-multipart-" + uuid4().hex[:12]
key = "sample.bin"
s3.create_bucket(Bucket=bucket)
upload = s3.create_multipart_upload(Bucket=bucket, Key=key)["UploadId"]

first = b"a" * (5 * 1024 * 1024)
etag1 = s3.upload_part(
    Bucket=bucket, Key=key, UploadId=upload,
    PartNumber=1, Body=first,
)["ETag"]
old_etag2 = s3.upload_part(
    Bucket=bucket, Key=key, UploadId=upload,
    PartNumber=2, Body=b"old",
)["ETag"]
```

最後以外のpartは5 MiB以上必要なので、part 1を5 MiB、最後のpart 2を3 bytesにしています。1 MiBは1,048,576 bytesです。

次にpart 2の内容を変えて再送します。

```python
new_etag2 = s3.upload_part(
    Bucket=bucket, Key=key, UploadId=upload,
    PartNumber=2, Body=b"new",
)["ETag"]
```

同じUploadId・同じpart番号への送信は置換です。保存済みpartは3個に増えず、part 1と新しいpart 2の2個になります。

[UploadPartの仕様](https://docs.aws.amazon.com/AmazonS3/latest/API/API_UploadPart.html)でも、同じ番号への送信は以前のpartを上書きします。Complete用に保持するETagも、その応答で更新します。

このSimulatorのpart ETagは、保存したbytesのMD5を引用符で囲んだ値です。今回の`old`と`new`では値が変わります。同じbytesの再送なら同じ値なので、「再送したら必ずETagが変わる」という判定には使えません。AWSのETag全般が単純なMD5であるとも限りません。

## 古いETagでは結合せず、新しいETagで完成させる

置換前のETagを誤って渡した場合を確かめます。

```python
try:
    s3.complete_multipart_upload(
        Bucket=bucket, Key=key, UploadId=upload,
        MultipartUpload={"Parts": [
            {"PartNumber": 1, "ETag": etag1},
            {"PartNumber": 2, "ETag": old_etag2},
        ]},
    )
except ClientError as error:
    if error.response["Error"]["Code"] != "InvalidPart":
        raise
    print("InvalidPart")  # 期待値
else:
    raise RuntimeError("Expected InvalidPart")
```

固定版では、保存済みpartのETagと一致しないため、結合を拒否します。この検証エラーで完成途中のオブジェクトを残したり、保存済みpartを削除したりはしません。

新しいETagで送り直します。

```python
result = s3.complete_multipart_upload(
    Bucket=bucket, Key=key, UploadId=upload,
    MultipartUpload={"Parts": [
        {"PartNumber": 1, "ETag": etag1},
        {"PartNumber": 2, "ETag": new_etag2},
    ]},
)
body = s3.get_object(Bucket=bucket, Key=key)["Body"]
try:
    print(body.read() == first + b"new")  # 期待値: True
finally:
    body.close()
```

入力と状態の変化を整理すると、次のようになります。これもソースとテストから整理した期待値です。

| 操作 | 渡す内容 | 固定版での結果 |
| --- | --- | --- |
| part 2の再送 | 同じ番号、`new` | 保存内容を置換し、新しいETagを返す |
| 古いETagでComplete | part 1と置換前のpart 2のETag | `InvalidPart`。保存済みpartは保持する |
| 新しいETagでComplete | part 1と置換後のpart 2のETag | 5 MiBの`a`と`new`を結合する |
| GetObject | 完成したキー | 5,242,883 bytesを返す |

完成したETagは、この実装では各partのMD5を使って計算し、末尾にpart数の`-2`を付けます。完成body全体の単純なMD5ではありません。内容の確認には、上の例のように取得したbytesそのものを比較しています。

## 中止は、完成済みオブジェクトを消す操作ではない

同じキーで別のアップロードを開始し、今度は結合せずに中止します。

```python
abandoned = s3.create_multipart_upload(Bucket=bucket, Key=key)["UploadId"]
s3.upload_part(
    Bucket=bucket, Key=key, UploadId=abandoned,
    PartNumber=1, Body=b"not-completed",
)
s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=abandoned)
```

Abortは、そのUploadIdに属するpartを片付けます。先ほど完成させた`sample.bin`は残ります。この小さいpartは最後以外のpartとして結合していないため、5 MiB未満でも保存できます。

試し終わったら、今回作成したオブジェクトとバケットを削除します。

```python
s3.delete_object(Bucket=bucket, Key=key)
s3.delete_bucket(Bucket=bucket)
s3.close()
```

途中で予期しないエラーが起きた場合は、上の最後の削除だけでは片付かないことがあります。ListMultipartUploadsで未完了のアップロードを確認し、不要なものをAbortしてください。このSimulatorでは、自動期限切れやlifecycleによる回収はありません。

通信が切れてCompleteの応答を受け取れなかった場合は、成功・失敗が分かりません。すぐ同じ操作を繰り返さず、一覧とオブジェクトを確認します。固定版では完了・中止済みのUploadIdへの再要求は`NoSuchUpload`になり、以前の成功応答を再送する仕組みではありません。

## SQLiteに途中の状態を残す

今回、upload IDと保存済みpartはSQLiteへ保存しています。同じ状態ファイルとトークンファイルでSimulatorを再起動すると、ListPartsで途中のpartを確認し、続きの送信を行えます。ブラウザーで選んだだけの未送信ファイルは保存されません。

Completeでは、保存済みpartの検証・結合、完成オブジェクトの更新、uploadとpartの削除を[同じトランザクション](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/internal/aws/s3_multipart.go)で扱います。検証エラーや保存失敗のときに、片付けだけ先に進んで再開できなくなることを避けるためです。

[再起動・保存失敗のテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/internal/aws/s3_multipart_test.go)と、[SQL失敗を注入するテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/internal/aws/s3_multipart_sql_test.go)を用意しています。あらゆる強制停止やストレージ障害からの復旧を保証したものではありません。

## 画面でも、途中のpartを確認できる

S3バケットのManagement画面は、SDKと同じAPI・保存状態を使います。SDKで開始したアップロードを選び、番号・サイズ・ETagを確認できます。画面からはpartファイルを1つずつ送り、`complete`または`abort`と入力して結合・中止します。

画面で結合するときは、表示済みのpartとAPIから取り直したpartを比較します。別のSDK操作でpartが変わっていたら、更新後の一覧を示して再確認を求めます。これはSimulator独自の操作画面の仕様です。

この画面は大きなファイルを自動分割しません。また、一覧を取り直したあとの並行変更まで予約・ロックするものでもありません。最後はAPI側でETagなどを検査します。

## 対応範囲と検証したこと

この実装は学習用に範囲を絞っています。[固定版の対応表](https://github.com/susumutomita/TenkaCloudSimulator/blob/3d575ac645de4f1b36d644879a714374f5f6d9d4/docs/s3-multipart.md)には、次の制限があります。

- partと完成オブジェクトは、それぞれ最大8 MiBです。実AWSのサイズ上限ではありません。
- 保存済みversionやpartなどのbody合計は、全バケットで64 MiBまでです。SQLiteファイル全体のサイズ制限とは異なります。
- 未完了アップロードが残るバケットは削除できません。これはSimulatorのローカル制約です。
- multipart copy、追加checksum、暗号化設定、条件付き結合などは未対応です。
- チームごとにプロセス・SQLite・トークンの管理を分けます。IAMの操作主体を選ぶだけではチームを分離できません。

記事作成時には、対象版の[CI](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42530214398)、[形式検証](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42530214418)、[リリース検証](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42535316180)の成功を確認しました。新機能がmainに入った時点の[SDK・ブラウザーテストのログ](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42478665855/job/128725577450)も読み合わせています。

そのSDK・ブラウザーテストは、40回のSDK要求と応答、再起動後のpart保持、画面とSDKの共通状態を検査しています。権限・リージョンの拒否、画面表示後のpart変更、デスクトップ幅と390px幅のアクセシビリティ、最後の削除も含まれます。

今回の記事用コードを新たにSDK実行したわけではなく、実AWSとの比較試験も行っていません。有限モデルの成功はGoやSQLiteの実装全体の証明ではなく、Cloudscapeを使った画面も実AWSコンソールとの完全一致を保証しません。

partの送信後に、アプリケーションが何を記録し、いつ完成・中止と判断するかを手元で追えるようになりました。内容を差し替えたらETagを更新し、終わらせないアップロードは明示的に中止するところまでが、今回の練習範囲です。
