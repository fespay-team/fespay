# API設計の網羅とレビュー項目

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / FE・BE・DB担当（未割当） |
| 更新日 / 基準 | 2026-10-09 / 要件v0.2、基本設計第14章 |
| 要件・受入試験 | 下表の各operationがOpenAPIのx-requirement-ids/x-acceptance-test-idsを参照 |
| Issue / PR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) |

## 論理APIからHTTP契約への対応

基本設計の全58論理IDを171 HTTP操作へ具体化した。型・認可・状態・エラーは[OpenAPI](openapi.yaml)に記載。以下はoperationIdの索引で、網羅チェックはIDの対応を検証する。実装・業務ルール・試験合格の証明ではない。

| 論理API ID | operationId |
| --- | --- |
| A01 | `getAuthContext`、`registerEmail`、`verifyEmail`、`requestEmailVerification`、`loginEmail`、`requestPasswordReset`、`resetPassword`、`completeLoginChallenge` |
| A02 | `startGoogleAuthentication`、`finishGoogleAuthentication`、`getGoogleVerifiedFlow` |
| A03 | `reauthenticatePassword`、`reauthenticateGoogle`、`listMyIdentities`、`linkMyIdentity`、`unlinkMyIdentity` |
| A04 | `getMySession`、`listMySessions`、`revokeMySessions`、`startTotpEnrollment`、`confirmTotpEnrollment`、`verifyMfaTotp`、`verifyMfaRecoveryCode`、`regenerateRecoveryCodes`、`disableTotp`、`updateMyProfile`、`requestMyEmailChange`、`confirmMyEmailChange`、`changeMyPassword`、`requestMyAccountDeletion`、`getMyGlobalOperationResult` |
| A05 | `getServiceStatus`、`changeServiceStatus` |
| E01 | `listPublicEvents` |
| E02 | `createEvent`、`getEventGuide`、`updateEventGuide`、`changeEventLifecycle`、`listMyEvents`、`requestContactEmailVerification`、`confirmContactEmail` |
| E03 | `listMyParticipations`、`joinEvent`、`getMyParticipation`、`leaveEvent` |
| E04 | `getEventDashboard` |
| E05 | `getEventSettings`、`updateEventSettings`、`startExpirationRun`、`listExpirationRuns`、`getExpirationRun` |
| E06 | `listEventSuspensions`、`suspendEventOrShop`、`getSuspension`、`releaseSuspension` |
| E07 | `checkEventCompletion`、`completeEvent` |
| E08 | `listEventShops`、`createShop`、`getShop`、`updateShop`、`getFixedShopQr`、`rotateFixedShopQr`、`listShopRegisters`、`createShopRegister`、`getShopRegister`、`updateShopRegister` |
| E09 | `resumeSettlementOnly` |
| E10 | `listPublicationGates`、`getPublicationGate`、`recordPublicationGate` |
| S01 | `listInvitations`、`issueInvitation`、`getInvitation`、`revokeInvitation`、`reissueInvitation` |
| S02 | `acceptInvitation`、`declineInvitation` |
| S03 | `listGrants`、`getGrant`、`updateGrant`、`revokeGrant` |
| S04 | `startOwnershipTransfer`、`getOwnershipTransfer`、`cancelOwnershipTransfer`、`acceptOwnershipTransfer` |
| Q01 | `createPaymentRequest`、`bindPaymentRequest` |
| Q02 | `approvePaymentRequest`、`declinePaymentRequest`、`cancelPaymentRequest` |
| Q03 | `issueQrToken`、`resolveQrToken` |
| Q04 | `listPaymentRequests`、`getPaymentRequest` |
| T01 | `getMyWalletSummary` |
| T02 | `approveCashRefund`、`completeCashRefund`、`executePurchaseRefund`、`approvePaymentRequest`、`completeCharge`、`correctCharge`、`correctUndeliveredCashRefund`、`completeTransfer`、`startExpirationRun` |
| T03 | `getTransaction`、`getMyTransactionResultByKey` |
| T04 | `listTransactions` |
| T05 | `correctUndeliveredCashRefund` |
| C01 | `prepareCharge`、`completeCharge`、`cancelUnreceivedCharge`、`recordUnpostedChargeReturn` |
| C02 | `getCashRefund`、`listCharges`、`getCharge`、`getCashOperation` |
| C03 | `correctCharge`、`getCashCorrection`、`recordCorrectionCashReturn` |
| C04 | `createCashCase`、`listCashCases`、`getCashCase`、`resolveCashCase` |
| C05 | `recordCashMovement`、`getCashMovement`、`recordCashReconciliation`、`listCashReconciliations`、`getCashReconciliation` |
| F01 | `prepareTransfer`、`cancelPreparedTransfer`、`completeTransfer` |
| F02 | `getTransferRequest` |
| F03 | `issueRecipientToken` |
| H01 | `prepareCashRefund`、`listCashRefunds`、`getCashRefund`、`approveCashRefund` |
| H02 | `startCashRefundHandover` |
| H03 | `completeCashRefund` |
| H04 | `listCashRefunds`、`handoverCashRefund` |
| P01 | `listProducts`、`createProduct`、`getProduct`、`updateProduct`、`archiveProduct` |
| P02 | `getProductInventory`、`createInventoryMove`、`getInventoryMove` |
| P03 | `createCart`、`getMyCart`、`updateCart` |
| P04 | `uploadProductImage`、`getProductImage` |
| P05 | `checkoutCart` |
| O01 | `createPaidOrder` |
| O02 | `listOrders`、`getOrder`、`getCallingBoard` |
| O03 | `updateOrderFulfillment` |
| O04 | `requestOrderCancellation`、`getOrderCancellation`、`decideOrderCancellation` |
| O05 | `issueOrderReceipt` |
| R01 | `getSalesReport`、`getSalesBreakdown` |
| R02 | `createPurchaseRefundRequest`、`listPurchaseRefunds`、`getPurchaseRefund`、`executePurchaseRefund` |
| R03 | `createExport` |
| R04 | `listMyExports`、`getExport`、`listExportParts`、`downloadExportPart` |
| R05 | `getReconciliation`、`listAuditEvents` |
| W01 | `getMyWallet` |
| W02 | `getMyWalletActivity` |
| N01 | `subscribeEventUpdates`、`getClientPolicy` |

