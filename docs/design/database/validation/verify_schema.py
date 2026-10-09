#!/usr/bin/env python3
"""Run real PostgreSQL constraints and a two-connection restore race in isolation."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
serial = 1000

def uid():
    global serial
    serial += 1
    return str(uuid.UUID(int=serial))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--image', default='postgres:16-alpine')
    ap.add_argument('--output', type=Path)
    args = ap.parse_args()
    name = 'fespay-schema-' + uuid.uuid4().hex[:10]
    checks = []
    def psql(sql, app=True):
        return subprocess.run(['docker', 'exec', '-i', name, 'psql', '-U', 'postgres', '-X', '-At',
                               '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
                              input=('SET ROLE fespay_app;\n' if app else '') + sql,
                              capture_output=True, text=True, timeout=30)
    def check(label, body, code=None):
        r = psql('BEGIN;\n' + body + '\nSET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;')
        match = re.search(r'ERROR:\s+([0-9A-Z]{5}):', r.stderr)
        actual = match.group(1) if match else None
        okay = (r.returncode == 0) if code is None else (r.returncode != 0 and actual == code)
        checks.append({'case': label, 'passed': okay, 'expected_sqlstate': code, 'actual_sqlstate': actual})
        if not okay:
            raise AssertionError(label + '\n' + r.stdout + '\n' + r.stderr)
    A, B, E, E2, P, P2, W, W2, SHOP, SHOP2, PROD, INV = [uid() for _ in range(12)]
    def key(event=E, operation='completeCharge', value=None, scope='EVENT'):
        k = uid(); target = uid()
        e = 'NULL' if event is None else "'" + event + "'"
        value = value or uid()
        return k, f"INSERT INTO idempotency_keys(id,scope,event_id,actor_account_id,operation,key,request_hash,status,result_kind,result_resource_id) VALUES('{k}','{scope}',{e},'{A}','{operation}','{value}',decode(repeat('01',32),'hex'),'SUCCEEDED','COMMAND','{target}');\n"
    def synchronize():
        return """UPDATE wallets w SET available_amount=coalesce((SELECT sum(amount) FROM ledger_entries WHERE wallet_id=w.id AND account_code='WALLET_AVAILABLE'),0), held_amount=coalesce((SELECT sum(amount) FROM ledger_entries WHERE wallet_id=w.id AND account_code='WALLET_HELD'),0), refund_only_amount=coalesce((SELECT sum(amount) FROM ledger_entries WHERE wallet_id=w.id AND account_code='WALLET_REFUND_ONLY'),0);\n"""
    def tx(kind='CHARGE', amount=100, entries=None, payment=None, source=None, origin=None, kid=None):
        tid = uid(); ksql = ''
        if kid is None: kid, ksql = key(operation='test' + kind)
        origin_kind = {'CASH_REFUND_HOLD':'HOLD', 'CASH_REFUND_RELEASE':'HOLD_RELEASE',
                       'CASH_REFUND_PAID':'HOLD_RELEASE','PURCHASE_REFUND':'REFUND',
                       'CHARGE_REVERSAL':'CORRECTION','CASH_REFUND_CORRECTION':'CORRECTION',
                       'EXPIRATION':'EXPIRATION_ITEM'}.get(kind,kind)
        origin = origin or payment or uid()
        payment_sql = 'NULL' if payment is None else "'"+payment+"'"
        source_sql = 'NULL' if source is None else "'"+source+"'"
        body = ksql + f"INSERT INTO transactions(id,event_id,type,amount,actor_account_id,idempotency_id,source_transaction_id,payment_request_id,origin_kind,origin_id,occurred_at) VALUES('{tid}','{E}','{kind}',{amount},'{A}','{kid}',{source_sql},{payment_sql},'{origin_kind}','{origin}',now());\n"
        if entries is None: entries = [('WALLET_AVAILABLE', W, None, amount), ('EVENT_CASH', None, None, -amount)]
        for code,wallet,shop,value in entries:
            wsql = 'NULL' if wallet is None else "'"+wallet+"'"
            ssql = 'NULL' if shop is None else "'"+shop+"'"
            body += f"INSERT INTO ledger_entries(id,event_id,transaction_id,account_code,wallet_id,shop_id,amount) VALUES('{uid()}','{E}','{tid}','{code}',{wsql},{ssql},{value});\n"
        return tid, body + synchronize()
    def request(mode='A', payer=None, status='CREATED', shop=SHOP):
        pid = uid(); payer_sql = 'NULL' if payer is None else "'"+payer+"'"
        expiry = "now()+interval '180 seconds'" if status=='AWAITING_APPROVAL' else 'NULL'
        return pid, f"INSERT INTO payment_requests(id,event_id,shop_id,payer_account_id,mode,basis,status,amount,content_snapshot,content_hash,approval_expires_at) VALUES('{pid}','{E}','{shop}',{payer_sql},'{mode}','ITEMS','{status}',100,'{{}}',decode(repeat('01',32),'hex'),{expiry});\n"
    try:
        subprocess.run(['docker','run','--rm','--detach','--pull','never','--name',name,'--network','none',
                        '--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',args.image],
                       check=True, capture_output=True, text=True)
        # Initialization uses a socket-only temporary server, then stops it.
        # Only the final server listens on loopback TCP, even with network none.
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            if subprocess.run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True).returncode==0: break
            time.sleep(.1)
        else: raise RuntimeError('isolated PostgreSQL not ready')
        server_version=psql('SHOW server_version;',False).stdout.strip()
        r = psql((ROOT/'sql/initial-schema-draft.sql').read_text(),False)
        if r.returncode: raise AssertionError('schema apply\n'+r.stderr)
        role = psql('CREATE ROLE fespay_app NOLOGIN; GRANT USAGE ON SCHEMA public TO fespay_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO fespay_app;',False)
        if role.returncode: raise AssertionError(role.stderr)
        seed = f"""BEGIN;
