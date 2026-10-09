# API・DB設計の接点

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / API：natuki53、DB：チームメンバー（未確認） / FE・BE・DB担当（未割当） |
| 更新日 | 2026-10-09 |
| 要件 / 受入試験 | API-01～05、DAT-01～03、LED-01～06、WAL-01～03、TX-01～06、INV-01～05、REF-01～04、EXP-01～03、ROL-03/06 / AT-010、021～024、026～028、035～038、042～058 |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / [ADR-0002](../../adr/0002-refund-api-workflows.md)、[ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)（提案） |

API担当はHTTP入力/応答/権限/エラー/再送を定義し、DB担当は[DB・台帳設計](../database/README.md)で物理型・制約・索引・マイグレーションを具体化する。HTTP DTOをテーブルの直接公開にしない。以下はAPIが必要とする論理条件であり、DDLやDB内部の名称を指定するものではない。

## 正本・一意性・型

| 接点 | APIに必要な条件 | DB担当と合わせる点 |
| --- | --- | --- |
| IDと親子 | UUID提案。event/shop/accountと対象を毎回確認 | 公開ID/内部ID、複合所属制約、削除/アーカイブ |
| 参加・wallet | account/event一意。3区分を同じ正本から取得 | 参加/残高0作成の同一Tx、退出後の履歴資格 |
| 金額・版 | 取引/残高30桁の10進文字列、版は正整数文字列 | 精密整数型・境界/桁あふれ、集計は無制限桁/符号付き、JSON変換 |
| Transaction | 成立のみSUCCEEDED、返金/訂正/拘束は別種別 | OpenAPI enumと勘定/物理enumのマッピング、原取引不変 |
| EVENTキー | actor/event/operation/key、元効果と内容hash | 一意制約・結果/取引/Outbox同一Tx、7年保持、現在認可で返す |
| GLOBALキー | actor/GLOBAL/operation/key | 既存event NOT NULL案との分離方法。イベント作成/サービス/公開ゲートの結果参照 |
| 最終拒否 | 永続拒否のみREJECTED。未検出はUNKNOWN | 処理中/未成立の排他確認・拒否永続化。遅延要求の再実行を防止 |
| 秘密 | QR/招待/OAuth/確認token単回ハッシュ、通常ログ/CSV/結果に生値なし | 用途・主体・期限・消費の一意性、発行時以外の再表示を禁止 |
| Cookie/MFA | 通常sessionと業務/特権MFA時刻を分離 | Better Auth adapter・失効・TOTP再利用防止/試行数/回復コード消費 |
| 認可解除 | 新規確定と同じTxで現在grant/停止を再確認 | 認可対象と金銭/在庫行の共通ロック順、解除競合の直列化 |
| 履歴 | 本人は譲渡受取も含む当事者、業務は現在scope | actorだけで絞らない、shop/eventフィルター、時刻+ID索引/カーソル |

## 領域をまたぐ確定

