"""設計の入力・互換性・CSV処理を照合する参照手順。アプリ用handlerではない。"""
import csv
import io
import json
import re
from datetime import datetime, timedelta


class InputFailure(ValueError):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


def decode_json(raw, policy):
    if len(raw) > policy['json_max_bytes']:
        raise InputFailure(413, 'PAYLOAD_TOO_LARGE')
    if not raw:
        raise InputFailure(422, 'VALIDATION_ERROR')

    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise ValueError('Duplicate key')
            out[key] = value
        return out

    def constant(_):
        raise ValueError('Non-finite number')

    try:
        value = json.loads(raw.decode('utf-8'), object_pairs_hook=pairs, parse_constant=constant)
        # JSON escapeでも孤立サロゲートを受理しない。
        json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
    except RecursionError as error:
        raise InputFailure(413, 'PAYLOAD_TOO_LARGE') from error
    except (UnicodeError, ValueError) as error:
        raise InputFailure(400, 'MALFORMED_REQUEST') from error
    pending = [(value, 1)]
    nodes = 0
    while pending:
        item, depth = pending.pop()
        nodes += 1
        if nodes > policy['json_max_nodes'] or depth > policy['json_max_depth']:
            raise InputFailure(413, 'PAYLOAD_TOO_LARGE')
        children = item.values() if isinstance(item, dict) else item if isinstance(item, list) else []
        pending.extend((child, depth + int(isinstance(child, (dict, list)))) for child in children)
    if not isinstance(value, dict):
        raise InputFailure(422, 'VALIDATION_ERROR')
    return value


def revision_gate(operation, revision, minimum, *, authorized=True, saved=False, same_content=True):
    if not authorized:
        return 'DENY_CURRENT_AUTHORIZATION'
    if saved:
        return 'RETURN_SAVED' if same_content else 'IDEMPOTENCY_CONFLICT'
    if operation['x-client-revision-policy'] == 'CURRENT' and revision < minimum:
        return 'CLIENT_UPDATE_REQUIRED'
    return 'ALLOW_WITH_NORMAL_VALIDATION'


def export_metadata(value):
    dt = lambda v: datetime.fromisoformat(v.replace('Z', '+00:00'))
    assert dt(value['filter']['start']) < dt(value['filter']['end'])
    if 'snapshot_at' in value:
        assert dt(value['created_at']) <= dt(value['snapshot_at'])
    if 'generated_at' in value:
        assert dt(value['snapshot_at']) <= dt(value['generated_at'])
        assert dt(value['expires_at']) == dt(value['generated_at']) + timedelta(hours=24)
    if value['status'] == 'READY':
        parts = value['parts']
        assert [p['index'] for p in parts] == list(range(1, len(parts) + 1))
        assert len({p['part_id'] for p in parts}) == len(parts)
        count, rows = int(value['part_count']), int(value['row_count'])
        assert count == max(1, (rows + 99999) // 100000)
        for p in parts:
            assert p['row_count'] == (100000 if p['index'] < count else rows - 100000 * (count - 1))
        assert (value['next_parts_cursor'] is None) == (len(parts) == count)


def csv_cell(value, kind='text'):
    value = str(value)
    if kind == 'unsigned':
        assert re.fullmatch(r'0|[1-9][0-9]*', value)
        return value
    if kind == 'signed':
        assert re.fullmatch(r'0|-?[1-9][0-9]*', value)
        return value
    value = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', value)
    value = re.sub(r'\r\n|\r|\n', '\r\n', value)
    if re.match(r'^[^\S\r\n\t]*[=+\-@\t\r\n]', value):
        value = "'" + value
    return value


def csv_parts(columns, rows, kinds=None):
    kinds = kinds or {}
    buffer = io.StringIO(newline='')
    writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
    writer.writerow(columns)
    count, total = 0, 0
    for row in rows:
        writer.writerow([csv_cell(row[c], kinds.get(c, 'text')) for c in columns])
        count += 1
        total += 1
        if count == 100000:
            yield count, buffer.getvalue().encode('utf-8-sig')
            buffer = io.StringIO(newline='')
            writer = csv.writer(buffer, quoting=csv.QUOTE_ALL, lineterminator='\r\n')
            writer.writerow(columns)
            count = 0
    if count or total == 0:
        yield count, buffer.getvalue().encode('utf-8-sig')


def sales_totals(payments, refunds, start, end, snapshot, basis):
    """公開契約の期間帰属例。DBの集計/返金累計を検証する実装ではない。"""
    dt = lambda v: datetime.fromisoformat(v.replace('Z', '+00:00'))
    start, end, snapshot = map(dt, [start, end, snapshot])
    assert start < end and basis in ['OCCURRENCE', 'ORIGINAL_PAYMENT_PERIOD']
    selected = [p for p in payments if start <= dt(p['occurred_at']) < end and dt(p['occurred_at']) <= snapshot]
    selected_ids = {p['id'] for p in selected}
    eligible = [r for r in refunds if dt(r['occurred_at']) <= snapshot and
                ((start <= dt(r['occurred_at']) < end) if basis == 'OCCURRENCE' else r['original_id'] in selected_ids)]
    gross, refund = sum(int(p['amount']) for p in selected), sum(int(r['amount']) for r in eligible)
    return str(gross), str(refund), str(gross - refund)