INSERT INTO accounts(id) VALUES('{A}'),('{B}');
INSERT INTO events(id,owner_account_id,name,starts_at,ends_at) VALUES('{E}','{A}','one',now(),now()+interval '1 day'),('{E2}','{A}','two',now(),now()+interval '1 day');
INSERT INTO event_policies(id,event_id,policy_version,terms,effective_at,created_by) VALUES('{P}','{E}',1,'{{}}',now(),'{A}'),('{P2}','{E2}',1,'{{}}',now(),'{A}');
INSERT INTO memberships(id,event_id,account_id,accepted_policy_version,joined_at) VALUES('{uid()}','{E}','{A}',1,now()),('{uid()}','{E2}','{A}',1,now());
INSERT INTO wallets(id,event_id,account_id) VALUES('{W}','{E}','{A}'),('{W2}','{E2}','{A}');
INSERT INTO shops(id,event_id,name,status) VALUES('{SHOP}','{E}','one','OPEN'),('{SHOP2}','{E}','two','OPEN');
INSERT INTO products(id,event_id,shop_id,name,price,status) VALUES('{PROD}','{E}','{SHOP}','food',50,'ON_SALE');
INSERT INTO inventory(id,event_id,shop_id,product_id) VALUES('{INV}','{E}','{SHOP}','{PROD}');
"""
        charge, body = tx(amount=500); seed += body
        payment_req, body = request(); seed += body
        payment, body = tx('PAYMENT',100,[('WALLET_AVAILABLE',W,None,-100),('SHOP_SALES',None,SHOP,100)],payment=payment_req); seed += body
        seed += f"UPDATE payment_requests SET status='SUCCEEDED',payer_account_id='{A}',transaction_id='{payment}' WHERE id='{payment_req}';\n"
        order, line, refund, refund_line = [uid() for _ in range(4)]
        seed += f"""INSERT INTO orders(id,event_id,shop_id,account_id,payment_request_id,transaction_id,display_number,route,fulfillment_status,total_amount) VALUES('{order}','{E}','{SHOP}','{A}','{payment_req}','{payment}','1','REGISTER_A','ACCEPTED',100);
