import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FeaturePolicy } from '../contracts';
import { events, eventIds } from '../fixtures';
import { SaveStatus } from '../pages/EventSettings';
import { createSettingsFixture, settingsFailure } from '../settingsAdapter';
import { guideDraft, japanInput, settingsDraft, settingsWindows, updateGuideBody, updateSettingsBody } from '../settingsModel';
import { createEventSettingsEditor } from '../settingsState';

const originalEnd = '2026-10-16T09:00:00.123456Z';
const latestEnd = '2026-10-16T09:00:00.123999Z';
const featurePolicy: FeaturePolicy = {
  amount_input: 'OPTIONAL', payment_a: 'REQUIRED', payment_b: 'PROHIBITED', fixed_qr: 'OPTIONAL',
  products: 'PROHIBITED', inventory: 'OPTIONAL', orders: 'REQUIRED', mobile_orders: 'PROHIBITED',
};

async function conflictView(features = featurePolicy) {
  const fixture = createSettingsFixture('owner'), eventId = eventIds[0];
  const resources = {
    guide: structuredClone(events[0]),
    settings: await fixture.adapter.getEventSettings(eventId, new AbortController().signal),
  };
  const window = { starts_at: '2026-10-16T01:00:00.123456Z', ends_at: originalEnd };
  resources.guide.hosting_window = { ...window };
  for (const key of settingsWindows) resources.settings[key] = { ...window };
  resources.settings.expiration_at = '2026-10-17T09:00:00.123456Z';
  resources.settings.expiration_terms = '払戻し受付終了後に失効';
  resources.settings.features = { ...features };
  const conflict = async (): Promise<never> => { throw settingsFailure(409, 'VERSION_CONFLICT', '版が更新されました。'); };
  const editor = createEventSettingsEditor({ ...fixture.adapter,
    getEventGuide: async () => structuredClone(resources.guide),
    getEventSettings: async () => structuredClone(resources.settings),
    updateEventGuide: conflict, updateEventSettings: conflict,
  }, eventId, () => true);
  await Promise.all([editor.guide.load(), editor.settings.load()]);
  editor.guide.edit({ ...editor.guide.getSnapshot().draft!, reason: '案内を更新' });
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, reason: '業務設定を更新' });
  const details = () => {
    const guide = editor.guide.getSnapshot(), settings = editor.settings.getSnapshot();
    const html = renderToStaticMarkup(createElement('div', null,
      createElement(SaveStatus, { state: guide, controller: editor.guide, latestDraft: guide.latest && guideDraft(guide.latest) }),
      createElement(SaveStatus, { state: settings, controller: editor.settings, latestDraft: settings.latest && settingsDraft(settings.latest) }),
    ));
    return [...html.matchAll(/<dt>([^<]+)<\/dt><dd>最新の正本：([^<]*)<\/dd><dd>編集中：([^<]*)<\/dd>/g)]
      .map(([, label, latest, draft]) => ({ label, latest, draft }));
  };
  return { resources, editor, details, async refresh(section: 'guide' | 'settings') {
    resources[section].version = (BigInt(resources[section].version) + 1n).toString();
    await editor[section].save();
    assert.equal(editor[section].getSnapshot().status, 'conflict');
    await editor[section].refreshConflict();
    return details();
  } };
}

test('guide conflict detects .123456Z to .123999Z despite identical datetime-local inputs and shows the exact end time', async () => {
  const view = await conflictView();
  view.resources.guide.hosting_window.ends_at = latestEnd;
  assert.equal(japanInput(originalEnd), japanInput(latestEnd));
  assert.deepEqual(await view.refresh('guide'), [{
    label: '開催期間',
    latest: '開始日時：2026-10-16 10:00:00.123456（日本時間） / 終了日時：2026-10-16 18:00:00.123999（日本時間）',
    draft: '開始日時：2026-10-16 10:00:00.123456（日本時間） / 終了日時：2026-10-16 18:00:00.123456（日本時間）',
  }]);
  const state = view.editor.guide.getSnapshot();
  assert.equal(updateGuideBody(state.draft!, state.resource!.version).hosting_window.ends_at, originalEnd);
});

test('settings conflicts retain all fractional digits for both boundaries of every window', async () => {
  const labels = ['チャージ受付期間', '支払受付期間', '譲渡受付期間', '通常払戻し受付期間', '精算用払戻し受付期間'];
  for (const [index, key] of settingsWindows.entries()) for (const field of ['starts_at', 'ends_at'] as const) {
    const view = await conflictView(), original = view.resources.settings[key][field];
    view.resources.settings[key][field] = original.replace('.123456Z', '.123999Z');
    assert.equal(japanInput(original), japanInput(view.resources.settings[key][field]));
    const changes = await view.refresh('settings'), label = field === 'starts_at' ? '開始日時' : '終了日時';
    assert.equal(changes.length, 1, `${key}.${field}`);
    assert.equal(changes[0].label, labels[index]);
    assert.match(changes[0].latest, new RegExp(`${label}：2026-10-16 .*\\.123999（日本時間）`));
    assert.match(changes[0].draft, new RegExp(`${label}：2026-10-16 .*\\.123456（日本時間）`));
    const state = view.editor.settings.getSnapshot();
    assert.equal(updateSettingsBody(state.draft!, state.resource!)[key][field], original);
  }
});

