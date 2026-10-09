from pathlib import Path
import json, re, sys
sys.dont_write_bytecode = True
import yaml
from jsonschema import Draft202012Validator, FormatChecker
root = Path(__file__).resolve().parents[4]
class UniqueKeyLoader(yaml.SafeLoader):
    def construct_mapping(self, node, deep=False):
        keys = [self.construct_object(key, deep=deep) for key, _ in node.value]
        if len(keys) != len(set(keys)):
            raise ValueError(f'Duplicate YAML key at line {node.start_mark.line + 1}')
        return super().construct_mapping(node, deep=deep)

doc = yaml.load((root / 'docs/design/api/openapi.yaml').read_text(), Loader=UniqueKeyLoader)
checks = 0
def validator(name):
    return Draft202012Validator({'$ref': '#/components/schemas/' + name, 'components': doc['components']}, format_checker=FormatChecker())
def check(name, value, expected=True):
    global checks
    errors = list(validator(name).iter_errors(value))
    assert (not errors) == expected, (name, value, [e.message for e in errors])
    checks += 1
for name, schema in doc['components']['schemas'].items():
    Draft202012Validator.check_schema(schema)
    for example in schema.get('examples', []):
        check(name, example)
for value in ['0', '1', '9007199254740993', '9' * 30]:
    check('Money', value)
for value in ['00', '01', '-1', '+1', '1.0', '1e3', '1,000', ' 1', '1 ', 'NaN', 'Infinity', '', '9' * 31, 1000]:
    check('Money', value, False)
for value in ['0', '-1', '9' * 31, 1000]:
    check('PositiveMoney', value, False)
check('PositiveMoney', '9' * 30)
check('UtcDateTime', '2026-10-09T00:00:00Z')
check('UtcDateTime', '2026-10-09T09:00:00+09:00', False)
check('UtcDateTime', '2026-13-99T00:00:00Z', False)
ts = '2026-10-09T00:00:00Z'
transaction = {'transaction_id':'11111111-1111-4111-8111-111111111111', 'event_id':'33333333-3333-4333-8333-333333333333', 'type':'PAYMENT', 'status':'SUCCEEDED', 'amount':'9007199254740993', 'currency':'JPY', 'occurred_at':ts}
check('Transaction', transaction)
check('RequestResult', {'status':'SUCCEEDED', 'transaction':transaction, 'checked_at':ts})
check('RequestResult', {'status':'SUCCEEDED', 'checked_at':ts}, False)
check('RequestResult', {'status':'REJECTED', 'rejection':{'code':'TOKEN_EXPIRED', 'message':'期限切れ'}, 'checked_at':ts})
check('RequestResult', {'status':'REJECTED', 'checked_at':ts}, False)
for state in ['PENDING', 'UNKNOWN']:
    check('RequestResult', {'status':state, 'checked_at':ts})
    check('RequestResult', {'status':state, 'transaction':transaction, 'checked_at':ts}, False)
check('RequestResult', {'status':'CANCELLED', 'checked_at':ts}, False)
check('Transaction', dict(transaction, status='REJECTED'), False)
check('TransactionPage', {'items':[transaction], 'next_cursor':None, 'checked_at':ts})
check('TransactionPage', {'items':[transaction] * 101, 'next_cursor':None, 'checked_at':ts}, False)
for kind in ['wallet', 'payment_request', 'order']:
    notice = {'resource_type':kind, 'resource_id':transaction['transaction_id']}
    check('ResourceChanged', notice, False)
    check('ResourceChanged', dict(notice, version='2'))
check('ResourceChanged', {'resource_type':'transaction', 'resource_id':transaction['transaction_id']})
check('ResyncNotice', {'reason':'CURSOR_UNAVAILABLE'})
check('ResyncNotice', {'reason':'OTHER_EVENT_EXISTS'}, False)
# 全OpenAPI参照・パスパラメータと要件/受入IDの存在を確認する。
req = (root / 'docs/requirements/event_payment_requirements.md').read_text()
operation_ids = set()
def walk(obj):
    if isinstance(obj, dict):
        if '$ref' in obj:
            ref = obj['$ref']
            assert ref.startswith('#/'), ref
            current = doc
            for part in ref[2:].split('/'):
                current = current[part.replace('~1','/').replace('~0','~')]
        for value in obj.values(): walk(value)
    elif isinstance(obj, list):
        for value in obj: walk(value)
