---
title: "MynaAgentを作った：マイナンバーカードの年齢証明からJPYC給付まで"
emoji: "🪪"
type: "tech"
topics: [AI, ZK, Solidity, blockchain, マイナンバーカード]
published: false
---

ETHGlobal Tokyo 2026で、MynaWalletの中で動くAIエージェント、MynaAgentを作りました。「受け取れる給付を探して」と頼むと、給付の条件を調べ、本人の同意を得て申請を進めます。

デモで用意したのは、20歳以上を条件とする500 JPYCの給付です。iPhoneにカードをかざして年齢のゼロ知識証明を作り、Polygon Amoy上のコントラクトで検証して給付します。Amoyはテストネットで、JPYCもテストトークンです。

私はZKによる年齢証明、コントラクト、verifierを担当しました。[作品ページ](https://ethglobal.com/showcase/mynaagent-hqgrm)と[公開コード](https://github.com/a42x/ETHGlobalTokyo2026)に、デモと実装をまとめています。

## AIが給付を探し、ウォレットがカードを読む

給付の対象になっていても、制度を知らなかったり申請を忘れたりすると受け取れません。MynaAgentでは、給付を探して申請するところを、ウォレット内のチャットから始められるようにしました。

Claudeは給付の検索、申請作成、証明作成の依頼、証明の提出をツールで進めます。20歳以上という条件は、カードから作った証明で確認します。

利用者が同意すると、給付窓口のWorkerが申請とチャレンジを作ります。MynaWalletが同意画面を出し、利用者はPINを入力してカードをiPhoneにかざします。NFCでカードを読み取り、iPhone上で証明を生成します。

証明はミニアプリが保持してWorkerへ提出します。LLMには証明作成が成功したかどうかを返します。コントラクトへトランザクションを送るのはWorkerのoperator鍵です。LLMには秘密鍵や給付資金を渡しません。

ウォレットとミニアプリのコードは公開リポジトリに含まれていません。端末側の流れは、[公開READMEの構成図とデモ](https://github.com/a42x/ETHGlobalTokyo2026/blob/bc19b4f358fd3027257a3c34fc28446153182d97/README.md#architecture)で確認できます。

## 生年月日を送る代わりに、20歳以上を証明する

年齢証明には、ZeroKeyMateで作っていたNoirの`jpki_age`回路と端末上のproverを使いました。回路は、カードの署名用証明書とそのプロファイル、申請のチャレンジに対する署名、20歳以上という条件を検証します。

給付窓口に送るのは証明と公開入力です。公開入力には申請のハッシュ、nonce、ルート鍵のハッシュ、基準時刻、有効期限を入れます。生年月日やカードの証明書は、給付窓口やオンチェインに渡しません。

カードがログイン中の本人のものかは、別に確認します。同じNFCセッションで作る別のカード署名と署名用証明書をMynaWalletのバックエンドへ送り、JPKIで確認して本人の記録と照合します。このため、証明書が端末内だけに留まる構成ではありません。

## ProveKitでGroth16を使った理由

証明の生成と検証には、World Foundationの[ProveKit](https://github.com/worldfnd/provekit)を使い、バックエンドにはGroth16を選びました。iPhoneで作った証明をSolidityのコントラクトで検証し、同じトランザクションでJPYCを払うところまで、この組み合わせで動かせたからです。

ProveKitには、次の3つの作業を任せています。

1. `prepare`で、Noirの回路をR1CSに変換し、Groth16の証明鍵と検証鍵を作ります。
2. ProveKitのproverをRustのライブラリとしてビルドし、MynaWalletのExpoモジュールから呼んでiPhone上で証明を作ります。
3. `export-solidity`で、検証鍵からSolidityのverifierを生成します。生成したverifierはPolygon Amoyにデプロイしました。

給付1件の`claim()`には669,349 gasかかり、そのうち証明の検証はフォーク上の見積もりで約37万gasです。

使ったのは、Groth16とBSB22コミットメントのSolidity verifierを加える[PR #447](https://github.com/worldfnd/provekit/pull/447)のrevision `dd237e5`です。このPRは執筆時点でもマージされておらず、上流のmainには入っていません。

この版のGroth16は、回路内のチャレンジを作るために、秘密のwitnessに対するPedersenコミットメント（BSB22）を証明に含めます。このコミットメントには乱数のマスクが入っていませんでした。gnarkでは、同じ形のコミットメントからwitnessの値を総当たりで推測できる問題が報告されています（[GHSA-9xcg-3q8v-7fq6](https://github.com/advisories/GHSA-9xcg-3q8v-7fq6)）。

年齢の回路は生年月日を秘密の入力に持つので、ZeroKeyMateでgnarkの修正に倣った[パッチ](https://github.com/susumutomita/ZeroKeyMate/blob/d78122c5f2e2b490356419d054e80ecebbdde74c/patches/provekit-groth16-hiding.patch)を書いて当てました。パッチは、コミットメントの対象に乱数のwireを1本加え、証明を作るたびに新しい乱数を入れます。セットアップでは、このwireの基底がゼロでないことを確かめます。デプロイしたverifierも、このパッチを当てた状態で生成しています。

## WHIRを使わなかった理由

ZeroKeyMateでは、同じ`jpki_age`回路と公開の合成データで、同じrevisionのWHIRとGroth16を比べました。Apple M5のMacでRayonのスレッドを2つに固定し、それぞれ2回ずつ試しています。

| バックエンド | 証明 | 検証 | 証明ファイル |
| --- | --- | --- | --- |
| WHIR | 6.2秒 / 5.8秒 | 0.73秒 / 0.72秒 | 約3.3 MB |
| Groth16 | 10.2秒 / 9.7秒 | 0.18秒 / 0.19秒 | 299 bytes |

証明の時間は、CLIの起動から鍵の読み込み、witnessの計算、ファイルの書き出しまでを含みます。ファイルの大きさはProveKitの圧縮形式のもので、EVMに渡す384 bytesの形式とは別です。

Macの計測ではWHIRのほうが証明は速かったのですが、この版にはWHIRの証明をEVMで検証する手段がありませんでした。EVMで検証するには、WHIRの検証をgnarkの再帰回路で行い、その結果をGroth16の証明に包む必要があります。

`dd237e5`の`generate-gnark-inputs`は動き、`narg_string`と`hints`を含むJSONを出力しました。ただし出力には、Goの再帰verifierが読む`io_pattern`と`transcript`がありませんでした。`transcript_len`やhiding-Spartanの設定、statementの評価値も欠けていました。そのため、ラップした証明は作れず、EVMでのWHIRの検証もしていません。

2026年9月13日に確認した上流のmain（`11fba77`）も、ZookコミットメントとGoのverifierをそろえて更新するまで、gnark向けのexportを受け付けないとしていました。

WHIRの比較は、MacとSimulator上の合成データによるものです。iPhone実機でのWHIRの速さと、実カードのデータでのWHIRのゼロ知識性は確かめていません。比較の手順は[WHIR比較の記録](https://github.com/susumutomita/ZeroKeyMate/blob/d78122c5f2e2b490356419d054e80ecebbdde74c/docs/age-proof-benchmark.md)に、計測値は[issue #54](https://github.com/susumutomita/ZeroKeyMate/issues/54)に残しています。

## 証明を別の給付に使い回せないようにした

年齢証明は、窓口が発行した申請に結び付けています。[BenefitOffice.sol](https://github.com/a42x/ETHGlobalTokyo2026/blob/bc19b4f358fd3027257a3c34fc28446153182d97/contracts/src/BenefitOffice.sol)は、次の値から`claimHash`を計算します。

```solidity
return keccak256(abi.encode(
	block.chainid,
	address(this),
	benefitId,
	recipient,
	benefitAmount[benefitId],
	MIN_AGE
));
```

チェイン、窓口、給付、受取人、金額、年齢条件を含めました。コントラクト自身が登録済みの給付内容から計算するので、申請者が好きなハッシュを渡して給付先や金額を変えることはできません。

[BenefitAgeGate.sol](https://github.com/a42x/ETHGlobalTokyo2026/blob/bc19b4f358fd3027257a3c34fc28446153182d97/contracts/src/BenefitAgeGate.sol)で、このハッシュとnonceが公開入力に一致するか確認します。有効期間は15分です。受け付けるルート鍵とverifierのコードハッシュを確認してから、Groth16の検証を呼びます。

今回の回路で使える年齢条件は20歳以上に固定しています。

## 検証とJPYC送金を同じトランザクションで行う

Workerは`eth_call`で証明を確認し、`claim()`をシミュレーションしてから送信します。給付済み、資金不足、証明の不正などを、送信前に利用者へ返すためです。

コントラクトの`claim()`でも、operatorからの呼び出しか、給付が登録されているか、受取人が受給済みかを確認します。年齢証明を検証して、受給済みフラグを更新し、JPYCを送金します。

送金が失敗すれば全体がrevertします。受給済みフラグだけ更新されて、利用者が受け取れなくなる状態を避けています。

二重給付を防ぐ記録は、`benefitId`とウォレットアドレスの組です。人物単位のnullifierは回路にありません。1人につき1回と扱うには、MynaWalletのカードとウォレットの対応と、バックエンドでの本人確認が必要です。

デモ撮影をやり直すため、ownerが受給済みフラグを消す`resetPaid`も入れています。ownerが再給付を許可できるので、そのまま本番の一度限りの給付に使う機能ではありません。

## 実機で確認したことと、残っていること

現行v2のデモはJPKIテストカードで動かしました。実際のマイナンバーカードによる一連の操作は旧verifierで確認しており、v2での実カード給付は未確認です。テストカードと実カードは、gateが受け付けるルート鍵で分けています。

[測定記録](https://github.com/a42x/ETHGlobalTokyo2026/blob/bc19b4f358fd3027257a3c34fc28446153182d97/README.md)では、iPhone 16 Proで証明生成に約12.4秒かかりました。これは単発の観測です。証明は384 bytesですが、端末へ用意するproving keyは653 MiBあります。公開GIFは1.5倍速で、証明生成の待ち時間も短縮しています。

Groth16のsetupはsingle-partyで、使用したProveKitの実験ブランチも含めて未監査です。証明やオンチェインのgateは証明書の失効を検査せず、MynaWalletのバックエンド側のJPKI確認に依存します。[現在の制約](https://github.com/a42x/ETHGlobalTokyo2026/blob/bc19b4f358fd3027257a3c34fc28446153182d97/README.md#known-limitations)に記載しています。

今回つないだのは、iOSとAmoy上のデモ給付窓口です。地域の給付に使うなら、居住地などの条件も必要になります。実カードでのv2確認とあわせて、今後検討する課題です。
