---
title: "KMSの鍵を同じ呼び名で切り替える：手元で試せるalias機能"
emoji: "🔑"
type: "tech"
topics: [AWS, KMS, Go, SQLite, OSS]
published: true
---

データを暗号化するアプリケーションで、これから使う鍵を新しいものへ切り替えたいとします。プログラムに鍵のIDを直接書いていると、切り替えるたびにその指定を変える必要があります。

そこで、鍵に「アプリ用の鍵」という呼び名を付けて使います。アプリケーションは同じ呼び名を指定し続け、管理する側で、その呼び名に結び付く鍵を変更します。

AWSで鍵を作り、データを暗号化・復号するサービスが**KMS**です。暗号化は読めるデータを暗号文に変える操作、復号は元のデータへ戻す操作です。その変換に使う情報が鍵です。鍵に付ける呼び名をalias（エイリアス）といいます。

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)という非公式の学習環境に、このaliasを作成・一覧・付け替え・削除する機能を追加しました。実AWSに接続せず、自分のPCで「同じ呼び名のまま新しい鍵に切り替える」操作を練習できます。

この記事では、ダミーデータを暗号化してから鍵を切り替え、新しいデータと切り替え前のデータで使う鍵の違いを追います。対象はマージ済みの[PR #429](https://github.com/susumutomita/TenkaCloudSimulator/pull/429)を含む[公開コミットd166f56](https://github.com/susumutomita/TenkaCloudSimulator/tree/d166f569772de7f45d98e31e9971eeb33b903763)です。

## 新しいデータは新しい鍵へ。以前のデータには以前の鍵が必要

まず「アプリ用の鍵」という呼び名を、最初の鍵に結び付けます。その呼び名でデータを暗号化すると、使われるのは最初の鍵です。

次に、同じ呼び名を新しい鍵へ付け替えます。ここから新しく暗号化するデータには、新しい鍵が使われます。アプリケーション側で指定する呼び名は変えません。

ただし、**以前に暗号化したデータは、そのままです**。呼び名の付け替えは、データを新しい鍵で暗号化し直す操作ではありません。以前のデータを読むには、最初の鍵と、それを使う権限を残す必要があります。

| いつ暗号化したデータか | 暗号化するときの指定 | 実際に使う鍵 | 元に戻すために必要な鍵 |
| --- | --- | --- | --- |
| 付け替え前 | アプリ用の鍵 | 最初の鍵 | 最初の鍵 |
| 付け替え後 | アプリ用の鍵 | 新しい鍵 | 新しい鍵 |

AWSの[UpdateAlias](https://docs.aws.amazon.com/kms/latest/APIReference/API_UpdateAlias.html)も、呼び名と鍵の結び付きを変更する操作です。今回作った機能では、保存済みデータの移行や鍵の削除までは行いません。

## 呼び名を変えずに鍵を切り替える例

以下はPythonのboto3で操作の流れを示す説明用コードです。起動・接続コードは省略しています。実行する場合は、先にGo 1.26を用意し、固定版の[起動手順](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/docs/start.md)に従って、学習専用のSQLiteでSimulatorを起動します。

コード中の`kms`は、ローカル接続用に設定済みのKMSクライアントです。[SDKテストの接続設定](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/test/e2e/kms_aliases.py#L24-L31)と同様に、ローカルの`endpoint_url`とリージョン、ダミーの認証情報`TCSIMLOCAL`・`dummy`を明示します。さらに、Simulatorのアクセストークンを`X-Simulator-Token`に付けます。ダミーのSDK認証情報だけでは接続できません。実AWSの認証情報は使わず、データもダミーだけにしてください。

この例は、必要な操作権限を持ち、同じリージョンの有効な鍵を使う前提です。複数チームで使う場合は、プロセス・SQLite・トークンの管理をチームごとに分けます。IAMの操作主体を切り替えるだけでは環境を分離できません。

### 1. 呼び名を付けて、最初のデータを暗号化する

2本の鍵を用意します。`old_key`は最初の鍵、`new_key`は次に使う鍵のIDです。「アプリ用の鍵」という呼び名には、APIで使える`alias/article-demo`を指定します。

```python
old_key = kms.create_key(Description="dummy old key")["KeyMetadata"]["KeyId"]
new_key = kms.create_key(Description="dummy new key")["KeyMetadata"]["KeyId"]
name = "alias/article-demo"
context = {"purpose": "local-test"}

kms.create_alias(AliasName=name, TargetKeyId=old_key)
old_data = kms.encrypt(
    KeyId=name, Plaintext=b"dummy before switch", EncryptionContext=context,
)["CiphertextBlob"]
```

`old_data`が、最初の鍵で作った暗号文です。`EncryptionContext`は暗号化・復号の際に照合する付加情報で、この例では同じ値を渡し続けます。秘密の保存場所には使いません。

### 2. 呼び名を新しい鍵へ付け替える

```python
kms.update_alias(AliasName=name, TargetKeyId=new_key)
new_data = kms.encrypt(
    KeyId=name, Plaintext=b"dummy after switch", EncryptionContext=context,
)["CiphertextBlob"]
```

暗号化の指定は、先ほどと同じ`KeyId=name`です。しかし、今度の`new_data`は新しい鍵で暗号化されます。`old_data`には変更を加えていません。

### 3. 以前のデータは、最初の鍵で読む

```python
result = kms.decrypt(
    KeyId=old_key, CiphertextBlob=old_data, EncryptionContext=context,
)
print(result["Plaintext"] == b"dummy before switch")
```

期待する結果は`True`です。最初の鍵を指定すれば、切り替え前のデータを元に戻せます。

では、この復号でも`KeyId=name`と指定するとどうなるでしょうか。現在その呼び名に結び付いているのは、新しい鍵です。切り替え前のデータを作った鍵とは異なるため、復号は失敗します。

次の表は、固定版のソースとテストから整理した期待値です。今回SDKを実行して得たログではありません。同じ`old_data`と`EncryptionContext`を渡し、選ばれる鍵の復号権限がある場合を比べます。

| 以前のデータを読むときの指定 | Simulatorの処理 | 期待する結果 |
| --- | --- | --- |
| 最初の鍵のID（`KeyId=old_key`） | 最初の鍵で復号する | 元のダミーデータが返る |
| 呼び名（`KeyId=name`） | 現在結び付いている新しい鍵を選ぶ | 鍵が違うため`IncorrectKeyException` |
| 鍵を指定しない（KeyIdを省略） | 暗号文に記録された最初の鍵を選ぶ | 元のダミーデータが返る |

鍵を指定しなくても復号できるのは、暗号文に、暗号化に使った鍵のIDを記録しているためです。AWSの対称鍵の[Decrypt API](https://docs.aws.amazon.com/kms/latest/APIReference/API_Decrypt.html)にも、この省略方法があります。ただしAWSは、意図した鍵を使うことを確認するため、鍵を明示する方法を推奨しています。

## 使う鍵を切り替える権限と、データを読む権限は別

aliasを付け替えられる人に、自動的に復号まで許可するわけではありません。このSimulatorでは、付け替えにはaliasと旧・新両方の鍵のARNに対する`kms:UpdateAlias`が必要です。ARNはリソースを特定する識別子です。

暗号化には`kms:Encrypt`、復号には`kms:Decrypt`を、実際に使う鍵のARNに対して確認します。上の表でも、選んだ鍵を使う権限がなければ、鍵の不一致を返す前に`AccessDeniedException`で拒否します。

aliasを指定する暗号操作では、使う鍵を決める処理と、その鍵の権限確認・暗号処理を[同じSQLiteトランザクション](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_aliases.go#L485-L613)で行います。途中の付け替えによって、許可した鍵とは別の鍵を使うことを防ぐためです。

## 学習用の対応範囲と、確認したこと

SQLiteには生の鍵素材を保存します。必ずダミーデータだけを使ってください。鍵の保護を保証する環境ではなく、暗号文もAWS KMSへ持ち込めません。

:::details AWSとの差、片付け、検証の範囲
この版は対称鍵とcustomer aliasに範囲を絞っています。[対応範囲](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/docs/kms.md)には、次の違いもあります。

- HSMや保存時の保護は保証しません。暗号文は独自形式です。
- aliasの変更は即座に反映され、AWSの結果整合性は再現しません。画面の「Change target (local API)」は独自の操作欄です。[AWSコンソールには付け替え操作がありません](https://docs.aws.amazon.com/kms/latest/developerguide/alias-update.html)。
- 鍵情報を読むDescribeKeyは、この版では鍵IDか鍵ARNだけを受け付けます。[実AWSはaliasも受け付けます](https://docs.aws.amazon.com/kms/latest/APIReference/API_DescribeKey.html)。aliasを使った暗号化・復号自体にDescribeKey権限は要求しませんが、画面の鍵候補を読むにはListKeysとDescribeKeyの権限が必要です。
- AWSのkey policy、grants、クロスアカウント、aliasによるABAC全体は再現しません。鍵ローテーション、鍵削除、他サービスのKMS暗号化連携も未対応です。

試したあとにaliasを削除しても、鍵と暗号文は残ります。この版には鍵削除APIがないため、学習用の状態を使ってください。状態ファイルを片付ける場合は、そのプロセスを停止し、自分が今回用意した学習専用ファイルに限ります。共有中のデータベースを削除する手順ではありません。

内容は、固定版の[Goテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_aliases_test.go#L518-L591)・[既存の復号テスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_store_test.go)・[SDKのE2E](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/test/e2e/kms_aliases.py#L131-L169)と照合しました。対象コミットの[CI](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42141685828)・[Formal validation](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42141685737)の成功も確認しています。今回の記事作成・改稿でSDK/E2Eや実AWS比較を再実行してはいません。有限モデルの成功は、Go・SQL・暗号実装全体の証明ではありません。

:::

この機能で試せるのは、アプリケーションの呼び名を保ったまま、これから使う鍵を切り替えることです。以前のデータには以前の鍵が必要だと分かると、鍵の切り替えとデータの移行を分けて考えられます。
