#!/usr/bin/env python3
"""Check the pinned API, complete operation index, SQL inventory and local links."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import yaml

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--api-ref', help='Compare a new Git ref instead of the recorded API commit')
    a=p.parse_args()
    ref=json.loads((ROOT/'validation/api-reference.json').read_text())
    commit=a.api_ref or ref['commit']
    raw=subprocess.check_output(['git','show',commit+':docs/design/api/openapi.yaml'],cwd=REPO)
    api=yaml.safe_load(raw)
    if not a.api_ref:
        assert hashlib.sha256(raw).hexdigest()==ref['openapi_sha256'], 'API source changed'
        assert api['info']['version']==ref['version']
    ops={op['operationId'] for path in api['paths'].values() for verb,op in path.items()
         if verb in ('get','post','patch','put','delete')}
    mapping=(ROOT/'api-mapping.md').read_text()
    indexed=re.findall(r'^\| `([A-Za-z][A-Za-z0-9]*)` \| `(?:GET|POST|PATCH|PUT|DELETE) ',mapping,re.M)
    assert len(indexed)==len(set(indexed)), 'duplicate operation mapping'
    assert set(indexed)==ops, f'missing={ops-set(indexed)} stale={set(indexed)-ops}'
    if not a.api_ref: assert len(ops)==ref['operation_count']
    sql=(ROOT/'sql/initial-schema-draft.sql').read_text()
    tables=set(re.findall(r'CREATE TABLE (\w+)',sql))
    documented=set(re.findall(r'^### (\w+)$',(ROOT/'physical-schema.md').read_text(),re.M))
    diagram=set(re.findall(r'^  (\w+)$',(ROOT/'er-diagram.md').read_text(),re.M))
    assert tables==documented==diagram, 'table/ER/document inventory differs'
    physical=(ROOT/'physical-schema.md').read_text()
    for table in tables:
        body=re.search(r'CREATE TABLE '+table+r' \((.*?)\n\);',sql,re.S).group(1)
        documented_body=re.search(r'^### '+table+r'\n\n```sql\n(.*?)```',physical,re.M|re.S).group(1)
        normalize=lambda value: [line.strip() for line in value.splitlines() if line.strip()]
        assert normalize(body)==normalize(documented_body), f'column definition differs: {table}'
    inventory=json.loads((ROOT/'validation/table-inventory.json').read_text())
    assert tables==set(inventory), 'inventory changed without update'
    for name,field in [('Transaction','type'),('PaymentRequest','mode'),('PaymentRequest','status'),
                       ('CashRefund','balance_source'),('PurchaseRefund','status'),('GrantScope','role'),
                       ('CashCase','source_type'),('CashCase','cash_fact'),('CashCase','db_outcome'),
                       ('Cart','status'),('Order','fulfillment_status'),('ExpirationRun','status'),('Export','status')]:
        schema=api['components']['schemas'][name]['properties'][field]
        for value in schema.get('enum',[]): assert "'"+value+"'" in sql,(name,field,value)
    for file in ROOT.rglob('*.md'):
        for url in re.findall(r'\[[^\]]*\]\(([^)]+)\)',file.read_text()):
            if '://' in url or url.startswith('#'):continue
            target=(file.parent/url.split('#')[0]).resolve()
            assert target.exists(), f'broken local link {file}: {url}'
    # Check concrete fields that the review found missing from the old physical model.
    for table,columns in {'holds':['source_bucket','hold_transaction_id','release_transaction_id'],
        'cash_operations':['balance_source'], 'refunds':['destination_bucket'],
        'refund_lines':['restored_quantity'],'stock_moves':['kind','refund_line_id','idempotency_id']}.items():
        body=re.search(r'CREATE TABLE '+table+r' \((.*?)\n\);',sql,re.S).group(1)
        for column in columns:assert re.search(r'\b'+column+r'\b',body),(table,column)
    print(f'API {commit[:7]}: {len(ops)} operations, {len(tables)} SQL/ER/physical tables, enums and local links passed.')

if __name__=='__main__':main()
