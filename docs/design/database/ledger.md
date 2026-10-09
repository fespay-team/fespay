# 台帳・残高・排他

状態：DBレビュー案。根拠：LED-01～06、WAL-01～03、TX-01～06、CSH-01～07、REF-03/04、DAT-01、AT-021～024/026～048/055/058。[設計方針](design.md)と[SQL](sql/initial-schema-draft.sql)を併読する。

## 勘定と残高再構築

| account_code | 符号付き累計の意味 |
| --- | --- |
| WALLET_AVAILABLE | walletの通常使用可能額 |
| WALLET_HELD | walletの現金払戻し拘束額 |
| WALLET_REFUND_ONLY | walletの返金専用額 |
| EVENT_CASH | イベントの純受領現金に対応する対向勘定（walletへのチャージ時は負） |
| SHOP_SALES | 店舗の純売上（利用者支払で正、購入返金で負） |
| EXPIRED_VALUE | 失効済み価値（失効で正） |

これは実装用の内部勘定辞書案。wallet/店舗の3区分と売上の正数を読みやすくする符号規約であり、法定帳簿の会計科目認定ではない。同じevent/取引で合計0、最低2行、各額の絶対値は30桁以内。walletに属する勘定だけwallet_id必須、SHOP_SALESだけshop_id必須。EVENT_CASH/EXPIRED_VALUEの行は個人walletを持たない。集計は無制限precisionのnumericで行う。

wallet3区分は同じsnapshotで、該当account_codeの台帳amount累計から再計算する。wallet行を更新するhandlerは対応仕訳を同Txで追加し、監査・Outboxと合わせてCOMMITする。SQLの遅延triggerは各Transactionの2本以上/合計0とwallet3区分の台帳射影一致をCOMMIT時に検査する。transactions.posting_xidに作成COMMITのDB transaction IDを記録し、台帳は同じDB transaction内だけ追加できる。成立後の取引へ均衡した追加行を付けて過去を変更することも拒否する。これは内部制御値でAPIへ返さず、復元時は管理権限の手順で保持する。業務ごとの勘定の組合せはhandler/復旧照合でも確認する。SQLで保証する範囲を増やす時は同じ検証へ追加する。

## 代表仕訳

| 処理 | 仕訳 |
| --- | --- |
| チャージ | AVAILABLE +額、EVENT_CASH -額 |
| 決済 | AVAILABLE -額、SHOP_SALES +額 |
| 譲渡 | 送信AVAILABLE -額、受取AVAILABLE +額 |
| 払戻し拘束 | 元AVAILABLEまたはREFUND_ONLY -額、HELD +額 |
| 未交付取消 | HELD -額、Hold.source_bucket +額 |
| 現金交付 | HELD -額、EVENT_CASH +額 |
| 購入返金 | SHOP_SALES -額、成立時のAVAILABLEまたはREFUND_ONLY +額 |
| 失効 | AVAILABLE -対象額、EXPIRED_VALUE +対象額。保全額/HELD/REFUND_ONLYは除外 |
| 訂正 | 元取引を更新せず、対象の反対仕訳を別取引で追加 |

Holdは本人承認HELD時だけ作成。元区分/額/本人wallet/拘束取引は不変、交付/取消時の解放取引を別に保持する。cash_operationの元区分と一致し、取消は同区分へ戻す。警告時刻や調査時刻は自動解放期限ではない。

## 冪等性と自然一意

EVENTはactor/event/operation/key、GLOBALはactor/operation/keyの別部分一意。scopeとevent有無をCHECKし、NULLを含む通常UNIQUEだけに依存しない。request_hashはAPIの正規化済み元入力のSHA-256、結果には元効果/IDを保存する。UNKNOWNは未検出の応答であり、保存済みの最終拒否状態ではない。現在認可→hash照合→元resource照会の順で再送を扱う。業務中間状態とコマンド成功を混同しない。

