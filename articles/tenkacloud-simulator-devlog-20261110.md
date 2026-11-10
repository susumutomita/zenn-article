---
title: "シミュレーター開発日記：SNSの1件を2つのSQSキューへ届ける"
emoji: "📬"
type: "tech"
topics: [AWS, SNS, SQS, Go, SQLite]
published: false
---

同じ出来事を、通知処理と集計処理の両方へ渡したいとします。送信側は1つの送り先へ送信し、そこから複数のキューへ届ける構成を使えます。

AWSでこの構成を作るときに使うのが、SNSのトピックとSQSのキューです。トピックは通知の送り先、キューは処理するまでメッセージをためておく場所です。キューをトピックへ登録する操作をSubscribeと呼び、複数の送り先へ配る構成をfanoutと呼びます。

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)に、SNSへの1回のPublishから、同じローカル環境の複数のSQSキューへメッセージを保存する機能を追加しました。実AWSに接続せず、送信した本文がどのような形でキューに入るかを試せます。

この記事は、Pythonのboto3でAWSのAPIを呼んだことがあり、SNSとSQSのつながりを学びたい開発者向けです。2つのキューで受信する例と、片方のキューがなくなった場合の動きを追います。

対象は[PR #457](https://github.com/susumutomita/TenkaCloudSimulator/pull/457)を含む、2026年11月10日の公開コミット[1ea676e](https://github.com/susumutomita/TenkaCloudSimulator/tree/1ea676eec2587e0df00629bcf26c23a6dd6e4681)です。以下はこの固定版の仕様です。

この実装は、同じSQLiteへの保存をまとめて成功・失敗させます。実AWSの非同期配信や再試行を再現するものではありません。まず通知の流れを試し、そのあとで、ローカル実装として選んだ境界を説明します。

## 学習専用の環境へ接続する

固定コミットのソースとGo 1.26を用意し、[起動手順](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/docs/start.md)に従って起動します。既存の練習データと混ざらない、新しい学習専用の状態ファイルを使ってください。以下は127.0.0.1:4566で動かす例です。

コードは、同じPythonプロセスで上から順に使います。boto3が必要です。固定版の[SDKテスト用の依存定義](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/scripts/requirements-test.txt)では、boto3 1.42.0を使用しています。

**以下はソースと既存テストに基づく説明用コードです。掲載する出力は期待値であり、この記事用コードを実行して取得したログではありません。**

```python
import json
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

endpoint = "http://127.0.0.1:4566"
token = Path("simulator-token").read_text().strip()

def local_token(request, **_):
    target = urlsplit(request.url)
    if (target.scheme, target.netloc) != ("http", "127.0.0.1:4566"):
        raise RuntimeError("Unexpected endpoint")
    request.headers.add_header("X-Simulator-Token", token)

def client(service):
    result = boto3.client(
        service, endpoint_url=endpoint, region_name="us-east-1",
        aws_access_key_id="TCSIMLOCAL", aws_secret_access_key="dummy",
        config=Config(proxies={}, retries={"max_attempts": 0}),
    )
    result.meta.events.register("before-sign." + service, local_token)
    return result

sns, sqs = client("sns"), client("sqs")
```

`simulator-token`は起動時に用意したローカルトークンのファイルです。この例は、自分の学習環境を管理するoperatorトークンを使います。別のディレクトリーから実行する場合はファイルのパスを変更してください。値を表示したり、Gitや画面共有へ載せたりしないでください。

ダミーのSDK認証情報だけでは接続できません。実AWSの認証情報は使わず、送るデータもダミーにします。参加者に環境を渡す場合はoperatorトークンを共有せず、ホスト側で参加者用の権限を設定します。

## 1つのトピックに2つのキューを登録する

名前が既存のリソースと重ならないよう、共通のランダムな接尾辞を付けます。

```python
suffix = uuid4().hex[:12]
topic = sns.create_topic(Name="article-fanout-" + suffix)["TopicArn"]
first = sqs.create_queue(QueueName="article-first-" + suffix)["QueueUrl"]
second = sqs.create_queue(QueueName="article-second-" + suffix)["QueueUrl"]

for queue in (first, second):
    arn = sqs.get_queue_attributes(
        QueueUrl=queue, AttributeNames=["QueueArn"],
    )["Attributes"]["QueueArn"]
    sns.subscribe(TopicArn=topic, Protocol="sqs", Endpoint=arn)
```

SQSの操作に渡す`QueueUrl`と、Subscribeへ渡す`QueueArn`を分けている点がポイントです。ARNはリソースを識別する文字列です。[AWSのキュー登録手順](https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html)でも、登録先にはキューのARNを使います。

今回は同じプロセス・SQLite・リージョンにあるStandardトピックとStandardキューを使います。外部のAWSキューへ転送する設定ではありません。

## 1回送信し、それぞれのキューから受け取る

本文に、日本語と山括弧を含む短い文字列を使います。

```python
sent = sns.publish(
    TopicArn=topic, Message="日本語 <message>", Subject="native fanout",
)

for name, queue in (("first", first), ("second", second)):
    messages = sqs.receive_message(QueueUrl=queue).get("Messages", [])
    assert len(messages) == 1
    message = messages[0]
    notice = json.loads(message["Body"])
    print(name, notice["Message"],
          notice["MessageId"] == sent["MessageId"],
          message["MessageId"] != sent["MessageId"])
    sqs.delete_message(QueueUrl=queue, ReceiptHandle=message["ReceiptHandle"])
```

期待する表示は次のとおりです。

```text
first 日本語 <message> True True
second 日本語 <message> True True
```

受信した`Body`は、送った本文そのものではなく、通知情報を含むJSON文字列です。`json.loads`で読み取ると、その中の`Message`に元の本文が入っています。今回のSimulatorは、`Type`、`MessageId`、`TopicArn`、`Message`、`Timestamp`と、指定時の`Subject`を保存します。

ここには2種類のMessageIdがあります。通知の中のIDは、SNSのPublishが返したIDと一致します。一方、外側のSQSメッセージには、キューへの保存時に別のIDが付きます。同じ通知かを調べるときと、SQSのメッセージを扱うときで、見る場所が異なります。

また、ReceiveMessageだけではメッセージを削除しません。処理後のDeleteMessageには、受信時の`ReceiptHandle`を渡します。上の例では内容を確認したあと、各キューから削除しています。

[AWSの通知形式](https://docs.aws.amazon.com/sns/latest/dg/sns-sqs-as-subscriber.html)も本文をJSONで包みますが、このSimulatorは署名、証明書URL、購読解除URLを生成しません。AWSの通知形式全体との互換性はありません。

## 片方のキューがなければ、今回の送信を残さない

次に、2つ目のキューだけを削除します。キューを消しても、SNS側の登録は残ります。

```python
sqs.delete_queue(QueueUrl=second)
try:
    sns.publish(TopicArn=topic, Message="missing second queue")
except ClientError as error:
    if error.response["Error"]["Code"] != "NotFound":
        raise
    print("NotFound")
else:
    raise RuntimeError("Expected NotFound")

print(sqs.receive_message(QueueUrl=first).get("Messages", []))
```

この固定版での期待値は、`NotFound`と空の一覧`[]`です。先ほどの通知は削除済みなので、1つ目のキューに今回の通知だけが残っていないことを確認できます。

| 入力・前提 | Simulatorの処理 | 期待する結果 |
| --- | --- | --- |
| 両方のキューがあり、必要な権限もある | 通知を包み、両キューへ保存する | 各キューで1件受信できる |
| 登録済みの2つ目のキューを削除してPublish | 保存先の存在確認で拒否する | `NotFound`。1つ目にも新しい通知を残さない |
| 片方にしかSendMessage権限がない主体でPublish | 保存先ごとの権限確認で拒否する | `AuthorizationError`。両方とも変更しない |

最後の権限拒否は上のコードでは実行していません。[固定版のSDKテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/test/e2e/sns_sqs_fanout.py#L85-L98)で、SNSの操作は許可し、SendMessageを1つ目のキューだけに許可した主体を作り、両キューが空のままかを検査しています。

## SQLiteで保存をまとめる理由

この実装では、SNSとSQSが同じSQLiteを使います。[配信処理](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/internal/aws/sns_sqs_fanout.go#L110-L209)は1つのトランザクションで、次の処理を行います。

1. 現在の登録先を読み、各キューの存在と送信権限を確認する。
2. SNSのメッセージ・配信記録と、各SQSメッセージを保存する。
3. 保存した行の内容と登録先が期待どおりかを確認し、まとめてコミットする。

途中で保存に失敗したら、先に保存した分も巻き戻します。単に「1つ目へSendMessage、次に2つ目へSendMessage」と独立したAPI呼び出しを並べる構成では、後半の失敗時に前半を取り消せません。同じデータベースを共有するローカル環境だからこそ、保存の単位をまとめられます。

ただし、これはSimulatorの同期的な保存契約です。実AWSの配信保証や再試行を、このトランザクションで説明できるわけではありません。また、保存後にクライアントが応答を受け取れない場合、呼び出し側から結果を断定できません。今回の実装はPublishの再送を重複排除する仕組みでもありません。

## AWSと異なる権限モデルに注意する

[AWSの手順](https://docs.aws.amazon.com/sns/latest/dg/subscribe-sqs-queue-to-sns-topic.html)では、キューのリソースポリシーでSNSサービスからのSendMessageを許可します。通知するユーザーの権限と、SNSがキューへ届けるための権限を分けます。

このSimulatorは、そのリソースポリシーとサービス間の信頼条件を実装していません。Subscribeでは登録するキューへの、Publishでは現在登録されている全キューへの`sqs:SendMessage`を、呼び出す主体自身に要求します。各操作のSNS権限も必要です。どこか1つでも許可がなければ全体を拒否します。

権限は[リクエストごとに1回読み取ったポリシー](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/internal/aws/sns_sqs_fanout.go#L20-L41)で判断します。複数回の読み取りで、変更前と変更後の許可を継ぎ合わせてしまわないためです。受信と削除には、それぞれのSQS操作権限も必要です。

このローカルの権限設定を、そのままAWS構成の正解として持ち込まないでください。複数チームの分離にも、IAM主体の切り替えだけでなく、チームごとのプロセス・SQLite・トークン管理が必要です。

## 片付けと対応範囲

例の最後には、今回作ったトピックと、残っている1つ目のキューを削除します。

```python
sns.delete_topic(TopicArn=topic)
sqs.delete_queue(QueueUrl=first)
sns.close()
sqs.close()
```

DeleteTopicはSNS側の登録と記録を削除します。すでにSQSへ届いたメッセージを取り消す操作ではありません。上の例は受信したメッセージを削除済みですが、途中で止めた場合は、今回作ったリソースだけを確認して片付けてください。

[固定版のSNS対応範囲](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/docs/sns.md)と[SQS対応範囲](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/docs/sqs.md)には、次の制限があります。

- 同じプロセス・データベース・リージョン・固定アカウントのStandardトピックとStandardキューに限ります。
- SNS本文は最大256 KiBです。JSONで包んだ後のSQS本文も262,144 bytes以内に収める必要があります。元の本文が入るサイズでも、エスケープや通知情報の追加後に拒否される場合があります。
- 保存件数と容量にもローカルの上限があります。SQSは全キュー・リージョン合計で10,000件、保存payloadは本文のUTF-8バイト数と、シリアライズ済み属性JSONの合計で64 MiBまでです。AWSのクォータやSQLiteファイル全体のサイズを表す値ではありません。
- FIFOでの配信、raw delivery、フィルター、再試行・DLQ、SNS用コンソール、SNSのCloudFormation連携は未対応です。
- emailやHTTP、Lambdaなどを登録しても、外部送信や関数実行は行いません。

## 確認したこと

執筆時に、固定コミットの[CI](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42784583829)と[形式検証](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42784583999)の成功を確認しました。[CIの実行ログ](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/42784583829/job/129722515897)では、fanoutのSDK検査が53回の呼び出し・送信・応答を記録して成功しています。

そのテストは、2つのキューでの本文とIDの照合、権限不足と保存先消失時の拒否、別プロセス・別リージョンへの非干渉、再起動後の保持、最後の削除を検査します。[Goの障害注入テスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/internal/aws/sns_sqs_fanout_test.go#L275-L356)では、後続の書き込みが先行する保存行を消すケースなども使い、部分的な保存を残さないか確認しています。

今回の記事作成では、SDK/E2Eや実AWSとの比較試験を新たに実行したわけではありません。[有限モデル](https://github.com/susumutomita/TenkaCloudSimulator/blob/1ea676eec2587e0df00629bcf26c23a6dd6e4681/formal/SNSQueueFanout.tla)も、1回のPublishと2つのキューを抽象化したものです。Go・SQL実装全体や、任意の障害への安全性を証明するものではありません。

今回試せるようになったのは、1件の通知を複数のキューへ渡し、各キューで受信し、削除するまでの流れです。通知の中と外にあるID、保存先が欠けたときの結果、AWSとは異なる権限と保存の境界を分けて見ると、この学習環境で確かめられることがはっきりします。