INSERT INTO order_lines(id,event_id,shop_id,order_id,product_id,product_name_snapshot,unit_price,quantity,line_total,product_version) VALUES('{line}','{E}','{SHOP}','{order}','{PROD}','food',50,2,100,1);
"""
        rk, body = key(operation='executePurchaseRefund'); seed += body
        refund_tx, body = tx('PURCHASE_REFUND',50,[('WALLET_AVAILABLE',W,None,50),('SHOP_SALES',None,SHOP,-50)],source=payment,origin=refund,kid=rk); seed += body
        seed += f"""INSERT INTO refunds(id,event_id,shop_id,original_transaction_id,order_id,requested_by,basis,amount,destination_bucket,refund_transaction_id,status,reason,idempotency_id) VALUES('{refund}','{E}','{SHOP}','{payment}','{order}','{A}','ITEMS',50,'AVAILABLE','{refund_tx}','SUCCEEDED','test','{rk}');
INSERT INTO refund_lines(id,event_id,shop_id,refund_id,order_line_id,product_id,quantity,amount) VALUES('{refund_line}','{E}','{SHOP}','{refund}','{line}','{PROD}',1,50);
COMMIT;"""
        r = psql(seed)
        if r.returncode: raise AssertionError('fixture\n'+r.stderr)
        for value, expected in [('0',None),('999999999999999999999999999999',None),('-1','23514'),('1.5','23514'),("'NaN'",'23514'),("'Infinity'",'23514'),('1000000000000000000000000000000','23514')]:
            check('nonnegative_yen '+value, 'SELECT ('+value+')::nonnegative_yen;',expected)
        for value, expected in [('1',None),('0','23514'),("'NaN'",'23514')]: check('positive_yen '+value,'SELECT ('+value+')::positive_yen;',expected)
        check('ledger 31 digits','SELECT 1000000000000000000000000000000::signed_ledger_yen;','23514')
        for v,c in [('2147483647',None),('2147483648','23514'),('-1','23514')]: check('stock boundary '+v,'SELECT ('+v+')::stock_count;',c)
        _, body = key(None,'createEvent',scope='GLOBAL'); check('GLOBAL no event persists',body)
        _, b1 = key(None,'createEvent','same-global','GLOBAL'); _, b2 = key(None,'createEvent','same-global','GLOBAL'); check('GLOBAL duplicate',b1+b2,'23505')
        _, body = key(E,'createEvent',scope='GLOBAL'); check('GLOBAL cannot contain event',body,'23514')
        _, body = key(None,scope='EVENT'); check('EVENT needs event',body,'23514')
        _, b1 = key(E,value='same-event'); _, b2 = key(E,value='same-event'); check('EVENT duplicate',b1+b2,'23505')
        kid, body = key(E2); _, extra = tx(kid=kid); check('foreign-event idempotency key',body+extra,'23503')
        _, body = tx(entries=[]); check('zero ledger entries',body,'23514')
        _, body = tx(entries=[('WALLET_AVAILABLE',W,None,100)]); check('single unbalanced entry',body,'23514')
        _, body = tx(); check('balanced complete transaction',body)
        _, body = tx(entries=[('WALLET_AVAILABLE',W2,None,100),('EVENT_CASH',None,None,-100)]); check('foreign-event ledger wallet',body,'23503')
        check('transaction mutation',f"UPDATE transactions SET amount=99 WHERE id='{charge}';",'23514')
        check('ledger mutation',f"UPDATE ledger_entries SET amount=99 WHERE transaction_id='{charge}';",'23514')
        check('ledger delete',f"DELETE FROM ledger_entries WHERE transaction_id='{charge}';",'23514')
        check('cannot append balanced entries to committed transaction',f"INSERT INTO ledger_entries(id,event_id,transaction_id,account_code,amount) VALUES('{uid()}','{E}','{charge}','EVENT_CASH',100),('{uid()}','{E}','{charge}','EVENT_CASH',-100);",'23514')
        check('policy mutation',f"UPDATE event_policies SET terms='{{\"bad\":true}}' WHERE id='{P}';",'23514')
        check('wallet projection mismatch',f"UPDATE wallets SET available_amount=999 WHERE id='{W}';",'23514')
        check('app cannot drop constraints','ALTER TABLE wallets DROP CONSTRAINT wallets_pkey;','42501')
        k, body=key(operation='createPaidOrder'); _, extra=tx('PAYMENT',100,[('WALLET_AVAILABLE',W,None,-100),('SHOP_SALES',None,SHOP,100)],payment=payment_req,kid=k);check('different operation/key same payment',body+extra,'23505')
        check('paid payer cannot change',f"UPDATE payment_requests SET payer_account_id='{B}' WHERE id='{payment_req}';",'23514')
        _, b1=request('B',A,'AWAITING_APPROVAL');_, b2=request('B',A,'AWAITING_APPROVAL');check('one B awaiting',b1+b2,'23505')
        def cash(source='AVAILABLE',amount=100):
            cid=uid(); return cid,f"INSERT INTO cash_operations(id,event_id,account_id,operator_account_id,type,balance_source,status,amount) VALUES('{cid}','{E}','{A}','{A}','CASH_REFUND','{source}','PREPARED',{amount});\n"
        _, b1=cash();_, b2=cash('REFUND_ONLY');check('open cash refund shared across buckets',b1+b2,'23505')
        cid,body=cash();check('cash source fixed',body+f"UPDATE cash_operations SET balance_source='REFUND_ONLY' WHERE id='{cid}';",'23514')
        hid=uid();cid,body=cash();ht,extra=tx('CASH_REFUND_HOLD',100,[('WALLET_AVAILABLE',W,None,-100),('WALLET_HELD',W,None,100)],origin=hid);body+=extra
        body+=f"INSERT INTO holds(id,event_id,wallet_id,cash_operation_id,source_bucket,hold_transaction_id,amount,status,warning_at,investigate_after) VALUES('{hid}','{E}','{W}','{cid}','AVAILABLE','{ht}',100,'HELD',now()+interval '5 minutes',now()+interval '30 minutes');\n"
        check('hold origin and balanced bucket move',body)
        check('hold source mismatch',body.replace("'AVAILABLE','"+ht,"'REFUND_ONLY','"+ht),'23503')
        check('hold amount mismatch',body.replace("'"+ht+"',100,'HELD'","'"+ht+"',99,'HELD'"),'23514')
        g1,g2=uid(),uid()
        grant=f"INSERT INTO grants(id,event_id,account_id,role,granted_by) VALUES('{g1}','{E}','{A}','EVENT_OPERATOR','{A}'),('{g2}','{E}','{A}','EVENT_OPERATOR','{A}');\n"
        permission=lambda gid:f"INSERT INTO grant_permissions(id,event_id,grant_id,account_id,permission) VALUES('{uid()}','{E}','{gid}','{A}','READ_REPORT');\n"
        check('NULL scope grant duplicate',grant+permission(g1)+permission(g2),'23505')
        check('grant permission shop mismatch',grant+f"INSERT INTO grant_permissions(id,event_id,grant_id,account_id,shop_id,permission) VALUES('{uid()}','{E}','{g1}','{A}','{SHOP}','READ_REPORT');",'23514')
        def purchase_refund(quantity=1, amount=50, status='REQUESTED', original=payment, original_order=order, original_line=line):
            rid=uid();kid,body=key(operation='createPurchaseRefundRequest')
            destination,effect='NULL','NULL'
            if status=='SUCCEEDED':
                tid,extra=tx('PURCHASE_REFUND',amount,[('WALLET_AVAILABLE',W,None,amount),('SHOP_SALES',None,SHOP,-amount)],source=original,origin=rid,kid=kid)
                body+=extra;destination="'AVAILABLE'";effect="'"+tid+"'"
            body+=f"INSERT INTO refunds(id,event_id,shop_id,original_transaction_id,order_id,requested_by,basis,amount,status,reason,idempotency_id,destination_bucket,refund_transaction_id) VALUES('{rid}','{E}','{SHOP}','{original}','{original_order}','{A}','ITEMS',{amount},'{status}','pending','{kid}',{destination},{effect});\n"
            body+=f"INSERT INTO refund_lines(id,event_id,shop_id,refund_id,order_line_id,product_id,quantity,amount) VALUES('{uid()}','{E}','{SHOP}','{rid}','{original_line}','{PROD}',{quantity},{amount});\n"
            return rid,body
        rid,pending=purchase_refund()
        check('REQUESTED refund destination unknown',pending)
        check('REQUESTED destination cannot be precommitted',pending+f"UPDATE refunds SET destination_bucket='AVAILABLE' WHERE id='{rid}';",'23514')
        check('refund basis must match original',pending.replace("'ITEMS',50,'REQUESTED'","'AMOUNT',50,'REQUESTED'"),'23514')
        _,body=purchase_refund(amount=49);check('refund uses original unit price',body,'23514')
        _,body=purchase_refund(quantity=3,amount=150);check('refund line exceeds original quantity',body,'23514')
        _,body=purchase_refund(quantity=2,amount=100,status='SUCCEEDED');check('refund cumulative amount exceeds payment',body,'23514')
        check('ITEMS refund requires lines',pending.split('INSERT INTO refund_lines')[0],'23514')
        _,body=purchase_refund(original_order=uid());check('refund original order mismatch',body,'23514')
        check('refund cannot change original facts',f"UPDATE refunds SET amount=49 WHERE id='{refund}';",'23514')
        # Mixed-price order: total remains within 100 yen, but one line must not be refunded 3/2 times.
        other_req,prefix=request();other_payment,extra=tx('PAYMENT',100,[('WALLET_AVAILABLE',W,None,-100),('SHOP_SALES',None,SHOP,100)],payment=other_req);prefix+=extra
        other_order,cheap_line,expensive_line=uid(),uid(),uid()
        prefix+=f"UPDATE payment_requests SET status='SUCCEEDED',payer_account_id='{A}',transaction_id='{other_payment}' WHERE id='{other_req}';\n"
        prefix+=f"INSERT INTO orders(id,event_id,shop_id,account_id,payment_request_id,transaction_id,display_number,route,fulfillment_status,total_amount) VALUES('{other_order}','{E}','{SHOP}','{A}','{other_req}','{other_payment}','2','REGISTER_A','ACCEPTED',100);\n"
        for lid,price,quantity in [(cheap_line,25,2),(expensive_line,50,1)]:
            prefix+=f"INSERT INTO order_lines(id,event_id,shop_id,order_id,product_id,product_name_snapshot,unit_price,quantity,line_total,product_version) VALUES('{lid}','{E}','{SHOP}','{other_order}','{PROD}','food',{price},{quantity},{price*quantity},1);\n"
        _,body=purchase_refund(amount=25,original_line=cheap_line);check('refund line from other order',prefix+body,'23514')
        _,body=purchase_refund(quantity=2,amount=50,status='SUCCEEDED',original=other_payment,original_order=other_order,original_line=cheap_line)
        _,extra=purchase_refund(amount=25,status='SUCCEEDED',original=other_payment,original_order=other_order,original_line=cheap_line)
        check('cumulative quantity exceeds line below payment amount',prefix+body+extra,'23514')
        def restore(amount=1):
            k,b=key(operation='createInventoryMove');move=uid()
            b+=f"INSERT INTO stock_moves(id,event_id,shop_id,product_id,kind,refund_line_id,idempotency_id,delta,reason,actor_account_id) VALUES('{move}','{E}','{SHOP}','{PROD}','RETURN_TO_STOCK','{refund_line}','{k}',{amount},'resalable','{A}');\n"
            b+=f"UPDATE refund_lines SET restored_quantity=restored_quantity+{amount} WHERE id='{refund_line}'; UPDATE inventory SET on_hand=on_hand+{amount} WHERE id='{INV}';\n"
            return b
        check('one stock return',restore())
        check('over quantity stock return',restore(2),'23514')
        check('different key cannot return twice',restore()+restore(),'23514')
        b=restore();check('restore projection must match',b+f"UPDATE refund_lines SET restored_quantity=0 WHERE id='{refund_line}';",'23514')
        check('refund quantity immutable',f"UPDATE refund_lines SET quantity=2 WHERE id='{refund_line}';",'23514')
        check('refund line delete',f"DELETE FROM refund_lines WHERE id='{refund_line}';",'23514')
        check('inventory beyond 32bit',f"UPDATE inventory SET on_hand=2147483648 WHERE id='{INV}';",'23514')
        check('reservation exceeds onhand',f"UPDATE inventory SET reserved=1 WHERE id='{INV}';",'23514')
        snap=uid();exp=uid()
        export=f"INSERT INTO report_snapshots(id,event_id,requested_by,dataset,filters,status) VALUES('{snap}','{E}','{A}','TRANSACTIONS','{{}}','RESERVED'); INSERT INTO exports(id,event_id,requested_by,snapshot_id,dataset,filters,status) VALUES('{exp}','{E}','{A}','{snap}','TRANSACTIONS','{{}}','QUEUED');\n"
        check('QUEUED no completion deadline',export)
        check('READY needs completion plus 24h',export+f"UPDATE exports SET status='READY',snapshot_at=now(),generated_at=now(),row_count=0 WHERE id='{exp}';",'23514')
        snap2=uid();exp2=uid();check('slot 1 and 2 only',export+f"INSERT INTO export_slots(id,account_id,slot,export_id) VALUES('{uid()}','{A}',3,'{exp}');",'23514')

        def paid_order(shop=SHOP, payer=A, basis='ITEMS', succeeded=True, associate_last=False):
            pid,b=request()
            if basis!='ITEMS':b=b.replace("'ITEMS'", "'"+basis+"'")
            paid,extra=tx('PAYMENT',100,[('WALLET_AVAILABLE',W,None,-100),('SHOP_SALES',None,SHOP,100)],payment=pid)
            b+=extra
            association=f"UPDATE payment_requests SET status='SUCCEEDED',payer_account_id='{A}',transaction_id='{paid}' WHERE id='{pid}';\n" if succeeded else ''
            if not succeeded:b+=f"UPDATE payment_requests SET payer_account_id='{A}' WHERE id='{pid}';\n"
            if not associate_last:b+=association
            if payer==B:b+=f"INSERT INTO memberships(id,event_id,account_id,accepted_policy_version,joined_at) VALUES('{uid()}','{E}','{B}',1,now());\n"
            product=PROD
            if shop!=SHOP:
                product=uid();b+=f"INSERT INTO products(id,event_id,shop_id,name,price,status) VALUES('{product}','{E}','{shop}','other',50,'ON_SALE');\n"
            oid=uid()
            b+=f"INSERT INTO orders(id,event_id,shop_id,account_id,payment_request_id,transaction_id,display_number,route,fulfillment_status,total_amount) VALUES('{oid}','{E}','{shop}','{payer}','{pid}','{paid}','review','REGISTER_A','ACCEPTED',100);\n"
            b+=f"INSERT INTO order_lines(id,event_id,shop_id,order_id,product_id,product_name_snapshot,unit_price,quantity,line_total,product_version) VALUES('{uid()}','{E}','{shop}','{oid}','{product}','food',50,2,100,1);\n"
            if associate_last:b+=association
            return b
        check('order matches payment shop and payer',paid_order())
        check('order association can complete within same commit',paid_order(associate_last=True))
        check('order cannot reference different payment shop',paid_order(shop=SHOP2),'23503')
        check('order cannot reference different payment payer',paid_order(payer=B),'23503')
        check('AMOUNT payment cannot create item order',paid_order(basis='AMOUNT'),'23514')
        check('order cannot exist before successful payment',paid_order(succeeded=False),'23514')

        def correction(state='PENDING_RETURN'):
            cid,op=uid(),uid()
            effect,b=tx('CHARGE_REVERSAL',50,[('WALLET_AVAILABLE',W,None,-50),('EVENT_CASH',None,None,50)],source=charge,origin=cid)
            b+=f"INSERT INTO cash_operations(id,event_id,account_id,operator_account_id,type,status,amount,transaction_id,cash_received_confirmed) VALUES('{op}','{E}','{A}','{A}','CHARGE','SUCCEEDED',500,'{charge}',true);\n"
            b+=f"INSERT INTO cash_corrections(id,event_id,cash_operation_id,original_transaction_id,kind,amount,balance_source,transaction_id,cash_return_status,reason) VALUES('{cid}','{E}','{op}','{charge}','CHARGE_REVERSAL',50,'AVAILABLE','{effect}','{state}','review');\n"
            return cid,b
        for state in ('PENDING_RETURN','RETURNED','NOT_REQUIRED','INVESTIGATING'):
            _,b=correction(state);check('correction stores '+state,b)
        _,b=correction('UNKNOWN');check('correction rejects unknown return state',b,'23514')
        cid,b=correction('NOT_REQUIRED');check('no-return correction cannot become pending',b+f"UPDATE cash_corrections SET cash_return_status='PENDING_RETURN' WHERE id='{cid}';",'23514')
        cid,b=correction('RETURNED');check('returned correction cannot reopen',b+f"UPDATE cash_corrections SET cash_return_status='PENDING_RETURN' WHERE id='{cid}';",'23514')
        cid,b=correction();check('required cash return cannot be waived later',b+f"UPDATE cash_corrections SET cash_return_status='NOT_REQUIRED' WHERE id='{cid}';",'23514')
        check('correction amount is immutable',b+f"UPDATE cash_corrections SET amount=49 WHERE id='{cid}';",'23514')
        cid,b=correction('INVESTIGATING');check('investigating correction needs evidence',b+f"UPDATE cash_corrections SET cash_return_status='RETURNED' WHERE id='{cid}';",'23514')
        case=uid()
        resolved=f"INSERT INTO cash_cases(id,event_id,source_type,correction_id,status,cash_fact,db_outcome,reason,resolution_reason,evidence_references,resolved_at) VALUES('{case}','{E}','CORRECTION','{cid}','RESOLVED','RETURNED','COMMITTED','review','verified','[\"evidence\"]',now());\n"
        check('same-source resolved correction can record returned fact',b+resolved+f"UPDATE cash_corrections SET cash_return_status='RETURNED',resolution_case_id='{case}' WHERE id='{cid}';")
        check('unknown DB outcome cannot resolve return',b+resolved.replace("'COMMITTED'","'UNKNOWN'")+f"UPDATE cash_corrections SET cash_return_status='RETURNED',resolution_case_id='{case}' WHERE id='{cid}';",'23514')
        other_cid,other=correction()
        check('other-source resolved case cannot resolve return',b+other+resolved.replace(f"'{cid}','RESOLVED'",f"'{other_cid}','RESOLVED'")+f"UPDATE cash_corrections SET cash_return_status='RETURNED',resolution_case_id='{case}' WHERE id='{cid}';",'23514')

        def contact(email='public@example.test', token_owner=A, record_owner=A, purpose='CONTACT_EMAIL'):
            tid,cid=uid(),uid()
            event='NULL' if purpose=='CONTACT_EMAIL' else "'"+E+"'"
            b=f"INSERT INTO tokens(id,event_id,purpose,subject_account_id,token_hash,binding_hash,expires_at) VALUES('{tid}',{event},'{purpose}','{token_owner}',sha256(convert_to('{tid}','UTF8')),contact_email_binding('{token_owner}','{email}'),now()+interval '24 hours');\n"
            b+=f"INSERT INTO contact_email_verifications(id,account_id,token_id,email) VALUES('{cid}','{record_owner}','{tid}','{email}');\n"
            return tid,cid,b
        def confirm(tid,cid):
            return f"UPDATE tokens SET consumed_at=now() WHERE id='{tid}'; UPDATE contact_email_verifications SET verified_at=now() WHERE id='{cid}';\n"
        tid,cid,b=contact();check('pending public email persists independently of login email',b)
        check('contact token needs dedicated address record',b.split('INSERT INTO contact_email_verifications')[0],'23514')
        check('public email verification and consumption commit together',b+confirm(tid,cid))
        check('contact cannot verify before token consumption',b+f"UPDATE contact_email_verifications SET verified_at=now() WHERE id='{cid}';",'23514')
        check('contact consumption requires ownership record update',b+f"UPDATE tokens SET consumed_at=now() WHERE id='{tid}';",'23514')
        check('pending contact email cannot be swapped',b+f"UPDATE contact_email_verifications SET email='other@example.test' WHERE id='{cid}';",'23514')
        check('contact binding cannot change',b+f"UPDATE tokens SET binding_hash=decode(repeat('02',32),'hex') WHERE id='{tid}';",'23514')
        check('contact replay cannot change consumed timestamp',b+confirm(tid,cid)+f"UPDATE tokens SET consumed_at=now()+interval '1 second' WHERE id='{tid}';",'23514')
        check('verified contact timestamp cannot change',b+confirm(tid,cid)+f"UPDATE contact_email_verifications SET verified_at=now()+interval '1 second' WHERE id='{cid}';",'23514')
        check('expired contact cannot verify',b.replace("now()+interval '24 hours'","now()-interval '1 second'")+confirm(tid,cid),'23514')
        check('revoked contact cannot verify',b+f"UPDATE tokens SET revoked_at=now() WHERE id='{tid}';"+confirm(tid,cid),'23514')
        check('wrong email binding cannot persist',b.replace(f"contact_email_binding('{A}','public@example.test')","decode(repeat('02',32),'hex')"),'23514')
        _,_,other=contact(record_owner=B);check('contact token and record owner must match',other,'23503')
        _,_,other=contact(purpose='RECIPIENT');check('other-purpose token cannot verify email',other,'23514')
        tid2,cid2,other=contact();check('same-owner address can be confirmed with a new token',b+confirm(tid,cid)+other+confirm(tid2,cid2))
        check('one contact record per token',b+f"INSERT INTO contact_email_verifications(id,account_id,token_id,email) VALUES('{uid()}','{A}','{tid}','public@example.test');",'23505')
        tid2,cid2,other=contact(token_owner=B,record_owner=B);check('public contact address can be verified by another owner',b+confirm(tid,cid)+other+confirm(tid2,cid2))
        check('pending contact cleanup removes address and token together',b+f"DELETE FROM contact_email_verifications WHERE id='{cid}'; DELETE FROM tokens WHERE id='{tid}';")

        for kind,delta,code in [('CORRECTION',0,None),('ADD',0,'23514'),('WASTE',0,'23514')]:
            kid,b=key(operation='createInventoryMove')
            b+=f"INSERT INTO stock_moves(id,event_id,shop_id,product_id,kind,idempotency_id,delta,reason,actor_account_id) VALUES('{uid()}','{E}','{SHOP}','{PROD}','{kind}','{kid}',{delta},'same physical count','{A}');\n"
            b+=f"UPDATE inventory SET version=version+1 WHERE id='{INV}';\n"
            check('inventory '+kind+' zero delta',b,code)

        # Both requests use distinct keys; the first owns the refund_line lock.
        first="SET application_name='fespay-restore-first'; BEGIN;\n"+restore()+"SELECT pg_sleep(0.8); COMMIT;"
        second='BEGIN;\n'+restore()+'COMMIT;'
        with ThreadPoolExecutor(max_workers=2) as executor:
            one=executor.submit(psql,first)
            for _ in range(100):
                r=psql("SELECT count(*) FROM pg_stat_activity WHERE application_name='fespay-restore-first' AND wait_event='PgSleep';",False)
                if r.stdout.strip()=='1':break
                if one.done():raise AssertionError('first race request ended before barrier')
                time.sleep(.02)
            else:raise AssertionError('race barrier not reached')
            two=executor.submit(psql,second)
            x,y=one.result(),two.result()
        okay=x.returncode==0 and y.returncode!=0 and '23514' in y.stderr
        checks.append({'case':'two-connection different-key stock return race','passed':okay,'winner':x.returncode,'loser':y.returncode})
        if not okay:raise AssertionError(x.stderr+y.stderr)
        restored=psql(f"SELECT restored_quantity FROM refund_lines WHERE id='{refund_line}'; SELECT sum(delta) FROM stock_moves WHERE refund_line_id='{refund_line}';")
        if [v for v in restored.stdout.splitlines() if v not in ('SET','')]!=['1','1']:raise AssertionError(restored.stdout)
        if args.output:args.output.write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
        print(f'PostgreSQL {server_version} constraints: {len(checks)} cases passed; separate application role; two-connection race passed.')
    finally:
        subprocess.run(['docker','stop',name],capture_output=True,timeout=15)

if __name__=='__main__':main()
