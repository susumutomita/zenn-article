---
title: "AWS学習用シミュレーター開発記録：CloudFormationでREST APIとLambdaをつなぐ"
emoji: "☁️"
type: "tech"
topics: [AWS, Go, CloudFormation, Lambda, OSS]
published: true
---

[TenkaCloud Simulator](https://github.com/susumutomita/TenkaCloudSimulator)という、非公式のAWS学習用シミュレーターを作っています。Goの単一バイナリにコンソールとデータベース、Pythonの実行環境をまとめ、手元でAWSサービスの操作を練習できるようにするものです。

2026年11月4日時点で、CloudFormationからREST API、Lambda、SSM Parameter Storeをまとめて作成する実装がmainに入りました。ローカルのAPIを呼ぶとPythonのLambda関数が動き、実行ロールの権限でSSMの値を読みます。

今回は、この一連の流れがどこまで動くようになったかを書きます。対象は[mainの55a1119](https://github.com/susumutomita/TenkaCloudSimulator/tree/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66)です。既存記事の[暗号バトル](https://zenn.dev/bull/articles/tenkacloud-local-cryptography-battle)や[APIの番人](https://zenn.dev/bull/articles/tenkacloud-cloud-master-ai-limit)とは別に、AWSのAPI操作を手元で試すための環境です。

## Goのバイナリに学習環境をまとめる

Simulatorには、次のものを組み込んでいます。

- Cloudscapeを使った操作コンソール
- ScalarのAPIリファレンス
- 状態を保存するSQLite
- PythonのLambda関数を実行するCPython/WASI

実行時にNode.js、外部のPython、Docker、実AWS、外部データベースは必要ありません。Pythonのコードは、バイナリに埋め込んだCPython/WASIで実行します。ただし、ソースからのビルドやテストには開発用のツールが必要です。

現時点の対応サービスは、S3、IAM、SSM Parameter Store、CloudFormation、API Gateway、Lambdaです。どのサービスも対応範囲を絞っています。たとえばLambdaは同期実行のみで、関数から任意の外部ネットワークへ通信できません。関数内でS3やSSMを操作するSDKも、シミュレーターが対応する範囲だけを扱います。

各サービスの対応操作と制限は[README](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/README.md)にまとめています。

## 個別に作れたものをCloudFormationでつなぐ

今回までに、IAMロールの作成、Python Lambdaの実行、API GatewayのREST APIが入りました。

- [PR #36](https://github.com/susumutomita/TenkaCloudSimulator/pull/36): IAMロールとLambda向けの信頼ポリシー
- [PR #45](https://github.com/susumutomita/TenkaCloudSimulator/pull/45): REST APIとLambda proxyの実行
- [PR #303](https://github.com/susumutomita/TenkaCloudSimulator/pull/303): CloudFormationによるREST APIとLambdaの構築

#303では、これらを1つのテンプレートから作れるようにしました。[サンプルテンプレート](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/examples/cloudformation-rest-lambda.json)には、次のリソースが入っています。

- SSMパラメーター
- インラインポリシーを持つIAMロール
- PythonのLambda関数
- REST APIとリソース、メソッド
- デプロイメントとステージ
- API GatewayからLambdaを呼ぶためのPermission

この例では、APIへのリクエストをLambdaに渡し、LambdaがSSMの値を読み取って返します。それぞれのサービスが保存している状態を使って処理をつなぎます。

## 読めるパラメーターと、読めないパラメーターを試す

サンプルのLambdaが読めるSSMパラメーターは、`/cfn-rest/public`です。実行ロールのポリシーで、このパラメーターに対する`ssm:GetParameter`だけを許可しています。

スタックを作成すると、Outputsに`LocalPath`が返ります。これは認証が必要なシミュレーター内のパスです。実AWSの公開URLは作りません。

このパスは`/config`で終わります。ローカルのエンドポイントにこのパスを付けて呼ぶと、Lambdaが保存済みのSSM値を読みます。一方、クエリに`?name=/private/dummy`を付けると、関数は権限不足で403を返します。

ただし、このサンプル関数はSDKの`ClientError`をすべて403へ変換しています。403だけでは原因を区別できません。[E2Eテスト](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/test/e2e/cloudformation_rest.py)は、応答本文の`code`も調べ、`AccessDeniedException`と一致するか確認しています。

同じ関数でも、読もうとするリソースによって結果が変わります。APIが呼べることに加えて、Lambdaの実行ロールで何を許可したのかを確かめられる例です。

応答はブラウザーで実行しないダウンロード形式です。現時点では、ここにWebアプリケーションを載せて公開するところまでは対応していません。

作成から呼び出し、削除までの手順は[CloudFormation REST API → Lambdaの実行例](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md)にあります。SDKから接続するときは、ローカルのエンドポイントとダミーの認証情報を明示し、`X-Simulator-Token`を付けます。実AWSの認証情報は使いません。

## 作成と削除でも状態を確認する

CloudFormationでは、リソース同士の依存関係を扱う必要があります。APIのメソッドを用意してからデプロイメントを作る、といった順序です。サンプルでは、Deploymentの`DependsOn`にMethodを指定しています。

今回の実装では、作成を1つのトランザクションで扱い、削除は依存関係の逆順で進めます。未対応のプロパティが書かれていた場合は、エラーにします。

削除時には、CloudFormationが作ったリソースの状態も確認します。作成後に別の操作で変更されたAPIのリソースや、所有していないリソースがあれば、そのまま削除を進めません。Lambdaのポリシーへ後から追加された別のステートメントも、スタックの削除時は保持します。

これらの動作と制約は、[対応範囲の説明](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md#supported-resources-and-boundaries)を参照してください。作れたことだけでなく、どの状態なら片付けられるかも確認するためです。

## 検証では2つのチーム環境を使う

リポジトリの[検証記録](https://github.com/susumutomita/TenkaCloudSimulator/blob/55a111953eb3eb0dfd90aaa473ac3fe39cb10b66/docs/cloudformation-rest.md#verification)とE2Eテストには、実際のバイナリとSDKを使う次の流れが含まれています。

1. CloudFormationでスタックを作る
2. 作成されたAPIとLambdaの権限を確認する
3. ローカルHTTP経由でLambdaを実行する
4. SSMへのアクセスが許可・拒否されることを確認する
5. スタックを削除し、関連リソースが片付くことを確認する

このE2Eには、別チームのトークンを拒否すること、プロセスを再起動しても状態が残ること、無関係なSSMパラメーターを削除しないことも含まれています。

執筆時には対象コミットの[CI成功](https://github.com/susumutomita/TenkaCloudSimulator/actions/runs/41822746313)を確認し、テストコードとテンプレートを読み合わせました。この記事のためにSimulatorのE2Eを手元で再実行したわけではありません。

チームを分けるときは、チームごとにプロセス、SQLite、トークンを分けます。IAMのidentityを切り替えるだけでは参加者の環境を分離できません。

## まだ対応していないこと

CloudFormationの対応は、CreateStack、DescribeStacks、DeleteStackを中心とした限定的なものです。UpdateStackやchange setsには対応していません。API GatewayもRegional RESTの一部で、v2やauthorizer、WAFは未対応です。

IAMには、今の実装で注意が必要な違いも残っています。CloudFormationで作ったロールは従来の保存モデルを使っており、新しいnative IAMのGetRoleやListRoles、ロール選択画面には出てきません。API Gateway、Lambda、SSMの状態は各サービスの画面と共有していますが、IAMの表示はまだそろっていません。

また、CloudFormationで作ったロールの信頼ポリシーはメタデータとして保持され、認可には使われません。native IAMロールの信頼ポリシー検証とは異なります。`CAPABILITY_IAM`の指定も、ロール作成への同意を表すだけで権限を付与しません。呼び出す側には、CloudFormationと各リソースの操作権限が必要です。

このREST APIのサンプルは学習用の実行例です。TenkaCloudの完成した競技問題として採点までつながったものではありません。通常のTenkaCloud起動への自動統合もまだです。READMEで実採点まで検証済みとしているのは、別のhello-worldの接続です。

## おわりに

今回、REST APIからLambdaを呼び、実行ロールの権限でSSMを読む流れを、CloudFormationから作成・削除できるようになりました。

次に残るのは、IAMの保存モデルと画面の違いを整理することや、TenkaCloudの問題環境としてどこまで使えるかを確認することです。サービスの対応範囲と、競技として動作を確認できた範囲を分けながら、開発状況を記録していきます。
