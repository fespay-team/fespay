# APIとDBの対応

状態：レビュー案。基準：API PR #8、`52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32`（v0.4、171操作）。[OpenAPI正本候補](https://github.com/fespay-team/fespay/blob/52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32/docs/design/api/openapi.yaml)・[DB接点](https://github.com/fespay-team/fespay/blob/52ef2d497dc5ccc243f900b2f5c3fb9c2bfcaa32/docs/design/api/db-handoff.md)を参照。以下の対応は保存責務と原子的処理の設計で、handler実装の完成証明ではない。

## 領域横断の契約

- EVENT/GLOBALのキー空間は別一意。長期結果には秘密/過去の中間応答を保存せず、元効果のIDと現在resourceを返す。
- Q02/O01はpayment_request_idを自然一意に使う。APIの別キー/別operationでも同じ成立取引/注文へ復帰する。
- 原払戻し訂正1回、チャージ準備1成立、受取token1譲渡、wallet/条件版/期限1失効を制約と元資源ロックで合わせる。
- grant解除/停止/条件変更と金銭/在庫更新は[共通ロック順](ledger.md)で直列化する。すべての期限は必要ロック取得後の実時刻で判定する。
- OrderLineのrefunded/restored_quantityは成立返金明細/在庫移動から導出する。PurchaseRefundのcredited_toはSUCCEEDEDだけ公開する。
- APIのresource versionは各所有行のversion、checked_atは読取確認時刻。Transactionは不変なので行の更新版を持たない。
- 商品display_order/inventory_managed、店舗visible/features、レジname/activeは明示列。EventGuideの公開連絡先/主催名/会場等はevents.guide、EventSettingsはevent_settings.settingsと条件版JSON。BEで該当API schemaを検証する。

## 全operation対応

