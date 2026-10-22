import type { BusinessDashboard, EventGuide, Grant, GrantScope, Page, Reconciliation, Shop, Suspension } from './contracts';

// All content is synthetic. These objects retain the OpenAPI field names and shapes.
export const checkedAt = '2026-10-15T03:00:00Z';
const id = (group: number, n: number) => `${String(group).padStart(8, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const eventIds = [id(1, 1), id(1, 2), id(1, 3)];
export const shopIds = [id(2, 1), id(2, 2), id(2, 3), id(2, 4)];
const contact = { https_url: 'https://example.invalid/fespay-demo' };
const window = { starts_at: '2026-10-15T01:00:00Z', ends_at: '2026-10-16T09:00:00Z' };
export const events: EventGuide[] = eventIds.map((event_id, i) => ({
  event_id, name: ['青空フェス 2026', 'みなと文化祭', '秋のマーケット'][i],
  description: '管理画面確認用の架空イベントです。実際の取引はありません。',
  organizer_name: 'FesPay DEMO実行委員会', venue: 'デモ会場', contact,
  hosting_window: window, listed: i !== 2, guide_public: true, participation_mode: 'PUBLIC',
  lifecycle: (['RUNNING', 'SETTLING', 'DRAFT'] as const)[i], version: '1', terms_version: '1',
  participation_terms: '設計確認用の模擬データです。', noindex: i === 2, checked_at: checkedAt,
  public_policy: {
    version: '1', charge_window: window, payment_window: window, transfer_window: window,
    transfer_enabled: false, cash_refund_enabled: true, cash_refund_window: window,
    cash_refund_location: 'デモ受付', cash_refund_contact: contact, expiration_at: null,
    expiration_terms: '', mobile_orders_enabled: false, settlement_cash_refund_window: window,
    settlement_cash_refund_location: 'デモ精算窓口', settlement_cash_refund_contact: contact,
  },
}));
export const shops: Shop[] = shopIds.map((shop_id, i) => ({
  shop_id, event_id: i === 3 ? eventIds[1] : eventIds[0],
  name: ['あおぞら食堂', 'ドリンクスタンド', '旧グッズ販売所', 'みなとカフェ'][i],
  description: 'fixtureの店舗', status: (['OPEN', 'CLOSED', 'ARCHIVED', 'OPEN'] as const)[i],
  visible: i !== 2, accepting_new_payments: i === 0,
  features: { amount_input: true, payment_a: true, payment_b: true, fixed_qr: false, products: true, inventory: true, orders: true, mobile_orders: false },
  version: '1', checked_at: checkedAt,
}));
export const suspensions: Suspension[] = [
  { suspension_id: id(3, 1), event_id: eventIds[0], scope: 'SHOP', shop_id: shopIds[0], active: true, reason: 'デモ：店舗の緊急停止を確認', version: '1', checked_at: checkedAt },
  { suspension_id: id(3, 2), event_id: eventIds[0], scope: 'SHOP', shop_id: shopIds[1], active: false, reason: 'デモ：解除済みの店舗停止', version: '2', checked_at: checkedAt },
  { suspension_id: id(3, 3), event_id: eventIds[1], scope: 'EVENT', active: true, reason: 'デモ：イベントの緊急停止を確認', version: '1', checked_at: checkedAt },
];
export type ProfileId = 'owner' | 'operator' | 'manager' | 'cashier' | 'report-cashier' | 'revoked';
// Fixture metadata is outside all wire DTOs. Ownership is supplied by OWNED pages.
export const profiles: { id: ProfileId; label: string; accountId: string; ownedEventIds: string[] }[] = [
  { id: 'owner', label: '主催者（grantも兼務）', accountId: id(4, 1), ownedEventIds: eventIds },
  { id: 'operator', label: '運営担当（イベント売上閲覧）', accountId: id(4, 2), ownedEventIds: [] },
  { id: 'manager', label: '店舗管理者', accountId: id(4, 3), ownedEventIds: [] },
  { id: 'cashier', label: 'レジ担当（集計権限なし）', accountId: id(4, 4), ownedEventIds: [] },
  { id: 'report-cashier', label: 'レジ担当（自店舗の集計権限あり）', accountId: id(4, 5), ownedEventIds: [] },
  { id: 'revoked', label: '権限解除済み', accountId: id(4, 6), ownedEventIds: [] },
];
const grant = (n: number, profile: number, event: number, scope: GrantScope, active = true): Grant => ({
  grant_id: id(5, n), account_id: profiles[profile].accountId, event_id: eventIds[event], scope, active, version: '1', checked_at: checkedAt,
});
export const grants: Grant[] = [
  grant(1, 0, 0, { role: 'CASHIER', shop_id: shopIds[0], register_ids: [id(6, 1)], permissions: ['CREATE_PAYMENT_REQUEST'] }),
  grant(2, 1, 0, { role: 'EVENT_OPERATOR', permissions: ['READ_REPORT'] }),
  grant(3, 1, 1, { role: 'EVENT_OPERATOR', permissions: ['CHARGE'] }),
  grant(4, 2, 0, { role: 'SHOP_MANAGER', shop_id: shopIds[0], permissions: ['READ_REPORT', 'MANAGE_PRODUCTS', 'MANAGE_INVENTORY', 'FULFILL_ORDER'] }),
  grant(5, 2, 1, { role: 'SHOP_MANAGER', shop_id: shopIds[3], permissions: ['MANAGE_PRODUCTS'] }),
  grant(6, 3, 0, { role: 'CASHIER', shop_id: shopIds[0], register_ids: [id(6, 1)], permissions: ['CREATE_PAYMENT_REQUEST'] }),
  grant(7, 4, 0, { role: 'CASHIER', shop_id: shopIds[0], register_ids: [id(6, 2)], permissions: ['CREATE_PAYMENT_REQUEST', 'READ_REPORT'] }),
  grant(8, 5, 0, { role: 'EVENT_OPERATOR', permissions: ['READ_REPORT', 'READ_AUDIT'] }, false),
];
export type ScenarioId = 'normal' | 'long-values' | 'zero' | 'negative' | 'empty-events' | 'empty-shops' | 'error' | 'slow';
export const scenarios: { id: ScenarioId; label: string }[] = [
  { id: 'normal', label: '標準データ' }, { id: 'long-values', label: '長い名称・大きな金額' },
  { id: 'zero', label: '0円・未解決なし' }, { id: 'negative', label: '負の売上純額' },
  { id: 'empty-events', label: 'イベントなし' }, { id: 'empty-shops', label: '店舗なし' },
  { id: 'error', label: '取得エラー' }, { id: 'slow', label: '読み込み待機（切替確認）' },
];
export function page<T>(items: T[]): Page<T> { return { items, next_cursor: null, checked_at: checkedAt }; }
export function eventFixtures(scenario: ScenarioId): EventGuide[] {
  return events.map(event => ({ ...structuredClone(event), name: scenario === 'long-values'
    ? `青空とみなとの文化交流フェスティバル・地域のおいしいものと音楽と手仕事が集まる秋の特別イベント・すべての世代で楽しむ交流の一日 ${event.name}` : event.name }));
}
export function dashboardFixture(eventId: string, scenario: ScenarioId): BusinessDashboard {
  const zero = scenario === 'zero' || eventId === eventIds[2];
  const negative = scenario === 'negative';
  const sales = zero || negative ? '0' : scenario === 'long-values' ? '98765432109876543210987654321098765432109876543210' : eventId === eventIds[1] ? '54000' : '1286400';
  const refund = zero ? '0' : negative ? '4200' : '8400';
  return {
    scope: 'EVENT', event_id: eventId, sales_amount: sales, refund_amount: refund,
    net_sales_amount: (BigInt(sales) - BigInt(refund)).toString(),
    open_order_count: zero ? 0 : 12, unresolved_cash_case_count: zero || eventId === eventIds[1] ? 0 : 3,
    checked_at: checkedAt,
  };
}
export function reconciliationFixture(eventId: string, scenario: ScenarioId): Reconciliation {
  const dashboard = dashboardFixture(eventId, scenario);
  const zero = scenario === 'zero' || eventId === eventIds[2];
  const available = zero ? '0' : scenario === 'long-values' ? '12345678901234567890123456789012345678901234567890' : '245000';
  const held = zero ? '0' : '12800';
  const refundOnly = zero ? '0' : '3600';
  const net = dashboard.net_sales_amount;
  return {
    event_id: eventId, snapshot_id: id(7, eventIds.indexOf(eventId) + 1),
    charged_amount: (BigInt(available) + BigInt(held) + BigInt(refundOnly) + BigInt(net)).toString(),
    cash_refund_paid_amount: '0', available_amount: available, held_amount: held, refund_only_amount: refundOnly,
    net_shop_sales_amount: net, expired_amount: '0', ledger_sum: '0', money_difference: '0', cash_difference: '0',
    unresolved_case_count: String(dashboard.unresolved_cash_case_count), balanced: true, checked_at: checkedAt,
  };
}
