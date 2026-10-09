"""OpenAPI拡張と設計用参照手順を、DBなしで照合する。"""
from copy import deepcopy
import csv
import io
import json
from pathlib import Path
import sys
sys.dont_write_bytecode = True
import yaml
from wire_reference import InputFailure, decode_json, revision_gate, export_metadata, csv_cell, csv_parts, sales_totals

root = Path(__file__).resolve().parents[4]
doc = yaml.safe_load((root / 'docs/design/api/openapi.yaml').read_text())
operations = {o['operationId']: (m, o) for p in doc['paths'].values() for m, o in p.items() if m in {'get', 'post', 'put', 'patch', 'delete'}}
policy = doc['x-http-policy']
checks = 0


def expect(action, expected=None, failure=None):
    global checks
    try:
        result = action()
    except InputFailure as error:
        assert failure == (error.status, error.code), (failure, error.status, error.code)
    except AssertionError:
        assert failure is AssertionError
    else:
        assert failure is None
        if expected is not None:
            assert result == expected, (result, expected)
    checks += 1


for raw in [b'{"a":1,"a":2}', b'{"v":NaN}', b'{"v":Infinity}', b'{"v":1e400}', b'{"v":"\\ud800"}', b'\xff', b'{']:
    expect(lambda raw=raw: decode_json(raw, policy), failure=(400, 'MALFORMED_REQUEST'))
expect(lambda: decode_json(b'', policy), failure=(422, 'VALIDATION_ERROR'))
expect(lambda: decode_json(b'null', policy), failure=(422, 'VALIDATION_ERROR'))
raw = json.dumps({'v': 'x' * (policy['json_max_bytes'] - 8)}, separators=(',', ':')).encode()
expect(lambda: len(raw), policy['json_max_bytes'])
expect(lambda: decode_json(raw, policy))
expect(lambda: decode_json(raw + b' ', policy), failure=(413, 'PAYLOAD_TOO_LARGE'))
value = 0
for _ in range(policy['json_max_depth']):
    value = {'a': value}
expect(lambda: decode_json(json.dumps(value).encode(), policy))
expect(lambda: decode_json(json.dumps({'a': value}).encode(), policy), failure=(413, 'PAYLOAD_TOO_LARGE'))
expect(lambda: decode_json(json.dumps({'a': [0] * (policy['json_max_nodes'] - 2)}).encode(), policy))
expect(lambda: decode_json(json.dumps({'a': [0] * (policy['json_max_nodes'] - 1)}).encode(), policy), failure=(413, 'PAYLOAD_TOO_LARGE'))

for oid, (method, op) in operations.items():
    assert op['x-client-revision-policy'] in ['READ', 'RECOVERY', 'CURRENT']
    if method == 'get':
        assert op['x-client-revision-policy'] == 'READ'
    else:
        assert any(p.get('$ref', '').endswith('/ClientRevision') for p in op['parameters'])
        assert {'400', '413', '415'} <= op['responses'].keys()
        assert op['x-max-request-bytes'] == (policy['multipart_max_bytes'] if oid == 'uploadProductImage' else policy['json_max_bytes'])
    for status, r in op['responses'].items():
        if '$ref' in r:
            r = doc['components']['responses'][r['$ref'].split('/')[-1]]
        assert {'Cache-Control', 'X-FesPay-Contract-Revision', 'X-FesPay-Min-Write-Revision'} <= r['headers'].keys()
recovery = {oid for oid, (_, op) in operations.items() if op['x-client-revision-policy'] == 'RECOVERY'}
example = doc['components']['schemas']['ClientPolicy']['examples'][0]
assert set(example['recovery_operations']) == recovery
assert example['minimum_write_revision'] <= example['current_revision']
assert doc['x-client-policy-defaults'] == {k: v for k, v in example.items() if k != 'checked_at'}
checks += 1
current = operations['approvePaymentRequest'][1]
for kwargs, wanted in [({}, 'CLIENT_UPDATE_REQUIRED'), ({'saved': True}, 'RETURN_SAVED'),
                        ({'saved': True, 'same_content': False}, 'IDEMPOTENCY_CONFLICT'),
                        ({'saved': True, 'authorized': False}, 'DENY_CURRENT_AUTHORIZATION')]:
    expect(lambda kwargs=kwargs: revision_gate(current, 1, 2, **kwargs), wanted)
expect(lambda: revision_gate(current, 2, 2), 'ALLOW_WITH_NORMAL_VALIDATION')
expect(lambda: revision_gate(operations['getMyWallet'][1], 0, 2), 'ALLOW_WITH_NORMAL_VALIDATION')
for oid in ['completeCashRefund', 'completeCharge', 'revokeMySessions', 'verifyMfaTotp']:
    expect(lambda oid=oid: revision_gate(operations[oid][1], 0, 2), 'ALLOW_WITH_NORMAL_VALIDATION')
    expect(lambda oid=oid: revision_gate(operations[oid][1], 0, 2, authorized=False), 'DENY_CURRENT_AUTHORIZATION')

catalog = doc['x-error-catalog']
for name, r in doc['components']['responses'].items():
    if 'x-error-codes' in r:
        statuses = {catalog[c]['http_status'] for c in r['x-error-codes']}
        assert len(statuses) == 1, name
