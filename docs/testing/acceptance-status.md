# 受入試験の管理表

現行対象：EPP-REQ-001 v0.2、付録A。これは進捗表です。合格条件は[現行要件書](../requirements/event_payment_requirements.md)を参照してください。
[CR-0001](../requirements/changes.md)で承認された期限・自動更新・安全な再試行条件は、AT-025、AT-031、AT-032、AT-039、AT-050、AT-068で確認します。
要件ID欄の `/` による省略表記は現行要件書付録Aの表記を保持しています。

全70件はATの全条件を満たした受入判定が未実施。管理・実施窓口はnatuki53（PR #17の全担当枠を兼任）です。行の担当は受入合格や作者以外のレビューの代用ではありません。
共通設計書は[EPP-DES-001](../design/basic-design.md)。[Issue #2](https://github.com/fespay-team/fespay/issues/2)は基本設計導入の完了済み履歴で、実装/受入の残件は認証の[Issue #13](https://github.com/fespay-team/fespay/issues/13)と業務/運用の[Issue #14](https://github.com/fespay-team/fespay/issues/14)で管理します。各行の欄に追加記載がある場合は、その個別の設計書・Issueも併せて参照します。#14は業務/運用の実装計画の参照先で、イベント/権限などの領域別Issueは着手時に分割して追加します。
詳細な実装・競合試験の計画は[EPP-DES-002](../design/detailed-design.md)を参照し、レビュー指摘の具体的な検証条件は同書20.1に記載します。試験状態は未実施のままです。報告欄の「部分検証」は基盤/認証の実装に対する限定的な証跡であり、そのATの全条件・実画面・外部連携・運用の合格を示しません。

| 試験ID | 対象要件（現行要件書表記） | 状態 | 担当 | 追加の設計書 / Issue（共通対応は上記） | 試験報告 / 証跡 |
| --- | --- | --- | --- | --- | --- |
| AT-001 | ACC-01 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | — |
| AT-002 | ACC-02 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | — |
| AT-003 | ACC-03/04 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-identity-list.md)（全条件未完了） |
| AT-004 | ACC-05 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-session-adapter.md)（全条件未完了） |
| AT-005 | ACC-01/06 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | — |
| AT-006 | SEC-01/03 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-session-adapter.md)（全条件未完了） |
| AT-007 | SEC-02 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-session-adapter.md)（全条件未完了） |
| AT-008 | JOIN-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-009 | JOIN-02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-010 | ROL-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-011 | STF-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-012 | STF-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-013 | STF-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-014 | STF-01/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-015 | STF-02/03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-016 | STF-02/ROL-06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-017 | EVT-02/03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-018 | EVT-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-019 | EVT-04/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-020 | CFG-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-021 | CFG-03/04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-022 | MNY-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-023 | MNY-02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-024 | MNY-02/WAL-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-025 | CHG-01/02 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-026 | CHG-02/TX-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-027 | CHG-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-028 | CHG-05/06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-029 | PAY-B01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-030 | PAY-B03/04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-031 | PAY-B02/03/06/QR-01 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-032 | PAY-A01/02 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-033 | PAY-C01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-034 | TX-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-035 | TX-04/WAL-02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-036 | TX-04/06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-037 | TX-05/NET-02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-038 | TX-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-039 | TRF-01/02/03 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-040 | TRF-01/06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-041 | TRF-04/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-042 | CSH-01/04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-043 | CSH-02/03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-044 | CSH-04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-045 | REF-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-046 | REF-02/04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-047 | REF-03/EXP-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-048 | EXP-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-049 | INV-01/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-050 | INV-01/02 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-051 | INV-04/PRD-02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-052 | ORD-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-053 | ORD-04/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-054 | EVT-06/ORD-06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-055 | LED-01/05/RPT-01 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-056 | RPT-02/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-057 | RPT-03/04 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-058 | DAT-01/ROL-03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-059 | SEC-07/10 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-session-adapter.md)（全条件未完了） |
| AT-060 | SEC-08/PERF-11 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-061 | SEC-09 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-062 | PWA-01/02 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-063 | PRV-03/05 | 未実施 | natuki53 | [Issue #13](https://github.com/fespay-team/fespay/issues/13) | [部分検証](auth-session-adapter.md)（全条件未完了） |
| AT-064 | OPS-02/03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-065 | OPS-04/05 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-066 | PERF-01/08 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-067 | PERF-04/07 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-068 | UI-01/03/04/NET-03 | 未実施 | natuki53 | [Issue #4](https://github.com/fespay-team/fespay/issues/4)（CR履歴） / [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-069 | OPS-01/LED-06 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
| AT-070 | REL-01/03 | 未実施 | natuki53 | [Issue #14](https://github.com/fespay-team/fespay/issues/14) | — |
