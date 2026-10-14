# 担当・レビュー分担

更新日：2026-10-14。[Issue #12](https://github.com/fespay-team/fespay/issues/12) / PR #17のnatuki53兼任は準備時点の記録。後続のユーザー指定により実装をFE/BEへ分担し、BE-1（金銭/台帳）はmarron46、BE-2（認証/認可）はyamadahanako2へ変更した。[担当変更の記録 #36](https://github.com/fespay-team/fespay/issues/36)と各実装Issueを参照する。

| 枠 | 主担当の範囲 | GitHubアカウント | レビュー窓口 |
| --- | --- | --- | --- |
| FE-1 | 認証・参加・残高・利用者QR・譲渡・モバイル注文 | popoten0630-dev | KawataKenshirou（FE相互レビュー） |
| FE-2 | 主催者・受付・レジ・商品・在庫・注文・集計 | KawataKenshirou | popoten0630-dev（FE相互レビュー） |
| BE-1 | 台帳・チャージ・決済・譲渡・払戻し・返金・照合 | marron46 | yamadahanako2（作者以外のBEレビュー） |
| BE-2 | 認証認可・イベント・招待・商品在庫・注文・CSV | yamadahanako2 | marron46（作者以外のBEレビュー。利用するFEとの契約影響も確認） |
| DB | 物理モデル・制約・排他・migration・照合/復旧検証 | natuki53 | marron46またはyamadahanako2（作者以外、DB/排他確認） |
| 運用 | 環境/鍵・監視・復旧・費用・終了後窓口・公開判定の記録 | natuki53 | developersの作者以外。外部/イベント主催者との合意は証跡で確認 |
| 総合 | 要件・API契約・CI・進行・公開条件・発表 | natuki53 | developersの作者以外 |

同一人物の担当枠同士の確認を作者以外のレビューへ読み替えない。個別PRのレビュー者はdevelopersチームから選び、実際の承認者/対象headをGitHubに記録する。mainの承認条件と最終push者以外の承認を維持する。

未決事項の決定窓口・期限・依存は[決定管理表](decisions.md)。natuki53は開発・運用・公開判定の窓口を兼任するが、法令判断の専門家や個々のイベント主催者の代わりに外部確認を完了扱いにしない。担当が決まったことと、公開gateが完了したことは別である。

[開発計画](../project/development-plan.md)、[GitHub設定](github-setup.md)を参照する。

AT-001～070の受入管理窓口はnatuki53として[受入管理表](../testing/acceptance-status.md)へ記録する。実装・担当領域の試験は各Issueの担当者が進める。作者外レビューと受入の全条件の合格は担当割当とは別に確認する。

## 現在の実装Issue

| 担当 | Issue / 最初の着手範囲 |
| --- | --- |
| popoten0630-dev | [#28 認証画面](https://github.com/fespay-team/fespay/issues/28)、[#29 参加者画面](https://github.com/fespay-team/fespay/issues/29)。認証画面基盤と登録フォームから |
| KawataKenshirou | [#30 管理画面](https://github.com/fespay-team/fespay/issues/30)。ナビゲーション・イベント/店舗選択と主催者ホーム/設定から |
| marron46 | [#14 台帳・金銭・共通Tx](https://github.com/fespay-team/fespay/issues/14)。共通Txとチャージの縦断実装から |
| yamadahanako2 | [#13 認証](https://github.com/fespay-team/fespay/issues/13)、[#31 イベント・権限](https://github.com/fespay-team/fespay/issues/31)、[#32 商品・注文・CSV](https://github.com/fespay-team/fespay/issues/32)。公開メール登録と業務accountの原子的な作成/関連付けから |

期限は各Issueで未設定。金銭確定と在庫/注文は両BEが同一Tx境界で統合する。担当変更は過去PRの作者・承認者や完了記録を変更するものではない。
