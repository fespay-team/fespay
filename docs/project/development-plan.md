# 設計採択後の開発計画

更新日：2026-10-14。ユーザー指定によりFE・BE・DB・運用・準備はnatuki53が兼任する。作者以外のレビューはdevelopersチームへ依頼する。

## 採択記録

| 対象 | 承認 | mainへの反映 |
| --- | --- | --- |
| API / ADR-0002～0004 | marron46、2026-10-13、52ef2d4 | [PR #8](https://github.com/fespay-team/fespay/pull/8)、120efcdc652d687534d2ced955625d6ac39147ee |
| DB / 台帳 / 保存モデル | marron46・popoten0630-dev、2026-10-13、8fe36cc | [PR #9](https://github.com/fespay-team/fespay/pull/9)、9d54a2bba1f2896a492dc7374ecc64e58d232db4 |

GitHubアカウントからFE/BEの役割を推定しない。設計採択、実装準備案、実装受入合格を区別する。OpenAPIの0.4.0-draftは採択した原文の版名として保持する。

## タスクと担当

| Issue | 完了条件 | 担当 |
| --- | --- | --- |
| [#11 開発基盤](https://github.com/fespay-team/fespay/issues/11) | 承認記録同期、固定workspace、起動/型/build、開発migration、認証の隔離DB検証、CI、PRレビュー | natuki53 |
| [#12 担当・未決割当](https://github.com/fespay-team/fespay/issues/12) | FE/BE/DB個人割当、相互レビュー、U-01～U-20の責任者・期限・依存 | natuki53（兼任）、[決定管理表](../team/decisions.md) |
| [#13 認証統合](https://github.com/fespay-team/fespay/issues/13) | /v1/authアダプター、業務MFA/CSRF/Origin、実メール/Google、因子/退会・失効の受入検証 | natuki53（BE-2 / FE-1 / DB兼任） |
| [#14 業務・worker](https://github.com/fespay-team/fespay/issues/14) | 金銭・注文・在庫の小さな実装PR、並行/再送/切断、CSV/SSE、移行/性能/復旧 | natuki53（BE / FE / DB兼任） |

未決事項を設計採択だけで消さない。U-03の公開契約、U-04/U-18/U-20の保存モデル/制約は採択済み。UUID生成方式・分離レベル/負荷・現金運用・worker保持値・クラウド/鍵・実機・法務/公開条件は責任者の決定・実証を残す。#12で実装着手前に割り当てる。基盤の準備案は[ADR-0005](../adr/0005-development-foundation.md)。

## 着手順

1. #11をレビューし、各OSで起動・検証できる基盤を共有する。
2. #12で担当・期限を決め、#13の認証アダプターを先行する。
3. #14をチャージ、決済、譲渡、払戻し/返金、訂正、注文/在庫、配信へ分割する。台帳・残高・監査・Outboxを同一Txへ含める。
4. 運用migration昇格、復旧/性能/実機・公開gateを実施する。

DB制約104件、API契約378件/参照69件の検証をAT-001～070の実装受入へ読み替えない。運用DBや実金銭公開は今回の準備対象外。

2026-10-14、[PR #15](https://github.com/fespay-team/fespay/pull/15)をKawataKenshirouの最終head承認後にマージし、Issue #11を完了。認証の最初の実装単位は[Issue #16](https://github.com/fespay-team/fespay/issues/16)。親#13/#14は残る全条件が揃うまでOPENとし、子Issueの部分完了だけで閉じない。