T02の汎用transactions POSTは、権限・本人承認を固定した各領域の確定操作へ分解した。Q04の詳細はevent配下へ統一。S02の招待秘密はPOST本文、O05の受取秘密発行はPOSTに具体化。A05は単一サービスの制御パス。これらは[ADR-0003](../../adr/0003-api-authentication-and-command-boundaries.md)のレビュー案。

## 内部処理とAPIの境界

| 内部処理 | 公開APIの契約/復帰 |
| --- | --- |
| 5秒の予約/要求期限処理 | 要求EXPIRED・予約全解放・cart再確認状態を同一整合性境界で確定。旧キーは元要求、新確認は再検証 |
| 日時によるイベント/受付状態判定 | lifecycleだけを信用せず実時刻・各windowを金銭確定時に再確認 |
| 自動失効 | 同じpolicy/wallet/期限の自然一意を利用。公開runの進捗と未解決を照会。worker承認方式は未決 |
| Outbox通知/メール配送 | COMMIT後。配送失敗で金銭を巻戻さない。SSE欠落時はGET正本に復帰 |
| CSV生成/24h削除 | 同じjob/snapshotへ照会、期限後はEXPIREDメタのみ。現在の権限でdownload |
| 画像変換/未参照回収 | 受理形式/再エンコード/所有・版を検証。参照なしobjectを後で回収 |
| 個人情報削除・バックアップ復元 | 精算前は409、受理後30日。残る取引保持と削除/失効再適用を分離 |
| 照合差異検出/復旧 | reportは差異を返し、内部警報/安全停止は監査付き。照合前に再開しない |

## DBの完成を待たず具体化した範囲

| 範囲 | レビューできる成果物 |
| --- | --- |
| 要求/応答・認可・状態・元キー復帰 | 全58論理IDを171操作へ対応。金銭の中間状態と最終結果、62キー操作の照会、秘密の単回発行を定義 |
| HTTP入力・コード・旧画面 | サイズ/深さ/画像資源案、400/413/415/422、54コードのHTTP/画面対応、client-policy、READ/RECOVERY/CURRENTと既成立復帰は[HTTP契約](http-contract.md) |
| 認証と通知の画面復帰 | Google開始flow_idと検証済み照会、失われたlogin challenge、SSE/GET世代・dirty再取得・poll/更新待機は[画面復帰](client-flows.md) |
| 集計・CSVの表示契約 | 売上の発生時/原決済期間再集計、店舗/商品数量/注文経路の行、列版/順序、生成開始/完了時刻、空結果/分割/partページング/配信は[CSV契約](csv-contract.md) |
| 形式/意味の設計検証 | schema状態ケース、HTTP入力/互換性/期間帰属/CSV参照手順、故意に壊したlint仕様を[保存して再実行](validation/README.md) |

これらはAPI側の設計案を具体化した状態。未採択の値・追加判断はADR-0003/0004へ記録し、実アプリで成立した動作としては扱わない。

## 確定前に残るレビュー・実証

| 区分 | 項目 | 担当と完了証拠 |
| --- | --- | --- |
| FE/BEの契約レビュー | 戻り先ルート、Googleログインchallenge方針、旧画面のRECOVERY、集計/CSV表示、具体値 | FE・BE。ADR-0002/0003/0004採択と正本反映。期限/JSON/画像/再接続値の合意 |
| 認証基盤・環境統合 | Cookie/CSRF/OAuth/GoogleのみTOTP、メール・画像/資源保護、カーソル鍵 | BE・環境。固定Better Auth版/SDK/adapter統合、異常画像/配送/実ブラウザー試験 |
| DBとの共同調整 | DTO enum/公開ID/版、GLOBALキー、自然一意/ロック、紛争保全/現金scope | API・DB。物理モデル対応表・制約/競合試験。DDLはDB担当が作成 |
| DBとの共同調整 | CSV/集計snapshot保持とcutoff、SSE配信位置/保持/順序 | BE・DB。同一job/ページの時点保持、欠落/権限解除/同時更新の実証、方式/実値の記録 |
| 運営・実装の調整 | 自動失効workerの承認/起動認証、因子喪失時サポート | BE・運営。特権MFA/事前設定を満たす手順と重複実行/保全試験 |
| 実装後の受入 | 金銭/認可/期限の同時実行、切断後復帰、実機/CSV/性能/削除 | FE・BE。該当AT証跡。設計用の形式チェックでは代替しない |
| 公開判断 | G1〜G5、責任者/保存・終了体制 | 総合・運営。外部確認/契約/試験の実証。API設計だけで承認しない |

DBに依存しない公開契約は担当間レビューへ進められる。資料承認・ADR採択・DB整合・実装/受入・公開ゲートは未完了。要件変更が必要な判断はCR手順へ戻す。承認者・日付・PR：未記入。
