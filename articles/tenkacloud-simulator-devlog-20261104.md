---
title: "AWS学習用シミュレーター開発記録：CloudFormationでREST APIとLambdaをつなぐ"
emoji: "☁️"
type: "tech"
topics: [AWS, Go, CloudFormation, Lambda, OSS]
published: true
---

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)という、非公式のAWS学習用シミュレーターを作っています。手元でAWSサービスの操作を練習するための環境です。

この記事は、IAMロールやLambda関数、CloudFormationのスタックを触り始めた開発者に向けた記録です。APIを呼んだあと、どの関数が動き、どの権限でデータを読むのかを、1つのサンプルで確かめます。

2026年11月4日、CloudFormationからREST API、Lambda、SSM Parameter Storeをまとめて作成する実装がmainに入りました。作成したローカルAPIを呼ぶとPythonのLambda関数が動き、実行ロールの権限でSSMの値を読みます。

対象は[コミット55a1119](https://github.com/susumutomita/TenkaCloudSimulator/tree/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66)です。以下の対応範囲と制限は、この版のものです。

## 1つのテンプレートでAPIと実行ロールを用意する

関数を動かすだけでなく、APIから呼び出し、必要なデータだけを読める構成を試せるようにしました。個別のサービスを作ったあとにつなぐ設定も、CloudFormationのテンプレートにまとめています。

[サンプルテンプレート](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/examples/cloudformation-rest-lambda.json)には、次のリソースが入っています。

- 値を保存するSSMパラメーター
- 読み取り権限を定めるインラインポリシー付きIAMロール
- SSMの値を読み取って返すPythonのLambda関数
- REST APIとリソース、メソッド
- APIを呼び出せる状態にするデプロイメントとステージ
- API GatewayからLambdaを呼ぶためのPermission

この構成では、APIへのリクエストをLambdaに渡し、Lambdaが実行ロールのポリシーに従ってSSMを読みます。CloudFormationで構成全体を作ることで、呼び出し先と権限の関係を同じテンプレートから確認できます。

リソースを作る順序もテンプレートで指定します。APIのメソッドを用意してからデプロイメントを作るため、Deploymentの`DependsOn`にMethodを指定しています。

実装は、[IAMロールとLambda向け信頼ポリシーのPR #36](https://github.com/susumutomita/TenkaCloudSimulator/pull/36)と、[REST APIとLambda proxy実行のPR #45](https://github.com/susumutomita/TenkaCloudSimulator/pull/45)を経ています。[PR #303](https://github.com/susumutomita/TenkaCloudSimulator/pull/303)で、この構成をCloudFormationから作成できるようにしました。

## ローカルAPIを呼び、実行ロールの許可と拒否を確かめる

スタックを作成すると、Outputsに`LocalPath`が返ります。これは`/_simulator/providers/aws/_execute-api/`で始まり、リージョン、APIのID、`prod/config`が続くパスです。ローカルのエンドポイントにこのパスを付けて呼び出します。

`LocalPath`は認証が必要なシミュレーター内の経路で、実AWSの公開URLは作りません。呼び出すときは、ホストのトークンを`X-Simulator-Token`に付けます。

サンプルの実行ロールは、`/cfn-rest/public`に対する`ssm:GetParameter`だけを許可しています。クエリを付けずにAPIを呼ぶと、Lambdaはこのパラメーターを読み、値と処理したパスをJSONで返します。

読もうとする名前は、クエリの`name`で変えられます。[E2Eテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/test/e2e/cloudformation_rest.py)では、スタック作成時に`Value`へ`team-one`を渡します。さらに、スタックとは別に`/private/dummy`も作成し、同じAPIから読み取りを試します。

以下は、その1つ目の環境でE2Eが検査する応答内容を整理したものです。この改稿で実行して得たログではありません。

| APIへの入力 | Lambda内の処理 | HTTPステータスと応答本文 |
| --- | --- | --- |
| `LocalPath`へのGET、クエリなし | `/cfn-rest/public`を読む | 200、`{"value":"team-one","path":"/config"}` |
| 同じパスへのGETに`?name=/private/dummy`を付ける | 許可されていないパラメーターを読む | 403、`{"code":"AccessDeniedException"}` |

ただし、このサンプル関数はSDKの`ClientError`をすべて403へ変換しています。403だけでは原因を区別できません。E2Eは応答本文の`code`も調べ、`AccessDeniedException`と一致するか確認しています。

この例で確かめられるのは、APIが呼べることと、関数から任意のSSMパラメーターを読めることは別だという点です。同じ関数でも、実行ロールで許可したリソースかどうかによって結果が変わります。

応答はブラウザーで実行しないダウンロード形式です。この経路にWebアプリケーションを載せて公開するところまでは対応していません。

作成から呼び出し、削除までの手順は[CloudFormation REST API → Lambdaの実行例](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md)にあります。SDKではローカルのエンドポイントとダミーの認証情報を明示し、トークンを付けます。実AWSの認証情報は使いません。

## 呼び出しの確認後に、スタックを片付ける

呼び出しと権限を確認したあとは、スタックを削除して片付けます。関連リソースをまとめて扱うため、作成と削除の途中の状態も確認します。

今回の実装では、作成を1つのトランザクションで扱い、削除は依存関係の逆順で進めます。未対応のプロパティが書かれていた場合は、エラーにします。

削除時には、CloudFormationが作ったリソースの状態も確認します。作成後に別の操作で変更されたAPIのリソースや、所有していないリソースがあれば、そのまま削除を進めません。

Lambdaのポリシーへ後から追加された別のステートメントも、スタックの削除時は保持します。

これらの動作と制約は、[対応範囲の説明](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md#supported-resources-and-boundaries)を参照してください。作れたことだけでなく、どの状態なら片付けられるかも確認するためです。

## 作成から削除までを2つのチーム環境で検証する

この作成・呼び出し・削除の流れは、リポジトリの[検証記録](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md#verification)とE2Eテストで確認しています。実際のバイナリとSDKを使い、次の順で進めます。

1. CloudFormationでスタックを作る
2. 作成されたAPIとLambdaの権限を確認する
3. ローカルHTTP経由でLambdaを実行する
4. SSMへのアクセスが許可・拒否されることを確認する
5. スタックを削除し、関連リソースが片付くことを確認する

このE2Eには、別チームのトークンを拒否すること、プロセスを再起動しても状態が残ること、無関係なSSMパラメーターを削除しないことも含まれています。

執筆時には対象コミットの[CI成功](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/41822746313)を確認し、テストコードとテンプレートを読み合わせました。この記事のためにSimulatorのE2Eを手元で再実行したわけではありません。

チームを分けるときは、チームごとにプロセス、SQLite、トークンを分けます。IAMのidentityを切り替えるだけでは参加者の環境を分離できません。

## 手元で動かす環境と対応範囲

このサンプルを動かす環境は、Goの単一バイナリにまとめています。次のものを組み込んでいます。

- Cloudscapeを使った操作コンソール
- ScalarのAPIリファレンス
- 状態を保存するSQLite
- PythonのLambda関数を実行するCPython/WASI

実行時にNode.js、外部のPython、Docker、実AWS、外部データベースは必要ありません。Pythonのコードは、バイナリに埋め込んだCPython/WASIで実行します。

ただし、ソースからのビルドやテストには開発用のツールが必要です。

この版の対応サービスは、S3、IAM、SSM Parameter Store、CloudFormation、API Gateway、Lambdaです。どのサービスも対応範囲を絞っています。

たとえばLambdaは同期実行のみで、関数から任意の外部ネットワークへ通信できません。関数内でS3やSSMを操作するSDKも、シミュレーターが対応する範囲だけを扱います。

各サービスの対応操作と制限は[README](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/README.md)にまとめています。

## この版で対応していないこと

CloudFormationの対応は、CreateStack、DescribeStacks、DeleteStackを中心とした限定的なものです。UpdateStackやchange setsには対応していません。

API GatewayもRegional RESTの一部で、v2やauthorizer、WAFは未対応です。

IAMには、この版で注意が必要な違いも残っています。CloudFormationで作ったロールは従来の保存モデルを使っており、新しいnative IAMのGetRoleやListRoles、ロール選択画面には出てきません。

API Gateway、Lambda、SSMの状態は各サービスの画面と共有していますが、IAMの表示はまだそろっていません。

また、CloudFormationで作ったロールの信頼ポリシーはメタデータとして保持され、認可には使われません。native IAMロールの信頼ポリシー検証とは異なります。

`CAPABILITY_IAM`の指定も、ロール作成への同意を表すだけで権限を付与しません。呼び出す側には、CloudFormationと各リソースの操作権限が必要です。

このREST APIのサンプルは学習用の実行例です。TenkaCloudの完成した競技問題として採点までつながったものではありません。通常のTenkaCloud起動への自動統合もまだです。READMEで実採点まで検証済みとしているのは、別のhello-worldの接続です。

## おわりに

今回のサンプルでは、CloudFormationで構成を作り、ローカルAPIからLambdaを呼び、実行ロールに応じたSSMの読み取り結果を確かめられます。最後はスタックを削除し、関連するリソースが片付くところまでを扱います。

APIの接続と権限の違いを手元で試したいときの例です。利用する際は、この固定版の対応範囲と実行例を確認してください。
