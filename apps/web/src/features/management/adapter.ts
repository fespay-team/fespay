import type { ApiError, BusinessDashboard, EventGuide, Grant, Page, Reconciliation, Shop, Suspension } from './contracts';
import { canDisplaySuspensions, currentGrants, ownsEvent, type DisplayAuthority } from './model';
import { dashboardFixture, eventFixtures, grants, page, profiles, reconciliationFixture, shops, suspensions, type ProfileId, type ScenarioId } from './fixtures';

type ListQuery = { cursor?: string; limit?: number };
export interface ManagementAdapter {
  listMyEvents(query: ListQuery & { scope: 'OWNED' | 'STAFFED' }, signal: AbortSignal): Promise<Page<EventGuide>>;
  listGrants(eventId: string, query: ListQuery & { scope: 'MINE' }, signal: AbortSignal): Promise<Page<Grant>>;
  listEventShops(eventId: string, query: ListQuery, signal: AbortSignal): Promise<Page<Shop>>;
  listEventSuspensions(eventId: string, query: ListQuery, signal: AbortSignal): Promise<Page<Suspension>>;
  getEventDashboard(eventId: string, query: { scope: 'EVENT' }, signal: AbortSignal): Promise<BusinessDashboard>;
  getReconciliation(eventId: string, signal: AbortSignal): Promise<Reconciliation>;
}
export class ManagementReadError extends Error {
  constructor(readonly status: number, readonly body: ApiError) { super(body.message); }
}
const failure = (status: number, code: string, message: string) => new ManagementReadError(status, {
  code, message, request_id: 'management-fixture', retryable: status === 503,
});
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
/** In-memory only. No fetch, cookies, API authorization, MFA, or money commands.
 * Access filtering below keeps demo responses scoped; it is NOT server authorization.
 */
export function createFixtureAdapter(profileId: ProfileId, scenario: ScenarioId): ManagementAdapter {
  const profile = profiles.find(p => p.id === profileId)!;
  const authority: DisplayAuthority = { accountId: profile.accountId, ownedEventIds: profile.ownedEventIds, grants };
  const accessible = (eventId: string) => ownsEvent(authority, eventId) || currentGrants(authority, eventId).length > 0;
  async function read<T>(value: T, signal: AbortSignal, eventId?: string): Promise<T> {
    await wait(scenario === 'slow' && eventId ? (eventId.endsWith('1') ? 1400 : 160) : 100, signal);
    if (eventId && !accessible(eventId)) throw failure(403, 'FORBIDDEN', 'このイベントの表示資格がありません。');
    return structuredClone(value);
  }
  function paginate<T>(values: T[], query: ListQuery): Page<T> {
    const offset = query.cursor ? Number(query.cursor.replace('fixture-', '')) : 0;
    const size = query.limit ?? 2;
    const result = page(values.slice(offset, offset + size));
    result.next_cursor = offset + size < values.length ? `fixture-${offset + size}` : null;
    return result;
  }
  return {
    listMyEvents(query, signal) {
      const values = scenario === 'empty-events' ? [] : eventFixtures(scenario).filter(event => query.scope === 'OWNED'
        ? profile.ownedEventIds.includes(event.event_id) : currentGrants(authority, event.event_id).length > 0);
      return read(paginate(values, query), signal);
    },
    listGrants(eventId, query, signal) {
      return read(paginate(grants.filter(g => g.account_id === profile.accountId && g.event_id === eventId), query), signal, eventId);
    },
    async listEventShops(eventId, query, signal) {
      const eligible = currentGrants(authority, eventId);
      const values = scenario === 'empty-shops' ? [] : shops.filter(shop => shop.event_id === eventId &&
        (ownsEvent(authority, eventId) || eligible.some(g => g.scope.role === 'EVENT_OPERATOR' ? shop.visible : g.scope.shop_id === shop.shop_id)));
      const result = await read(paginate(values, query), signal, eventId);
      if (scenario === 'error') throw failure(503, 'DEPENDENCY_UNAVAILABLE', '店舗情報を取得できませんでした。');
      return result;
    },
    listEventSuspensions(eventId, query, signal) {
      if (!canDisplaySuspensions(authority, eventId)) return Promise.reject(failure(403, 'FORBIDDEN', '緊急停止の表示資格がありません。'));
      const managerShops = currentGrants(authority, eventId).filter(g => g.scope.role === 'SHOP_MANAGER').map(g => g.scope.shop_id);
      const values = suspensions.filter(s => s.event_id === eventId && (scenario !== 'empty-shops' || s.scope === 'EVENT') &&
        (ownsEvent(authority, eventId) || (s.scope === 'SHOP' && managerShops.includes(s.shop_id))));
      return read(paginate(values, query), signal, eventId);
    },
    getEventDashboard(eventId, _query, signal) {
      if (!ownsEvent(authority, eventId) && !currentGrants(authority, eventId).some(g => g.scope.role === 'EVENT_OPERATOR' && g.scope.permissions.includes('READ_REPORT'))) {
        return Promise.reject(failure(403, 'FORBIDDEN', 'イベント集計の表示資格がありません。'));
      }
      return read(dashboardFixture(eventId, scenario), signal, eventId);
    },
    getReconciliation(eventId, signal) {
      if (!ownsEvent(authority, eventId) && !currentGrants(authority, eventId).some(g => g.scope.role === 'EVENT_OPERATOR' && g.scope.permissions.includes('READ_AUDIT'))) {
        return Promise.reject(failure(403, 'FORBIDDEN', 'イベント照合の表示資格がありません。'));
      }
      return read(reconciliationFixture(eventId, scenario), signal, eventId);
    },
  };
}
export async function allPages<T>(read: (cursor?: string) => Promise<Page<T>>, signal: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    signal.throwIfAborted();
    const result = await read(cursor);
    signal.throwIfAborted();
    items.push(...result.items);
    cursor = result.next_cursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new Error('Repeated pagination cursor');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}
