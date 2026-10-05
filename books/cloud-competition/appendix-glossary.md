---
title: "付録B｜用語集"
free: true
---

## クラウド競技

参加者がクラウド運用を模した状況で環境を調査、設定、復旧し、その結果を採点する実践型の演習です。

## Challenge

参加者が自分のペースで解く問題形式です。`flag`、`verify`、`multi-verify`などの採点方式があります。

## Battle

複数チームが同時に参加し、endpointや統計の状態を継続的に採点する問題形式です。

## TenkaCloud

イベント、チーム、問題デプロイ、採点、ヒント、Participant Portal、障害注入を管理するOSSです。

## TenkaCloudChallenge

TenkaCloudが読み込む公開問題カタログです。1問を1ディレクトリで管理します。

## Application Admin Console

運営者がイベント、チーム、問題デプロイ、障害を管理する画面です。

## Participant Portal

参加者が問題文、ヒント、提出欄、endpoint登録、得点を確認する画面です。

## ローカル開催とクラウド開催

TenkaCloudの2つの開催方式です。ローカル開催は、1台のPCで1つのBunプロセスと永続SQLiteを使います。クラウド開催は、自分のAWSアカウントでLambdaとCognitoを使い、データをTursoかDynamoDBへ保存します。

## ローカルモード

TenkaCloudの採点API、Participant Portal、Docker問題を手元で動かす構成です。AWSアカウントやAWS認証情報を使いません。

## Problem Pack

公開カタログへ登録せずに、社内向けの問題やイベント後に公開する予定の問題を管理する単位です。クラウド開催は、有効化したAWS/CloudFormationのPackを次のデプロイで読み込みます。ローカル開催はPackを読まず、手元の`problems/`にある問題を使います。

## `metadata.json`

問題の表示、採点、ヒント、endpoint、障害を定義するJSONファイルです。

## `template.yaml`

1チームのAWSアカウントへ作るリソースを定義するCloudFormation templateです。

## `NamePrefix`

同じAWSアカウント内で、チームや問題のリソース名を衝突させないための接頭辞です。

## `ParticipantViewerRole`

参加者が自分の問題環境へアクセスするためのIAM Roleです。名前にViewerとありますが、問題で必要な範囲の操作権限を含む場合があります。

## `ExternalId`

TenkaCloudが競技者アカウントのRoleを引き受けるときに使う追加条件です。意図しない第三者によるRole引受けを防ぎます。

## flag

参加者が発見して提出する値です。本書では`TC{...}`形式を使います。

## discovered flag

暗記や公開情報から推測できず、意図した操作をしたときだけ取得できるflagです。

## endpoint slot

Battleで参加者が登録するURLの入力枠です。採点定義はslot名を使って対象URLを参照します。

## endpoint

TenkaCloudがHTTP要求を送り、サービスの状態を確認するURLです。参加者がParticipant Portalから登録する場合があります。

## `uptime-flat`

登録済みのendpointを定期的に確認し、すべて正常なら加点する継続採点の方式です。

## disruption

運営がBattle中に実行する障害です。実際の処理を`action`へ書き、元へ戻す処理を`revert`へ書きます。

## レッドチーム

Battle中に、問題へ定義済みの障害や攻撃を対象チームへ実行する運営側の役割です。本書のBattleでは、対象チームのnginxを停止します。

## revert

障害を一定時間後に元へ戻す処理です。永続障害を防ぐ安全網になります。

## EC2へのセッション接続

SSH portや秘密鍵を公開せず、IAM権限を使ってEC2へ接続するAWS Systems Managerの機能です。

## competitor bootstrap

TenkaCloudがチームのAWSアカウントへ問題stackをデプロイできるよう、専用IAM Roleを作る初期設定です。

## launcher stack

TenkaCloudをデプロイするCodeBuild projectを作るCloudFormation stackです。TenkaCloud本体とは別です。

## `destroy-all`

TenkaCloudの基盤stackに加えて、stackが所有する保持データと、Tursoを選んだ場合はそのDBの競技データも削除する操作です。通常の`destroy`は、Tursoの競技データを残します。

## `runtime`

ローカル問題をどのDocker Compose fileで起動し、どのURLを参加者と採点へ公開するかを`metadata.json`で定義する項目です。

## `/verify`

ローカル問題が提出内容を判定するloopback APIです。TenkaCloudは正解を保持せず、提出内容をこのAPIへ渡して`correct`の結果を受け取ります。
