import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { events, eventIds, profiles, grants, type ProfileId } from '../fixtures';
import type { EventGuide, EventSettings, UpdateEvent, UpdateEventSettings } from '../contracts';
import { ManagementReadError } from '../adapter';
import { managementNavigation } from '../model';
import { createSettingsFixture, settingsFailure, type EventSettingsAdapter, type SettingsScenario } from '../settingsAdapter';
import { createEventSettingsEditor, createSettingsWorkspace } from '../settingsState';
import { guideDraft, japanInput, settingsDraft, settingsErrorMessage, settingsWindows, SettingsValidationError, updateGuideBody, updateSettingsBody, utcFromJapan } from '../settingsModel';

const eventId = eventIds[0];
const signal = () => new AbortController().signal;
const schema = readFileSync(new URL('../../../../../../docs/design/api/openapi.yaml', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function required(name: string) {
  const block = schema.split(`    ${name}:\n`)[1]?.split(/\n    [A-Z][A-Za-z]+:/)[0];
  assert.ok(block, `schema ${name}`);
  return block.match(/      required:\r?\n([\s\S]*?)      properties:/)![1].match(/(?<=      - )\w+/g)!.sort();
}
// Reading the adopted schema makes these assertions independent of the DTO builder.
function exactFields(body: object, name: string) { assert.deepEqual(Object.keys(body).sort(), required(name)); }
async function setup(scenario: SettingsScenario = 'success', id = eventId) {
  const fixture = createSettingsFixture('owner'); fixture.setScenario(scenario);
  const editor = createEventSettingsEditor(fixture.adapter, id, () => true);
  await Promise.all([editor.guide.load(), editor.settings.load()]);
  return { fixture, editor };
}
function editReasons(editor: ReturnType<typeof createEventSettingsEditor>) {
  editor.guide.edit({ ...editor.guide.getSnapshot().draft!, name: '編集中の案内', reason: '案内を更新' });
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, participation_terms: '編集中の参加条件', reason: '条件を更新' });
}
function fieldError(action: () => unknown, field: string) {
  assert.throws(action, (error: unknown) => error instanceof SettingsValidationError && !!error.fields[field]);
}