test('edited guide and settings dates compare their entered Japan time with the latest UTC value', async () => {
  for (const section of ['guide', 'settings'] as const) {
    const view = await conflictView();
    view.resources.guide.hosting_window.ends_at = '2026-10-16T10:00:00.000Z';
    view.resources.settings.payment_window.ends_at = '2026-10-16T10:00:00.000Z';
    const guide = view.editor.guide.getSnapshot().draft!, settings = view.editor.settings.getSnapshot().draft!;
    view.editor.guide.edit({ ...guide, hosting_window: { ...guide.hosting_window, ends_at: '2026-10-16T19:00' } });
    view.editor.settings.edit({ ...settings, payment_window: { ...settings.payment_window, ends_at: '2026-10-16T19:00' } });
    assert.deepEqual(await view.refresh(section), []);
    if (section === 'guide') view.editor.guide.edit({ ...guide, hosting_window: { ...guide.hosting_window, ends_at: '2026-10-16T20:00' } });
    else view.editor.settings.edit({ ...settings, payment_window: { ...settings.payment_window, ends_at: '2026-10-16T20:00' } });
    const changes = view.details();
    assert.equal(changes.length, 1);
    assert.equal(changes[0].label, section === 'guide' ? '開催期間' : '支払受付期間');
    assert.match(changes[0].latest, /終了日時：2026-10-16 19:00:00.000（日本時間）/);
    assert.match(changes[0].draft, /終了日時：2026-10-16 20:00:00.000（日本時間）/);
  }
});

test('expiration conflicts use original precision, edited Japan time and an explicit unset value', async () => {
  const view = await conflictView();
  view.resources.settings.expiration_at = '2026-10-17T09:00:00.123999Z';
  assert.deepEqual(await view.refresh('settings'), [{ label: '残高失効日時',
    latest: '2026-10-17 18:00:00.123999（日本時間）', draft: '2026-10-17 18:00:00.123456（日本時間）' }]);
  let state = view.editor.settings.getSnapshot();
  assert.equal(updateSettingsBody(state.draft!, state.resource!).expiration_at, '2026-10-17T09:00:00.123456Z');
  view.editor.settings.edit({ ...state.draft!, expiration_at: '2026-10-17T18:30' });
  assert.equal(view.details()[0].draft, '2026-10-17 18:30:00.000（日本時間）');
  view.resources.settings.expiration_at = '2026-10-17T09:30:00.000Z';
  await view.editor.settings.refreshConflict();
  assert.deepEqual(view.details(), []);
  state = view.editor.settings.getSnapshot();
  view.editor.settings.edit({ ...state.draft!, expiration_at: '' });
  assert.equal(view.details()[0].draft, '未指定');
  view.resources.settings.expiration_at = null;
  await view.editor.settings.refreshConflict();
  assert.deepEqual(view.details(), []);
});

test('identical feature policies with reversed key insertion order are not conflicts', async () => {
  const view = await conflictView();
  view.resources.settings.features = Object.fromEntries(Object.entries(featurePolicy).reverse()) as FeaturePolicy;
  assert.notEqual(JSON.stringify(featurePolicy), JSON.stringify(view.resources.settings.features));
  assert.deepEqual(await view.refresh('settings'), []);
});

test('feature conflicts show all Japanese item names in fixed order even when reordered values look identical', async () => {
  const view = await conflictView();
  const { products: _, inventory: __, orders, mobile_orders, ...unchanged } = featurePolicy;
  view.resources.settings.features = { ...unchanged, inventory: 'PROHIBITED', products: 'OPTIONAL', orders, mobile_orders };
  assert.deepEqual(Object.values(view.resources.settings.features), Object.values(featurePolicy));
  assert.deepEqual(await view.refresh('settings'), [{ label: '機能ポリシー',
    latest: '金額入力：任意 / A方式：必須 / B方式：禁止 / 固定QR：任意 / 商品：任意 / 在庫：禁止 / 注文：必須 / モバイル注文：禁止',
    draft: '金額入力：任意 / A方式：必須 / B方式：禁止 / 固定QR：任意 / 商品：禁止 / 在庫：任意 / 注文：必須 / モバイル注文：禁止',
  }]);
});