| operationId | HTTP | 保存先/導出元 | Tx/一意・復帰 |
| --- | --- | --- | --- |
| `getMyWallet` | `GET /v1/events/{event_id}/wallet` | wallets, ledger_entries, transactions | 同一snapshotの3区分/当事者照会 |
| `getMyWalletSummary` | `GET /v1/events/{event_id}/wallet/summary` | wallets, ledger_entries, transactions | 同一snapshotの3区分/当事者照会 |
| `listTransactions` | `GET /v1/events/{event_id}/transactions` | transactions, ledger_entries, idempotency_keys | 現在scopeで正本/元効果を照会。GLOBAL/EVENT分離 |
| `getTransaction` | `GET /v1/events/{event_id}/transactions/{transaction_id}` | transactions, ledger_entries, idempotency_keys | 現在scopeで正本/元効果を照会。GLOBAL/EVENT分離 |
| `getMyTransactionResultByKey` | `GET /v1/events/{event_id}/transaction-results` | transactions, ledger_entries, idempotency_keys | 現在scopeで正本/元効果を照会。GLOBAL/EVENT分離 |
| `subscribeEventUpdates` | `GET /v1/events/{event_id}/stream` | outbox, event_stream_positions, sse_replay_entries | 現在認可・保持position、欠落時resync。client-policyは配信設定 |
| `prepareCashRefund` | `POST /v1/events/{event_id}/refund-requests` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `listCashRefunds` | `GET /v1/events/{event_id}/refund-requests` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `getCashRefund` | `GET /v1/events/{event_id}/refund-requests/{cash_refund_id}` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `approveCashRefund` | `POST /v1/events/{event_id}/refund-requests/{cash_refund_id}/approve` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `startCashRefundHandover` | `POST /v1/events/{event_id}/refund-requests/{cash_refund_id}/cash-handing` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `completeCashRefund` | `POST /v1/events/{event_id}/refund-requests/{cash_refund_id}/complete` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `handoverCashRefund` | `POST /v1/events/{event_id}/refund-requests/{cash_refund_id}/handover` | cash_operations, holds, cash_cases, transactions | 元区分固定・本人承認/交付/取消・担当引継ぎを別Tx |
| `createPurchaseRefundRequest` | `POST /v1/events/{event_id}/refunds` | refunds, refund_lines, transactions, ledger_entries | REQUESTED保存→executeで原取引/累計を排他再検証 |
| `listPurchaseRefunds` | `GET /v1/events/{event_id}/refunds` | refunds, refund_lines, transactions, ledger_entries | REQUESTED保存→executeで原取引/累計を排他再検証 |
| `getPurchaseRefund` | `GET /v1/events/{event_id}/refunds/{purchase_refund_id}` | refunds, refund_lines, transactions, ledger_entries | REQUESTED保存→executeで原取引/累計を排他再検証 |
| `executePurchaseRefund` | `POST /v1/events/{event_id}/refunds/{purchase_refund_id}/execute` | refunds, refund_lines, transactions, ledger_entries | REQUESTED保存→executeで原取引/累計を排他再検証 |
| `getAuthContext` | `GET /v1/auth/context` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `registerEmail` | `POST /v1/auth/email/register` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `verifyEmail` | `POST /v1/auth/email/verify` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `requestEmailVerification` | `POST /v1/auth/email/verification-requests` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `loginEmail` | `POST /v1/auth/email/login` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `requestPasswordReset` | `POST /v1/auth/email/password-reset-requests` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `resetPassword` | `POST /v1/auth/email/password-reset` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `startGoogleAuthentication` | `POST /v1/auth/google/start` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `finishGoogleAuthentication` | `GET /v1/auth/google/callback` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `getGoogleVerifiedFlow` | `GET /v1/auth/google/flows/{flow_id}` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `getMySession` | `GET /v1/auth/session` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `listMySessions` | `GET /v1/auth/sessions` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `revokeMySessions` | `POST /v1/auth/sessions/revoke` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `reauthenticatePassword` | `POST /v1/auth/reauthentications/password` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `reauthenticateGoogle` | `POST /v1/auth/reauthentications/google` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `listMyIdentities` | `GET /v1/auth/identities` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `linkMyIdentity` | `POST /v1/auth/identities` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `unlinkMyIdentity` | `DELETE /v1/auth/identities/{identity_id}` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `startTotpEnrollment` | `POST /v1/auth/mfa/enrollments` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `confirmTotpEnrollment` | `POST /v1/auth/mfa/enrollments/confirm` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `verifyMfaTotp` | `POST /v1/auth/mfa/verifications/totp` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `verifyMfaRecoveryCode` | `POST /v1/auth/mfa/verifications/recovery-code` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `regenerateRecoveryCodes` | `POST /v1/auth/mfa/recovery-codes` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `disableTotp` | `DELETE /v1/auth/mfa` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `updateMyProfile` | `PATCH /v1/accounts/me` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `requestMyEmailChange` | `POST /v1/accounts/me/email-change-requests` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `confirmMyEmailChange` | `POST /v1/accounts/me/email-change-confirmations` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `changeMyPassword` | `POST /v1/accounts/me/password` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `requestMyAccountDeletion` | `POST /v1/accounts/me/deletion` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `listPublicEvents` | `GET /v1/events` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `createEvent` | `POST /v1/events` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getEventGuide` | `GET /v1/events/{event_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `updateEventGuide` | `PATCH /v1/events/{event_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `changeEventLifecycle` | `POST /v1/events/{event_id}/lifecycle` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listMyParticipations` | `GET /v1/accounts/me/participations` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `joinEvent` | `POST /v1/events/{event_id}/participations` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getMyParticipation` | `GET /v1/events/{event_id}/participations/me` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `leaveEvent` | `DELETE /v1/events/{event_id}/participations/me` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getEventDashboard` | `GET /v1/events/{event_id}/dashboard` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getEventSettings` | `GET /v1/events/{event_id}/settings` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `updateEventSettings` | `PATCH /v1/events/{event_id}/settings` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listEventSuspensions` | `GET /v1/events/{event_id}/suspensions` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `suspendEventOrShop` | `POST /v1/events/{event_id}/suspensions` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getSuspension` | `GET /v1/events/{event_id}/suspensions/{suspension_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `releaseSuspension` | `DELETE /v1/events/{event_id}/suspensions/{suspension_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `checkEventCompletion` | `GET /v1/events/{event_id}/completion` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `completeEvent` | `POST /v1/events/{event_id}/completion` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `resumeSettlementOnly` | `POST /v1/events/{event_id}/settlement-resume` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listEventShops` | `GET /v1/events/{event_id}/shops` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `createShop` | `POST /v1/events/{event_id}/shops` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getShop` | `GET /v1/events/{event_id}/shops/{shop_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `updateShop` | `PATCH /v1/events/{event_id}/shops/{shop_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getFixedShopQr` | `GET /v1/events/{event_id}/shops/{shop_id}/fixed-qr` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `rotateFixedShopQr` | `POST /v1/events/{event_id}/shops/{shop_id}/fixed-qr` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listShopRegisters` | `GET /v1/events/{event_id}/shops/{shop_id}/registers` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `createShopRegister` | `POST /v1/events/{event_id}/shops/{shop_id}/registers` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getShopRegister` | `GET /v1/events/{event_id}/shops/{shop_id}/registers/{register_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `updateShopRegister` | `PATCH /v1/events/{event_id}/shops/{shop_id}/registers/{register_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listInvitations` | `GET /v1/events/{event_id}/invitations` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `issueInvitation` | `POST /v1/events/{event_id}/invitations` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `getInvitation` | `GET /v1/events/{event_id}/invitations/{invitation_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `revokeInvitation` | `DELETE /v1/events/{event_id}/invitations/{invitation_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `reissueInvitation` | `POST /v1/events/{event_id}/invitations/{invitation_id}/reissue` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `acceptInvitation` | `POST /v1/invitations/accept` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `declineInvitation` | `POST /v1/invitations/decline` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `listGrants` | `GET /v1/events/{event_id}/grants` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `getGrant` | `GET /v1/events/{event_id}/grants/{grant_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `updateGrant` | `PATCH /v1/events/{event_id}/grants/{grant_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `revokeGrant` | `DELETE /v1/events/{event_id}/grants/{grant_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `startOwnershipTransfer` | `POST /v1/events/{event_id}/ownership-transfers` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `getOwnershipTransfer` | `GET /v1/events/{event_id}/ownership-transfers/{transfer_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `cancelOwnershipTransfer` | `DELETE /v1/events/{event_id}/ownership-transfers/{transfer_id}` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `acceptOwnershipTransfer` | `POST /v1/events/{event_id}/ownership-transfers/{transfer_id}/accept` | invitations, grants, grant_permissions, grant_registers, ownership_transfers | 発行者現権限再検証、単回受諾、scope/permission一意、owner受諾時だけ更新 |
| `getServiceStatus` | `GET /v1/admin/service/status` | service_control, publication_gates, audit, outbox, idempotency_keys | GLOBALキー、G1～G5・独立停止・精算を保護 |
| `changeServiceStatus` | `POST /v1/admin/service/status` | service_control, publication_gates, audit, outbox, idempotency_keys | GLOBALキー、G1～G5・独立停止・精算を保護 |
| `listPublicationGates` | `GET /v1/admin/publication-gates` | service_control, publication_gates, audit, outbox, idempotency_keys | GLOBALキー、G1～G5・独立停止・精算を保護 |
| `getPublicationGate` | `GET /v1/admin/publication-gates/{publication_gate_id}` | service_control, publication_gates, audit, outbox, idempotency_keys | GLOBALキー、G1～G5・独立停止・精算を保護 |
| `recordPublicationGate` | `POST /v1/admin/publication-gates/{publication_gate_id}` | service_control, publication_gates, audit, outbox, idempotency_keys | GLOBALキー、G1～G5・独立停止・精算を保護 |
| `issueQrToken` | `POST /v1/qr-tokens` | tokens | 用途/主体/対象/期限と単回消費。原文は発行時以外保存/復元しない |
| `resolveQrToken` | `POST /v1/qr-tokens/resolve` | tokens | 用途/主体/対象/期限と単回消費。原文は発行時以外保存/復元しない |
| `createPaymentRequest` | `POST /v1/events/{event_id}/payment-requests` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `listPaymentRequests` | `GET /v1/events/{event_id}/payment-requests` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `getPaymentRequest` | `GET /v1/events/{event_id}/payment-requests/{payment_request_id}` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `bindPaymentRequest` | `POST /v1/events/{event_id}/payment-requests/{payment_request_id}/bind` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `approvePaymentRequest` | `POST /v1/events/{event_id}/payment-requests/{payment_request_id}/approve` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `declinePaymentRequest` | `POST /v1/events/{event_id}/payment-requests/{payment_request_id}/decline` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `cancelPaymentRequest` | `POST /v1/events/{event_id}/payment-requests/{payment_request_id}/cancel` | payment_requests, tokens, stock_reservations, wallets, transactions, orders | Q02/O01共通確定。1要求1取引/注文、B承認待ち1件 |
| `prepareCharge` | `POST /v1/events/{event_id}/charges` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `listCharges` | `GET /v1/events/{event_id}/charges` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `getCharge` | `GET /v1/events/{event_id}/charges/{charge_id}` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `completeCharge` | `POST /v1/events/{event_id}/charges/{charge_id}/complete` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `cancelUnreceivedCharge` | `POST /v1/events/{event_id}/charges/{charge_id}/cancel` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `getCashOperation` | `GET /v1/events/{event_id}/cash-operations/{cash_operation_id}` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `correctCharge` | `POST /v1/events/{event_id}/charges/{charge_id}/corrections` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `correctUndeliveredCashRefund` | `POST /v1/events/{event_id}/transactions/{transaction_id}/corrections` | transactions, ledger_entries, idempotency_keys | 現在scopeで正本/元効果を照会。GLOBAL/EVENT分離 |
| `getCashCorrection` | `GET /v1/events/{event_id}/corrections/{correction_id}` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `recordCorrectionCashReturn` | `POST /v1/events/{event_id}/corrections/{correction_id}/cash-return` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `createCashCase` | `POST /v1/events/{event_id}/cash-cases` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `listCashCases` | `GET /v1/events/{event_id}/cash-cases` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `getCashCase` | `GET /v1/events/{event_id}/cash-cases/{cash_case_id}` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `resolveCashCase` | `POST /v1/events/{event_id}/cash-cases/{cash_case_id}/resolve` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `recordCashMovement` | `POST /v1/events/{event_id}/cash-movements` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `getCashMovement` | `GET /v1/events/{event_id}/cash-movements/{cash_movement_id}` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `recordCashReconciliation` | `POST /v1/events/{event_id}/cash-reconciliations` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `listCashReconciliations` | `GET /v1/events/{event_id}/cash-reconciliations` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `getCashReconciliation` | `GET /v1/events/{event_id}/cash-reconciliations/{cash_reconciliation_id}` | cash_operations, cash_corrections, cash_cases, cash_movements, cash_reconciliations, report_snapshots | 実査/訂正/現金処理の型別FK。resolve単独は価値移動なし |
| `issueRecipientToken` | `POST /v1/events/{event_id}/recipient-tokens` | tokens, transfer_requests, wallets, transactions | 保存済み相手/額/版、1token1成立、両wallet同時更新 |
| `prepareTransfer` | `POST /v1/events/{event_id}/transfer-requests` | tokens, transfer_requests, wallets, transactions | 保存済み相手/額/版、1token1成立、両wallet同時更新 |
| `getTransferRequest` | `GET /v1/events/{event_id}/transfer-requests/{transfer_request_id}` | tokens, transfer_requests, wallets, transactions | 保存済み相手/額/版、1token1成立、両wallet同時更新 |
| `cancelPreparedTransfer` | `DELETE /v1/events/{event_id}/transfer-requests/{transfer_request_id}` | tokens, transfer_requests, wallets, transactions | 保存済み相手/額/版、1token1成立、両wallet同時更新 |
| `completeTransfer` | `POST /v1/events/{event_id}/transfers` | tokens, transfer_requests, wallets, transactions | 保存済み相手/額/版、1token1成立、両wallet同時更新 |
| `getMyWalletActivity` | `GET /v1/events/{event_id}/wallet/activity` | wallets, ledger_entries, transactions | 同一snapshotの3区分/当事者照会 |
| `listProducts` | `GET /v1/events/{event_id}/products` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `createProduct` | `POST /v1/events/{event_id}/products` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `getProduct` | `GET /v1/events/{event_id}/products/{product_id}` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `updateProduct` | `PATCH /v1/events/{event_id}/products/{product_id}` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `archiveProduct` | `DELETE /v1/events/{event_id}/products/{product_id}` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `getProductInventory` | `GET /v1/events/{event_id}/products/{product_id}/inventory` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `createInventoryMove` | `POST /v1/events/{event_id}/inventory-moves` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `getInventoryMove` | `GET /v1/events/{event_id}/inventory-moves/{inventory_move_id}` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `uploadProductImage` | `POST /v1/events/{event_id}/products/{product_id}/image` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `getProductImage` | `GET /v1/events/{event_id}/products/{product_id}/image` | products, inventory, stock_moves, refund_lines | 公開/管理認可を分離。32bit在庫/返金数量内の明示再販戻し |
| `createCart` | `POST /v1/events/{event_id}/carts` | carts, cart_lines, payment_requests, stock_reservations | 保存は予約なし、checkoutで全明細。本人event/shop確認中1件 |
| `getMyCart` | `GET /v1/events/{event_id}/carts/{cart_id}` | carts, cart_lines, payment_requests, stock_reservations | 保存は予約なし、checkoutで全明細。本人event/shop確認中1件 |
| `updateCart` | `PATCH /v1/events/{event_id}/carts/{cart_id}` | carts, cart_lines, payment_requests, stock_reservations | 保存は予約なし、checkoutで全明細。本人event/shop確認中1件 |
| `checkoutCart` | `POST /v1/events/{event_id}/carts/{cart_id}/checkout` | carts, cart_lines, payment_requests, stock_reservations | 保存は予約なし、checkoutで全明細。本人event/shop確認中1件 |
| `createPaidOrder` | `POST /v1/events/{event_id}/orders` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `listOrders` | `GET /v1/events/{event_id}/orders` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `getOrder` | `GET /v1/events/{event_id}/orders/{order_id}` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `updateOrderFulfillment` | `PATCH /v1/events/{event_id}/orders/{order_id}/fulfillment` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `issueOrderReceipt` | `POST /v1/events/{event_id}/orders/{order_id}/receipt-tokens` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `requestOrderCancellation` | `POST /v1/events/{event_id}/orders/{order_id}/cancel` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `getOrderCancellation` | `GET /v1/events/{event_id}/order-cancellations/{cancellation_id}` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `decideOrderCancellation` | `POST /v1/events/{event_id}/order-cancellations/{cancellation_id}/decision` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `getCallingBoard` | `GET /v1/events/{event_id}/shops/{shop_id}/calling-board` | orders, order_lines, order_cancellations, receipt_verifications, tokens, refunds | 支払済のみOrder、提供/返金独立、受取単回/保留、全取消は全額返金対応 |
| `getSalesReport` | `GET /v1/events/{event_id}/reports/sales` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `createExport` | `POST /v1/events/{event_id}/exports` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `listMyExports` | `GET /v1/events/{event_id}/exports` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `getExport` | `GET /v1/exports/{export_id}` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `downloadExportPart` | `GET /v1/exports/{export_id}/parts/{part_id}/download` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `getReconciliation` | `GET /v1/events/{event_id}/reconciliation` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `listAuditEvents` | `GET /v1/events/{event_id}/audit-events` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `listMyEvents` | `GET /v1/accounts/me/events` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `completeLoginChallenge` | `POST /v1/auth/login-challenges/{challenge_id}/complete` | 認証基盤, accounts, account_profiles, auth_contexts | 基盤session/秘密/単回フローが正本。GLOBAL結果はidempotency_keys |
| `startExpirationRun` | `POST /v1/events/{event_id}/expiration-runs` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `listExpirationRuns` | `GET /v1/events/{event_id}/expiration-runs` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getExpirationRun` | `GET /v1/events/{event_id}/expiration-runs/{expiration_run_id}` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `recordUnpostedChargeReturn` | `POST /v1/events/{event_id}/charges/{charge_id}/cash-return` | cash_operations, cash_cases, cash_corrections, transactions | 1準備1付与。現金受領/未成立返却を別事実として保存 |
| `requestContactEmailVerification` | `POST /v1/accounts/me/contact-email-verification-requests` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `confirmContactEmail` | `POST /v1/accounts/me/contact-email-confirmations` | events, event_settings, event_policies, memberships, wallets, shops, registers, suspensions, expiration_runs, expiration_items | 現在制御/条件版を金銭確定と直列化。退出/完了は全未精算を再判定 |
| `getMyGlobalOperationResult` | `GET /v1/operation-results` | transactions, ledger_entries, idempotency_keys | 現在scopeで正本/元効果を照会。GLOBAL/EVENT分離 |
| `getClientPolicy` | `GET /v1/client-policy` | outbox, event_stream_positions, sse_replay_entries | 現在認可・保持position、欠落時resync。client-policyは配信設定 |
| `listExportParts` | `GET /v1/exports/{export_id}/parts` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |
| `getSalesBreakdown` | `GET /v1/events/{event_id}/reports/sales/breakdown` | report_snapshots, report_snapshot_rows, exports, export_parts, export_slots, audit | 固定物化時点/全part/本人2slot/完成後24h、creator AND現在scopeで配信 |

## 実装・採択が残る境界

認証基盤内部migrationとadapter、本人承認/実物の事実、価格/返金累計/全取消対応のhandler、SSE配送/現在認可、CSV物化/生成/削除、画像再エンコード/未参照回収はBE側実装を伴う。SQLで作成したモデルと実handlerが接続されたことを、operation網羅のチェックから推論しない。追加物理モデル/勘定辞書の採択とAT証跡は別途必要。
