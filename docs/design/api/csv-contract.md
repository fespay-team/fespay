# CSVの列・時点・配信契約

状態：API設計案、FE/BEレビュー前。担当：natuki53。更新日：2026-10-09。
要件：RPT-01～05、SEC-10、DAT-03。受入：AT-055～057。
[Issue #7](https://github.com/fespay-team/fespay/issues/7) / [ADR-0004](../../adr/0004-api-client-recovery-and-wire-contracts.md)。

列順と列版の正本は[OpenAPI](openapi.yaml)のx-csv-contract。CSVの表示契約で、テーブル/SQL/物理snapshotを指定しない。

## job・snapshot

| 状態 | 契約 |
| --- | --- |
| QUEUED | creator/scope/dataset/filter/列版1を申込時固定。snapshot_idは予約済み公開ID。読取時点/成果物はまだなし |
| GENERATING | 生成開始のsnapshot_atを固定。申込scopeを拡大せず現在資格も確認。同じjobの再試行で時点を変更しない |
| READY | 全part確定後generated_at・件数・expires_atを返す。期限はgenerated_at+24h |
| FAILED | failure_code、取得参照なし。生成前失敗ならsnapshot_atなし。新時点は新job/新snapshotへ |
| EXPIRED | download/partページ参照を除去し元snapshot/件数/生成・期限時点を残す。now>=expires_atで取得不可 |

filterはUTCの[start,end)、start<end。表示はAsia/Tokyo。SALESのsales_basis省略はOCCURRENCE（決済/返金それぞれの成立時刻で計上）。ORIGINAL_PAYMENT_PERIODは期間内の原決済とsnapshot_atまでの成立返金を再集計する。SALES応答filterとCSV列へ基準を必ず返し、他datasetの入力では拒否する。過去CSVを無言変更せず新snapshotで再出力する。TRANSACTIONSは原取引対応と各取引の発生時刻を維持する。

例：10/8の600円決済、10/9の100円返金。10/9発生時集計は売上0/返金100/純額-100。10/8原決済期間の再集計は返金成立後の新snapshotで600/100/500、返金前のsnapshotは600/0/600のまま。

生成中の権限失効では成果物を公開せずFAILEDへ。状態GET/part一覧/downloadはcreator本人AND現在の元scope/dataset資格を毎回確認する。DB障害で未生成/期限切れを推測しない。

## 列の意味

全列名・順序はx-csv-contract.columnsに固定。CSV時刻/timezoneはUTC（Z）、display_timezoneで無言変換しない。ID/番号は金額に変換しない。非該当の任意列は空欄、null文字列を出さない。

| dataset | 1行と対応 |
| --- | --- |
| TRANSACTIONS | 成立1取引。state=SUCCEEDED、amount_yenは正の原文。original_transaction_idはAPI source_transaction_id等の原取引対応から変換。shop/order/operatorは非該当なら空。operator_idは業務IDでメール/氏名なし |
| SALES | 1店舗・指定期間・snapshot・sales_basis。件数/総売上/返金/純額、店舗名。純額だけ負数可 |
| ORDERS | 注文1明細。時点商品名/単価/数量/明細額/返金数量と提供・支払・返金状態。注文総額を全行へ重複出力しない |
| CASH | 1担当者・受付場所・指定期間の現金集計。受領/交付/訂正、対応実査/差異/理由/未解決数。未実査は空欄で0を捏造しない。実査cutoff/受付場所の保存・紐付けはDB/業務調整 |

金額/件数は厳密な10進原文。差異/純額だけ正負を許す。並びはTRANSACTIONSの成立時刻・ID、ORDERSの成立時刻・order_id・order_line_id、SALESのshop_id、CASHのoperator_id・reception_placeの昇順。同一snapshotの順序を固定してpart境界の重複/欠落を防ぐ。

## 集計内訳API

GET reports/salesは指定scopeの合計、sales/breakdownはdimension=SHOP/PRODUCT/ROUTEの最大100行/ページ。正規化したfilter、snapshot_at、snapshot_idを返し、cursorは本人/event/scope/期間/集計基準/dimension/時点に束縛。期限30minや保持不可は422として新snapshotの先頭から再取得する。毎ページ現在のREAD_REPORTを確認し、同じページ走査の時点を維持できる方式はDBレビュー対象。

SHOPは全成立決済/購入返金、ROUTEはPAID注文を持つ決済/その返金だけ。PRODUCTはPAID注文明細の販売数量と成立ITEMS返金数量で、AMOUNT返金から商品数量を推定せず、再販在庫戻しも数量へ加算しない。発生時集計では返金だけの期間の純数量が負になり得る。商品/経路の範囲を全決済金額と混同しない。並びはSHOPのshop_id、PRODUCTのshop_id/product_id、ROUTEの宣言enum順。

## 形式と配信

各part先頭にUTF-8 BOMを1回、レコードはCRLF、1行目ヘッダー。全セルをダブルクォートで囲み、内部引用符を2個へ。セル改行もCRLF。文字列はNUL等不要な制御を除去（tab/改行は保持）し、先頭または先頭空白の後が=、+、-、@、tab、改行ならapostropheを先頭へ。金額/件数は許可列の型を検証し、この文字列加工で負純額/大桁原文を変えない。

表計算ソフトの型推定で大桁が丸め得るため、文字列インポートを案内してCSVを正本にしない。秘密/PW/QR/email/証跡全文は許可列に存在しない。

データ10万行ごとに分割。ヘッダーはrow_countへ含めず、0件でもヘッダーだけのpart1を返す。indexは1始まり・欠番/重複なし、合計行数は全体と一致。同じsnapshot・列版・条件を全partで共有する。

Exportは先頭最大100partとpart_count/next_parts_cursorを返す。残りはGET exports/{export_id}/partsでindex順にページングし、カーソルはcreator/export/snapshotへ束縛。ファイル数を理由に末尾を切り捨てない。未生成409、期限切れ/秘匿404。走査・snapshot連続性の実証はDB実装後。

downloadは認可プロキシのtext/csv、no-store、attachment。名前は`fespay-{dataset小文字}-{export_id}-part-{index 6桁以上}.csv`のサーバー生成ASCII。Range再開は使わずpart先頭から取得する。別exportのpart_idは404、署名URLを認可の代用にしない。取得済みファイルの回収を権限解除で保証する機能はない。

引用の根拠：[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180.html)。その他は現行RPT要件とAPI具体化案。設計用検証と、実集計・生成120秒・期限削除の未測定を区別する。
