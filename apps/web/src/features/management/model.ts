import type { BusinessDashboard, EventGuide, Grant, Permission, Reconciliation, ResourceId, Shop } from './contracts';

/** UI input, not a wire DTO or a substitute for server authorization.
 * ownedEventIds comes only from the current actor's listMyEvents(scope=OWNED).
 * grants comes from that actor's current listGrants(scope=MINE).
 */
export interface DisplayAuthority {
  accountId: ResourceId;
  ownedEventIds: readonly ResourceId[];
  grants: readonly Grant[];
}
export function ownsEvent(authority: DisplayAuthority, eventId: ResourceId): boolean {
  return authority.ownedEventIds.includes(eventId);
}
export function currentGrants(authority: DisplayAuthority, eventId: ResourceId): Grant[] {
  return authority.grants.filter(g => g.active && g.account_id === authority.accountId && g.event_id === eventId);
}
export function canDisplayPermission(authority: DisplayAuthority, eventId: ResourceId, shopId: ResourceId | null, permission: Permission): boolean {
  if (ownsEvent(authority, eventId)) return true;
  return currentGrants(authority, eventId).some(g =>
    g.scope.permissions.includes(permission) &&
    (g.scope.role === 'EVENT_OPERATOR' || (shopId !== null && g.scope.shop_id === shopId)),
  );
}
export function canDisplayShopManagement(authority: DisplayAuthority, eventId: ResourceId, shopId: ResourceId | null): boolean {
  return ownsEvent(authority, eventId) || currentGrants(authority, eventId).some(g => g.scope.role === 'SHOP_MANAGER' && g.scope.shop_id === shopId);
}
export function canDisplaySuspensions(authority: DisplayAuthority, eventId: ResourceId): boolean {
  // There is no adopted permission enum for an event stop viewer. Do not invent one.
  return ownsEvent(authority, eventId) || currentGrants(authority, eventId).some(g => g.scope.role === 'SHOP_MANAGER');
}
export interface NavigationItem { id: string; label: string; available: boolean }
export function managementNavigation(authority: DisplayAuthority, eventId: ResourceId, shopId: ResourceId | null): NavigationItem[] {
  const owner = ownsEvent(authority, eventId);
  const permits = (p: Permission) => canDisplayPermission(authority, eventId, shopId, p);
  const shopManagement = canDisplayShopManagement(authority, eventId, shopId);
  const eventCash = owner || currentGrants(authority, eventId).some(g => g.scope.role === 'EVENT_OPERATOR' && g.scope.permissions.some(p => ['CHARGE', 'CASH_REFUND', 'MANAGE_CASH_REFUNDS'].includes(p)));
  return [
    { id: 'context', label: '選択中の管理対象', visible: true, available: true },
    { id: 'M01', label: '主催者ホーム', visible: owner, available: true },
    { id: 'M02', label: 'イベント設定', visible: owner, available: true },
    { id: 'M03', label: '店舗・運営管理', visible: shopManagement, available: false },
    { id: 'M04', label: '受付', visible: eventCash, available: false },
    { id: 'M05', label: 'スマホレジ', visible: shopId !== null && permits('CREATE_PAYMENT_REQUEST'), available: false },
    { id: 'M06', label: '商品・在庫', visible: shopId !== null && (permits('MANAGE_PRODUCTS') || permits('MANAGE_INVENTORY')), available: false },
    { id: 'M07', label: '注文一覧', visible: shopId !== null && permits('FULFILL_ORDER'), available: false },
    { id: 'M08', label: 'スタッフ管理', visible: shopId !== null && shopManagement, available: false },
    { id: 'M09', label: '取消・返金', visible: permits('PURCHASE_REFUND'), available: false },
    { id: 'M10', label: '売上・現金照合', visible: permits('READ_REPORT') || permits('RECONCILE_CASH'), available: false },
    { id: 'M11', label: '運用・完了判定', visible: owner, available: false },
  ].filter(item => item.visible).map(({ visible: _, ...item }) => item);
}

export interface ManagementSelection { eventId: ResourceId | null; shopId: ResourceId | null }
export function changeEvent(eventId: ResourceId): ManagementSelection {
  // Clear immediately, before the next event's shop list has arrived.
  return { eventId, shopId: null };
}
export function validShopId(eventId: ResourceId, shopId: ResourceId | null, shops: readonly Shop[]): ResourceId | null {
  return shops.some(shop => shop.event_id === eventId && shop.shop_id === shopId) ? shopId : null;
}
export function requestGeneration() {
  let generation = 0;
  return { next: () => ++generation, isCurrent: (candidate: number) => candidate === generation };
}
export function mergeEventPages(owned: readonly EventGuide[], staffed: readonly EventGuide[]): EventGuide[] {
  return [...new Map([...staffed, ...owned].map(event => [event.event_id, event])).values()];
}
export function formatYen(amount: string): string {
  // Never pass aggregate money through Number, floating point, or a 30 digit cap.
  return `${BigInt(amount).toLocaleString('ja-JP')}円`;
}
export function formatCheckedAt(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
export function organizerHomeModel(eventId: ResourceId, dashboard: BusinessDashboard, reconciliation: Reconciliation) {
  if (dashboard.scope !== 'EVENT' || dashboard.event_id !== eventId || reconciliation.event_id !== eventId) {
    throw new Error('M01 requires EVENT data for the selected event');
  }
  return {
    netSales: dashboard.net_sales_amount,
    unresolvedCashCases: dashboard.unresolved_cash_case_count,
    balanceTotal: (BigInt(reconciliation.available_amount) + BigInt(reconciliation.held_amount) + BigInt(reconciliation.refund_only_amount)).toString(),
    balanceParts: [
      { label: '利用可能額', amount: reconciliation.available_amount },
      { label: '拘束額', amount: reconciliation.held_amount },
      { label: '返金専用額', amount: reconciliation.refund_only_amount },
    ],
    dashboardCheckedAt: dashboard.checked_at,
    balanceCheckedAt: reconciliation.checked_at,
  };
}
export const eventLifecycleLabels: Record<EventGuide['lifecycle'], string> = {
  DRAFT: '下書き', PUBLISHED: '公開済み', RUNNING: '開催中', SALES_ENDED: '販売終了', SETTLING: '精算中', COMPLETED: '完了',
};
