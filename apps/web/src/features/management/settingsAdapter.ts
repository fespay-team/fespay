import type { ApiError, EventGuide, EventSettings, EventSettingsRequestResult, UpdateEvent, UpdateEventSettings } from './contracts';
import { ManagementReadError } from './adapter';
import { checkedAt, events, profiles, shops, type ProfileId } from './fixtures';
import { guideDraft, settingsDraft, SettingsValidationError, updateGuideBody, updateSettingsBody } from './settingsModel';

export type SettingsOperation = 'updateEventGuide' | 'updateEventSettings';
// Transport envelope, not additional fields on an API DTO.
export type SettingsUpdateResponse<T> = { status: 200; data: T } | { status: 202; error: ApiError };
export interface EventSettingsAdapter {
  getEventGuide(eventId: string, signal: AbortSignal): Promise<EventGuide>;
  getEventSettings(eventId: string, signal: AbortSignal): Promise<EventSettings>;
  updateEventGuide(eventId: string, body: UpdateEvent, idempotencyKey: string, signal: AbortSignal): Promise<SettingsUpdateResponse<EventGuide>>;
  updateEventSettings(eventId: string, body: UpdateEventSettings, idempotencyKey: string, signal: AbortSignal): Promise<SettingsUpdateResponse<EventSettings>>;
  getMyTransactionResultByKey(eventId: string, operation: SettingsOperation, idempotencyKey: string, signal: AbortSignal): Promise<EventSettingsRequestResult>;
}
export const settingsScenarios = [
  ['success', '通常の保存成功'], ['guide-error', '案内だけ入力拒否'], ['settings-error', '業務設定だけ入力拒否'],
  ['conflict', '版の競合'], ['validation', '入力エラー'], ['feature-dependency', '機能依存の拒否'],
  ['protected-policy', '初回チャージ後の保護拒否'], ['pending', '202 → 処理中 → 成功'],
  ['unknown', '結果不明 → UNKNOWN → 成功'], ['query-error', '結果照会の一時障害'],
  ['auth-required', '401 再ログイン'], ['forbidden', '403 権限不足'], ['unavailable', '503 → 元キー照会'],
  ['load-error', '設定取得エラー'], ['slow', '読み込み・保存の遅延'],
] as const;
export type SettingsScenario = typeof settingsScenarios[number][0];
export function settingsFailure(status: number, code: string, message: string, field?: string) {
  return new ManagementReadError(status, { code, message, request_id: 'management-settings-fixture', retryable: status >= 500 || status === 202,
    ...(field ? { field_errors: [{ location: 'BODY', field, reason: 'INVALID_COMBINATION' }] } : {}) });
}
async function pause(signal: AbortSignal, milliseconds: number) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
  signal.throwIfAborted();
}
async function fingerprint(value: unknown): Promise<string> {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v !== null && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, item]) => [k, canonical(item)])) : v;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(value))));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
/** Synthetic, in-memory server responses only. No real authorization or password storage. */
export function createSettingsFixture(profileId: ProfileId) {
  let scenario: SettingsScenario = 'success';
  const records = new Map<string, { hash: string; mode: SettingsScenario; polls: number; committed: boolean; commit: () => void; rejection?: { code: string; message: string } }>();
  const conflicted = new Set<string>();
  const guides = new Map(events.map(e => [e.event_id, structuredClone(e)]));
  const settings = new Map<string, EventSettings>(events.map((e, i) => [e.event_id, {
    ...structuredClone(e.public_policy), settings_id: `00000008-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, event_id: e.event_id,
    participation_mode: e.participation_mode, participation_terms: e.participation_terms, terms_version: e.terms_version,
    features: { amount_input: 'OPTIONAL', payment_a: 'OPTIONAL', payment_b: 'OPTIONAL', fixed_qr: 'OPTIONAL', products: 'OPTIONAL', inventory: 'OPTIONAL', orders: 'OPTIONAL', mobile_orders: 'OPTIONAL' },
    first_charge_at: i === 2 ? null : checkedAt, checked_at: checkedAt,
  }]));
  const owner = (eventId: string) => {
    if (!profiles.find(p => p.id === profileId)!.ownedEventIds.includes(eventId)) throw settingsFailure(403, 'FORBIDDEN', '現在の主催者だけがこの設定を編集できます。');
  };
  const guide = (eventId: string): EventGuide => {
    const g = guides.get(eventId), s = settings.get(eventId);
    if (!g || !s) throw settingsFailure(404, 'RESOURCE_NOT_FOUND', '対象イベントを確認できません。');
    return structuredClone({ ...g, participation_mode: s.participation_mode, participation_terms: s.participation_terms, terms_version: s.terms_version,
      noindex: !g.listed, public_policy: {
        version: s.version, charge_window: s.charge_window, payment_window: s.payment_window, transfer_window: s.transfer_window,
        transfer_enabled: s.transfer_enabled, cash_refund_enabled: s.cash_refund_enabled, cash_refund_window: s.cash_refund_window,
        cash_refund_location: s.cash_refund_location, cash_refund_contact: s.cash_refund_contact, expiration_at: s.expiration_at,
        expiration_terms: s.expiration_terms, mobile_orders_enabled: s.mobile_orders_enabled,
        settlement_cash_refund_window: s.settlement_cash_refund_window, settlement_cash_refund_location: s.settlement_cash_refund_location,
        settlement_cash_refund_contact: s.settlement_cash_refund_contact,
      } });
  };
  const nextVersion = (version: string) => (BigInt(version) + 1n).toString();
  function protect(eventId: string, body: UpdateEvent | UpdateEventSettings) {
    const current = settings.get(eventId)!;
    if (!current.first_charge_at) return;
    const shortened = (a: { starts_at: string; ends_at: string }, b: { starts_at: string; ends_at: string }) => Date.parse(b.starts_at) > Date.parse(a.starts_at) || Date.parse(b.ends_at) < Date.parse(a.ends_at);
    if ('hosting_window' in body) {
      if (shortened(guides.get(eventId)!.hosting_window, body.hosting_window)) throw settingsFailure(409, 'PROTECTED_POLICY_CHANGE', '開催期間を短縮できません。', '/hosting_window/ends_at');
      return;
    }
    if (current.cash_refund_enabled && !body.cash_refund_enabled) throw settingsFailure(409, 'PROTECTED_POLICY_CHANGE', '通常払戻しをONからOFFへ変更できません。', '/cash_refund_enabled');
    for (const key of ['charge_window', 'payment_window', 'transfer_window', 'cash_refund_window', 'settlement_cash_refund_window'] as const) {
      if (shortened(current[key], body[key])) throw settingsFailure(409, 'PROTECTED_POLICY_CHANGE', '受付期間を短縮できません。', `/${key}/ends_at`);
    }
    if (body.expiration_at && (!current.expiration_at || Date.parse(body.expiration_at) < Date.parse(current.expiration_at))) {
      throw settingsFailure(409, 'PROTECTED_POLICY_CHANGE', '残高失効の新設・前倒しはできません。', '/expiration_at');
    }
  }
  async function update(eventId: string, operation: SettingsOperation, body: UpdateEvent | UpdateEventSettings, key: string, signal: AbortSignal) {
    owner(eventId); await pause(signal, scenario === 'slow' ? 900 : 120); owner(eventId);
    const identity = `${eventId}:${operation}:${key}`, hash = await fingerprint(body), previous = records.get(identity);
    if (previous) {
      if (previous.hash !== hash) throw settingsFailure(409, 'IDEMPOTENCY_CONFLICT', '同じキーの送信内容が異なります。元の要求の結果を確認してください。');
      return previous;
    }
    if (scenario === 'auth-required') throw settingsFailure(401, 'AUTH_REQUIRED', 'ログインし直してください。');
    if (scenario === 'forbidden') throw settingsFailure(403, 'FORBIDDEN', '主催者資格を再確認してください。');
    const current = operation === 'updateEventGuide' ? guides.get(eventId)! : settings.get(eventId)!;
    if (scenario === 'conflict' && !conflicted.has(`${eventId}:${operation}`)) {
      conflicted.add(`${eventId}:${operation}`); current.version = nextVersion(current.version);
      if ('name' in current) current.name = `${current.name}（別の更新）`.slice(0, 100);
      else current.participation_terms = `${current.participation_terms}\n別の主催者操作による更新（fixture）。`;
    }
    if (body.expected_version !== current.version) throw settingsFailure(409, 'VERSION_CONFLICT', '現在の版と一致しません。');
    if (scenario === 'validation' || (scenario === 'guide-error' && operation === 'updateEventGuide') || (scenario === 'settings-error' && operation === 'updateEventSettings')) {
      throw settingsFailure(422, 'VALIDATION_ERROR', '入力内容を確認して修正してください。', operation === 'updateEventGuide' ? '/name' : '/participation_terms');
    }
    if (operation === 'updateEventSettings' && scenario === 'feature-dependency') {
      // OpenAPI operation prose says 409; the adopted error catalog says 422.
      throw settingsFailure(422, 'FEATURE_DEPENDENCY', 'あおぞら食堂の商品・注文設定と矛盾しています。店舗の利用機能を確認してから禁止・必須指定を変更してください。', '/features/products');
    }
    if (operation === 'updateEventSettings' && scenario === 'protected-policy') throw settingsFailure(409, 'PROTECTED_POLICY_CHANGE', '既存の払戻し請求に不利益な条件変更は拒否されます（fixture）。', '/cash_refund_window/ends_at');
    protect(eventId, body);
    let commit: () => void;
    try {
      if (operation === 'updateEventGuide') {
        const d = guideDraft({ ...guide(eventId), ...body } as EventGuide); d.reason = body.reason;
        const { expected_version: _, reason: __, ...values } = updateGuideBody(d, current.version);
        commit = () => guides.set(eventId, { ...guides.get(eventId)!, ...values, version: nextVersion(guides.get(eventId)!.version), checked_at: new Date().toISOString() });
      } else {
        const input = body as UpdateEventSettings, s = settings.get(eventId)!;
        const d = settingsDraft({ ...s, ...input }); d.reason = input.reason; d.passwordAction = input.participation_password_change.action;
        d.newPassword = input.participation_password_change.action === 'SET' ? input.participation_password_change.password : '';
        const { expected_version: _, reason: __, participation_password_change: ___, ...values } = updateSettingsBody(d, s);
        if (values.mobile_orders_enabled && (values.features.products === 'PROHIBITED' || values.features.orders === 'PROHIBITED' || values.features.mobile_orders === 'PROHIBITED')) {
          throw settingsFailure(422, 'FEATURE_DEPENDENCY', 'モバイル注文には商品・注文機能と主催者のモバイル注文許可が必要です。', '/features/mobile_orders');
        }
        for (const shop of shops.filter(s => s.event_id === eventId && s.status !== 'ARCHIVED')) {
          for (const [feature, rule] of Object.entries(values.features)) {
            const enabled = shop.features[feature as keyof typeof shop.features];
            if ((rule === 'PROHIBITED' && enabled) || (rule === 'REQUIRED' && !enabled)) throw settingsFailure(422, 'FEATURE_DEPENDENCY', `${shop.name}の${feature}設定と矛盾しています。対象店舗の機能設定を確認してから再保存してください。`, `/features/${feature}`);
          }
        }
        // Neither the supplied password nor a password hash is retained or returned.
        commit = () => settings.set(eventId, { ...settings.get(eventId)!, ...values, version: nextVersion(settings.get(eventId)!.version), terms_version: nextVersion(settings.get(eventId)!.terms_version), checked_at: new Date().toISOString() });
      }
    } catch (error) {
      if (error instanceof SettingsValidationError) throw new ManagementReadError(422, { code: 'VALIDATION_ERROR', message: '入力形式・組合せを確認してください。', request_id: 'management-settings-fixture', retryable: false,
        field_errors: Object.keys(error.fields).map(field => ({ location: 'BODY', field: `/${field.replaceAll('.', '/')}`, reason: 'INVALID_COMBINATION' })) });
      throw error;
    }
    const expectedVersion = body.expected_version;
    const record = { hash, mode: scenario, polls: 0, committed: false, commit: () => {
      const latest = operation === 'updateEventGuide' ? guides.get(eventId)! : settings.get(eventId)!;
      if (latest.version !== expectedVersion) throw settingsFailure(409, 'VERSION_CONFLICT', '処理待ちの間に版が更新されました。');
      commit();
    } };
    records.set(identity, record);
    if (!['pending', 'unknown', 'query-error', 'unavailable'].includes(scenario)) { record.commit(); record.committed = true; }
    if (scenario === 'unavailable') throw settingsFailure(503, 'DEPENDENCY_UNAVAILABLE', '正本への接続を確認できません。元のキーで保存結果を照会してください。');
    return record;
  }
  const response = <T,>(record: { committed: boolean; mode: SettingsScenario }, resource: () => T): SettingsUpdateResponse<T> => record.committed
    ? { status: 200, data: structuredClone(resource()) }
    : { status: 202, error: { code: record.mode === 'unknown' ? 'RESULT_UNKNOWN' : 'REQUEST_IN_PROGRESS', message: '保存結果を確認中です。元のキーで結果を照会してください。', request_id: 'management-settings-fixture', retryable: true } };
  const adapter: EventSettingsAdapter = {
    async getEventGuide(eventId, signal) { owner(eventId); await pause(signal, scenario === 'slow' ? 800 : 100); if (scenario === 'load-error') throw settingsFailure(503, 'DEPENDENCY_UNAVAILABLE', '案内設定を取得できません。'); return guide(eventId); },
    async getEventSettings(eventId, signal) { owner(eventId); await pause(signal, scenario === 'slow' ? 800 : 100); if (scenario === 'load-error') throw settingsFailure(503, 'DEPENDENCY_UNAVAILABLE', '業務設定を取得できません。'); return structuredClone(settings.get(eventId)!); },
    async updateEventGuide(eventId, body, key, signal) { return response(await update(eventId, 'updateEventGuide', body, key, signal), () => guide(eventId)); },
    async updateEventSettings(eventId, body, key, signal) { return response(await update(eventId, 'updateEventSettings', body, key, signal), () => settings.get(eventId)!); },
    async getMyTransactionResultByKey(eventId, operation, key, signal) {
      owner(eventId); await pause(signal, 100);
      const r = records.get(`${eventId}:${operation}:${key}`), checked_at = new Date().toISOString();
      if (!r) return { status: 'UNKNOWN', checked_at };
      r.polls++;
      if (r.mode === 'query-error' && r.polls === 1) throw settingsFailure(503, 'DEPENDENCY_UNAVAILABLE', '結果照会が一時的に利用できません。元の要求を保持して再照会してください。');
      if (!r.committed && r.polls === 1) return { status: r.mode === 'unknown' ? 'UNKNOWN' : 'PENDING', checked_at };
      if (!r.committed && !r.rejection) {
        try { r.commit(); r.committed = true; }
        catch (error) { if (!(error instanceof ManagementReadError)) throw error; r.rejection = { code: error.body.code, message: error.body.message }; }
      }
      if (r.rejection) return { status: 'REJECTED', rejection: r.rejection, checked_at };
      const s = settings.get(eventId)!, g = guide(eventId), isGuide = operation === 'updateEventGuide';
      return { status: 'SUCCEEDED', resource: { resource_type: isGuide ? 'event' : 'settings', resource_id: isGuide ? eventId : s.settings_id,
        query_path: `/v1/events/${eventId}${isGuide ? '' : '/settings'}`, version: isGuide ? g.version : s.version }, checked_at };
    },
  };
  return { adapter, getScenario: () => scenario, setScenario(value: SettingsScenario) { scenario = value; conflicted.clear(); } };
}
export type SettingsFixture = ReturnType<typeof createSettingsFixture>;
