"""実際のRedocly CLIで、成功応答・SSE・権利表示の欠落を検出できることを確認する。"""
from copy import deepcopy
import json
from pathlib import Path
import subprocess
import tempfile

import yaml

root = Path(__file__).resolve().parents[4]
source = root / 'docs/design/api/openapi.yaml'
doc = yaml.safe_load(source.read_text())
callback_path = '/v1/auth/google/callback'
stream_path = '/v1/events/{event_id}/stream'
success_rule = 'fespay/operation-success-response'


def lint(path):
    result = subprocess.run([
        'npx', '--yes', '@redocly/cli@2.60.0', 'lint', str(path),
        '--config', str(root / 'redocly.yaml'), '--format=json',
    ], cwd=root, capture_output=True, text=True, timeout=60)
    try:
        report = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(f'Lint did not return JSON: {result.stderr}') from error
    assert report['version'] == '2.60.0', report['version']
    return result.returncode, report


code, report = lint(source)
assert code == 0 and report['totals'] == {'errors': 0, 'warnings': 0, 'ignored': 0}, report

cases = []


def case(name, expected_rule, mutate):
    changed = deepcopy(doc)
    mutate(changed)
    cases.append((name, expected_rule, changed))


case('ordinary API loses 200', success_rule,
     lambda d: d['paths']['/v1/events/{event_id}/wallet']['get']['responses'].pop('200'))
case('302 on an ordinary API is not accepted', success_rule,
     lambda d: d['paths']['/v1/events/{event_id}/wallet']['get']['responses'].update(
         {'302': d['paths']['/v1/events/{event_id}/wallet']['get']['responses'].pop('200')}))
case('callback loses 302', success_rule,
     lambda d: d['paths'][callback_path]['get']['responses'].pop('302'))
case('callback adds a fictional 200', success_rule,
     lambda d: d['paths'][callback_path]['get']['responses'].update({'200': {'description': 'Wrong'}}))
case('callback loses Location', success_rule,
     lambda d: d['paths'][callback_path]['get']['responses']['302']['headers'].pop('Location'))
case('callback allows arbitrary Location', success_rule,
     lambda d: d['paths'][callback_path]['get']['responses']['302']['headers']['Location'].update(
         {'schema': {'type': 'string'}}))
case('callback loses no-store', success_rule,
     lambda d: d['paths'][callback_path]['get']['responses']['302']['headers'].pop('Cache-Control'))
case('SSE reference is broken', 'no-unresolved-refs',
     lambda d: d['paths'][stream_path]['get']['x-event-data-schemas']['resync'].update(
         {'$ref': '#/components/schemas/MissingNotice'}))
case('removed SSE use is detected', 'no-unused-components',
     lambda d: d['paths'][stream_path]['get']['x-event-data-schemas'].pop('resync'))
case('an unrelated unused schema is detected', 'no-unused-components',
     lambda d: d['components']['schemas'].update({'UnusedFixture': {'type': 'string'}}))
case('rights metadata is missing', 'info-license', lambda d: d['info'].pop('license'))
case('OAuth query reference is broken', 'no-unresolved-refs',
     lambda d: d['paths'][callback_path]['get']['x-query-schema'].update(
         {'$ref': '#/components/schemas/MissingQuery'}))
case('removed OAuth query use is detected', 'no-unused-components',
     lambda d: d['paths'][callback_path]['get'].pop('x-query-schema'))

with tempfile.TemporaryDirectory(prefix='fespay-api-lint-') as directory:
    for index, (name, expected_rule, changed) in enumerate(cases):
        path = Path(directory) / f'case-{index}.json'
        path.write_text(json.dumps(changed, ensure_ascii=False))
        code, report = lint(path)
        detected = {p['ruleId'] for p in report['problems'] if p['severity'] == 'error'}
        assert code != 0 and expected_rule in detected, (name, code, report)
        assert report['totals']['ignored'] == 0, (name, report)

print('Redocly 2.60.0: 0 errors, 0 warnings, 0 ignored')
print(f'Lint regression cases: {len(cases)} rejected as expected')
