#!/usr/bin/env python3
"""Apply deterministic prose fixes to the cloud-competition draft.

This helper is temporary and exists only to apply textlint's safe autofixes plus
manual rewrites inside GitHub Actions, where the full dependency set is available.
"""

from pathlib import Path

ROOT = Path("books/cloud-competition")


for path in ROOT.glob("chapter*.md"):
    content = path.read_text(encoding="utf-8")
    content = content.replace("SSMセッションManager", "`SSM Session Manager`")
    content = content.replace("SSM セッション Manager", "`SSM Session Manager`")
    content = content.replace("browserセッション", "ブラウザーセッション")
    path.write_text(content, encoding="utf-8")


REPLACEMENTS: dict[str, list[tuple[str, str]]] = {
    "chapter1.md": [
        (
            "AWSの障害対応やセキュリティを学ぶとき、説明を読んだだけでは分かった気になりやすいものです。実際の環境では、症状から原因を絞り込み、権限や設定を確認し、復旧し、再発防止まで考える必要があります。",
            "AWSの障害対応やセキュリティは、説明を読んだだけでは身につきません。実際の環境では、症状から原因を絞り込みます。その後、権限や設定を確認して復旧し、再発防止まで考える必要があります。",
        ),
        (
            "境界は厳密ではありません。よい競技は、CTFの発見する楽しさ、障害訓練の現実性、ハンズオンの学びやすさを組み合わせます。",
            "境界は厳密ではありません。良質な競技では、CTFにある発見の楽しさ、障害訓練の現実性、ハンズオンの学びやすさを組み合わせます。",
        ),
        (
            "問題を追加するとき、原則としてTenkaCloud本体は変更しません。問題は`metadata.json`と`template.yaml`、必要に応じて`portal/`や`services/`を持つプラグインとして作ります。",
            "問題を追加するとき、原則としてTenkaCloud本体は変更しません。カタログ表示とCloudFormationだけで成立する問題は、`metadata.json`と`template.yaml`で構成します。問題固有のUIまたは実装が必要な場合に限り、`portal/`や`services/`を追加します。",
        ),
    ],
    "chapter2.md": [
        ("- EC2へ接続するにはSSH鍵が必要だと思う", "- EC2への接続にはSSH鍵が必須だと誤認する"),
        ("- 一度HTTP 200が返れば競技終了だと思う", "- 一度HTTP 200が返れば競技終了だと誤認する"),
    ],
    "chapter3.md": [
        (
            "問題環境は、作るより消す方が難しいことがあります。参加者にトップレベルリソースを新規作成させると、CloudFormation stackを削除しても残ります。",
            "問題環境では、作成より削除が難しくなることがあります。参加者がトップレベルリソースを新規作成すると、CloudFormation stackを削除してもそのリソースは残ります。",
        ),
        ("3. データ保存は競技中に必要な最小量にする", "3. 保存データは競技中に必要な最小量へ絞る"),
    ],
    "chapter6.md": [
        ("IDは内部参照に使われるため、表示名のように頻繁に変えません。", "IDは内部参照で使うため、表示名ほど頻繁に変更しません。"),
    ],
    "chapter7.md": [
        ("`flagOutputKey`は、`template.yaml`のOutput名と完全に一致させます。", "`flagOutputKey`は、`template.yaml`のOutput名と一致させます。"),
        (
            "ランダムであることと、秘密であることは同じではありません。権限、表示、ログを含む経路全体を確認します。",
            "ランダム値でも、秘密が保たれるとは限りません。権限、表示、ログを含む経路全体を確認します。",
        ),
    ],
    "chapter8.md": [
        (
            "> 接続後、`systemctl --failed`と`systemctl status nginx`でサービス状態を確認してください。必要に応じて`journalctl -u nginx`でログを確認します。",
            "> 接続後、`systemctl --failed`と`systemctl status nginx`でサービス状態を確認してください。状態が`failed`または`inactive`なら、`journalctl -u nginx`で直近のログを確認します。",
        ),
    ],
    "chapter9.md": [
        (
            "完成の基準は、別のAWS環境へデプロイし、参加者権限で解き、採点され、最後に削除できることです。本章では、検証を層に分けて行います。",
            "完成の基準は、別のAWS環境へデプロイできることです。さらに、参加者権限で解答と採点を確認し、最後に環境を削除できなければなりません。本章では検証を層に分けます。",
        ),
        (
            "最後に、問題の実装を使うべきではない言葉なので修正してください人へ解いてもらいます。",
            "最後に、問題の実装内容を事前に共有していない人へ解いてもらいます。",
        ),
    ],
    "chapter10.md": [
        (
            "frontendとAPIのうち、正常なendpointごとに評価したい場合に向きます。部分復旧を点数へ反映できます。",
            "frontendとAPIを個別に評価したい場合に向きます。部分復旧を点数へ反映できます。",
        ),
    ],
    "chapter11.md": [
        (
            "フェーズの切り替えは、問題文または公開hintで予告する方がよい場合があります。参加者が「採点が壊れた」と誤解する変化は、競技ではなく運営不具合に見えます。",
            "採点条件が切り替わるフェーズでは、問題文または公開hintで変更時刻と新しい条件を予告します。予告がない変化は、参加者から採点障害に見えるためです。",
        ),
        (
            "- `team-score-above`: 一定得点へ到達したチームへ起こす",
            "- `team-score-above`: チームが一定得点に到達した時点で起こす",
        ),
    ],
    "chapter12.md": [
        ("- 参加者が登録すべきendpointが多い", "- 登録対象のendpoint数が多い"),
        (
            "ただし、AWS Consoleやターミナル操作までスマートフォンへ最適化することを本章の目的にはしません。Portalは状況把握と導線、実作業は適切な開発環境という役割分担で構いません。",
            "ただし、本章ではAWS Consoleやターミナル操作までスマートフォンへ最適化しません。Portalは状況把握と導線に使い、AWSの実作業はPCのConsoleまたはターミナルで行います。",
        ),
    ],
    "chapter13.md": [
        (
            "TenkaCloudの推奨運用は、常設SaaSとして無期限に置くことではなく、**イベント単位で環境を作り、開催し、削除する**形です。競技で使うcommitを固定し、リハーサルと本番で同じ構成を再現します。",
            "TenkaCloudでは、常設SaaSとして無期限に置く運用を前提にしません。**イベント単位で環境を作り、開催後に削除する**形を推奨します。競技で使うcommitを固定し、リハーサルと本番で同じ構成を再現します。",
        ),
    ],
    "chapter15.md": [
        (
            "問題の実装を使うべきではない言葉なので修正してください人が解きます。作者は正解を説明せず、詰まりと時間を記録します。",
            "問題の実装内容を事前に共有していない人が解きます。作者は正解を説明せず、詰まりと時間を記録します。",
        ),
        (
            "特に社内研修では、scoreを人事評価へ直結させると情報共有が減り、学習より防御的行動が増える可能性があります。目的に応じて扱います。",
            "社内研修でscoreを人事評価へ直結させると、参加者間の情報共有が減る可能性があります。また、学習より防御的な行動を選びやすくなります。開催目的に合わせてscoreの用途を決めます。",
        ),
    ],
    "chapter16.md": [
        (
            "古いlauncherが`destroy-all`を使うべきではない言葉なので修正してください場合、未知のACTIONを通常deployとして扱う可能性があります。利用中のlauncherとtemplateのversionを確認し、必要なら最新templateへ更新してから実行します。",
            "古いlauncherが`destroy-all`に対応していない場合、未知のACTIONを通常deployとして扱う可能性があります。利用中のlauncherとtemplateのversionを確認し、必要なら最新templateへ更新してから実行します。",
        ),
    ],
}


for filename, replacements in REPLACEMENTS.items():
    path = ROOT / filename
    content = path.read_text(encoding="utf-8")
    for before, after in replacements:
        content = content.replace(before, after)
    path.write_text(content, encoding="utf-8")