walk(doc)
# リポジトリの権利表示とAPIの公開条件を一致させる。
license_id = 'LicenseRef-FesPay-All-Rights-Reserved'
assert doc['info']['license'] == {'name': 'All rights reserved（権利留保）', 'identifier': license_id}
assert f'SPDX-License-Identifier: {license_id}' in (root / 'LICENSE').read_text()
assert '[権利留保（All rights reserved）](LICENSE)' in (root / 'README.md').read_text()
# SSEはwire全体が文字列であり、各eventのdataだけを対応するJSON型で検証する。
stream = doc['paths']['/v1/events/{event_id}/stream']['get']
event_schemas = stream['x-event-data-schemas']
assert event_schemas == {
    'resource.changed': {'$ref': '#/components/schemas/ResourceChanged'},
    'resync': {'$ref': '#/components/schemas/ResyncNotice'},
}
media = stream['responses']['200']['content']['text/event-stream']
assert media['schema'] == {'type': 'string'}
seen_events = set()
for frame in re.split(r'\r?\n\r?\n', media['example'].strip()):
    fields, data_lines = {}, []
    for line in frame.splitlines():
        if line.startswith(':'):
            continue
        key, _, value = line.partition(':')
        value = value.removeprefix(' ')
        if key == 'data':
            data_lines.append(value)
        else:
            assert key not in fields, f'Duplicate SSE field: {key}'
            fields[key] = value
    assert fields.keys() <= {'id', 'event'}
    event = fields['event']
    assert event in event_schemas and data_lines
    check(event_schemas[event]['$ref'].split('/')[-1], json.loads('\n'.join(data_lines)))
    if event == 'resource.changed':
        check('ResourceId', fields['id'])
    else:
        assert 'id' not in fields, 'resync must not invent an Outbox ID'
    seen_events.add(event)
assert seen_events == event_schemas.keys(), 'Every SSE event needs a wire example'
print('Rights notice and SSE wire examples: passed')
methods = {'get', 'post', 'put', 'patch', 'delete'}
keyed_ids = {'EVENT': set(), 'GLOBAL': set()}
api_ids = set()
for path, path_item in doc['paths'].items():
    for method, op in path_item.items():
        if method not in methods:
            continue
        assert op['operationId'] not in operation_ids
        operation_ids.add(op['operationId'])
        api_ids.update(op['x-api-ids'])
        params = path_item.get('parameters', []) + op.get('parameters', [])
        resolved = [doc['components']['parameters'][p['$ref'].split('/')[-1]] if '$ref' in p else p for p in params]
        assert set(re.findall(r'\{([^}]+)\}', path)) == {p['name'] for p in resolved if p['in'] == 'path'}
        for key in ['x-requirement-ids', 'x-acceptance-test-ids']:
            for identifier in op[key]:
                assert identifier in req, identifier
        if method != 'get':
            assert op['security'] in [[{'sessionCookie': [], 'csrfToken': []}], [{'csrfToken': []}]]
            assert {'409', '401', '403', '404', '422', '503'} <= op['responses'].keys()
            assert op['requestBody']['required']
            assert op['x-state-transitions']
            if op.get('x-idempotency-scope'):
                scope = op['x-idempotency-scope']
                keyed_ids[scope].add(op['operationId'])
                assert any(p['name'] == 'Idempotency-Key' and p['required'] for p in resolved)
                assert '202' in op['responses']
                assert ('{event_id}' in path) == (scope == 'EVENT')
