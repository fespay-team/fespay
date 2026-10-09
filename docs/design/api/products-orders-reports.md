# 商品・在庫・注文・集計/CSV

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / FE・BE・DB担当（未割当） |
| 更新日 / API ID | 2026-10-09 / P01～P05、O01～O05、R01～R05 |
| 要件 / 受入試験 | PRD-01/02、INV-01～05、ORD-01～06、REF-01～04、RPT-01～05、SEC-09、DAT-01～03 / AT-045～047、049～058、061、069 |
| Issue / PR / ADR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) / [ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)（提案） |

型は[OpenAPI](openapi.yaml)、金銭確定との接点は[決済・現金設計](payments-and-cash.md)を参照する。

## 商品・在庫・画像

商品閲覧と変更は別権限。参加本人は販売公開商品、現在の自店担当は業務閲覧資格で自店を参照する。商品管理grantなしでPOST/PATCH/DELETEできない。商品値は版付きで、過去の単価/名称/提供条件はorder line snapshotを保持する。APIのDELETEは販売停止/アーカイブを返す案。未販売・参照なしに限る物理削除はDB方針で確認する。

在庫はon_hand/reserved/availableを非負32bit整数とし、reserved<=on_handを守る。入荷/廃棄/目標値訂正は理由付きの移動記録。手動減算は予約数を下回らせない。返金商品の再販戻しはRETURN_TO_STOCK、元refund_line_id、数量、resalable_confirmed=true、理由、版、キー必須。元商品/成立返金数量−復元済数量を排他再計算し、在庫・復元累計・移動を同一Txで確定する。

画像はmultipartでJPEG/PNG/WebPの実内容を検証。5MB超413、偽MIME/SVG/HTML等415または422。デコード時の寸法/画素資源保護、長辺2048px以下への再エンコード・EXIF除去を適用する。外部URLを取得しない。DBに参照されなかったアップロードは回収し、画像キーを他店へ関連付けない。具体的なデコード資源上限とobject storageはBE/環境レビュー対象。

## カートと注文

cartは本人・1店舗・最大50明細・数量1〜999で保存し、参考価格だけを表示する。在庫予約しない。fixed_shop_identifierがある時は現在の店識別を検証して固定QR経路を保存する。経路でモバイルの双方許可を迂回しない。

checkoutは本人/event/shopの確認中1件とカート版を再確認し、最新価格/販売/機能/期間から全見積と180s予約を一括作成する。1明細不足でも部分予約しない。期限切れ処理は要求/予約/在庫/カートを同じ順で排他し、旧要求をEXPIRED・予約全解放・カート再確認可能状態へ。元checkoutキーは期限切れ元要求を返し、新しい確認は明示の新キーと再検証へ進む。

注文前の支払待ちはPaymentRequestを正本とし、提供対象のOrderは決済と同じTxでPAID/ACCEPTEDから生成する案。Q02/O01双方の確定経路で同じ注文を返す。提供、支払、返金状態を分離し、部分返金でも残商品の提供を続ける。

| 提供遷移 | 条件 |
| --- | --- |
| ACCEPTED→PREPARING/READY | 現在の自店受渡しgrant、expected_version |
| PREPARING→READY | 同上 |
| READY→PICKED_UP | 本人QRまたは8桁codeの単回検証＋注文更新を同一Tx |
| 未払い候補→取消 | payment-requestの取消/期限切れ、予約解放、wallet変化なし |
| 支払済み→全取消 | 店舗の決定と同一原決済の全額返金完了または全額調査を対応付け |

受取秘密は本人のPOST receipt-tokensで発行し、再発行は旧QR/code失効の明示操作。5失敗/注文/10minで保留。保留後は本人画面を再確認し、保留後発行QRと確認フラグで店員が確定する。コードの再生成だけで誤入力保留を解除しない。受取完了は単回で、公開番号だけを本人証明にしない。公開呼出は番号/提供状態のみを返す。

本人の支払後取消はREQUESTED申出で、無条件取消ではない。店が全額返金SUCCEEDEDまたは全額INVESTIGATINGを確認して提供CANCELLEDと申出APPROVED/INVESTIGATINGを対応付ける。部分返金だけで全取消しない。調査後全額返金が確定したら同じ返金IDでAPPROVEDへ。未受取注文を自動完了/失効しない。

## 集計・CSV・照合

期間はUTCのstart含む/end含まず、画面はAsia/Tokyo。支払いは支払成立時刻、返金は返金成立時刻で別集計し、返金だけの期間の純額は負数を許す。AggregateAmount/AggregateCountは桁を限定せず、差異/純額はSignedAggregateAmount。1取引30桁の上限を合計へ流用しない。

CSV申込はevent/shop/dataset・条件・snapshotを固定する。生成中は本人最大2件。10万行ごとに分割し、超過分を切り捨てない。UTF-8 BOM、CRLF、RFC4180引用、数式開始/制御文字への対策を適用。金額は完全な10進原文を残すが、表計算ソフトで数値扱いした場合の精度は保証しない。

| dataset | 列の許可リスト |
| --- | --- |
| TRANSACTIONS | transaction_id/event_id/shop_id、type、成立UTC時刻、amount/currency、source_transaction_id。actor個人情報は含めない |
| SALES | event_id/shop_id、期間、snapshot_id、売上/返金/純額、件数。期間ごとの集計 |
| ORDERS | order_id/番号、event_id/shop_id、経路、支払/提供/返金状態、成立時刻、固定商品名/単価/数量/明細総額、元transaction_id |
| CASH | event_id、処理/現金移動ID、種別、額、成立/記録時刻、状態、実査/理論/差異。証跡全文/連絡先/秘密は含めない |

CSV各partのrow_countは10万以内、全体件数は文字列。行の並びは対象の成立/記録UTC時刻・ID昇順。注文は1明細1行で金額種別を明示し、注文総額を明細ごとに合算しない。snapshot内で複数partを連続分割する。一般一覧のカーソルをCSV snapshotとして使わない。

GET状態とpart downloadは作成本人AND現在の元scope/dataset権限を毎回検証する。生成完了から24hでファイル削除。認可プロキシ配信とし、権限解除後も通る恒久署名URLを返さない。再生成は新snapshot/new jobで履歴を保持する。

照合は訂正を反映した純チャージ−純現金払戻しと、wallet3区分＋店舗純売上＋失効の式、全台帳合計0を同じsnapshotで確認。現金実査差異と未解決案件数は別の判定。差異があればbalanced=falseを返し、内部の警報/安全停止を監査付きで実施する。報告APIが返ったことを安全な再開の証明にしない。

DBのsnapshot保持/生成方式、画像処理・CSV表示、並行処理/期限/認可の受入試験：未実施。
