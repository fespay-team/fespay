import test from 'node:test';
import assert from 'node:assert/strict';
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsTabs, SettingsTabsView, type SettingsTab } from '../components/SettingsTabs';
import { eventIds } from '../fixtures';
import { SaveStatus } from '../pages/EventSettings';
import { createSettingsFixture } from '../settingsAdapter';
import { guideDraft, settingsDraft } from '../settingsModel';
import { createEventSettingsEditor, createSettingsWorkspace, type EventSettingsEditor } from '../settingsState';

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements(child.props.children as ReactNode)] : []);
}
function tabView(content: () => { guide: ReactNode; settings: ReactNode }) {
  let selectedTab: SettingsTab = 'guide';
  const selections: SettingsTab[] = [];
  const tree = () => SettingsTabsView({ ...content(), selectedTab, onSelect: tab => { selectedTab = tab; selections.push(tab); } });
  return { selections, selected: () => selectedTab, html: () => renderToStaticMarkup(tree()),
    select(tab: SettingsTab) {
      const button = elements(tree()).find(element => element.props.id === `m02-${tab}-tab`)!;
      (button.props.onClick as () => void)();
    },
    followLink() {
      const button = elements(tree()).find(element => element.props.className === 'mg-button mg-settings-tab-switch')!;
      let focused = '';
      (button.props.onClick as (event: unknown) => void)({ currentTarget: { ownerDocument: {
        getElementById: (id: string) => ({ focus: () => { focused = id; } }),
      } } });
      return focused;
    },
  };
}
function saveStates(editor: EventSettingsEditor) {
  const guide = editor.guide.getSnapshot(), settings = editor.settings.getSnapshot();
  return {
    guide: createElement(SaveStatus, { state: guide, controller: editor.guide, latestDraft: guide.latest && guideDraft(guide.latest) }),
    settings: createElement(SaveStatus, { state: settings, controller: editor.settings, latestDraft: settings.latest && settingsDraft(settings.latest) }),
  };
}

