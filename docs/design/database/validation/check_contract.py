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
    commit=subprocess.check_output(['git','rev-parse','--verify',a.api_ref or ref['commit']],cwd=REPO,text=True).strip()
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
    enum_fields=[('Transaction','type','transactions','type'),
        ('PaymentRequest','mode','payment_requests','mode'),
        ('PaymentRequest','status','payment_requests','status'),
        ('CashRefund','balance_source','cash_operations','balance_source'),
        ('PurchaseRefund','status','refunds','status'),('GrantScope','role','grants','role'),
        ('CashCase','source_type','cash_cases','source_type'),
        ('CashCase','cash_fact','cash_cases','cash_fact'),
        ('CashCase','db_outcome','cash_cases','db_outcome'),
        ('Cart','status','carts','status'),('Order','fulfillment_status','orders','fulfillment_status'),
        ('ExpirationRun','status','expiration_runs','status'),('Export','status','exports','status'),
        ('Correction','cash_return_status','cash_corrections','cash_return_status')]
    for name,field,table,column in enum_fields:
        schema=api['components']['schemas'][name]['properties'][field]
        body=re.search(r'CREATE TABLE '+table+r' \((.*?)\n\);',sql,re.S).group(1)
        checks=re.findall(r'\b'+column+r' IN \(([^)]+)\)',body)
        values=set(re.findall(r"'([^']+)'",' '.join(checks)))
        assert set(schema.get('enum',[])) <= values,(name,field,table,column,values)
    for file in ROOT.rglob('*.md'):
        for url in re.findall(r'\[[^\]]*\]\(([^)]+)\)',file.read_text()):
            if '://' in url or url.startswith('#'):continue
            target=(file.parent/url.split('#')[0]).resolve()
            assert target.exists(), f'broken local link {file}: {url}'
    # Check concrete fields that the review found missing from the old physical model.
    for table,columns in {'holds':['source_bucket','hold_transaction_id','release_transaction_id'],
        'cash_operations':['balance_source'], 'refunds':['destination_bucket'],
        'refund_lines':['restored_quantity'],'stock_moves':['kind','refund_line_id','idempotency_id'],
        'cash_corrections':['cash_return_status'],
        'contact_email_verifications':['account_id','token_id','email','verified_at']}.items():
        body=re.search(r'CREATE TABLE '+table+r' \((.*?)\n\);',sql,re.S).group(1)
        for column in columns:assert re.search(r'\b'+column+r'\b',body),(table,column)
    for operation,required_tables in {
        'requestContactEmailVerification':{'accounts','tokens','contact_email_verifications'},
        'confirmContactEmail':{'accounts','tokens','contact_email_verifications'},
        'correctUndeliveredCashRefund':{'cash_operations','cash_cases','cash_corrections','transactions'},
    }.items():
        row=re.search(r'^\| `'+operation+r'` \|.*$',mapping,re.M).group(0)
        mapped_tables={word.strip() for word in row.split('|')[3].split(',')}
        assert required_tables <= mapped_tables,(operation,required_tables-mapped_tables)
    print(f'API {commit[:7]}: {len(ops)} operations, {len(tables)} SQL/ER/physical tables, enums and local links passed.')

if __name__=='__main__':main()