test('UpdateEvent sends every adopted required field and no UI-only fields', async () => {
  const { editor } = await setup(); const g = editor.guide.getSnapshot().resource!;
  const body = updateGuideBody({ ...guideDraft(g), reason: '更新' }, g.version);
  exactFields(body, 'UpdateEvent');
  assert.equal(body.expected_version, g.version); assert.equal(body.hosting_window.starts_at, g.hosting_window.starts_at);
});
test('UpdateEventSettings sends every adopted required field and all eight feature keys', async () => {
  const { editor } = await setup(); const s = editor.settings.getSnapshot().resource!;
  const body = updateSettingsBody({ ...settingsDraft(s), reason: '更新' }, s);
  exactFields(body, 'UpdateEventSettings'); exactFields(body.features, 'FeaturePolicy');
  assert.deepEqual(body.participation_password_change, { action: 'KEEP' });
});
test('versions remain arbitrary precision strings and returned versions become authoritative', async () => {
  const fixture = createSettingsFixture('owner'), base = await fixture.adapter.getEventSettings(eventId, signal());
  const version = '9007199254740993123456789', next = '9007199254740993123456790';
  let requestVersion: unknown;
  const adapter: EventSettingsAdapter = { ...fixture.adapter,
    getEventSettings: async () => ({ ...base, version }),
    updateEventSettings: async (_id, body) => { requestVersion = body.expected_version; return { status: 200, data: { ...base, version: next } }; },
  };
  const editor = createEventSettingsEditor(adapter, eventId, () => true); await editor.settings.load();
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, reason: '更新' }); await editor.settings.save();
  assert.equal(requestVersion, version); assert.equal(editor.settings.getSnapshot().resource?.version, next);
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, reason: 'もう一度' }); await editor.settings.save(); assert.equal(requestVersion, next);
  assert.equal(updateGuideBody({ ...guideDraft(events[0]), reason: '更新' }, version).expected_version, version);
});
test('password KEEP / SET / CLEAR follow participation mode and never restore GET secrets', async () => {
  const { fixture } = await setup(); let s = await fixture.adapter.getEventSettings(eventId, signal());
  let d = { ...settingsDraft(s), reason: '設定', participation_mode: 'PASSWORD' as const, passwordAction: 'SET' as const, newPassword: '新しい秘密12345' };
  const result = await fixture.adapter.updateEventSettings(eventId, updateSettingsBody(d, s), crypto.randomUUID(), signal());
  assert.equal(result.status, 200); s = await fixture.adapter.getEventSettings(eventId, signal());
  assert.equal(s.participation_mode, 'PASSWORD'); assert.ok(!JSON.stringify(s).includes(d.newPassword));
  assert.ok(!('participation_password_change' in s)); assert.ok(!('password' in s));
  const draft = settingsDraft({ ...s, password: 'unexpected secret' } as EventSettings);
  assert.equal(draft.newPassword, ''); assert.equal(draft.passwordAction, 'KEEP');
  assert.deepEqual(updateSettingsBody({ ...draft, reason: '維持' }, s).participation_password_change, { action: 'KEEP' });
  const clear = updateSettingsBody({ ...draft, participation_mode: 'PUBLIC', passwordAction: 'CLEAR', newPassword: '送らない秘密', reason: '解除' }, s);
  assert.deepEqual(clear.participation_password_change, { action: 'CLEAR' });
  await fixture.adapter.updateEventSettings(eventId, clear, crypto.randomUUID(), signal());
  assert.equal((await fixture.adapter.getEventSettings(eventId, signal())).participation_mode, 'PUBLIC');
});
test('password transitions reject missing SET/CLEAR and validate 8..64 Unicode characters', async () => {
  const { editor } = await setup(); const s = editor.settings.getSnapshot().resource!, d = { ...settingsDraft(s), reason: '設定', participation_mode: 'PASSWORD' as const };
  fieldError(() => updateSettingsBody(d, s), 'passwordAction');
  for (const length of [7, 65]) fieldError(() => updateSettingsBody({ ...d, passwordAction: 'SET', newPassword: 'あ'.repeat(length) }, s), 'newPassword');
  for (const length of [8, 64]) assert.equal(updateSettingsBody({ ...d, passwordAction: 'SET', newPassword: '😀'.repeat(length) }, s).participation_password_change.action, 'SET');
  fieldError(() => updateSettingsBody({ ...d, participation_mode: 'PUBLIC', passwordAction: 'SET', newPassword: '12345678' }, s), 'passwordAction');
  fieldError(() => updateSettingsBody({ ...settingsDraft(s), participation_mode: 'PUBLIC', reason: '変更' }, { ...s, participation_mode: 'PASSWORD' }), 'passwordAction');
});
test('M02 display/edit is ownership based, and fixture rejects grants without ownership', async () => {
  for (const p of profiles) {
    const authority = { accountId: p.accountId, ownedEventIds: p.ownedEventIds, grants };
    const owner = p.ownedEventIds.includes(eventId);
    assert.equal(managementNavigation(authority, eventId, null).some(n => n.id === 'M02' && n.available), owner);
    if (!owner) await assert.rejects(createSettingsFixture(p.id as ProfileId).adapter.updateEventGuide(eventId, updateGuideBody({ ...guideDraft(events[0]), reason: '更新' }, '1'), crypto.randomUUID(), signal()), (e: unknown) => e instanceof ManagementReadError && e.status === 403);
  }
  const fixture = createSettingsFixture('owner'); let writes = 0;
  const editor = createEventSettingsEditor({ ...fixture.adapter, updateEventGuide: async (...args) => { writes++; return fixture.adapter.updateEventGuide(...args); } }, eventId, () => false);
  await editor.guide.load(); await editor.settings.load(); editReasons(editor); await editor.guide.save();
  assert.equal(writes, 0); assert.equal(editor.guide.getSnapshot().status, 'error');
});
for (const scenario of ['settings-error', 'guide-error'] as const) test(`separate saves preserve partial success: ${scenario}`, async () => {
  const { editor } = await setup(scenario); editReasons(editor);
  await Promise.all([editor.guide.save(), editor.settings.save()]);
  const g = editor.guide.getSnapshot(), s = editor.settings.getSnapshot();
  assert.equal(g.status, scenario === 'guide-error' ? 'error' : 'saved');
  assert.equal(s.status, scenario === 'settings-error' ? 'error' : 'saved');
  assert.equal(g.draft?.name, '編集中の案内'); assert.equal(s.draft?.participation_terms, '編集中の参加条件');
});
test('version conflict keeps drafts; latest read and explicit rebase do not erase edits', async () => {
  const { editor } = await setup('conflict'); editReasons(editor); await Promise.all([editor.guide.save(), editor.settings.save()]);
  assert.equal(editor.guide.getSnapshot().status, 'conflict'); assert.equal(editor.settings.getSnapshot().status, 'conflict');
  const g = editor.guide.getSnapshot().draft, s = editor.settings.getSnapshot().draft;
  await Promise.all([editor.guide.refreshConflict(), editor.settings.refreshConflict()]);
  assert.equal(editor.guide.getSnapshot().draft, g); assert.equal(editor.settings.getSnapshot().draft, s);
  assert.notEqual(editor.guide.getSnapshot().latest?.name, g?.name);
  editor.guide.acceptLatestVersion(); editor.settings.acceptLatestVersion();
  assert.equal(editor.guide.getSnapshot().draft, g); assert.equal(editor.settings.getSnapshot().draft, s);
  await Promise.all([editor.guide.save(), editor.settings.save()]);
  assert.equal(editor.guide.getSnapshot().status, 'saved'); assert.equal(editor.settings.getSnapshot().status, 'saved');
});
test('FEATURE_DEPENDENCY uses error.code for both 409 and 422 with repair instructions', async () => {
  for (const status of [409, 422]) assert.match(settingsErrorMessage(settingsFailure(status, 'FEATURE_DEPENDENCY', '対象店舗').body), /対象店舗.*見直/);
  const { editor } = await setup('feature-dependency'); editReasons(editor); await editor.settings.save();
  assert.equal(editor.settings.getSnapshot().status, 'error'); assert.match(editor.settings.getSnapshot().message, /あおぞら食堂/);
  assert.ok(editor.settings.getSnapshot().fields['features.products']);
});
for (const scenario of ['pending', 'unknown', 'unavailable', 'query-error'] as const) test(`${scenario}: neither success nor failure until original key+operation result is confirmed`, async () => {
  const fixture = createSettingsFixture('owner'); fixture.setScenario(scenario);
  const updates: { key: string; op: string }[] = [], queries: { key: string; op: string }[] = [];
  const adapter: EventSettingsAdapter = { ...fixture.adapter,
    updateEventGuide: async (id, body, key, sig) => { updates.push({ key, op: 'updateEventGuide' }); return fixture.adapter.updateEventGuide(id, body, key, sig); },
    getMyTransactionResultByKey: async (id, op, key, sig) => { queries.push({ key, op }); return fixture.adapter.getMyTransactionResultByKey(id, op, key, sig); },
  };
  const editor = createEventSettingsEditor(adapter, eventId, () => true); await editor.guide.load();
  editor.guide.edit({ ...editor.guide.getSnapshot().draft!, name: '確認中の編集', reason: '更新' }); const d = editor.guide.getSnapshot().draft;
  await editor.guide.save(); assert.equal(editor.guide.getSnapshot().status, 'pending');
  editor.guide.edit({ ...d!, name: '書き換え不可' }); await editor.guide.save(); assert.equal(updates.length, 1);
  assert.equal(editor.guide.getSnapshot().draft, d);
  await editor.guide.confirm(); assert.equal(editor.guide.getSnapshot().status, 'pending'); assert.equal(editor.guide.getSnapshot().draft, d);
  await editor.guide.confirm(); assert.equal(editor.guide.getSnapshot().status, 'saved'); assert.equal(editor.guide.getSnapshot().resource?.name, '確認中の編集');
  assert.ok(queries.every(q => q.key === updates[0].key && q.op === updates[0].op)); assert.equal(updates.length, 1);
});
test('settings result confirmation uses settings operation and resets SET secret after success', async () => {
  const { editor } = await setup('pending'); const d = editor.settings.getSnapshot().draft!;
  editor.settings.edit({ ...d, participation_mode: 'PASSWORD', passwordAction: 'SET', newPassword: 'new-password', reason: '更新' });
  await editor.settings.save(); await editor.settings.confirm(); await editor.settings.confirm();
  assert.equal(editor.settings.getSnapshot().status, 'saved'); assert.equal(editor.settings.getSnapshot().draft?.newPassword, '');
  assert.equal(editor.settings.getSnapshot().draft?.passwordAction, 'KEEP');
});
test('unknown transport failure remains pending and rejected result retains editing content', async () => {
  const fixture = createSettingsFixture('owner');
  const editor = createEventSettingsEditor({ ...fixture.adapter, updateEventGuide: async () => { throw new TypeError('network'); },
    getMyTransactionResultByKey: async () => ({ status: 'REJECTED', rejection: { code: 'VERSION_CONFLICT', message: '競合' }, checked_at: new Date().toISOString() }) }, eventId, () => true);
  await editor.guide.load(); editor.guide.edit({ ...editor.guide.getSnapshot().draft!, reason: '保持する理由' });
  await editor.guide.save(); assert.equal(editor.guide.getSnapshot().status, 'pending'); await editor.guide.confirm();
  assert.equal(editor.guide.getSnapshot().status, 'conflict'); assert.equal(editor.guide.getSnapshot().draft?.reason, '保持する理由');
});
test('first-charge server fixture refuses refund OFF, shorter periods and new/earlier expiry', async () => {
  const { fixture, editor } = await setup(); const s = editor.settings.getSnapshot().resource!;
  assert.ok(s.first_charge_at);
  const base = updateSettingsBody({ ...settingsDraft(s), reason: '条件を変更' }, s);
  for (const body of [{ ...base, cash_refund_enabled: false }, { ...base, expiration_at: '2026-10-20T00:00:00Z' },
    { ...base, charge_window: { ...base.charge_window, ends_at: '2026-10-16T08:00:00Z' } },
    { ...base, settlement_cash_refund_window: { ...base.settlement_cash_refund_window, starts_at: '2026-10-15T02:00:00Z' } }]) {
    await assert.rejects(fixture.adapter.updateEventSettings(eventId, body, crypto.randomUUID(), signal()), (e: unknown) => e instanceof ManagementReadError && e.body.code === 'PROTECTED_POLICY_CHANGE');
  }
  const result = await fixture.adapter.updateEventSettings(eventId, { ...base, cash_refund_window: { ...base.cash_refund_window, ends_at: '2026-10-17T09:00:00Z' } }, crypto.randomUUID(), signal());
  assert.equal(result.status, 200);
  const preCharge = await fixture.adapter.getEventSettings(eventIds[2], signal()); assert.equal(preCharge.first_charge_at, null);
  const b = updateSettingsBody({ ...settingsDraft(preCharge), cash_refund_enabled: false, reason: '初回前' }, preCharge);
  assert.equal((await fixture.adapter.updateEventSettings(eventIds[2], b, crypto.randomUUID(), signal())).status, 200);
});
test('Japan wall-clock converts to UTC independently of browser local zone, including day boundary', () => {
  for (const [utc, jst] of [['2026-10-14T15:00:00.000Z', '2026-10-15T00:00:00'], ['2026-12-31T16:01:02.000Z', '2027-01-01T01:01:02']]) {
    assert.equal(japanInput(utc), jst); assert.equal(utcFromJapan(jst), utc);
  }
  assert.equal(utcFromJapan('2026-10-15T00:00'), '2026-10-14T15:00:00.000Z');
  assert.equal(japanInput('2026-10-14T15:00:00.125Z'), '2026-10-15T00:00:00.125');
  assert.equal(utcFromJapan('2026-10-15T00:00:00.125'), '2026-10-14T15:00:00.125Z');
  assert.throws(() => utcFromJapan('2026-02-30T01:00:00')); assert.throws(() => utcFromJapan('2026-01-01T01:00Z'));
});
test('guide validates schema limits, Unicode boundary, public contacts, reason and window order', () => {
  const base = { ...guideDraft(events[0]), reason: '更新' };
  const limits = { name: 100, description: 2000, organizer_name: 100, venue: 200, reason: 1000 } as const;
  for (const [key, max] of Object.entries(limits)) {
    updateGuideBody({ ...base, [key]: '😀'.repeat(max) }, '1');
    fieldError(() => updateGuideBody({ ...base, [key]: 'あ'.repeat(max + 1) }, '1'), key);
  }
  fieldError(() => updateGuideBody({ ...base, reason: ' \n　' }, '1'), 'reason');
  fieldError(() => updateGuideBody({ ...base, contact: { verified_email: '', https_url: '' } }, '1'), 'contact.https_url');
  fieldError(() => updateGuideBody({ ...base, contact: { verified_email: 'invalid', https_url: '' } }, '1'), 'contact.verified_email');
  for (const https_url of ['http://example.invalid', 'HTTPS://example.invalid', 'https://example.invalid/' + 'a'.repeat(2048)]) fieldError(() => updateGuideBody({ ...base, contact: { verified_email: '', https_url } }, '1'), 'contact.https_url');
  updateGuideBody({ ...base, contact: { verified_email: 'public@example.invalid', https_url: '' } }, '1');
  fieldError(() => updateGuideBody({ ...base, hosting_window: { starts_at: base.hosting_window.starts_at, ends_at: base.hosting_window.starts_at } }, '1'), 'hosting_window.ends_at');
});
test('settings validates long texts, empty required fields and every independent date/contact group', async () => {
  const { editor } = await setup(), s = editor.settings.getSnapshot().resource!, d = { ...settingsDraft(s), reason: '更新' };
  for (const [key, max] of Object.entries({ participation_terms: 4000, expiration_terms: 4000, cash_refund_location: 200, settlement_cash_refund_location: 200, reason: 1000 })) {
    updateSettingsBody({ ...d, [key]: 'あ'.repeat(max) }, s); fieldError(() => updateSettingsBody({ ...d, [key]: 'あ'.repeat(max + 1) }, s), key);
  }
  fieldError(() => updateSettingsBody({ ...d, participation_terms: '' }, s), 'participation_terms');
  for (const key of ['charge_window', 'payment_window', 'transfer_window', 'cash_refund_window', 'settlement_cash_refund_window'] as const) fieldError(() => updateSettingsBody({ ...d, [key]: { starts_at: d[key].starts_at, ends_at: d[key].starts_at } }, s), `${key}.ends_at`);
  for (const key of ['cash_refund_contact', 'settlement_cash_refund_contact'] as const) fieldError(() => updateSettingsBody({ ...d, [key]: { verified_email: '', https_url: '' } }, s), `${key}.https_url`);
  fieldError(() => updateSettingsBody({ ...d, transfer_window: { ...d.transfer_window, ends_at: '2026-10-17T18:00:00' } }, s), 'transfer_window.ends_at');
  fieldError(() => updateSettingsBody({ ...d, expiration_at: '2026-10-16T17:59:59', expiration_terms: '払戻し終了後に失効' }, s), 'expiration_at');
  fieldError(() => updateSettingsBody({ ...d, expiration_at: '2026-10-20T00:00:00' }, s), 'expiration_terms');
});
test('401/403 and field validation preserve drafts; loading failure is not zero/empty success', async () => {
  for (const scenario of ['auth-required', 'forbidden', 'validation', 'protected-policy'] as const) {
    const { editor } = await setup(scenario); editReasons(editor); await editor.settings.save();
    assert.equal(editor.settings.getSnapshot().status, 'error'); assert.equal(editor.settings.getSnapshot().draft?.reason, '条件を更新'); assert.ok(editor.settings.getSnapshot().message);
  }
  const { fixture, editor } = await setup('load-error'); assert.ok(editor.guide.getSnapshot().loadError); assert.equal(editor.guide.getSnapshot().resource, undefined);
  fixture.setScenario('success'); await editor.guide.load(); assert.ok(editor.guide.getSnapshot().resource); assert.equal(editor.guide.getSnapshot().loadError, undefined);
});
test('per-event workspace retains pending edits without old event response overwriting another', async () => {
  const workspace = createSettingsWorkspace('owner'); workspace.fixture.setScenario('slow');
  const a = workspace.editor(eventId, () => true), b = workspace.editor(eventIds[1], () => true);
  await Promise.all([a.guide.load(), b.guide.load()]);
  a.guide.edit({ ...a.guide.getSnapshot().draft!, name: 'イベントAの編集', reason: '変更' });
  workspace.fixture.setScenario('pending'); const save = a.guide.save();
  assert.equal(b.guide.getSnapshot().resource?.event_id, eventIds[1]); await save;
  assert.equal(workspace.editor(eventId, () => true), a); assert.equal(a.guide.getSnapshot().status, 'pending');
  assert.equal(b.guide.getSnapshot().resource?.name, events[1].name); await a.guide.confirm(); await a.guide.confirm();
  assert.equal(a.guide.getSnapshot().resource?.name, 'イベントAの編集'); assert.equal(b.guide.getSnapshot().resource?.event_id, eventIds[1]);
});
test('result reference must match the target before confirming success', async () => {
  const fixture = createSettingsFixture('owner'); fixture.setScenario('pending');
  const editor = createEventSettingsEditor({ ...fixture.adapter, getMyTransactionResultByKey: async () => ({ status: 'SUCCEEDED', checked_at: new Date().toISOString(), resource: { resource_type: 'event', resource_id: eventIds[1], query_path: `/v1/events/${eventIds[1]}` } }) }, eventId, () => true);
  await editor.guide.load(); editor.guide.edit({ ...editor.guide.getSnapshot().draft!, reason: '更新' }); await editor.guide.save(); await editor.guide.confirm();
  assert.equal(editor.guide.getSnapshot().status, 'pending'); assert.equal(editor.guide.getSnapshot().draft?.reason, '更新');
});
test('a deferred fixture command cannot overwrite an intervening committed version', async () => {
  const { fixture, editor } = await setup('pending'); editReasons(editor); await editor.guide.save();
  fixture.setScenario('success');
  await fixture.adapter.updateEventGuide(eventId, updateGuideBody({ ...guideDraft(events[0]), name: '別の保存', reason: '先に成立' }, '1'), crypto.randomUUID(), signal());
  await editor.guide.confirm(); await editor.guide.confirm();
  assert.equal(editor.guide.getSnapshot().status, 'conflict'); assert.equal(editor.guide.getSnapshot().draft?.name, '編集中の案内');
  assert.equal((await fixture.adapter.getEventGuide(eventId, signal())).name, '別の保存');
});

