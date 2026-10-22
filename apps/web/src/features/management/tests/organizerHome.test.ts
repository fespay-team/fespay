import test from 'node:test';
import assert from 'node:assert/strict';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Shop, Suspension } from '../contracts';
import { ContextSelectors } from '../components/ContextSelectors';
import { dashboardFixture, eventIds, events, grants, profiles, reconciliationFixture, shops, suspensions } from '../fixtures';
import { changeEvent, validShopId, type ManagementSelection } from '../model';
import { OrganizerHome } from '../pages/OrganizerHome';
import type { EventContext } from '../useManagement';

function context(eventId = eventIds[0]): EventContext {
  return {
    authority: { accountId: profiles[0].accountId, ownedEventIds: [...eventIds], grants },
    shops: shops.filter(shop => shop.event_id === eventId), suspensions: suspensions.filter(stop => stop.event_id === eventId),
    dashboard: dashboardFixture(eventId, 'normal'), reconciliation: reconciliationFixture(eventId, 'normal'),
  };
}
function render(data = context(), shopId: string | null = null, eventId = eventIds[0]) {
  return renderToStaticMarkup(createElement(OrganizerHome, { event: events.find(event => event.event_id === eventId)!, context: data, shopId }));
}
function summary(html: string) {
  const dl = /<dl class="mg-home-shop-summary">([\s\S]*?)<\/dl>/.exec(html);
  assert.ok(dl, 'Shop summary definition list');
  return Object.fromEntries([...dl[1].matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map(([, label, count]) => [label, count]));
}
function metricValues(html: string) {
  return [...html.matchAll(/data-testid="([^"]+)">([^<]+)/g)].map(([, id, value]) => [id, value]);
}
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}

test('M01 without a selected shop renders an accessible compact summary instead of all shop cards', () => {
  const data = context(), html = render(data);
  assert.match(html, /<section[^>]*aria-labelledby="shop-summary-title"/);
  assert.match(html, /<h2 id="shop-summary-title">店舗状況<\/h2>/);
  assert.deepEqual(summary(html), { 店舗数: '3', 営業中: '1', 新規決済受付停止: '2', 緊急停止中: '1' });
  assert.doesNotMatch(html, /mg-shop-card|mg-shop-list|shop-status-title/);
  for (const shop of data.shops) assert.ok(!html.includes(shop.name));
  assert.match(html, /上部で店舗を選択すると、その店舗の詳細を確認できます/);
});

test('shop total, OPEN and payment acceptance counts stay independent of each other', () => {
  const data = context();
  data.shops = (['OPEN', 'OPEN', 'CLOSED', 'ARCHIVED'] as const).map((status, index): Shop => ({
    ...data.shops[0], shop_id: `shop-${index}`, status, accepting_new_payments: index === 1 || index === 2,
  }));
  data.suspensions = [];
  assert.deepEqual(summary(render(data)), { 店舗数: '4', 営業中: '2', 新規決済受付停止: '2', 緊急停止中: '0' });
});

test('active SHOP suspensions count each shop once and ignore inactive and EVENT suspensions', () => {
  const data = context(), base = suspensions[0];
  data.suspensions = [
    { ...base, suspension_id: 'shop-one-a', scope: 'SHOP', shop_id: data.shops[0].shop_id, active: true },
    { ...base, suspension_id: 'shop-one-b', scope: 'SHOP', shop_id: data.shops[0].shop_id, active: true },
    { ...base, suspension_id: 'shop-two', scope: 'SHOP', shop_id: data.shops[1].shop_id, active: true },
    { ...base, suspension_id: 'inactive', scope: 'SHOP', shop_id: data.shops[2].shop_id, active: false },
    { suspension_id: 'event-stop', event_id: eventIds[0], scope: 'EVENT', active: true, reason: 'イベント停止', version: '1', checked_at: base.checked_at },
  ] satisfies Suspension[];
  assert.equal(summary(render(data)).緊急停止中, '2');
  assert.equal(summary(render(data)).営業中, '1');
});

test('an event with no shops displays explicit zero counts', () => {
  const data = { ...context(), shops: [], suspensions: [] };
  assert.deepEqual(summary(render(data)), { 店舗数: '0', 営業中: '0', 新規決済受付停止: '0', 緊急停止中: '0' });
});

test('unavailable suspension data is not reported as zero stopped shops', () => {
  const data = { ...context(), suspensions: null };
  assert.equal(summary(render(data)).緊急停止中, '未取得（表示対象外）');
});

test('each selected shop shows only its existing detail and deselection restores the summary without changing metrics', () => {
  const data = context(), unselected = render(data);
  for (const shop of data.shops) {
    const html = render(data, shop.shop_id);
    assert.equal((html.match(/class="mg-shop-card"/g) ?? []).length, 1);
    assert.ok(html.includes(shop.name));
    for (const other of data.shops.filter(other => other.shop_id !== shop.shop_id)) assert.ok(!html.includes(other.name));
    assert.doesNotMatch(html, /shop-summary-title/);
    assert.match(html, /店舗状態/); assert.match(html, /新規決済の受付設定/); assert.match(html, /店舗の緊急停止/);
    assert.deepEqual(metricValues(html), metricValues(unselected));
  }
  assert.deepEqual(summary(render(data, null)), summary(unselected));
});

test('M01 removes its owned-event switcher and preserves financial indicators and the event emergency-stop section', () => {
  const html = render(context(eventIds[1]), null, eventIds[1]);
  assert.doesNotMatch(html, /自イベント|YOUR EVENTS|owned-events-title|mg-event-button/);
  assert.match(html, /イベントの緊急停止/); assert.match(html, /デモ：イベントの緊急停止を確認/);
  assert.match(html, /売上純額/); assert.match(html, /利用者残高総額/); assert.match(html, /未解決現金ケース/);
  assert.equal(metricValues(html).length, 3);
});

test('the shared event selector still changes the event, clears the shop and rejects the previous event shop ID', () => {
  const first = context(), second = context(eventIds[1]);
  let selection: ManagementSelection = { eventId: eventIds[0], shopId: first.shops[0].shop_id };
  const selectors = ContextSelectors({ events, eventId: selection.eventId, shops: first.shops, shopId: selection.shopId, loading: false,
    onEventChange: id => { selection = changeEvent(id); }, onShopChange: id => { selection = { ...selection, shopId: id }; },
  });
  const eventSelect = elements(selectors).find(element => element.props.id === 'management-event')!;
  (eventSelect.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: eventIds[1] } });
  assert.deepEqual(selection, { eventId: eventIds[1], shopId: null });
  assert.equal(validShopId(eventIds[1], first.shops[0].shop_id, second.shops), null);
  assert.deepEqual(summary(render(second, selection.shopId, eventIds[1])), { 店舗数: '1', 営業中: '1', 新規決済受付停止: '1', 緊急停止中: '0' });
});

test('a thousand shops still render only the four summary entries', () => {
  const data = context();
  data.shops = Array.from({ length: 1000 }, (_, index) => ({ ...data.shops[0], shop_id: `shop-${index}`, name: `店舗${index}` }));
  data.suspensions = [];
  const html = render(data);
  assert.deepEqual(summary(html), { 店舗数: '1,000', 営業中: '1,000', 新規決済受付停止: '0', 緊急停止中: '0' });
  assert.doesNotMatch(html, /mg-shop-card|店舗999/);
  assert.equal(Object.keys(summary(html)).length, 4);
});
