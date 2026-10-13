"""DB不要の認証段階・復帰・CSVメタの形式ケース。"""
from copy import deepcopy


def run_cases(check, doc):
    rid = '44444444-4444-4444-8444-444444444444'
    ts = '2026-10-09T00:00:00Z'
    tomorrow = '2026-10-10T00:00:00Z'
    anon = {'csrf_token': 'fixture', 'expires_at': tomorrow, 'authenticated': False,
            'authentication_stage': 'ANONYMOUS', 'checked_at': ts}
    challenge = {'challenge_id': rid, 'methods': ['TOTP'], 'expires_at': tomorrow}
    check('AuthContext', anon)
    check('AuthContext', dict(anon, authentication_stage='AUTHENTICATED', authenticated=True))
    pending = dict(anon, authentication_stage='LOGIN_CHALLENGE', login_challenge=challenge)
    check('AuthContext', pending)
    for bad in [dict(anon, authenticated=True), dict(anon, login_challenge=challenge),
                dict(pending, authenticated=True), dict(pending, login_challenge=None),
                {k: v for k, v in pending.items() if k != 'login_challenge'}]:
        check('AuthContext', bad, False)
    check('LoginChallenge', dict(challenge, methods=['TOTP', 'TOTP']), False)
    oauth = {'flow_id': rid, 'authorization_url': 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture', 'expires_at': tomorrow}
    check('OAuthStart', oauth)
    check('OAuthStart', {k: v for k, v in oauth.items() if k != 'flow_id'}, False)
    for url in ['https://accounts.google.com.evil.invalid/o/oauth2/v2/auth?x=1', 'http://accounts.google.com/o/oauth2/v2/auth?x=1', 'javascript:alert(1)']:
        check('OAuthStart', dict(oauth, authorization_url=url), False)
    query = {'code': 'fixture', 'state': 'fixture'}
    check('OAuthCallbackQuery', query)
    check('OAuthCallbackQuery', {'error': 'access_denied', 'state': 'fixture'})
    check('OAuthCallbackQuery', dict(query, scope='openid email', extension='ignored'))
    for bad in [{'state': 'fixture'}, {'code': 'fixture'}, dict(query, error='access_denied'),
                dict(query, extension='x' * 2049), dict(query, **{f'k{i}': 'x' for i in range(31)})]:
        check('OAuthCallbackQuery', bad, False)
    for path in ['/events/%2f%2fevil', '/account?token=secret', '/account#secret', '/account/../other', '/%0d%0aLocation']:
        check('ReturnPath', path, False)
    for path in ['/v1/exports/fixture/parts/fixture/download', '/v1/events/fixture/wallet']:
        check('RelativeApiPath', path)
    for path in ['//evil.invalid', '/v1/../secret', '/v1/wallet?token=secret', '/v1/%0a']:
        check('RelativeApiPath', path, False)
    error = {'code': 'CLIENT_UPDATE_REQUIRED', 'message': '処理が落ち着いたら画面を更新してください', 'request_id': 'fixture', 'retryable': False,
             'update_hint': {'current_revision': 2, 'minimum_write_revision': 2, 'policy_path': '/v1/client-policy'}}
    check('Error', error)
    check('Error', {k: v for k, v in error.items() if k != 'update_hint'}, False)
    violation = {'location': 'BODY', 'field': '/password', 'reason': 'FORMAT'}
    check('FieldViolation', violation)
    check('FieldViolation', dict(violation, value='must-not-echo-secret'), False)
    for revision in [0, 1, 2147483647]:
        check('ClientRevision', revision)
    for revision in [-1, 2147483648, '1', 1.5]:
        check('ClientRevision', revision, False)
    policy = deepcopy(doc['components']['schemas']['ClientPolicy']['examples'][0])
    check('ClientPolicy', policy)
    check('ClientPolicy', dict(policy, recovery_operations=policy['recovery_operations'] + policy['recovery_operations'][:1]), False)
    export = {'export_id': rid, 'event_id': rid, 'creator_account_id': rid, 'dataset': 'SALES', 'csv_schema_version': '1',
              'filter': {'scope': 'EVENT', 'start': ts, 'end': tomorrow, 'display_timezone': 'Asia/Tokyo', 'sales_basis': 'OCCURRENCE'},
              'status': 'QUEUED', 'snapshot_id': rid, 'created_at': ts, 'checked_at': ts}
    check('Export', export)
    generating = dict(export, status='GENERATING', snapshot_at=ts)
    check('Export', generating)
    ready = dict(generating, status='READY', generated_at=ts, expires_at=tomorrow, row_count='0', part_count='1', next_parts_cursor=None,
                 parts=[{'part_id': rid, 'index': 1, 'row_count': 0, 'download_path': '/v1/exports/fixture/parts/fixture/download'}])
    check('Export', ready)
    expired = {k: v for k, v in ready.items() if k not in ['parts', 'next_parts_cursor']}
    expired['status'] = 'EXPIRED'
    check('Export', expired)
    for field in ['snapshot_at', 'generated_at', 'csv_schema_version', 'part_count', 'next_parts_cursor']:
        check('Export', {k: v for k, v in ready.items() if k != field}, False)
    check('Export', dict(export, snapshot_at=ts), False)
    check('Export', dict(generating, parts=ready['parts']), False)
    check('Export', dict(expired, next_parts_cursor='must-not-download'), False)
    check('ExportPartPage', {'export_id': rid, 'snapshot_id': rid, 'items': ready['parts'], 'next_cursor': None, 'checked_at': ts})

    # 期間帰属と商品/注文経路の集計範囲を明示する。
    period = {'scope': 'EVENT', 'start': ts, 'end': tomorrow, 'display_timezone': 'Asia/Tokyo'}
    for basis in ['OCCURRENCE', 'ORIGINAL_PAYMENT_PERIOD']:
        check('SalesBasis', basis)
        check('CreateExport', {'dataset': 'SALES', 'filter': dict(period, sales_basis=basis)})
    check('SalesBasis', 'UNKNOWN', False)
    check('CreateExport', {'dataset': 'SALES', 'filter': period})
    for dataset in ['CASH', 'ORDERS', 'TRANSACTIONS']:
        check('CreateExport', {'dataset': dataset, 'filter': dict(period, sales_basis='OCCURRENCE')}, False)
    missing_basis = deepcopy(export)
    del missing_basis['filter']['sales_basis']
    check('Export', missing_basis, False)
    amounts = {'gross_sales_amount': '600', 'refund_amount': '100', 'net_sales_amount': '500', 'payment_count': '1', 'refund_count': '1'}
    shop = dict(amounts, dimension='SHOP', shop_id=rid)
    route = dict(amounts, dimension='ROUTE', route='MOBILE')
    product = {'dimension': 'PRODUCT', 'shop_id': rid, 'product_id': rid, 'sold_quantity': '0', 'refunded_quantity': '1', 'net_quantity': '-1'}
    for row in [shop, route, product]:
        check('SalesBreakdownRow', row)
    check('SalesBreakdownRow', dict(product, gross_sales_amount='600'), False)
    check('SalesBreakdownRow', dict(route, shop_id=rid), False)
    check('SalesBreakdownRow', dict(route, route='UNASSIGNED'), False)
    page = {'event_id': rid, 'snapshot_id': rid, 'snapshot_at': ts, 'filter': dict(period, sales_basis='OCCURRENCE'), 'dimension': 'SHOP', 'items': [shop], 'next_cursor': None, 'generated_at': ts, 'checked_at': ts}
    check('SalesBreakdownPage', page)
    check('SalesBreakdownPage', dict(page, items=[product]), False)
    check('SalesBreakdownPage', dict(page, filter=period), False)
    check('SalesBreakdownPage', dict(page, items=[]))

    report = dict(amounts, event_id=rid, snapshot_id=rid, snapshot_at=ts, filter=dict(period, sales_basis='OCCURRENCE'), generated_at=ts, checked_at=ts)
    check('SalesReport', report)
    check('SalesReport', dict(report, filter=period), False)
    check('SalesReport', {k: v for k, v in report.items() if k != 'snapshot_at'}, False)

    failed = dict(generating, status='FAILED', failure_code='DEPENDENCY_UNAVAILABLE')
    check('Export', failed)
    check('Export', dict(failed, generated_at=ts), False)
