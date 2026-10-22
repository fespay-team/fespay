import test from 'node:test';
import assert from 'node:assert/strict';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { allPages, createFixtureAdapter, type ManagementAdapter } from '../adapter';
import { ContextSelectors } from '../components/ContextSelectors';
import { eventFixtures, eventIds, events, page, profiles, shops } from '../fixtures';
import { changeEvent, managementNavigation, validShopId, type ManagementSelection } from '../model';
import { loadBootstrap, loadEventContext } from '../useManagement';

type SelectorProps = Parameters<typeof ContextSelectors>[0];
const signal = () => new AbortController().signal;
const view = (props: Partial<SelectorProps> = {}) => ContextSelectors({
  events: events.slice(0, 2), ownedEventIds: [eventIds[0]], eventId: eventIds[0],
  shops: shops.filter(shop => shop.event_id === eventIds[0]), shopId: null, loading: false,
  onEventChange: () => {}, onShopChange: () => {}, ...props,
});
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function eventSelect(tree: ReactNode) {
  return elements(tree).find(element => element.props.id === 'management-event')!;
}
function groups(tree: ReactNode) {
  return elements(eventSelect(tree)).filter(element => element.type === 'optgroup').map(group => ({
    label: group.props.label,
    ids: elements(group).filter(element => element.type === 'option').map(option => option.props.value),
  }));
}
function selectionText(tree: ReactNode) {
  return elements(tree).find(element => element.props.id === 'management-event-selection')!.props.children;
}

test('mixed OWNED/STAFFED results are grouped and overlapping events appear once under owned', async () => {
  const base = createFixtureAdapter('owner-staff', 'normal');
  const owned = await allPages(cursor => base.listMyEvents({ scope: 'OWNED', cursor }, signal()), signal());
  const staffed = await allPages(cursor => base.listMyEvents({ scope: 'STAFFED', cursor }, signal()), signal());
  assert.deepEqual(owned.map(event => event.event_id), [eventIds[0]]);
  assert.deepEqual(staffed.map(event => event.event_id), eventIds.slice(0, 2));
  const adapter: ManagementAdapter = { ...base, listMyEvents: async (query, abort) => {
    const result = await base.listMyEvents(query, abort);
    return query.scope === 'STAFFED' ? { ...result, items: result.items.map(event => ({ ...event, name: `STAFFED: ${event.name}` })) } : result;
  } };
  const bootstrap = await loadBootstrap(adapter, signal());
  assert.equal(bootstrap.events.length, 2);
  assert.equal(bootstrap.events.find(event => event.event_id === eventIds[0])!.name, owned[0].name, 'OWNED payload keeps merge precedence');
  const tree = view({ events: bootstrap.events, ownedEventIds: bootstrap.ownedEvents.map(event => event.event_id) });
  assert.deepEqual(groups(tree), [
    { label: '主催イベント', ids: [eventIds[0]] }, { label: '担当イベント', ids: [eventIds[1]] },
  ]);
  const select = eventSelect(tree);
  assert.ok(Children.toArray(select.props.children as ReactNode).every(child => isValidElement(child) && child.type === 'optgroup'), 'Event options cannot mix outside their groups');
  const options = elements(select).filter(element => element.type === 'option');
  assert.equal(new Set(options.map(option => option.props.value)).size, 2);
  assert.equal(options.length, 2);
});

test('selected event description identifies owned and staffed events by text and describes the select', () => {
  for (const [eventId, label] of [[eventIds[0], '主催イベント'], [eventIds[1], '担当イベント']]) {
    const tree = view({ eventId });
    assert.equal(selectionText(tree), `${label}：${events.find(event => event.event_id === eventId)!.name}`);
    assert.equal(eventSelect(tree).props['aria-describedby'], 'management-event-selection');
  }
});