lookup = doc['paths']['/v1/events/{event_id}/transaction-results']['get']
lookup_ops = next(p['schema']['enum'] for p in lookup['parameters'] if p.get('name') == 'operation')
assert set(lookup_ops) == keyed_ids['EVENT'], 'All event commands must be recoverable by their original keys'
global_lookup = doc['paths']['/v1/operation-results']['get']
assert set(next(p['schema']['enum'] for p in global_lookup['parameters'] if p.get('name') == 'operation')) == keyed_ids['GLOBAL']
basic = (root / 'docs/design/basic-design.md').read_text()
logical_ids = set(re.findall(r'^\| ([A-Z]\d{2}) \|', basic, re.M))
assert api_ids == logical_ids, ('Uncovered logical APIs', logical_ids - api_ids, 'Unexpected', api_ids - logical_ids)
coverage = (root / 'docs/design/api/coverage.md').read_text()
assert all(f'`{identifier}`' in coverage for identifier in operation_ids)
assert all(re.search(r'^\| ' + identifier + r' \|', coverage, re.M) for identifier in logical_ids)
# 新規文書と変更した入口の相対リンク確認。
for file in list((root / 'docs/design/api').rglob('*.md')) + [root / 'docs/design/README.md', root / 'docs/adr/README.md'] + list((root / 'docs/adr').glob('000*.md')):
    for target in re.findall(r'\]\(([^)]+)\)', file.read_text()):
        if '://' in target or target.startswith('#'): continue
        assert (file.parent / target.split('#')[0]).exists(), (file, target)
print(f'Initial schema examples and edge cases: {checks} passed')
print(f'OpenAPI references, {len(operation_ids)} operations, requirement IDs and document links: passed')
print('Application/DB acceptance tests: not run (not implemented)')

# 返金契約の異常入力・中間状態。業務認可/実際の残高変化は実装後の受入試験。
rid = '44444444-4444-4444-8444-444444444444'
approval = {'expected_version': '1', 'amount': '500', 'balance_source': 'REFUND_ONLY', 'approved': True}
check('ApproveCashRefund', approval)
for field in approval:
    check('ApproveCashRefund', {k:v for k,v in approval.items() if k != field}, False)
for mutation in [{'approved':False}, {'amount':'0'}, {'expected_version':1}, {'expected_version':'0'}, {'balance_source':'HELD'}, {'account_id':rid}]:
    check('ApproveCashRefund', dict(approval, **mutation), False)
check('PrepareCashRefund', {'identity_token':'fixture-only-not-a-live-token', 'amount':'500', 'balance_source':'AVAILABLE'})
check('PrepareCashRefund', {'identity_token':'fixture', 'amount':'500', 'balance_source':'AVAILABLE', 'account_id':rid}, False)
paid = {'expected_version':'2', 'outcome':'PAID', 'cash_delivered_confirmed':True}
check('CompleteCashRefund', paid)
check('CompleteCashRefund', dict(paid, cash_delivered_confirmed=False), False)
check('CompleteCashRefund', {'expected_version':'2', 'outcome':'PAID'}, False)
check('CompleteCashRefund', dict(paid, cash_not_delivered_confirmed=True), False)
check('CompleteCashRefund', dict(paid, resolution_case_id=rid))
cancelled = {'expected_version':'2', 'outcome':'CANCELLED', 'cash_not_delivered_confirmed':True, 'reason':'未交付確認済み'}
check('CompleteCashRefund', cancelled)
check('CompleteCashRefund', dict(cancelled, reason='   '), False)
check('CompleteCashRefund', dict(cancelled, cash_not_delivered_confirmed=False), False)
check('CompleteCashRefund', {'expected_version':'2', 'outcome':'INVESTIGATING', 'reason':'交付有無不明'})
check('CompleteCashRefund', {'expected_version':'2', 'outcome':'INVESTIGATING'}, False)
prepared = {'cash_refund_id':rid, 'event_id':transaction['event_id'],
    'target':{'account_id':rid, 'display_name':'試験用利用者', 'verification_code':'TEST-01'},
    'assigned_operator_account_id':rid, 'amount':'500', 'currency':'JPY',
    'balance_source':'REFUND_ONLY', 'status':'PREPARED', 'version':'1', 'created_at':ts, 'checked_at':ts}