transactions.origin_kind/origin_idは成立の自然由来で、event/由来にUNIQUEを持つ。PAYMENTはpayment_request_idでも一意。origin_kindはCHARGE、PAYMENT、TRANSFER、HOLD、HOLD_RELEASE、REFUND、CORRECTION、EXPIRATION_ITEMの固定対応をSQLのCHECKとhandlerで検査する。Q02/O01は同じrequestの共通finalizePaymentを呼び、別キーで一意衝突した場合も認可後に既成立取引/注文を返す。全runのキーで複数wallet取引を作れるため、transactions.idempotency_idを一律UNIQUEにはしない。

注文は同じ支払要求の店舗/支払者へ複合FKで結合する。ITEMS/SUCCEEDED・要求額/決済額/明細合計は遅延triggerで確認し、同額の別店舗/別本人の要求を流用しない。CORRECTIONの在庫目標値が現在値と同じ場合はdelta=0の移動・理由・キー・監査・版更新を同じTxで残す。その他の在庫移動は非ゼロ数量が必要。

## 共通ロック順と競合

1. actor・session/MFA確認後、対象のサービス/イベント/店舗制御、grant/条件版、冪等キーを同じ順で取得する。grant解除/停止側も同じ制御行をロックする。
2. 商品/在庫をproduct_id順、walletをwallet_id順、原取引をtransaction_id順、要求/領域資源と明細をID順にロックする。同じ処理の再実行は同じ順にする。
3. 必要な全ロック取得後のclock_timestamp()で期間・QR・承認・予約期限を再検証する。等しい期限は拒否。追加ロック待ち後は再検証する。
4. 現在の認可・停止・版・残高・全明細・返金成立累計を検査する。部分成立をしない。
5. 取引/仕訳/残高/業務行/在庫/監査/Outbox/キー結果を同一Txで確定して応答する。

RETURN_TO_STOCKは元refund_lineをロックし、成立数量−既StockMove合計以内だけ追加する。restored_quantityは同Txで加算、遅延triggerでStockMove合計との一致を検査する。元product/event/shopは複合FKで一致。SQL trigger内で取得するrefund_lineロックも事前にこの共通順で確保する。並行実行はREAD COMMITTEDでロック後の最新累計を再計算し、REPEATABLE READ/SERIALIZABLEの競合は元キーでTx全体を再試行する。

返金executeは元Transaction/OrderLineをロックしてSUCCEEDED累計だけを再計算する。SQLは元会計方式・注文・単価・数量・返金取引との一致と、元額/元数量以下の成立累計を検査する。REQUESTEDは枠を予約しない。在庫戻し/数量と元金額は独立。B承認待ち、通常/返金専用を合わせた未完了払戻し、確認中cartは部分一意で制限する。現金誤PAID訂正は元取引1回、譲渡は1受取token1成立、失効はwallet/条件版/期限1回。

## 不変履歴と復旧

Transaction・台帳・条件版・在庫移動・注文明細・重要監査は更新/削除triggerで拒否する。refund_lineの原数量/金額は不変、復元射影だけ更新する。個人情報は別表に分離し、金銭FKのRESTRICTを外さない。通常appロールはschema/trigger変更権限を持たず、保持期間後の削除は別の承認済み保管/移行手順で行う。

復旧時は全台帳合計0、wallet3区分、店舗純売上、現金記録と未解決案件を同一snapshotで照合する。差異がある状態で営業再開しない。バックアップ復元後に退会/失効を再適用する。実際の運用復旧・性能・認可のATは未実施。

チャージ訂正の金銭取引と現金返却は別の成立事実。cash_return_statusを4状態で保存し、返却確認は既存の訂正取引を再記帳しない。RETURNED/NOT_REQUIREDを巻き戻さず、INVESTIGATING→RETURNEDは同一訂正の解決済み現金案件に結合する。公開連絡先の所有確認もtoken消費と確認日時を同一Txで記録するが、金銭7年履歴へメール本文を混在させない。
