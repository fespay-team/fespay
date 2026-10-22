import { useEffect, useRef, useState } from 'react';
import { allPages, type ManagementAdapter } from './adapter';
import type { BusinessDashboard, EventGuide, Grant, Reconciliation, Shop, Suspension } from './contracts';
import { canDisplaySuspensions, mergeEventPages, ownsEvent, requestGeneration, type DisplayAuthority } from './model';

export type ReadState<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };
/** Key mismatch hides the previous data during render, even before effect cleanup.
 * The generation check also protects against adapters that ignore AbortSignal.
 */
export function useManagementRead<T>(key: string, load: (signal: AbortSignal) => Promise<T>): ReadState<T> {
  const generation = useRef(requestGeneration());
  const [state, setState] = useState<{ key: string; result: ReadState<T> }>({ key, result: { status: 'loading' } });
  useEffect(() => {
    const controller = new AbortController();
    const ticket = generation.current.next();
    setState({ key, result: { status: 'loading' } });
    void load(controller.signal).then(
      data => { if (!controller.signal.aborted && generation.current.isCurrent(ticket)) setState({ key, result: { status: 'ready', data } }); },
      error => { if (!controller.signal.aborted && generation.current.isCurrent(ticket)) setState({ key, result: { status: 'error', error } }); },
    );
    return () => { controller.abort(); generation.current.next(); };
  }, [key, load]);
  return state.key === key ? state.result : { status: 'loading' };
}
export interface ManagementBootstrap { events: EventGuide[]; ownedEvents: EventGuide[] }
export async function loadBootstrap(adapter: ManagementAdapter, signal: AbortSignal): Promise<ManagementBootstrap> {
  const [ownedEvents, staffedEvents] = await Promise.all([
    allPages(cursor => adapter.listMyEvents({ scope: 'OWNED', cursor }, signal), signal),
    allPages(cursor => adapter.listMyEvents({ scope: 'STAFFED', cursor }, signal), signal),
  ]);
  return { events: mergeEventPages(ownedEvents, staffedEvents), ownedEvents };
}
export interface EventContext {
  authority: DisplayAuthority;
  shops: Shop[];
  suspensions: Suspension[] | null;
  dashboard: BusinessDashboard | null;
  reconciliation: Reconciliation | null;
}
export async function loadEventContext(adapter: ManagementAdapter, accountId: string, ownedEvents: EventGuide[], eventId: string, signal: AbortSignal): Promise<EventContext> {
  const [grants, shops]: [Grant[], Shop[]] = await Promise.all([
    allPages(cursor => adapter.listGrants(eventId, { scope: 'MINE', cursor }, signal), signal),
    allPages(cursor => adapter.listEventShops(eventId, { cursor }, signal), signal),
  ]);
  if (shops.some(shop => shop.event_id !== eventId)) throw new Error('Shop response belongs to another event');
  const authority: DisplayAuthority = { accountId, ownedEventIds: ownedEvents.map(event => event.event_id), grants };
  const [suspensions, dashboard, reconciliation] = await Promise.all([
    canDisplaySuspensions(authority, eventId) ? allPages(cursor => adapter.listEventSuspensions(eventId, { cursor }, signal), signal) : null,
    ownsEvent(authority, eventId) ? adapter.getEventDashboard(eventId, { scope: 'EVENT' }, signal) : null,
    ownsEvent(authority, eventId) ? adapter.getReconciliation(eventId, signal) : null,
  ]);
  if (suspensions?.some(s => s.event_id !== eventId || (s.scope === 'SHOP' && !shops.some(shop => shop.shop_id === s.shop_id)))) {
    throw new Error('Suspension response is outside the selected context');
  }
  return { authority, shops, suspensions, dashboard, reconciliation };
}
