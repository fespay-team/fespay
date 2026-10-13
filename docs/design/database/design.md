# FesPay DB設計方針

状態：レビュー案。参照版と文書入口は[README](README.md)。要件：LED-01～06、WAL-01～03、TX-01～06、DAT-01～03、PAY-B04、CSH-01～07、REF-01～04、INV-01～05、ORD-01～06、PRV-03～05。対応受入：AT-021～024、026～048、049～058、063。資料承認と実装/受入合格は別に記録する。

## 基準と変更

現行要件v0.2とCR-0001は承認済み。QR表示は受付/Bが60秒、A/譲渡受取が300秒、本人関連付け後の承認・見積・予約は180秒。表示更新で関連付け済み期限を延長しない。必要ロック取得後の実時刻で期限を判定する。

詳細設計7章の30表案を起点に、最新APIの保存/復帰に必要なモデルを[物理スキーマ](physical-schema.md)へ具体化した。API DTOとDB列の1対1一致は求めず、公開値の保存先/導出元を[対応表](api-mapping.md)へ記録する。この文書群を物理モデルの正本候補とし、詳細設計7章は起点の概要として扱う。採択後に総合設計側も参照先へ同期する。

| 旧案との差分 | 理由 |
| --- | --- |
| Holdの元区分/拘束・解放取引、cash operation.balance_source | 取消で返金専用額を支払可能額へ変換しない |
| StockMoveの種類/返金明細/キーと復元済み数量 | 別キーでも返金数量を超える在庫戻しを拒否する |
| EVENT/GLOBALキーとscope別一意索引 | イベント作成前/サービス制御も元キーで照会する |
| 金額domainはscaleなしnumeric＋整数/有限/範囲検査 | NUMERIC(30,0)による丸めとNaNの保存を拒否する |
| B承認待ち/未完了払戻し/確認中cartの部分一意 | 別端末・別担当・別キーでも件数制約を守る |
| 支払要求1成立取引/注文、自然由来ごとの取引一意 | Q02/O01の異経路でも二重引落ししない |
| grantを集合＋permission/registerの子行へ分離 | APIのrole/permissions/register_idsとscope一意を両立する |
| 個人情報をaccount_profilesへ分離 | 精算済み退会30日後の削除と7年保持IDを分離する |
| contact_email_verificationsに指定メールと確認日時を保存 | tokenのみの確認要求から公開連絡先を取得し、ログインidentityとは別に本人の所有確認を保持する |
| cash_corrections.cash_return_statusを4状態で保存 | 返却待ち/返却済み/返却不要/調査中を再読込でも混同しない |
| 注文と支払要求の店舗/支払者を複合FKで結合 | 同event内の別店舗/別本人への誤った注文関連付けを拒否する |
| 現金調査の型別FK、実査/訂正/釣銭記録 | 利用者の現金処理を伴わない実査にも案件を関連付ける |
| Cart、TransferRequest、全取消、受取保留、失効run/item | 再読込/通信断後も保存済み状態へ戻る |
| report snapshot rows、export parts/slots、SSE replay position | 時点/分割/2件上限/安全な再開を保持する |

## 正本・公開値・機密

Transaction/台帳/条件版/在庫移動/監査は追記専用。Walletは台帳から再構築可能な3区分の射影。成立のみTransactionへ保存し、準備/最終拒否/処理中は領域資源/冪等結果で保持する。冪等結果は元効果/IDを保存し、変化するPREPARED等の応答全文を再生しない。再送は現在認可の後に現在resourceを読み直す。

Better Authがidentity/session/PW/TOTP/回復コード/OAuth/challengeを所有する。業務DBはaccounts.auth_user_refで対応付け、auth_contextsは基盤で検証済みの業務/特権MFA時刻のみ持つ。sessionの停止・失効は基盤を毎回確認し、文脈表や期限コピーだけでログインを成立させない。基盤の内部表はこのSQLへ複製しない。採用版adapterのtransaction/失効/TOTP再利用検査はBE統合試験対象。

QR/招待/連絡先確認/受取秘密はハッシュ・用途・主体・対象・期限・単回消費で保管する。CONTACT_EMAILは本人と連絡先hashをbinding_hashに束縛する。JSON/監査/Outbox/冪等結果にtoken生値・PW・TOTP・回復コード・session cookieを保存しない。外部認証フローは基盤保管。更新可能なJSONはAPI schemaで検証し、同じ行の版で排他する。

公開連絡先の確認依頼はtokensとcontact_email_verificationsを同一Txで作成する。専用表に本人/指定メール/token IDを保存し、binding_hashはcontact_email_binding(account_id,email)で計算する。tokenだけの確認要求はハッシュからこの表を取得でき、ログインメールを転記しない。確認はtokenと所有確認行を共通順でロックし、本人/用途/binding/実時刻/未消費を検証してconsumed_atとverified_atを同じ確認時刻で保存する。遅延triggerは用途・メールbinding・確認と消費の一致・期限前・未失効を検査する。同tokenの再確認は既存の確認日時へ復帰し、新tokenによる同じメールの再確認は別の所有確認記録として単回消費する。本人/メールの照合はverified_atありの記録を用い、必要時は最新の確認日時を返す。メール変更は新たな確認依頼とし、既存依頼のメールを差し替えない。Event PublicContactへ設定できるのは設定本人のverified_atありの登録だけ。配送はBEの秘密配送経路で行い、token生値をOutboxへ保存しない。