| 領域 | 必要な不変条件 |
| --- | --- |
| A/B/C支払要求 | 1要求に本人関連付け1回。B本人/event承認待ち1件。表示QR期限と180s要求期限を分離 |
| 決済/注文 | Q02/O01の共通finalizePayment。1 payment_requestにつき1 Transaction/必要Order。別operation/キーでも重複不可 |
| 全明細予約 | product_id順の排他、全件成功か全件未予約。on_hand/reserved非負32bit、reserved<=on_hand |
| 予約の期限 | ロック取得後の実時刻で判断、消費/解放の片方だけ。5s解放workerと確定APIを直列化 |
| cart | 保存だけで予約なし。本人/event/shop確認中1件。期限切れ要求とcart再確認状態を連動 |
| チャージ | 1準備1成立。現金確認後だけ同額付与。準備版/額/担当、受領済未成立→返却記録の履歴 |
| 譲渡 | 両wallet全額同時更新、1 recipient tokenに1譲渡、同event/有効本人。送信者単独取消なし |
| 現金払戻し | PREPARED未拘束→本人承認HELD→交付。AVAILABLE/REFUND_ONLYを合わせ未完了1件、取消は元区分に返す |
| 調査/訂正 | 案件resolveは事実/証跡のみ。後続commandが同じ原処理/解決caseを参照。元PAID誤記録訂正は全額1回 |
| 購入返金 | REQUESTEDを先に永続保存。executeで元決済額/数量−成立累計を再計算、元本人/元event/元shopへだけ戻す |
| 再販在庫戻し | refund_lineの成立数量−復元済数量以内、元product一致、再販可能確認/理由。累計/在庫移動同じTx |
| Order | 支払PAID/提供/返金を独立。注文番号はevent/shop一意。固定商品版・名・価格/数量を保存 |
| 受取 | QR/code単回消費とPICKED_UP同一Tx。5失敗/注文/10minの保留は再発行だけで解除しない |
| 全取消 | 本人申出と店舗決定を分離。全額返金成立/調査への対応、調査後同じ返金で完了 |
| 失効 | wallet/条件版/期限の自然一意。AVAILABLE対象だけ、拘束/返金専用/紛争保全を除外。遅延中も利用期限を検証 |
| 金銭/在庫成功応答 | wallet/取引/売上/注文/在庫/台帳/監査/OutboxがCOMMIT済み。外部配送失敗で巻戻さない |

## 管理・集計・保管

| 接点 | 確認する条件 |
| --- | --- |
| 条件版 | 初回チャージに参照する永久履歴。初回後の不利益変更を拒否、通常/精算専用受付を別保持 |
| 公開連絡先 | ログインidentityと別の用途で所有確認。申込本人とCONTACT_EMAIL tokenを束縛 |
| 招待/管理者交代 | 受諾時にissuer現権限再確認。受諾済みgrantは元issuerと独立、解除時未受諾だけ失効 |
| owner交代 | 未受諾proposalと受諾確定を分離、owner1人。指定新ownerはmembershipなしで受諾可 |
| 緊急停止 | SERVICE/EVENT/SHOP独立、未成立要求/予約を取消、既成立照会・安全な受渡しを維持 |
| 現金scope | EVENT総額と担当OPERATOR集計を重複加算しない。釣銭/投入/引出はwalletチャージと別 |
| 実査cutoff | 実査時刻に対応した正本snapshotと現金記録。差異は調査へ、入力された理論額を信用しない |
| report/CSV | 同一snapshot・不変条件・分割連続性。10万行/part、本人生成中2件、完了から24hでファイル削除 |
| CSV配信 | creator AND現在scope/dataset grant。毎回認可、秘密/連絡先/他店を列へ含めない |
| Outbox/SSE | UUIDを順序とみなさない。配送前後/重複/再開保持、送信前に現在認可。保証不能はresync |
| 完了/削除 | 全残高/拘束/未決cash/refund/order/失効/差異を再照合。取引親のcascade delete不可 |
| 退会/復元 | 30日後の個人情報分離と取引7年保持を分け、復元後に削除/失効を再適用 |

## 次のレビューと実証

OpenAPIの型・enum・自然一意と物理モデルを合わせ、GLOBAL結果保持、cash operationの公開ID共通namespace、CSV snapshot/cutoff、紛争保全額、失効workerの承認/起動認証、Outbox再開位置を重点レビューする。公開API案が揃ったことを、これらのDB実装や承認の完了とは扱わない。

実装後は、同口座二重決済、Q02/O01の異経路同時確定、grant解除との競合、予約解放/確定、コミット直後切断、返金累計/二重在庫戻し、現金未成立の返却、失効の再実行を実DBで確認する。API・DB・FEの各担当が決定を自身の正本へ反映し、PR/ADRへ承認を記録する。

承認者・日付・PR：未記入。DDL変更・実DB試験：未実施。
