---
title: "KMSのaliasを付け替えても、古い暗号文の鍵は変わらない"
emoji: "🔑"
type: "tech"
topics: [AWS, KMS, Go, SQLite, OSS]
published: true
---

KMSのaliasを鍵Aから鍵Bへ付け替えたあと、同じaliasで古い暗号文を復号するとどうなるでしょうか。

この記事は、AWS KMSのEncryptやDecryptを使い始めた開発者に向けた記録です。「アプリケーションが指定する名前」と「暗号文を作った鍵」を分けて考えるため、ローカルの学習環境で3つの復号方法を比べます。

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)は、クラウド操作を手元で練習する非公式のシミュレーターです。[PR #429](https://github.com/susumutomita/TenkaCloudSimulator/pull/429)で、KMSのcustomer aliasの作成・一覧・付け替え・削除がmainに入りました。以下は、公開済みの[コミットd166f56](https://github.com/susumutomita/TenkaCloudSimulator/tree/d166f569772de7f45d98e31e9971eeb33b903763)に固定した説明です。

## 付け替えるのは、これから名前を解決したときの参照先

最初に`alias/article-demo`を鍵Aへ向け、この名前でダミーデータを暗号化します。その後、UpdateAliasで参照先を鍵Bへ変えます。

```text
暗号化時: alias/article-demo → 鍵A → 暗号文C
付け替え後: alias/article-demo → 鍵B
暗号文Cを作った鍵: 鍵Aのまま
```

AWSの[UpdateAliasの説明](https://docs.aws.amazon.com/kms/latest/APIReference/API_UpdateAlias.html)でも、aliasは鍵から独立したリソースとして扱われます。付け替えは既存の鍵や暗号文を書き換える処理ではありません。

そのため、新しい暗号化を鍵Bへ切り替えられても、鍵Aで暗号化したデータの移行までは済んでいません。古いデータを読むには、鍵Aとその利用権限を残す必要があります。

## 同じ暗号文に、3つのKeyIdを試す

次のコードは、SimulatorのローカルKMSクライアント`kms`を用意したあとの実行例です。鍵A・Bが有効で、必要な操作権限があり、同じリージョンで実行することを前提にしています。

```python
from botocore.exceptions import ClientError

key_a = kms.create_key(Description="dummy article A")["KeyMetadata"]["KeyId"]
key_b = kms.create_key(Description="dummy article B")["KeyMetadata"]["KeyId"]
name = "alias/article-demo"
context = {"purpose": "local-test"}

kms.create_alias(AliasName=name, TargetKeyId=key_a)
blob = kms.encrypt(
    KeyId=name,
    Plaintext=b"dummy article data",
    EncryptionContext=context,
)["CiphertextBlob"]

kms.update_alias(AliasName=name, TargetKeyId=key_b)

for label, selection in [
    ("KeyId omitted", {}),
    ("old concrete key", {"KeyId": key_a}),
    ("retargeted alias", {"KeyId": name}),
]:
    try:
        result = kms.decrypt(
            CiphertextBlob=blob,
            EncryptionContext=context,
            **selection,
        )
        print(label, result["Plaintext"] == b"dummy article data")
    except ClientError as error:
        print(label, error.response["Error"]["Code"])

kms.delete_alias(AliasName=name)
```

以下は固定版のソースとテストから整理した期待値です。EncryptionContextは暗号化時と同じ値を渡します。この記事のためにSDKを実行して採取したログではありません。

| 古い暗号文Cへの入力 | Simulatorが選ぶ鍵 | 期待する結果 |
| --- | --- | --- |
| KeyIdを省略 | 暗号文に記録した鍵A | 元のダミーデータへ復号できる |
| KeyIdに鍵Aの具体的なIDを指定 | 鍵A | 元のダミーデータへ復号できる |
| KeyIdに付け替え後のaliasを指定 | 現在の参照先である鍵B | `IncorrectKeyException` |

最後のケースは、鍵Bの復号権限がある場合です。選ばれた鍵Bを利用する権限がなければ、この実装は鍵の不一致を返す前に`AccessDeniedException`で拒否します。エラーだけを見て「暗号文が壊れた」と決めつけず、指定した鍵と権限を確認します。

AWSの[Decrypt API](https://docs.aws.amazon.com/kms/latest/APIReference/API_Decrypt.html)でも、対称鍵で作った暗号文はメタデータから鍵を特定でき、KeyIdを省略できます。一方、KeyIdを指定すると、その鍵だけを使用します。AWSは意図した鍵の利用を確認するため、明示的な指定を推奨しています。ここでの省略は、その違いを比べるための例です。

### ローカル接続と片付けの前提

ソースからの起動にはGo 1.26が必要です。固定版の[起動手順](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/docs/start.md)に従い、専用の作業ディレクトリとSQLiteで起動します。上のPython例には、別途boto3が必要です。

クライアントはローカルの`endpoint_url`とリージョンを明示し、ダミーの認証情報を使います。[SDKテストのclient関数](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/test/e2e/kms_aliases.py#L24-L31)では、`TCSIMLOCAL`と`dummy`を渡し、`X-Simulator-Token`をリクエストに付けています。実AWSの認証情報は使いません。

ダミーのSDK認証情報は接続認証にはなりません。接続にはローカルのアクセストークンを使い、参加者のトークンには操作主体を結び付けます。チームごとにプロセス・SQLite・トークンの管理を分けます。IAMの主体を切り替えるだけではチームを分離できません。

例の最後ではaliasだけを削除しています。鍵と暗号文は削除されず、この版には鍵削除APIもありません。繰り返し試すと鍵が残るので、学習専用の状態を使い、終了後はプロセスを停止して自分が用意した状態ファイルを片付けてください。

## 実装では、名前の解決と権限確認を同じトランザクションに入れる

権限確認と暗号処理でaliasを別々に解決すると、その間の付け替えによって、許可した鍵とは別の鍵を使いかねません。

[KMSAliasStoreの実装](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_aliases.go#L485-L613)は、次の処理を同じSQLiteトランザクションで扱います。

1. aliasを現在の具体的な鍵IDへ解決する
2. その鍵ARNに対するEncryptまたはDecryptの権限を確認する
3. 鍵の状態や暗号文との一致を検査し、暗号処理を行う
4. コミットに成功してから結果を返す

KeyIdを省略したDecryptでは、手順1の代わりに暗号文内の鍵IDを選びます。暗号文の識別情報には可変のalias名を使いません。ローカル形式はAES-256-GCMを使い、具体的な鍵ARN、リージョン、EncryptionContextなどを認証対象に含めます。

この設計で守りたいのは、付け替えの前後で同じ名前を使えても、古い暗号文の鍵が曖昧にならないことです。

## aliasを管理する権限と、鍵を使う権限を分ける

このSimulatorのUpdateAliasには、alias ARNと旧・新両方の鍵ARNに対する`kms:UpdateAlias`が必要です。それがあっても、暗号化・復号を許可したことにはなりません。EncryptとDecryptでは、解決後の具体的な鍵ARNに対する各操作の権限を確認します。

aliasの解決に、追加のDescribeKey権限を要求することもありません。ただし画面の鍵選択欄はListKeysとDescribeKeyを使うので、画面で候補を読む権限は別に必要です。

AWSの[UpdateAliasの権限](https://docs.aws.amazon.com/kms/latest/APIReference/API_UpdateAlias.html)も、aliasと旧・新の鍵を区別します。ただしSimulatorはローカルのidentity policyの照合に範囲を絞っています。AWSのkey policy、grants、クロスアカウント、aliasによるABAC全体を再現したものではありません。

## 何を検査し、何を再実行していないか

固定版の[Goテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_aliases_test.go#L518-L591)は、暗号文内の鍵ID、付け替え後の不一致、権限拒否を先に返すこと、KeyId省略、新規暗号化が新しい鍵を使うことを検査します。

[SDKのE2E](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/test/e2e/kms_aliases.py#L131-L169)には、実際のローカルHTTP経由でaliasを付け替え、古い暗号文の不一致とKeyId省略時の復号を確かめる検査があります。古い具体的な鍵IDを指定する経路は、[既存のKMSテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/internal/aws/kms_store_test.go)も参照しました。

執筆時には、対象コミットの[CI](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42141685828)と[Formal validation](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42141685737)の成功を確認し、ソースとテストを照合しました。この記事のためにSimulatorの大規模E2Eや実AWSでの比較を再実行したわけではありません。有限モデルの成功は、Go・SQL・暗号実装全体の証明ではありません。

## 学習用シミュレーターとしての制限

この版の[KMS対応範囲](https://github.com/susumutomita/TenkaCloudSimulator/blob/d166f569772de7f45d98e31e9971eeb33b903763/docs/kms.md)では、対称鍵とcustomer aliasに限定しています。DescribeKeyはaliasを受け付けず、具体的な鍵IDか鍵ARNを使います。[実AWSのDescribeKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_DescribeKey.html)はaliasも受け付けるため、この点は異なります。

aliasの変更はローカルで即座に反映され、AWSの結果整合性は再現しません。画面の「Change target (local API)」もSimulator独自の操作欄です。AWSは[コンソールからの付け替えを提供していません](https://docs.aws.amazon.com/kms/latest/developerguide/alias-update.html)。

また、SQLiteには生の鍵素材が保存されます。HSMや保存時の保護を保証する環境ではなく、必ずダミーデータだけを使ってください。暗号文も独自のローカル形式で、AWS KMSへ持ち込めません。鍵ローテーション、鍵削除、他サービスのKMS暗号化連携も未対応です。

aliasの付け替えで変わるのは、以後その名前から選ばれる鍵です。古い暗号文を読む設計では、暗号化した具体的な鍵と権限をどこまで残すかも、合わせて考える必要があります。
