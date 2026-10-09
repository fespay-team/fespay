"""全領域契約の形式・状態境界。業務認可やDB排他を証明するテストではない。"""


def run_cases(check):
    rid = '44444444-4444-4444-8444-444444444444'
    ts = '2026-10-09T00:00:00Z'

    def mutations(schema, valid, changes):
        check(schema, valid)
        for change in changes:
            check(schema, dict(valid, **change), False)

    # 認証: 認証前の入力へ勝手な権限/手動統合フラグを持ち込めない。
    register = {'email': 'fixture@example.invalid', 'password': 'x' * 15,
                'display_name': '試験利用者', 'terms_version': '1', 'accepted': True}
    mutations('EmailRegistration', register, [
        {'password': 'x' * 14}, {'password': 'x' * 129}, {'accepted': False},
        {'display_name': '改行\n名前'}, {'role': 'OWNER'}, {'email_verified': True},
        {'email': 'invalid'}, {'terms_version': 1},
    ])
    mutations('GoogleStart', {'intent': 'LINK', 'return_path': '/account/identities'}, [
        {'return_path': '//example.invalid'}, {'return_path': 'https://example.invalid'},
        {'return_path': '/\\example.invalid'}, {'return_path': '/\nredirect'},
        {'intent': 'MERGE_BY_EMAIL'}, {'account_id': rid},
    ])
    check('TotpCode', '012345')
    for code in [123456, '12345', '1234567', '12 345', 'abcdef']:
        check('TotpCode', code, False)
    check('LinkIdentity', {'provider': 'GOOGLE', 'verified_flow_id': rid, 'confirmed': True})
    check('LinkIdentity', {'provider': 'GOOGLE', 'id_token': 'unvalidated', 'confirmed': True}, False)
    check('LinkIdentity', {'provider': 'EMAIL_PASSWORD', 'new_password': 'x' * 15, 'confirmed': True})
    check('LinkIdentity', {'provider': 'EMAIL_PASSWORD', 'new_password': 'x' * 15, 'email': 'other@example.invalid', 'confirmed': True}, False)
    check('LoginProof', {'method': 'TOTP', 'code': '012345'})
    check('LoginProof', {'method': 'RECOVERY_CODE', 'recovery_code': 'fixture'})
    check('LoginProof', {'method': 'TOTP', 'code': '012345', 'recovery_code': 'fixture'}, False)
    check('ManageMfa', {'proof': {'method': 'RECOVERY_CODE', 'recovery_code': 'fixture'}})
    check('ManageMfa', {'proof': {'method': 'TOTP', 'code': '012345'}, 'trustDevice': True}, False)
    for value in ['0', '9' * 31, '9' * 100]:
        check('AggregateAmount', value)
    for value in ['-0', '+1', '-1', '01', 1000]:
        check('AggregateAmount', value, False)
    for value in ['-9007199254740993', '0', '9' * 100]:
        check('SignedAggregateAmount', value)
    for value in ['-0', '+1', '01', '-01', 1.0]:
        check('SignedAggregateAmount', value, False)

    # 親子・値の組合せを静的に制限できる範囲。実所有関係はサーバーで確認。
    check('GrantScope', {'role': 'EVENT_OPERATOR', 'permissions': ['CHARGE']})
    check('GrantScope', {'role': 'EVENT_OPERATOR', 'permissions': [], 'shop_id': rid}, False)
    check('GrantScope', {'role': 'CASHIER', 'permissions': ['CREATE_PAYMENT_REQUEST'], 'shop_id': rid, 'register_ids': [rid]})
    check('GrantScope', {'role': 'CASHIER', 'permissions': [], 'shop_id': rid}, False)
    check('GrantScope', {'role': 'CASHIER', 'permissions': ['PLATFORM_ADMIN'], 'shop_id': rid, 'register_ids': [rid]}, False)
    check('ReportFilter', {'scope': 'SHOP', 'shop_id': rid, 'start': ts, 'end': ts, 'display_timezone': 'Asia/Tokyo'})
    check('ReportFilter', {'scope': 'SHOP', 'start': ts, 'end': ts, 'display_timezone': 'Asia/Tokyo'}, False)
    check('ReportFilter', {'scope': 'EVENT', 'shop_id': rid, 'start': ts, 'end': ts, 'display_timezone': 'Asia/Tokyo'}, False)
    # start<endは形式だけでは検証できない。上の同時刻例も業務入力では422。
    check('CashScope', {'scope': 'EVENT'})
    check('CashScope', {'scope': 'OPERATOR', 'operator_account_id': rid})
    check('CashScope', {'scope': 'EVENT', 'operator_account_id': rid}, False)
    check('CashScope', {'scope': 'OPERATOR'}, False)
    for action in [{'action': 'KEEP'}, {'action': 'CLEAR'}, {'action': 'SET', 'password': 'x' * 8}]:
        check('ParticipationPasswordChange', action)
    check('ParticipationPasswordChange', {'action': 'KEEP', 'password': 'x' * 8}, False)
    check('ParticipationPasswordChange', {'action': 'SET', 'password': 'x' * 7}, False)

    # A/B/Cに不要な本人指定/スタッフ経路を混ぜない。QR読取と金銭確定を分離。
    a = {'shop_id': rid, 'register_id': rid, 'mode': 'A', 'basis': 'AMOUNT', 'amount': '500'}
    mutations('CreatePaymentRequest', a, [{'payer_token': 'fixture'}, {'payer_account_id': rid}, {'unit_price': '100'}, {'amount': 500}])
    b = dict(a, mode='B', payer_token='fixture')
    check('CreatePaymentRequest', b)
    check('CreatePaymentRequest', {k: v for k, v in b.items() if k != 'payer_token'}, False)
    c = {k: v for k, v in dict(a, mode='C').items() if k != 'register_id'}
    check('CreatePaymentRequest', c)
    check('CreatePaymentRequest', dict(c, register_id=rid), False)
    mutations('ApprovePaymentRequest', {'expected_version': '1', 'content_version': '1', 'approved': True}, [
        {'approved': False}, {'amount': '999'}, {'payer_account_id': rid}, {'content_version': 1},
    ])
    mutations('CompleteCharge', {'expected_version': '1', 'amount': '500', 'cash_received_confirmed': True}, [
        {'cash_received_confirmed': False}, {'cash_not_received_confirmed': True}, {'account_id': rid},
    ])
    charge = {'charge_id': rid, 'event_id': rid, 'target': {'account_id': rid, 'display_name': '試験', 'verification_code': 'TEST'},
              'assigned_operator_account_id': rid, 'amount': '500', 'currency': 'JPY', 'status': 'PREPARED',
              'version': '1', 'created_at': ts, 'checked_at': ts}
    check('Charge', charge)
    check('Charge', dict(charge, transaction_id=rid), False)
    check('Charge', dict(charge, status='SUCCEEDED'), False)
    check('Charge', dict(charge, status='SUCCEEDED', transaction_id=rid, cash_received_confirmed=True))
    check('Charge', dict(charge, status='INVESTIGATING'), False)
    check('Charge', dict(charge, status='INVESTIGATING', case_id=rid))
    mutations('CompleteTransfer', {'expected_version': '1', 'transfer_request_id': rid, 'recipient_account_id': rid, 'amount': '500', 'approved': True}, [
        {'approved': False}, {'sender_account_id': rid}, {'amount': '0'}, {'expected_version': 1},
    ])
    mutations('ResolveCashCase', {'expected_version': '1', 'cash_fact': 'NOT_HANDED', 'db_outcome': 'COMMITTED', 'evidence_references': ['fixture-audit'], 'confirmed': True, 'reason': '現物と原処理を確認'}, [
        {'cash_fact': 'UNKNOWN'}, {'db_outcome': 'UNKNOWN'}, {'evidence_references': []},
        {'confirmed': False}, {'amount': '500'}, {'reason': ' '},
    ])

    # 返金に伴う在庫戻し、32bit境界、明細数/数量、受取証明。
    restored = {'expected_version': '1', 'product_id': rid, 'kind': 'RETURN_TO_STOCK',
                'refund_line_id': rid, 'quantity': 1, 'resalable_confirmed': True, 'reason': '未開封確認'}
    mutations('CreateInventoryMove', restored, [
        {'resalable_confirmed': False}, {'quantity': 0}, {'quantity': '1'},
        {'quantity': 1000}, {'target_on_hand': 100}, {'reason': ' '},
    ])
    check('CreateInventoryMove', {k: v for k, v in restored.items() if k != 'refund_line_id'}, False)
    stock_add = {'expected_version': '1', 'product_id': rid, 'kind': 'ADD', 'quantity': 2147483647, 'reason': '入荷'}
    check('CreateInventoryMove', stock_add)
    check('CreateInventoryMove', dict(stock_add, quantity=2147483648), False)
    cart = {'shop_id': rid, 'lines': [{'product_id': rid, 'quantity': 999}]}
    check('CreateCart', cart)
    check('CreateCart', dict(cart, lines=[]))
    for quantity in [0, 1000, 1.5, '1']:
        check('CreateCart', dict(cart, lines=[{'product_id': rid, 'quantity': quantity}]), False)
    check('CreateCart', dict(cart, lines=cart['lines'] * 51), False)
    check('CreateCart', dict(cart, reserved=True), False)
    check('CheckoutCart', {'expected_version': '1'})
    check('CheckoutCart', {'expected_version': '1', 'amount': '500'}, False)
    picked = {'expected_version': '2', 'next_status': 'PICKED_UP', 'receipt_proof': {'kind': 'CODE', 'code': '01234567'}}
    check('UpdateFulfillment', picked)
    check('UpdateFulfillment', {k: v for k, v in picked.items() if k != 'receipt_proof'}, False)
    check('UpdateFulfillment', dict(picked, receipt_proof={'kind': 'CODE', 'code': 12345678}), False)
    check('UpdateFulfillment', dict(picked, receipt_proof={'kind': 'CODE', 'code': '0123456'}), False)
    check('UpdateFulfillment', dict(picked, next_status='READY'), False)
    check('UpdateFulfillment', {'expected_version': '1', 'next_status': 'PREPARING'})
    check('DecideOrderCancellation', {'expected_version': '1', 'outcome': 'APPROVE', 'reason': '全額返金済み', 'purchase_refund_id': rid})
    check('DecideOrderCancellation', {'expected_version': '1', 'outcome': 'APPROVE', 'reason': '未払いとみなす'}, False)
    check('DecideOrderCancellation', {'expected_version': '1', 'outcome': 'REJECT', 'reason': '提供可能'})
    check('CallingBoard', {'shop_id': rid, 'items': [{'order_number': 'TEST-001', 'fulfillment_status': 'READY'}], 'next_cursor': None, 'checked_at': ts})
    check('CallingBoard', {'shop_id': rid, 'items': [{'order_number': 'TEST-001', 'fulfillment_status': 'READY', 'display_name': '秘密'}], 'next_cursor': None, 'checked_at': ts}, False)
    export = {'export_id': rid, 'event_id': rid, 'creator_account_id': rid, 'dataset': 'SALES',
              'filter': {'scope': 'EVENT', 'start': ts, 'end': ts, 'display_timezone': 'Asia/Tokyo'},
              'status': 'QUEUED', 'snapshot_id': rid, 'created_at': ts, 'checked_at': ts}
    check('Export', export)
    check('Export', dict(export, status='READY'), False)
    ready = dict(export, status='READY', row_count='9007199254740993', expires_at=ts,
                 parts=[{'part_id': rid, 'index': 1, 'row_count': 100000, 'download_path': '/v1/exports/fixture/parts/fixture/download'}])
    check('Export', ready)
    check('Export', dict(ready, status='EXPIRED'), False)
    check('ExportPart', dict(ready['parts'][0], row_count=100001), False)
    reference = {'resource_type': 'order', 'resource_id': rid, 'query_path': '/v1/events/fixture/orders/fixture'}
    check('RequestResult', {'status': 'SUCCEEDED', 'resource': reference, 'checked_at': ts})
    check('CommandReference', dict(reference, query_path='https://example.invalid'), False)
    for kind in ['charge', 'transfer_request', 'cash_case', 'inventory', 'grant', 'export', 'event']:
        notice = {'resource_type': kind, 'resource_id': rid}
        check('ResourceChanged', notice, False)
        check('ResourceChanged', dict(notice, version='2'))
    cancelled_return = dict(charge, status='CANCELLED', cash_received_confirmed=True, cash_returned_confirmed=True)
    check('Charge', cancelled_return)
    check('Charge', dict(charge, status='CANCELLED', cash_received_confirmed=True), False)
    check('Charge', dict(charge, cash_received_confirmed=True, cash_returned_confirmed=True), False)
    check('RecordUnpostedChargeReturn', {'expected_version': '1', 'resolution_case_id': rid, 'cash_returned_confirmed': True, 'reason': '未成立確認後返却済み'})
    check('RecordUnpostedChargeReturn', {'expected_version': '1', 'resolution_case_id': rid, 'cash_returned_confirmed': False, 'reason': '未成立確認'}, False)
    check('StartExpirationRun', {'policy_version': '1', 'confirmed': True, 'reason': '設定済み期限到来'})
    check('StartExpirationRun', {'policy_version': '1', 'confirmed': True, 'reason': '設定済み期限到来', 'amount': '999'}, False)
    check('CreatePaymentRequest', {'shop_id': rid, 'mode': 'C', 'basis': 'ITEMS', 'lines': [{'product_id': rid, 'quantity': 1}]}, False)
