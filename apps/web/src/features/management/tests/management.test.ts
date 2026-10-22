import test from 'node:test';
import assert from 'node:assert/strict';
import { allPages, createFixtureAdapter, ManagementReadError, type ManagementAdapter } from '../adapter';
import { dashboardFixture, eventFixtures, eventIds, events, grants, profiles, reconciliationFixture, scenarios, shopIds, shops } from '../fixtures';
import { canDisplayPermission, changeEvent, currentGrants, formatYen, managementNavigation, organizerHomeModel, ownsEvent, requestGeneration, validShopId, type DisplayAuthority } from '../model';
import { loadBootstrap, loadEventContext } from '../useManagement';

const signal = () => new AbortController().signal;
function authority(profileId: string): DisplayAuthority {
  const profile = profiles.find(p => p.id === profileId)!;
  return { accountId: profile.accountId, ownedEventIds: profile.ownedEventIds, grants };
}
const nav = (profileId: string, eventId = eventIds[0], shopId: string | null = shopIds[0]) => managementNavigation(authority(profileId), eventId, shopId).map(item => item.id);

test('ownership is separate from grant role; owner without grants retains its own M01 only', () => {
  const owner = { ...authority('owner'), grants: [] };
  assert.ok(ownsEvent(owner, eventIds[0]));
  assert.equal(currentGrants(owner, eventIds[0]).length, 0);
  assert.ok(managementNavigation(owner, eventIds[0], null).some(item => item.id === 'M01'));
  assert.equal(ownsEvent({ ...owner, ownedEventIds: [eventIds[0]] }, eventIds[1]), false);
  assert.equal(ownsEvent(authority('operator'), eventIds[0]), false);
  assert.ok(currentGrants(authority('owner'), eventIds[0]).some(g => g.scope.role === 'CASHIER'));
});
test('current account, event, shop and permission restrict display independently', () => {
  assert.ok(nav('operator').includes('M10'));
  assert.ok(!nav('operator').includes('M01'));
  assert.ok(!nav('operator').includes('M03'));
  assert.ok(!nav('operator', eventIds[1]).includes('M10'));
  assert.ok(nav('operator', eventIds[1]).includes('M04'));
  assert.ok(nav('manager').includes('M06'));
  assert.ok(nav('manager').includes('M08'));
  assert.ok(!nav('manager', eventIds[0], shopIds[1]).includes('M06'));
  assert.ok(nav('cashier').includes('M05'));
  assert.ok(!nav('cashier').includes('M10'));
  assert.ok(!nav('cashier').includes('M08'));
  assert.ok(nav('report-cashier').includes('M10'));
  assert.ok(!nav('report-cashier', eventIds[0], null).includes('M10'));
  const auditOnly: DisplayAuthority = { ...authority('operator'), grants: [{ ...grants[1], scope: { role: 'EVENT_OPERATOR', permissions: ['READ_AUDIT'] } }] };
  assert.ok(!managementNavigation(auditOnly, eventIds[0], null).some(item => item.id === 'M10'));
  assert.deepEqual(nav('revoked'), ['context']);
  assert.equal(canDisplayPermission({ ...authority('cashier'), accountId: 'another-account' }, eventIds[0], shopIds[0], 'CREATE_PAYMENT_REQUEST'), false);
  assert.ok(managementNavigation(authority('owner'), eventIds[0], shopIds[0]).filter(item => item.available).every(item => ['context', 'M01', 'M02'].includes(item.id)));
});
test('event change clears shop immediately and shop validation rejects cross-event IDs', () => {
  assert.deepEqual(changeEvent(eventIds[1]), { eventId: eventIds[1], shopId: null });
  assert.equal(validShopId(eventIds[1], shopIds[0], shops), null);
  assert.equal(validShopId(eventIds[1], shopIds[3], shops), shopIds[3]);
  assert.equal(validShopId(eventIds[0], shopIds[0], []), null);
});
test('latest generation rejects old responses even when a source ignores cancellation', async () => {
  const generation = requestGeneration();
  const committed: string[] = [];
  let finishOld!: () => void;
  const old = generation.next();
  const oldResult = new Promise<void>(resolve => { finishOld = resolve; }).then(() => { if (generation.isCurrent(old)) committed.push('old'); });
  const latest = generation.next();
  if (generation.isCurrent(latest)) committed.push('new');
  finishOld();
  await oldResult;
  assert.deepEqual(committed, ['new']);
});
test('M01 preserves arbitrary aggregate precision, zero, negative net sales and all balance buckets', () => {
  assert.ok(eventFixtures('long-values').every(event => event.name.length > 60 && event.name.length <= 100));
  for (const scenario of ['normal', 'long-values', 'zero', 'negative'] as const) {
    const dashboard = dashboardFixture(eventIds[0], scenario);
    const reconciliation = reconciliationFixture(eventIds[0], scenario);
    const model = organizerHomeModel(eventIds[0], dashboard, reconciliation);
    assert.equal(BigInt(model.balanceTotal), BigInt(reconciliation.available_amount) + BigInt(reconciliation.held_amount) + BigInt(reconciliation.refund_only_amount));
    assert.equal(model.netSales, dashboard.net_sales_amount);
    assert.equal(formatYen(model.balanceTotal).replaceAll(',', ''), `${model.balanceTotal}円`);
    assert.ok(!('total_balance' in reconciliation));
  }
  assert.equal(formatYen('0'), '0円');
  assert.equal(formatYen('-4200'), '-4,200円');
  assert.throws(() => organizerHomeModel(eventIds[1], dashboardFixture(eventIds[0], 'normal'), reconciliationFixture(eventIds[0], 'normal')));
});
test('all pages are consumed and duplicate OWNED/STAFFED events are merged', async () => {
  const adapter = createFixtureAdapter('owner', 'normal');
  const bootstrap = await loadBootstrap(adapter, signal());
  assert.deepEqual(bootstrap.ownedEvents.map(e => e.event_id), eventIds);
  assert.equal(bootstrap.events.length, 3);
  const context = await loadEventContext(adapter, profiles[0].accountId, bootstrap.ownedEvents, eventIds[0], signal());
  assert.equal(context.shops.length, 3);
  assert.equal(context.suspensions?.length, 2);
  assert.ok(context.dashboard && context.reconciliation);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(adapter.listEventShops(eventIds[0], {}, controller.signal));
  await assert.rejects(allPages(async () => ({ items: [], next_cursor: 'repeat', checked_at: '2026-10-15T03:00:00Z' }), signal()), /Repeated/);
});
test('ordinary cashier receives only assigned shops and loader never requests M01 or stop data', async () => {
  const adapter = createFixtureAdapter('cashier', 'normal');
  const bootstrap = await loadBootstrap(adapter, signal());
  const notAllowed = async (): Promise<never> => { throw new Error('unauthorized read attempted'); };
  const guarded: ManagementAdapter = { ...adapter, getEventDashboard: notAllowed, getReconciliation: notAllowed, listEventSuspensions: notAllowed };
  const context = await loadEventContext(guarded, profiles[3].accountId, bootstrap.ownedEvents, eventIds[0], signal());
  assert.deepEqual(context.shops.map(s => s.shop_id), [shopIds[0]]);
  assert.equal(context.dashboard, null);
  assert.equal(context.reconciliation, null);
  assert.equal(context.suspensions, null);
  await assert.rejects(adapter.getEventDashboard(eventIds[0], { scope: 'EVENT' }, signal()), (error: unknown) => error instanceof ManagementReadError && error.status === 403);
  const operatorShops = await allPages(cursor => createFixtureAdapter('operator', 'normal').listEventShops(eventIds[0], { cursor }, signal()), signal());
  assert.ok(operatorShops.every(shop => shop.visible));
});
test('shop state, acceptance and suspensions remain independent wire values', async () => {
  const adapter = createFixtureAdapter('owner', 'normal');
  const context = await loadEventContext(adapter, profiles[0].accountId, events, eventIds[0], signal());
  assert.deepEqual(context.shops.map(s => s.status), ['OPEN', 'CLOSED', 'ARCHIVED']);
  assert.equal(context.shops[0].accepting_new_payments, true);
  assert.ok(context.suspensions?.some(s => s.scope === 'SHOP' && s.shop_id === context.shops[0].shop_id && s.active));
  const second = await loadEventContext(adapter, profiles[0].accountId, events, eventIds[1], signal());
  assert.ok(second.suspensions?.some(s => s.scope === 'EVENT' && s.active));
  assert.equal(second.shops[0].status, 'OPEN');
  assert.equal(second.shops[0].accepting_new_payments, false);
});
test('fixture empty and read-error states do not turn into successful zero metrics', async () => {
  assert.equal((await loadBootstrap(createFixtureAdapter('owner', 'empty-events'), signal())).events.length, 0);
  assert.equal((await loadBootstrap(createFixtureAdapter('revoked', 'normal'), signal())).events.length, 0);
  const emptyShops = await loadEventContext(createFixtureAdapter('owner', 'empty-shops'), profiles[0].accountId, events, eventIds[0], signal());
  assert.equal(emptyShops.shops.length, 0);
  await assert.rejects(loadEventContext(createFixtureAdapter('owner', 'error'), profiles[0].accountId, events, eventIds[0], signal()), (error: unknown) => error instanceof ManagementReadError && error.body.code === 'DEPENDENCY_UNAVAILABLE');
  assert.equal(scenarios.length, 8);
});