test('switching from owned A to staffed B immediately clears A shop and rejects it in B', async () => {
  const adapter = createFixtureAdapter('owner-staff', 'normal');
  const bootstrap = await loadBootstrap(adapter, signal());
  let selection: ManagementSelection = { eventId: eventIds[0], shopId: shops[0].shop_id };
  const tree = view({ events: bootstrap.events, ownedEventIds: bootstrap.ownedEvents.map(event => event.event_id),
    eventId: selection.eventId, shopId: selection.shopId, onEventChange: id => { selection = changeEvent(id); } });
  (eventSelect(tree).props.onChange as (event: { target: { value: string } }) => void)({ target: { value: eventIds[1] } });
  assert.deepEqual(selection, { eventId: eventIds[1], shopId: null });
  const loadingTree = view({ events: bootstrap.events, eventId: selection.eventId, shopId: selection.shopId, shops: [], loading: true });
  assert.equal(selectionText(loadingTree), `担当イベント：${events[1].name}`);
  assert.equal(eventSelect(loadingTree).props.disabled, false);
  assert.equal(elements(loadingTree).find(element => element.props.id === 'management-shop')!.props.disabled, true);
  const accountId = profiles.find(profile => profile.id === 'owner-staff')!.accountId;
  const context = await loadEventContext(adapter, accountId, bootstrap.ownedEvents, eventIds[1], signal());
  assert.equal(validShopId(eventIds[1], shops[0].shop_id, context.shops), null);
});

test('OWNED without grants stays owned while EVENT_OPERATOR grants alone never imply ownership', async () => {
  const base = createFixtureAdapter('owner-staff', 'normal');
  const adapter: ManagementAdapter = { ...base, listGrants: (eventId, query, abort) => eventId === eventIds[0]
    ? Promise.resolve(page([])) : base.listGrants(eventId, query, abort) };
  const bootstrap = await loadBootstrap(adapter, signal());
  const accountId = profiles.find(profile => profile.id === 'owner-staff')!.accountId;
  const owned = await loadEventContext(adapter, accountId, bootstrap.ownedEvents, eventIds[0], signal());
  const staffed = await loadEventContext(adapter, accountId, bootstrap.ownedEvents, eventIds[1], signal());
  assert.deepEqual(owned.authority.grants, []);
  assert.ok(staffed.authority.grants.some(grant => grant.scope.role === 'EVENT_OPERATOR'));
  assert.ok(managementNavigation(owned.authority, eventIds[0], null).some(item => item.id === 'M01'));
  assert.ok(managementNavigation(owned.authority, eventIds[0], null).some(item => item.id === 'M02'));
  assert.ok(!managementNavigation(staffed.authority, eventIds[1], null).some(item => item.id === 'M01' || item.id === 'M02'));
  assert.deepEqual(groups(view({ events: bootstrap.events, ownedEventIds: bootstrap.ownedEvents.map(event => event.event_id) })), [
    { label: '主催イベント', ids: [eventIds[0]] }, { label: '担当イベント', ids: [eventIds[1]] },
  ]);
});

for (const [profileId, label] of [['owner', '主催イベント'], ['operator', '担当イベント']] as const) {
  test(`${profileId} selector omits the empty group and retains every available event`, async () => {
    const bootstrap = await loadBootstrap(createFixtureAdapter(profileId, 'normal'), signal());
    const tree = view({ events: bootstrap.events, ownedEventIds: bootstrap.ownedEvents.map(event => event.event_id) });
    assert.deepEqual(groups(tree), [{ label, ids: bootstrap.events.map(event => event.event_id) }]);
  });
}

test('empty and initial loading states keep disabled selectors and unselected descriptions', () => {
  for (const loading of [false, true]) {
    const tree = view({ events: [], ownedEventIds: [], eventId: null, shops: [], shopId: null, loading });
    assert.deepEqual(groups(tree), []);
    assert.equal(eventSelect(tree).props.disabled, true);
    assert.equal(selectionText(tree), 'イベント未選択');
    const html = renderToStaticMarkup(tree);
    assert.match(html, /選択できるイベントなし/);
    assert.match(html, loading ? /店舗を確認中/ : /選択できる店舗なし/);
    assert.equal(elements(tree).find(element => element.props.id === 'management-shop')!.props.disabled, true);
  }
});

test('long event names remain complete in grouped options and the qualified description', () => {
  const longEvents = eventFixtures('long-values').slice(0, 2);
  const tree = view({ events: longEvents, eventId: eventIds[1] });
  assert.deepEqual(groups(tree), [{ label: '主催イベント', ids: [eventIds[0]] }, { label: '担当イベント', ids: [eventIds[1]] }]);
  assert.equal(selectionText(tree), `担当イベント：${longEvents[1].name}`);
  assert.deepEqual(elements(eventSelect(tree)).filter(element => element.type === 'option').map(option => option.props.children), longEvents.map(event => event.name));
});