for c, v in catalog.items():
    assert isinstance(v['retryable'], bool) and v['client_action']
    if v['http_status'] in [400, 401, 403, 404, 409, 413, 415, 422]:
        assert v['retryable'] is False, c
checks += 1

rid = '44444444-4444-4444-8444-444444444444'
ready = {'status': 'READY', 'filter': {'start': '2026-10-08T00:00:00Z', 'end': '2026-10-09T00:00:00Z'},
         'created_at': '2026-10-09T00:00:00Z', 'snapshot_at': '2026-10-09T00:00:01Z', 'generated_at': '2026-10-09T00:00:02Z',
         'expires_at': '2026-10-10T00:00:02Z', 'row_count': '0', 'part_count': '1', 'next_parts_cursor': None,
         'parts': [{'part_id': rid, 'index': 1, 'row_count': 0}]}
expect(lambda: export_metadata(ready))
for change in [{'expires_at': '2026-10-10T00:00:01Z'}, {'snapshot_at': '2026-10-08T00:00:00Z'},
               {'row_count': '1'}, {'part_count': '0'}, {'next_parts_cursor': 'unexpected'},
               {'parts': [{'part_id': rid, 'index': 2, 'row_count': 0}]}]:
    expect(lambda change=change: export_metadata(dict(ready, **change)), failure=AssertionError)
bad = deepcopy(ready)
bad['filter']['end'] = bad['filter']['start']
expect(lambda: export_metadata(bad), failure=AssertionError)
many = dict(ready, row_count='10000001', part_count='101', next_parts_cursor='next',
            parts=[{'part_id': f'00000000-0000-4000-8000-{i:012d}', 'index': i, 'row_count': 100000} for i in range(1, 101)])
expect(lambda: export_metadata(many))
expect(lambda: export_metadata(dict(many, next_parts_cursor=None)), failure=AssertionError)

for text in ['=1+1', '+cmd', '-店名', '@SUM(A1)', '\tplain', '\nplain', '  =1+1', '  \tplain', '  \nplain', '\u00a0=1+1']:
    expect(lambda text=text: csv_cell(text).startswith("'"), True)
expect(lambda: csv_cell('\x00=1').startswith("'"), True)
expect(lambda: csv_cell('9' * 31, 'unsigned'), '9' * 31)
expect(lambda: csv_cell('-9007199254740993', 'signed'), '-9007199254740993')
for value in ['=1+1', '-0', '01', '1e3']:
    expect(lambda value=value: csv_cell(value, 'signed'), failure=AssertionError)

# 返金発生日集計と原決済期間の再集計は、同じ値を無言で差し替えない。
payments = [{'id': rid, 'occurred_at': '2026-10-08T12:00:00Z', 'amount': '600'}]
refunds = [{'original_id': rid, 'occurred_at': '2026-10-09T12:00:00Z', 'amount': '100'}]
for args, wanted in [
    (('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-09T00:00:00Z', 'ORIGINAL_PAYMENT_PERIOD'), ('600', '0', '600')),
    (('2026-10-08T00:00:00Z', '2026-10-09T00:00:00Z', '2026-10-10T00:00:00Z', 'ORIGINAL_PAYMENT_PERIOD'), ('600', '100', '500')),
    (('2026-10-09T00:00:00Z', '2026-10-10T00:00:00Z', '2026-10-10T00:00:00Z', 'OCCURRENCE'), ('0', '100', '-100')),
]:
    expect(lambda args=args: sales_totals(payments, refunds, *args), wanted)

columns = doc['x-csv-contract']['columns']
for dataset in ['TRANSACTIONS', 'SALES', 'ORDERS', 'CASH']:
    assert len(columns[dataset]) == len(set(columns[dataset]))
    assert not {'email', 'password', 'token', 'identity_token', 'payer_account_id'} & set(columns[dataset])
    count, content = next(csv_parts(columns[dataset], []))
    assert count == 0 and content.startswith(b'\xef\xbb\xbf') and content.endswith(b'\r\n')
    assert list(csv.reader(io.StringIO(content.decode('utf-8-sig')))) == [columns[dataset]]
    checks += 1
row = {'name': '店名,"引用"\n次行', 'amount': '9' * 31, 'net': '-1'}
_, content = next(csv_parts(['name', 'amount', 'net'], [row], {'amount': 'unsigned', 'net': 'signed'}))
expect(lambda: list(csv.reader(io.StringIO(content.decode('utf-8-sig'), newline='')))[1], ['店名,"引用"\r\n次行', '9' * 31, '-1'])
assert b'""' in content and content.count(b'\xef\xbb\xbf') == 1
for rows, expected_counts in [(100000, [100000]), (100001, [100000, 1])]:
    parts = list(csv_parts(['amount'], ({'amount': '1'} for _ in range(rows)), {'amount': 'unsigned'}))
    expect(lambda: [n for n, _ in parts], expected_counts)
    assert sum(n for n, _ in parts) == rows
    for n, content in parts:
        assert len(list(csv.reader(io.StringIO(content.decode('utf-8-sig'))))) == n + 1

print(f'Wire/reference cases: {checks} passed')
print(f'HTTP headers/input limits/revision policies: {len(operations)} operations passed')
print(f'Error catalog: {len(catalog)} codes passed; recovery allowlist: {len(recovery)} operations passed')
print('Application, DB, real OAuth, browser, image decoder and performance: not tested')
