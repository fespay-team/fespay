# 試験資料

[受入管理表](acceptance-status.md)にAT-001～070を登録しています。全条件の受入判定は全70件とも未実施で、担当窓口はnatuki53。基盤/認証の部分検証が実施済みでもAT一式の合格とは区別します。合格条件の正本は[現行要件書付録A](../requirements/event_payment_requirements.md)。

| 証跡 | 対象・範囲 |
| --- | --- |
| [開発基盤](development-foundation.md) | PR #15時点の基盤・内部認証・開発migration・CI。検証時の件数を保持 |
| [本人セッション](auth-session-adapter.md) | PR #19、CSRF/Origin/本人分離/失効/期限/監査Tx。認証全体は未完了 |
| [認証手段一覧](auth-identity-list.md) | PR #23、公開UUID/本人分離/旧DBからの補完。実Googleの合格を含まない |

現在の通常8件・DB統合34件、実応答83件のOpenAPI照合と、設計のschema378件/wire69件/DB制約104件を、それぞれの対象範囲で参照します。ATの全条件・実ブラウザー・実機・負荷・復旧・公開条件の達成へ読み替えません。

実行後は[試験報告テンプレート](../templates/test-report.md)を使い、reports/YYYY-MM-DD-topic.mdへ条件・対象commit・実結果を記録します。未実施/合格/不合格/ブロックを区別し、再試験で過去の不合格を消しません。自動試験はapps/api/testと設計検証器にあり、横断E2E/負荷/障害は未実装。現在の残件は[採択・進捗記録](../project/design-status.md)。