check('CashRefund', prepared)
check('CashRefund', dict(prepared, hold_transaction_id=rid), False)
held = dict(prepared, status='HELD', hold_transaction_id=rid)
check('CashRefund', held)
check('CashRefund', dict(prepared, status='HELD'), False)
check('CashRefund', dict(held, cash_transaction_id=rid), False)
check('CashRefund', dict(held, status='PAID'), False)
check('CashRefund', dict(held, status='PAID', cash_transaction_id=rid))
check('CashRefund', dict(held, status='INVESTIGATING'), False)
check('CashRefund', dict(held, status='INVESTIGATING', investigation_reason='不明', case_id=rid))
check('CashRefund', dict(held, status='CANCELLED', cancellation_reason='未交付', cash_not_delivered_confirmed=True), False)
check('CashRefund', dict(held, status='CANCELLED', cancellation_reason='未交付', cash_not_delivered_confirmed=True, release_transaction_id=rid))
check('CashRefund', dict(prepared, status='CANCELLED', cancellation_reason='未交付', cash_not_delivered_confirmed=True))
amount_request = {'original_transaction_id':rid, 'basis':'AMOUNT', 'amount':'300', 'reason':'購入取消'}
check('CreatePurchaseRefund', amount_request)
for mutation in [{'amount':'0'}, {'amount':300}, {'payer_account_id':rid}, {'credited_to':'AVAILABLE'}, {'shop_id':rid}, {'unit_price':'100'}, {'reason':' '}, {'lines':[{'original_order_line_id':rid, 'quantity':1}]}]:
    check('CreatePurchaseRefund', dict(amount_request, **mutation), False)
items_request = {'original_transaction_id':rid, 'basis':'ITEMS', 'lines':[{'original_order_line_id':rid, 'quantity':1}], 'reason':'1点取消'}
check('CreatePurchaseRefund', items_request)
check('CreatePurchaseRefund', dict(items_request, amount='300'), False)
check('CreatePurchaseRefund', dict(items_request, lines=[]), False)
for quantity in [0, -1, 1.5, 1000, '1']:
    check('CreatePurchaseRefund', dict(items_request, lines=[{'original_order_line_id':rid, 'quantity':quantity}]), False)
check('ExecutePurchaseRefund', {'expected_version':'1', 'confirmed':True})
check('ExecutePurchaseRefund', {'expected_version':'1', 'confirmed':False}, False)
check('ExecutePurchaseRefund', {'expected_version':'1', 'confirmed':True, 'amount':'999'}, False)
purchase = {'purchase_refund_id':rid, 'event_id':transaction['event_id'], 'shop_id':rid,
    'original_transaction_id':rid, 'payer_account_id':rid, 'basis':'AMOUNT', 'amount':'300',
    'currency':'JPY', 'status':'REQUESTED', 'reason':'取消', 'version':'1', 'created_at':ts, 'checked_at':ts}
check('PurchaseRefund', purchase)
check('PurchaseRefund', dict(purchase, refund_transaction_id=rid), False)
check('PurchaseRefund', dict(purchase, credited_to='AVAILABLE'), False)
check('PurchaseRefund', dict(purchase, status='SUCCEEDED'), False)
check('PurchaseRefund', dict(purchase, status='SUCCEEDED', credited_to='REFUND_ONLY', refund_transaction_id=rid))
check('PurchaseRefund', dict(purchase, status='INVESTIGATING'), False)
check('PurchaseRefund', dict(purchase, status='INVESTIGATING', investigation_code='DB_UNAVAILABLE'))
check('PurchaseRefund', dict(purchase, status='REJECTED'), False)
check('PurchaseRefund', dict(purchase, status='REJECTED', rejection_code='REFUND_LIMIT_EXCEEDED'))
check('PurchaseRefund', dict(purchase, basis='ITEMS'), False)
check('RequestResult', {'status':'SUCCEEDED', 'resource':prepared, 'checked_at':ts})
check('RequestResult', {'status':'SUCCEEDED', 'resource':purchase, 'checked_at':ts})
check('RequestResult', {'status':'SUCCEEDED', 'resource':purchase, 'transaction':transaction, 'checked_at':ts}, False)
check('RequestResult', {'status':'UNKNOWN', 'resource':purchase, 'checked_at':ts}, False)
for resource_type in ['cash_refund','purchase_refund']:
    check('ResourceChanged', {'resource_type':resource_type, 'resource_id':rid}, False)
    check('ResourceChanged', {'resource_type':resource_type, 'resource_id':rid, 'version':'2'})
from contract_cases import run_cases
run_cases(check)
print(f'Total schema examples and edge cases: {checks} passed')
print(f'Keyed command security and result lookup coverage: {sum(map(len, keyed_ids.values()))} operations passed')
print(f'Basic design logical API coverage: {len(logical_ids)} IDs passed')