for (const [latest, input, editedUtc] of [
  ['2026-10-16T10:00:00Z', '2026-10-16T19:00', '2026-10-16T10:00:00.000Z'],
  ['2026-10-16T10:00:00.123000Z', '2026-10-16T19:00:00.123', '2026-10-16T10:00:00.123Z'],
] as const) test(`edited dates equal ${latest} without changing their UTC wire representation`, async () => {
  for (const section of ['guide', 'settings'] as const) {
    const view = await conflictView();
    if (section === 'guide') {
      const state = view.editor.guide.getSnapshot();
      view.resources.guide.hosting_window.ends_at = latest;
      view.editor.guide.edit({ ...state.draft!, hosting_window: { ...state.draft!.hosting_window, ends_at: input } });
      assert.equal(updateGuideBody(view.editor.guide.getSnapshot().draft!, state.resource!.version).hosting_window.ends_at, editedUtc);
    } else {
      const state = view.editor.settings.getSnapshot();
      view.resources.settings.payment_window.ends_at = latest;
      view.resources.settings.expiration_at = latest;
      view.editor.settings.edit({ ...state.draft!, payment_window: { ...state.draft!.payment_window, ends_at: input }, expiration_at: input });
      const body = updateSettingsBody(view.editor.settings.getSnapshot().draft!, state.resource!);
      assert.equal(body.payment_window.ends_at, editedUtc);
      assert.equal(body.expiration_at, editedUtc);
    }
    assert.deepEqual(await view.refresh(section), []);
  }
});

test('comparison ignores fractional zeroes while retaining original precision in origins, display and unedited wire values', async () => {
  for (const [originalFraction, latestFraction] of [
    ['.000000', ''], ['.123000', '.123'], ['.123400', '.1234'],
    ['.1234567890123456789000', '.1234567890123456789'],
  ]) {
    const view = await conflictView(), original = `2026-10-16T10:00:00${originalFraction}Z`;
    const latest = `2026-10-16T10:00:00${latestFraction}Z`;
    const guide = { ...view.resources.guide, hosting_window: { ...view.resources.guide.hosting_window, ends_at: original } };
    const draft = { ...guideDraft(guide), reason: '日時の表現を保持' }, origins = structuredClone(draft.dateOrigins);
    view.editor.guide.edit(draft);
    view.resources.guide.hosting_window.ends_at = latest;
    assert.deepEqual(await view.refresh('guide'), []);

    // A changed start exposes the unchanged end, so display precision is checked independently of comparison.
    view.resources.guide.hosting_window.starts_at = '2026-10-16T01:00:00.123999Z';
    await view.editor.guide.refreshConflict();
    const changes = view.details();
    assert.equal(changes.length, 1);
    assert.ok(changes[0].draft.endsWith(`終了日時：2026-10-16 19:00:00${originalFraction}（日本時間）`));
    assert.ok(changes[0].latest.endsWith(`終了日時：2026-10-16 19:00:00${latestFraction}（日本時間）`));
    assert.deepEqual(draft.dateOrigins, origins);
    view.editor.guide.acceptLatestVersion();
    const state = view.editor.guide.getSnapshot();
    assert.equal(updateGuideBody(state.draft!, state.resource!.version).hosting_window.ends_at, original);
  }
});

test('comparison keeps distinct sub-millisecond instants distinct, including arbitrary fractional lengths', async () => {
  for (const [originalFraction, latestFraction] of [
    ['123456', '123999'], ['123456000', '123999000'],
    ['123456789012345678901', '123456789012345678902'],
  ]) {
    const view = await conflictView(), original = `2026-10-16T10:00:00.${originalFraction}Z`;
    const latest = `2026-10-16T10:00:00.${latestFraction}Z`;
    const guide = { ...view.resources.guide, hosting_window: { ...view.resources.guide.hosting_window, ends_at: original } };
    const draft = { ...guideDraft(guide), reason: '高精度日時を保持' }, origins = structuredClone(draft.dateOrigins);
    view.editor.guide.edit(draft);
    view.resources.guide.hosting_window.ends_at = latest;
    const changes = await view.refresh('guide');
    assert.equal(changes.length, 1);
    assert.ok(changes[0].draft.endsWith(`終了日時：2026-10-16 19:00:00.${originalFraction}（日本時間）`));
    assert.ok(changes[0].latest.endsWith(`終了日時：2026-10-16 19:00:00.${latestFraction}（日本時間）`));
    assert.deepEqual(draft.dateOrigins, origins);
    const state = view.editor.guide.getSnapshot();
    assert.equal(updateGuideBody(state.draft!, state.resource!.version).hosting_window.ends_at, original);
  }
});

test('fractional zero normalization applies only to date fields, not timestamp text in descriptions', async () => {
  const view = await conflictView(), draft = view.editor.guide.getSnapshot().draft!;
  view.editor.guide.edit({ ...draft, description: '2026-10-16T10:00:00.000Z' });
  view.resources.guide.description = '2026-10-16T10:00:00Z';
  assert.deepEqual(await view.refresh('guide'), [{ label: '説明',
    latest: '2026-10-16 10:00:00Z', draft: '2026-10-16 10:00:00.000Z' }]);
});
