import type { ApiError, EventGuide, EventSettings } from './contracts';
import { ManagementReadError } from './adapter';
import { createSettingsFixture, type EventSettingsAdapter, type SettingsOperation, type SettingsUpdateResponse } from './settingsAdapter';
import { guideDraft, settingsDraft, settingsErrorMessage, serverFieldErrors, SettingsValidationError, updateGuideBody, updateSettingsBody, type GuideDraft, type SettingsDraft } from './settingsModel';
import type { ProfileId } from './fixtures';

// These are M02 editing states, not new API/transaction states.
export interface SettingsSectionState<R, D> {
  loading: boolean;
  loadError?: string;
  resource?: R;
  draft?: D;
  status: 'idle' | 'saving' | 'saved' | 'pending' | 'conflict' | 'error';
  checking: boolean;
  message: string;
  fields: Record<string, string>;
  latest?: R;
}
function section<R extends { version: string; event_id: string }, D, B>(options: {
  eventId: string; operation: SettingsOperation; resourceType: 'event' | 'settings'; canEdit: () => boolean;
  read: () => Promise<R>; draft: (resource: R) => D; body: (draft: D, resource: R) => B;
  write: (body: B, key: string) => Promise<SettingsUpdateResponse<R>>; adapter: EventSettingsAdapter;
}) {
  let state: SettingsSectionState<R, D> = { loading: true, status: 'idle', checking: false, message: '', fields: {} };
  const listeners = new Set<() => void>();
  let loadPromise: Promise<void> | undefined;
  let attempt: { key: string; operation: SettingsOperation } | undefined;
  const publish = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const verify = (resource: R) => { if (resource.event_id !== options.eventId || !/^[1-9][0-9]*$/.test(resource.version)) throw new Error('対象イベントまたは版を確認できません。'); return resource; };
  const apiError = (error: unknown): ApiError => error instanceof ManagementReadError ? error.body : { code: 'RESULT_UNKNOWN', message: '通信結果を確認できません。元の要求の結果照会を続けてください。', request_id: 'management-settings-client', retryable: true };
  const succeeded = (resource: R) => {
    const current = verify(resource);
    attempt = undefined;
    publish({ resource: current, draft: options.draft(current), status: 'saved', checking: false, message: '保存済みです。返却された最新の版を使用しています。', fields: {}, latest: undefined });
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async load() {
      if (loadPromise) return loadPromise;
      if (state.resource) return;
      publish({ loading: true, loadError: undefined });
      loadPromise = (async () => {
        try { const resource = verify(await options.read()); publish({ resource, draft: options.draft(resource), loading: false }); }
        catch (error) { publish({ loading: false, loadError: error instanceof ManagementReadError ? settingsErrorMessage(error.body) : '設定を取得できませんでした。再読込してください。' }); }
        finally { loadPromise = undefined; }
      })();
      return loadPromise;
    },
    edit(draft: D) {
      if (state.loading || state.status === 'saving' || state.status === 'pending' || !options.canEdit()) return;
      publish({ draft, status: state.status === 'conflict' ? 'conflict' : 'idle', message: state.status === 'conflict' ? state.message : '未保存の変更があります。', fields: {} });
    },
    async save() {
      if (!state.resource || !state.draft || ['saving', 'pending', 'conflict'].includes(state.status)) return;
      if (!options.canEdit()) { publish({ status: 'error', message: settingsErrorMessage({ code: 'FORBIDDEN', message: '', request_id: 'management-settings-client', retryable: false }) }); return; }
      let body: B;
      try { body = options.body(state.draft, state.resource); }
      catch (error) { if (error instanceof SettingsValidationError) publish({ status: 'error', message: error.message, fields: error.fields }); else throw error; return; }
      attempt = { key: crypto.randomUUID(), operation: options.operation };
      publish({ status: 'saving', message: '保存中です。', fields: {}, latest: undefined });
      try {
        const response = await options.write(body, attempt.key);
        if (response.status === 200) succeeded(response.data);
        else publish({ status: 'pending', message: '確認中です。保存の成功・失敗はまだ確定していません。元の要求の結果を確認してください。' });
      } catch (error) {
        const e = apiError(error);
        if (!(error instanceof ManagementReadError) || error.status >= 500 || error.status === 202 || ['REQUEST_IN_PROGRESS', 'RESULT_UNKNOWN'].includes(e.code)) {
          publish({ status: 'pending', message: '確認中です。応答を確認できないため保存の成功・失敗は断定しません。元の要求の結果を確認してください。' });
        } else publish({ status: e.code === 'VERSION_CONFLICT' ? 'conflict' : 'error', message: settingsErrorMessage(e), fields: serverFieldErrors(e) });
      }
    },
    async confirm() {
      if (!attempt || state.status !== 'pending' || state.checking) return;
      const original = attempt;
      publish({ checking: true });
      try {
        const result = await options.adapter.getMyTransactionResultByKey(options.eventId, original.operation, original.key, new AbortController().signal);
        if (result.status === 'SUCCEEDED') {
          const expectedId = options.resourceType === 'event' ? options.eventId : (state.resource as EventSettings | undefined)?.settings_id;
          if (result.resource.resource_type !== options.resourceType || result.resource.resource_id !== expectedId) throw new Error('結果の対象を確認できません。');
          // A command reference proves the effect; fetch the current resource before showing saved.
          succeeded(await options.read());
        } else if (result.status === 'REJECTED') {
          publish({ status: result.rejection.code === 'VERSION_CONFLICT' ? 'conflict' : 'error', message: settingsErrorMessage({ ...result.rejection, request_id: 'management-settings-result', retryable: false }) });
        } else publish({ message: `確認中（${result.status}）です。新しい要求は送らず、元の要求の結果照会を続けてください。` });
      } catch (error) {
        publish({ message: `確認中です。${error instanceof ManagementReadError ? settingsErrorMessage(error.body) : '最新の正本を確認できません。'} 元の要求を保持しています。結果照会を続けてください。` });
      } finally { publish({ checking: false }); }
    },
    async refreshConflict() {
      if (state.status !== 'conflict' || state.checking) return;
      publish({ checking: true });
      try { publish({ latest: verify(await options.read()), message: '最新の正本を取得しました。編集内容は変更していません。差分を確認してください。' }); }
      catch (error) { publish({ message: error instanceof ManagementReadError ? settingsErrorMessage(error.body) : '最新情報を取得できません。編集内容を保持しています。' }); }
      finally { publish({ checking: false }); }
    },
    acceptLatestVersion() {
      if (state.status !== 'conflict' || !state.latest || state.checking) return;
      publish({ resource: state.latest, latest: undefined, status: 'idle', message: '最新の版で編集を続けます。保持した編集内容を再確認してから保存してください。' });
    },
  };
}
export function createEventSettingsEditor(adapter: EventSettingsAdapter, eventId: string, canEdit: () => boolean) {
  return {
    guide: section<EventGuide, GuideDraft, ReturnType<typeof updateGuideBody>>({ eventId, operation: 'updateEventGuide', resourceType: 'event', canEdit, adapter,
      read: () => adapter.getEventGuide(eventId, new AbortController().signal), draft: guideDraft, body: (d, r) => updateGuideBody(d, r.version),
      write: (body, key) => adapter.updateEventGuide(eventId, body, key, new AbortController().signal) }),
    settings: section<EventSettings, SettingsDraft, ReturnType<typeof updateSettingsBody>>({ eventId, operation: 'updateEventSettings', resourceType: 'settings', canEdit, adapter,
      read: () => adapter.getEventSettings(eventId, new AbortController().signal), draft: settingsDraft, body: updateSettingsBody,
      write: (body, key) => adapter.updateEventSettings(eventId, body, key, new AbortController().signal) }),
  };
}
export type EventSettingsEditor = ReturnType<typeof createEventSettingsEditor>;
/** One in-memory editing session per actor/event; navigation does not erase pending work. */
export function createSettingsWorkspace(profileId: ProfileId) {
  const fixture = createSettingsFixture(profileId);
  const editors = new Map<string, { editor: EventSettingsEditor; permission: { canEdit: () => boolean } }>();
  return { fixture, editor(eventId: string, canEdit: () => boolean) {
    let entry = editors.get(eventId);
    if (!entry) {
      const permission = { canEdit };
      entry = { editor: createEventSettingsEditor(fixture.adapter, eventId, () => permission.canEdit()), permission };
      editors.set(eventId, entry);
    }
    entry.permission.canEdit = canEdit;
    return entry.editor;
  } };
}
export type SettingsWorkspace = ReturnType<typeof createSettingsWorkspace>;