期限切れ/失効した未確認メールはtokenと専用表を同一Txで削除する。確認済みメールは個人情報として精算済み退会30日後の削除対象に含め、金銭履歴7年保持とは分離する。所有確認はメール到達を伴うhandler試験が必要であり、DB制約合格だけで配送や本人認証を証明しない。

チャージ訂正はCreateChargeCorrection.cash_return_required=trueならPENDING_RETURN、falseならNOT_REQUIREDを明示して保存する。現金払戻しの誤PAID訂正は内部kind=CASH_REFUND_CORRECTION、公開kind=REVERSE_UNDELIVERED_CASH_REFUND、返却状態NOT_REQUIRED。返却済み/返却不要は終端で、必要な返却を後から不要へ変更しない。INVESTIGATINGからRETURNEDへ進む時は同じ訂正のRESOLVED/COMMITTEDかつRETURNEDまたはNOT_RETURNEDの案件を参照する。NOT_RETURNEDの場合の明示返却事実はhandlerが監査する。訂正取引の残高効果を再実行しない。

## 永続化と排他

金銭/在庫は[台帳の共通順](ledger.md)でロックし、現在認可・MFA・停止・期間を再検証。条件版/所属FK、自然一意、冪等キー、台帳を同じCOMMITへ含める。現金物理授受はDB非原子的なので、事実/案件/後続commandを分ける。調査resolveだけで残高や交付を変えない。

DBのCHECK/FK/triggerは不正な保存の防壁であり、本人承認や実物の再販売可能性を証明しない。成功応答には取引/台帳/残高/業務行/監査/OutboxのCOMMITが必要。handler、worker、現在権限の照合は未実装。

Orderの店舗/本人は元PaymentRequestに一致する複合FKを持つ。遅延検査でITEMS/SUCCEEDED要求だけから注文を成立させ、元要求額/取引額/全明細合計の一致を確認する。本人関連付け・要求成功・注文挿入の順序は同一Tx内で完結でき、別店舗/別支払者の注文はCOMMITできない。在庫の目標値訂正は現在値と同じ場合もCORRECTION/delta=0として理由・キー・監査・在庫版を保存し、APIのquantity=0と現在Stockを返す。ADD/WASTE/RETURN_TO_STOCKの0数量は許可しない。

## CSV・snapshot

QUEUEDではsnapshot_idだけ予約。workerはREPEATABLE READの1Txで認可済み行をreport_snapshot_rowsへordinal順に物化し、snapshot_atとMATERIALIZEDを原子的に保存する。物化前の失敗はQUEUEDのままで読取時点を公表しない。物化後は同じjobのファイル生成再試行でも同じ保存済み行を使う。分割処理のページごとに元の変更可能テーブルへ読み直さない。

exportsはcreator/dataset/filter/列版を固定、export_slotsの本人slot1/2を確保して同時生成2件を保証する。全part確定後だけREADY、generated_atから24時間をexpires_atへ保存する。0件でもヘッダーのみpart1。10万データ行/part、欠番/重複なし、全part合計=row_count。EXPIREDでもjobメタを残し、objectを削除して取得参照を返さない。列版/part/同一jobの結合はhandlerとworkerで検証する。

集計内訳も物化した同一snapshotにcursorを束縛する。一般一覧の現在値cursorとは分ける。実査はcounted_atと正本cutoffを対応付けたsnapshotを保存し、EVENT/OPERATORを重複加算しない。理論額はserver算出、差異/未解決案件を完了条件へ含める。

## Outbox・SSE

金銭Txではoutboxだけを追加する。配送workerはCOMMIT済みoutboxを読み、event_stream_positionsを短時間ロックしてsse_replay_entriesへ単調な配信positionを採番する。outbox UUIDは公開idであり順序値ではない。金銭Txをevent単位の配信行ロックへ巻き込まない。outbox重複処理はoutbox_id UNIQUEで同位置へ復帰する。

Last-Event-IDはUUID→保持中positionで解決し、後続positionを現在の認可で絞る。元commitと配送順は一致を仮定せず、resource versionと正本GETで収束する。保持欠落/他event/権限外/安全性不明は同じCURSOR_UNAVAILABLEでresync。保持期間の値と2秒/5秒目標はBE/運用の採択・負荷試験を残す。

## 保管と未実証

取引・台帳・条件版・金銭/在庫キー・重要監査は7年。精算済み退会は30日後にaccount_profilesを削除/分離し、認証基盤の秘密を失効・削除して業務IDを保持する。auth_user_refは復元後の失効再適用用の制御台帳と連携して分離する。紛争保全はdispute_preservationsに理由/見直し期限を持ち、失効対象から除外。CSVファイル/物化行の短期削除と金銭根拠の保持を混同しない。削除・失効の再適用と保持主体は運用設計で確定する。

未実証：認証基盤固定版、現在認可/MFA、現金事実、返金の本人/先区分選択・全取消handler、CSV物化/配信worker、SSE配送、実機/負荷/復旧、運用migration/rollback。追加物理モデル・勘定辞書は提案であり、API/BE/DB採択と実装後AT証跡で確定する。制約試験だけで受入管理表を合格へ変更しない。
