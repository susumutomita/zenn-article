---
title: "参加者ポータルを競技専用に拡張する"
free: true
---

TenkaCloudのParticipant Portalは、問題文、ヒント、flag提出、endpoint登録、得点などを汎用的に表示します。多くの問題は、この機能だけで成立します。

専用UIは見栄えをよくするために追加するのではありません。汎用UIでは表現できず、参加者の判断に必要な情報がある場合にだけ追加します。

## 最初は専用UIを作らない

Cloud Rescueの最小版に必要なのは次です。

- 問題文
- Stack Outputへの導線
- frontendとAPIのendpoint登録
- 現在の採点結果
- ヒント

これらは汎用Portalで扱えるため、初版では`portal/`を作りません。

専用UIを先に作ると、次の保守対象が増えます。

- React component
- metadataとのslot参照
- API responseの型
- 多言語表示
- レスポンシブ対応
- 問題の秘密情報がbundleへ入っていないかの確認

学習効果が変わらないUIは追加しない方が堅牢です。

## 専用UIが必要になる例

次のような場合は検討します。

- 複数フェーズの現在位置を視覚化したい
- 問題固有の状態を複数まとめて表示したい
- 時系列ログや攻撃回数を見せたい
- 参加者が登録すべきendpointが多い
- 競技中に利用する操作パネルが必要

一方、AWS Consoleで見つけるべき情報をPortalへコピーすると、探索を奪います。UIに出すべきなのは答えではなく、競技を進めるための状態です。

## plugin slotの考え方

問題固有UIは、問題ディレクトリの`portal/<slot>.tsx`へ置き、`metadata.json`の`dashboard.slots`から参照します。

```text
battles/cloud-rescue-battle/
├── metadata.json
├── template.yaml
└── portal/
    └── status.tsx
```

slot名、componentのprops、利用可能なruntime APIはTenkaCloudのバージョンに依存します。実装時は、現在の`SCHEMA.json`と既存問題の`portal/`を複製し、型を推測して書かないようにします。

## UIへ出してよい情報

Cloud Rescueで表示するなら、次のような情報です。

- frontendの最終probe結果
- APIの最終probe結果
- 最終確認時刻
- 現在のフェーズ
- 公開済みの障害通知
- 残り時間

次は出しません。

- flagの実値
- 正解コマンド
- 管理者credential
- ParticipantViewerRoleの一時credential
- 他チームの非公開状態
- disruptionの未公開予定
- stack内のsecret

フロントエンドへ渡された値は、画面上で隠してもブラウザから読めます。秘密情報は最初から送信しません。

## 観測とネタバレの境界

「nginxが停止している」とPortalへ表示すれば、参加者は調査せず再起動するだけです。

一方、「frontend probe failed」と表示するのは外形監視として自然です。参加者はそこからEC2、nginx、networkを調べます。

UIには症状を出し、原因はAWS環境から調べさせます。

```text
表示してよい: Frontend / failed / HTTP timeout
表示しない: nginx is inactive; run systemctl restart nginx
```

## 操作機能を追加するときの注意

PortalからAWS設定を変更できるボタンを作ると、問題の学習目標を飛ばす可能性があります。

たとえば「nginxを再起動」ボタンは、Linuxサービスの調査を学ぶCloud Rescueには不適切です。一方、運営者用の障害注入ボタンは、競技進行を支えるため合理的です。

UIから操作させる場合は、次を確認します。

- 誰が実行できるか
- 対象teamを間違えないか
- 冪等か
- 監査ログが残るか
- 失敗時に再実行できるか
- revertできるか

## モバイル表示

イベント中、参加者がスマートフォンでスコアやヒントを見ることがあります。専用UIを作るなら、横長tableだけに依存せず、狭い画面でも重要な状態を確認できるようにします。

ただし、AWS Consoleやターミナル操作までスマートフォンへ最適化することを本章の目的にはしません。Portalは状況把握と導線、実作業は適切な開発環境という役割分担で構いません。

## Cloud Rescueでの結論

本書の初版では専用UIを追加しません。汎用Portalで次が確認できれば十分です。

- 2つのendpoint登録
- probeの成功・失敗
- 得点
- ヒント
- 運営からの公開通知

専用UIを作らない判断も、プラットフォーム設計の一部です。

次章では、作成した問題リポジトリを指定してTenkaCloudをAWSへデプロイします。