test('M02 starts on guide and does not render the inactive settings form', () => {
  const guide = createElement('form', { id: 'guide-form' }, '案内の本文');
  const settings = createElement((): ReactNode => { throw new Error('Inactive form rendered'); });
  const html = renderToStaticMarkup(createElement(SettingsTabs, { guide, settings }));
  assert.match(html, /id="guide-form"/);
  assert.match(html, /id="m02-guide-tab"[^>]*type="button"[^>]*role="tab"[^>]*aria-selected="true"[^>]*aria-controls="m02-guide-panel"/);
  assert.match(html, /id="m02-settings-tab"[^>]*aria-selected="false"[^>]*aria-controls="m02-settings-panel"/);
  assert.match(html, /role="tablist" aria-label="イベント設定の切替"/);
  assert.match(html, /id="m02-guide-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="m02-guide-tab"/);
  assert.match(html, /id="m02-settings-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="m02-settings-tab" hidden=""><\/div>/);
  assert.match(html, /現在の編集：案内設定/);
  assert.match(html, /業務設定へ →/);
});

test('native tab buttons show one form at a time and section links focus the destination tab', () => {
  const view = tabView(() => ({ guide: createElement('form', { id: 'guide-form' }), settings: createElement('form', { id: 'settings-form' }) }));
  view.select('settings');
  let html = view.html();
  assert.equal((html.match(/<form/g) ?? []).length, 1);
  assert.match(html, /id="settings-form"/);
  assert.doesNotMatch(html, /id="guide-form"/);
  assert.match(html, /id="m02-settings-tab"[^>]*aria-selected="true"/);
  assert.match(html, /id="m02-guide-panel"[^>]*hidden=""><\/div>/);
  assert.match(html, /現在の編集：業務設定/);
  assert.match(html, /← 案内設定へ/);
  assert.equal(view.followLink(), 'm02-guide-tab');
  html = view.html();
  assert.match(html, /id="guide-form"/);
  assert.doesNotMatch(html, /id="settings-form"/);
  assert.equal(view.followLink(), 'm02-settings-tab');
  assert.equal(view.selected(), 'settings');
  assert.deepEqual(view.selections, ['settings', 'guide', 'settings']);
});

test('tab switches preserve pending drafts and original idempotency keys; save confirmation never selects another tab', async () => {
  const fixture = createSettingsFixture('owner'); fixture.setScenario('pending');
  const writes: string[] = [], queries: string[] = [];
  let reads = 0;
  const editor = createEventSettingsEditor({ ...fixture.adapter,
    getEventGuide: async (...args) => { reads++; return fixture.adapter.getEventGuide(...args); },
    getEventSettings: async (...args) => { reads++; return fixture.adapter.getEventSettings(...args); },
    updateEventGuide: async (id, body, key, signal) => { writes.push(key); return fixture.adapter.updateEventGuide(id, body, key, signal); },
    updateEventSettings: async (id, body, key, signal) => { writes.push(key); return fixture.adapter.updateEventSettings(id, body, key, signal); },
    getMyTransactionResultByKey: async (id, op, key, signal) => { queries.push(key); return fixture.adapter.getMyTransactionResultByKey(id, op, key, signal); },
  }, eventIds[0], () => true);
  await Promise.all([editor.guide.load(), editor.settings.load()]);
  editor.guide.edit({ ...editor.guide.getSnapshot().draft!, name: '保持する案内', reason: '案内の更新' });
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, participation_terms: '保持する参加条件', reason: '業務設定の更新' });
  await Promise.all([editor.guide.save(), editor.settings.save()]);
  const guide = editor.guide.getSnapshot(), settings = editor.settings.getSnapshot(), readCount = reads;
  assert.equal(guide.status, 'pending'); assert.equal(settings.status, 'pending');
  const view = tabView(() => saveStates(editor));
  view.html(); view.select('settings'); assert.match(view.html(), /保存結果を確認/);
  view.select('guide'); view.html();
  assert.equal(editor.guide.getSnapshot(), guide); assert.equal(editor.settings.getSnapshot(), settings);
  assert.equal(editor.guide.getSnapshot().draft, guide.draft); assert.equal(editor.settings.getSnapshot().draft, settings.draft);
  assert.equal(reads, readCount); assert.equal(writes.length, 2); assert.equal(queries.length, 0);
  await Promise.all([editor.guide.confirm(), editor.settings.confirm()]);
  await Promise.all([editor.guide.confirm(), editor.settings.confirm()]);
  assert.equal(editor.guide.getSnapshot().status, 'saved'); assert.equal(editor.settings.getSnapshot().status, 'saved');
  assert.deepEqual(queries.toSorted(), [...writes, ...writes].toSorted());
  assert.equal(writes.length, 2);
  assert.match(view.html(), /保存済み/);
  assert.equal(view.selected(), 'guide'); assert.deepEqual(view.selections, ['settings', 'guide']);
  const saved = editor.guide.getSnapshot();
  view.select('settings'); view.html(); view.select('guide'); view.html();
  assert.equal(editor.guide.getSnapshot(), saved);
});

test('tab switches retain the workspace editor, field errors, conflict draft and latest resource', async () => {
  const workspace = createSettingsWorkspace('owner'), editor = workspace.editor(eventIds[0], () => true);
  await Promise.all([editor.guide.load(), editor.settings.load()]);
  editor.guide.edit({ ...editor.guide.getSnapshot().draft!, reason: '案内を更新' });
  editor.settings.edit({ ...editor.settings.getSnapshot().draft!, participation_terms: '競合しても保持', reason: '業務設定を更新' });
  workspace.fixture.setScenario('validation'); await editor.guide.save();
  workspace.fixture.setScenario('conflict'); await editor.settings.save(); await editor.settings.refreshConflict();
  const guide = editor.guide.getSnapshot(), settings = editor.settings.getSnapshot();
  assert.equal(guide.status, 'error'); assert.ok(guide.fields.name);
  assert.equal(settings.status, 'conflict'); assert.ok(settings.latest);
  const view = tabView(() => saveStates(editor));
  assert.match(view.html(), /入力エラー/);
  view.select('settings'); assert.match(view.html(), /最新の正本/);
  view.select('guide'); assert.match(view.html(), /入力エラー/);
  assert.equal(workspace.editor(eventIds[0], () => true), editor);
  assert.equal(editor.guide.getSnapshot(), guide); assert.equal(editor.settings.getSnapshot(), settings);
  assert.equal(editor.guide.getSnapshot().fields, guide.fields);
  assert.equal(editor.settings.getSnapshot().draft, settings.draft);
  assert.equal(editor.settings.getSnapshot().latest, settings.latest);
});
