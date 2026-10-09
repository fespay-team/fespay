# API設計の網羅とレビュー項目

| 項目 | 内容 |
| --- | --- |
| 状態 / 担当 / レビュー者 | 下書き / natuki53 / FE・BE・DB担当（未割当） |
| 更新日 / 基準 | 2026-10-09 / 要件v0.2、基本設計第14章 |
| 要件・受入試験 | 下表の各operationがOpenAPIのx-requirement-ids/x-acceptance-test-idsを参照 |
| Issue / PR | [Issue #7](https://github.com/fespay-team/fespay/issues/7) / [Draft PR #8](https://github.com/fespay-team/fespay/pull/8) |

## 論理APIからHTTP契約への対応

基本設計の全58論理IDを168 HTTP操作へ具体化した。型・認可・状態・エラーは[OpenAPI](openapi.yaml)に記載。以下はoperationIdの索引で、網羅チェックはIDの対応を検証する。実装・業務ルール・試験合格の証明ではない。

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
| R01 | `getSalesReport` |
| R02 | `createPurchaseRefundRequest`、`listPurchaseRefunds`、`getPurchaseRefund`、`executePurchaseRefund` |
| R03 | `createExport` |
| R04 | `listMyExports`、`getExport`、`downloadExportPart` |
| R05 | `getReconciliation`、`listAuditEvents` |
| W01 | `getMyWallet` |
| W02 | `getMyWalletActivity` |
| N01 | `subscribeEventUpdates` |

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

## 確定前に残る項目

| 項目 | 担当と完了証拠 |
| --- | --- |
| Cookie/CSRF/OAuth/GoogleのみのTOTP、ログインchallenge | BE。固定したBetter Auth版/SDK/adapterで統合試験、FEの画面復帰確認 |
| DTO enum/公開ID/版、GLOBALキー、紛争保全、現金scope | API・DB。物理モデルとの対応表・制約/競合試験 |
| CSV snapshot/cutoff、SSE再開/保持・カーソル鍵 | BE・DB。欠落/権限解除/同時更新の実証、方式と実値を記録 |
| 自動失効workerの承認/起動認証 | BE・運営。特権MFAと事前設定条件を満たす手順/実装、重複実行/保全試験 |
| 画像デコード資源上限/ストレージ/メール配送 | BE・環境担当。実装上限・契約/秘密分離・異常画像/配送試験 |
| QR256bit、受取300s、再認証/短命フロー期限、回復コード10個、カーソル30min | FE・BE・DB。ADR-0003の具体値をレビューして採択 |
| 金銭・認可・期限のDB同時実行、切断後復帰、実機/CSV/性能 | FE・BE。該当AT証跡。形式チェックで代替しない |
| G1〜G5と運営責任者/保存・終了体制 | 総合・実運営責任者。実際の外部確認/契約/試験証跡。APIだけで承認しない |

現在は全領域の初稿が揃った段階。資料レビュー・ADR採択・実装/受入・公開ゲートは未完了。要件変更が必要な判断はCR手順へ戻す。承認者・日付・PR：未記入。