const preciseWindow = { starts_at: '2026-10-16T01:00:00.123456Z', ends_at: '2026-10-16T09:00:00.654321Z' };
function preciseGuide(): EventGuide { return { ...structuredClone(events[0]), hosting_window: { ...preciseWindow } }; }
async function preciseSettings(): Promise<EventSettings> {
  const s = await createSettingsFixture('owner').adapter.getEventSettings(eventId, signal());
  for (const key of settingsWindows) s[key] = { ...preciseWindow };
  return { ...s, expiration_at: '2026-10-17T09:00:00.876543Z', expiration_terms: '払戻し受付終了後に失効' };
}
test('Guide reason-only save preserves both original six-digit UTC strings', () => {
  const g = preciseGuide(), d = { ...guideDraft(g), name: '名称だけ変更', reason: '日時は未編集' };
  const body = updateGuideBody(d, g.version);
  assert.deepEqual(body.hosting_window, g.hosting_window); exactFields(body, 'UpdateEvent');
});
test('Settings non-date save preserves every original window and expiration string', async () => {
  const s = await preciseSettings(), d = { ...settingsDraft(s), participation_terms: '参加条件だけ変更', reason: '日時は未編集' };
  const body = updateSettingsBody(d, s);
  for (const key of settingsWindows) assert.deepEqual(body[key], s[key], key);
  assert.equal(body.expiration_at, s.expiration_at); exactFields(body, 'UpdateEventSettings');
});
for (const field of ['starts_at', 'ends_at'] as const) test(`Guide ${field}-only edit converts that field and preserves its counterpart`, () => {
  const g = preciseGuide(), d = guideDraft(g), other = field === 'starts_at' ? 'ends_at' : 'starts_at';
  d.reason = '片側だけ編集'; d.hosting_window = { ...d.hosting_window, [field]: field === 'starts_at' ? '2026-10-16T09:30' : '2026-10-16T17:30' };
  const body = updateGuideBody(d, g.version);
  assert.equal(body.hosting_window[field], field === 'starts_at' ? '2026-10-16T00:30:00.000Z' : '2026-10-16T08:30:00.000Z');
  assert.equal(body.hosting_window[other], g.hosting_window[other]);
});
for (const key of settingsWindows) for (const field of ['starts_at', 'ends_at'] as const) test(`Settings ${key}.${field}-only edit leaves all other dates byte-for-byte intact`, async () => {
  const s = await preciseSettings(), d = settingsDraft(s), other = field === 'starts_at' ? 'ends_at' : 'starts_at';
  const input = field === 'starts_at' ? '2026-10-16T09:30' : key === 'transfer_window' ? '2026-10-16T17:30' : '2026-10-16T19:00';
  d.reason = '片側だけ編集'; d[key] = { ...d[key], [field]: input };
  const body = updateSettingsBody(d, s);
  assert.equal(body[key][field], field === 'starts_at' ? '2026-10-16T00:30:00.000Z' : key === 'transfer_window' ? '2026-10-16T08:30:00.000Z' : '2026-10-16T10:00:00.000Z');
  assert.equal(body[key][other], s[key][other]);
  for (const untouched of settingsWindows.filter(k => k !== key)) assert.deepEqual(body[untouched], s[untouched], untouched);
  assert.equal(body.expiration_at, s.expiration_at);
});
test('expiration edits convert Japan time while unchanged, null and cleared values retain their meaning', async () => {
  const s = await preciseSettings(), d = { ...settingsDraft(s), reason: '失効日時の確認' };
  assert.equal(updateSettingsBody(d, s).expiration_at, s.expiration_at);
  const edited = updateSettingsBody({ ...d, expiration_at: '2026-10-18T00:30' }, s);
  assert.equal(edited.expiration_at, '2026-10-17T15:30:00.000Z');
  for (const key of settingsWindows) assert.deepEqual(edited[key], s[key]);
  assert.equal(updateSettingsBody({ ...d, expiration_at: '' }, s).expiration_at, null);
  const noExpiry = { ...s, expiration_at: null };
  assert.equal(updateSettingsBody({ ...settingsDraft(noExpiry), reason: '未設定のまま' }, noExpiry).expiration_at, null);
});
test('actual editor saves retain original UTC strings and refresh date origins from successful responses', async () => {
  const fixture = createSettingsFixture('owner'); let g = preciseGuide(), s = await preciseSettings();
  const guideWrites: UpdateEvent[] = [], settingsWrites: UpdateEventSettings[] = [];
  const adapter: EventSettingsAdapter = { ...fixture.adapter,
    getEventGuide: async () => structuredClone(g), getEventSettings: async () => structuredClone(s),
    updateEventGuide: async (_id, body) => {
      guideWrites.push(body); const { expected_version: _, reason: __, ...values } = body;
      g = { ...g, ...values, hosting_window: { ...values.hosting_window, ends_at: '2026-10-16T09:00:00.999999Z' }, version: (BigInt(g.version) + 1n).toString() };
      return { status: 200, data: structuredClone(g) };
    },
    updateEventSettings: async (_id, body) => {
      settingsWrites.push(body); const { expected_version: _, reason: __, participation_password_change: ___, ...values } = body;
      s = { ...s, ...values, expiration_at: '2026-10-17T09:00:00.999999Z', version: (BigInt(s.version) + 1n).toString() };
      return { status: 200, data: structuredClone(s) };
    },
  };
  const editor = createEventSettingsEditor(adapter, eventId, () => true); await Promise.all([editor.guide.load(), editor.settings.load()]);
  editReasons(editor); await Promise.all([editor.guide.save(), editor.settings.save()]);
  assert.equal(editor.guide.getSnapshot().status, 'saved'); assert.equal(editor.settings.getSnapshot().status, 'saved');
  assert.deepEqual(guideWrites[0].hosting_window, preciseWindow);
  for (const key of settingsWindows) assert.deepEqual(settingsWrites[0][key], preciseWindow);
  assert.equal(settingsWrites[0].expiration_at, '2026-10-17T09:00:00.876543Z');
  editReasons(editor); await Promise.all([editor.guide.save(), editor.settings.save()]);
  assert.equal(guideWrites[1].hosting_window.ends_at, '2026-10-16T09:00:00.999999Z');
  assert.equal(settingsWrites[1].expiration_at, '2026-10-17T09:00:00.999999Z');
});
test('retained fractional precision does not break window order or cross-window validation', async () => {
  const g = preciseGuide(); g.hosting_window = { starts_at: '2026-10-16T09:00:00Z', ends_at: '2026-10-16T09:00:00.000001Z' };
  assert.deepEqual(updateGuideBody({ ...guideDraft(g), reason: '小数桁比較' }, g.version).hosting_window, g.hosting_window);
  g.hosting_window = { starts_at: '2026-10-16T09:00:00.123456Z', ends_at: '2026-10-16T09:00:00.123457Z' };
  updateGuideBody({ ...guideDraft(g), reason: '同一ミリ秒内の期間' }, g.version);
  const reversed = { ...g, hosting_window: { starts_at: g.hosting_window.ends_at, ends_at: g.hosting_window.starts_at } };
  fieldError(() => updateGuideBody({ ...guideDraft(reversed), reason: '逆順' }, g.version), 'hosting_window.ends_at');
  const s = await preciseSettings(); s.transfer_window.ends_at = '2026-10-16T09:00:00.654322Z';
  fieldError(() => updateSettingsBody({ ...settingsDraft(s), reason: '支払終了超過' }, s), 'transfer_window.ends_at');
  s.transfer_window.ends_at = s.payment_window.ends_at; s.expiration_at = '2026-10-16T09:00:00.654320Z';
  fieldError(() => updateSettingsBody({ ...settingsDraft(s), reason: '払戻し終了前の失効' }, s), 'expiration_at');
});
test('UTC and Los Angeles process timezones preserve the same Tokyo conversion and original wire strings', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles']) {
      process.env.TZ = zone;
      assert.equal(utcFromJapan('2026-10-16T00:30'), '2026-10-15T15:30:00.000Z');
      assert.equal(japanInput('2026-10-15T15:30:00Z'), '2026-10-16T00:30:00');
      const g = preciseGuide(), d = { ...guideDraft(g), reason: 'timezone非依存' };
      assert.deepEqual(updateGuideBody(d, g.version).hosting_window, g.hosting_window);
      d.hosting_window.starts_at = '2026-10-16T09:30';
      assert.equal(updateGuideBody(d, g.version).hosting_window.starts_at, '2026-10-16T00:30:00.000Z');
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
