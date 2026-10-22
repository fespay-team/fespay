import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { EventGuide } from '../contracts';
import { formatCheckedAt, ownsEvent, type DisplayAuthority } from '../model';
import { guideDraft, settingsDraft, type GuideDraft, type SettingsDraft } from '../settingsModel';
import type { EventSettingsEditor, SettingsSectionState, SettingsWorkspace } from '../settingsState';
import { SettingsContact, SettingsField, SettingsSelect, SettingsToggle, SettingsWindow } from '../components/SettingsFields';
import { Badge } from '../components/Status';

const fieldLabels: Record<string, string> = {
  name: 'イベント名', description: '説明', organizer_name: '主催者名', venue: '会場', contact: '案内の連絡先', hosting_window: '開催期間', listed: '一般一覧への掲載', guide_public: '案内の公開',
  participation_mode: '参加方式', participation_terms: '参加条件', charge_window: 'チャージ受付期間', payment_window: '支払受付期間', transfer_window: '譲渡受付期間',
  transfer_enabled: '譲渡の有効化', cash_refund_enabled: '通常払戻しの有効化', cash_refund_window: '通常払戻し受付期間', cash_refund_location: '通常払戻し受付場所', cash_refund_contact: '通常払戻し連絡先',
  settlement_cash_refund_window: '精算用払戻し受付期間', settlement_cash_refund_location: '精算用払戻し受付場所', settlement_cash_refund_contact: '精算用払戻し連絡先',
  expiration_at: '残高失効日時', expiration_terms: '残高失効条件', features: '機能ポリシー', mobile_orders_enabled: 'モバイル注文の主催者許可',
};
const featureLabels = { amount_input: '金額入力', payment_a: 'A方式', payment_b: 'B方式', fixed_qr: '固定QR', products: '商品', inventory: '在庫', orders: '注文', mobile_orders: 'モバイル注文' } as const;
const displayValue = (value: unknown): string => typeof value === 'boolean' ? value ? '有効' : '無効' : typeof value === 'object' && value !== null
  ? Object.values(value).map(displayValue).join(' / ') : ({ PROHIBITED: '禁止', OPTIONAL: '任意', REQUIRED: '必須', PUBLIC: '公開', PASSWORD: 'パスワード' } as Record<string, string>)[String(value)] ?? String(value || '未指定').replace('T', ' ');

function SaveStatus<R extends { version: string }, D extends object>({ state, controller, latestDraft }: {
  state: SettingsSectionState<R, D>; controller: { confirm: () => Promise<void>; refreshConflict: () => Promise<void>; acceptLatestVersion: () => void }; latestDraft?: D;
}) {
  const statusLabel = ({ idle: '未保存', saving: '保存中', saved: '保存済み', pending: '確認中', conflict: '競合', error: 'エラー' })[state.status];
  const changes = latestDraft && state.draft ? Object.keys(fieldLabels).filter(key => key in latestDraft && JSON.stringify(latestDraft[key as keyof D]) !== JSON.stringify(state.draft![key as keyof D])) : [];
  return <div className="mg-settings-save-state">
    <div role={state.status === 'error' || state.status === 'conflict' ? 'alert' : 'status'} aria-live="polite"><Badge tone={['error', 'conflict', 'pending'].includes(state.status) ? 'warning' : 'blue'}>{statusLabel}</Badge><p>{state.message || 'この設定は個別に保存します。'}</p></div>
    {Object.keys(state.fields).length > 0 && <p className="mg-field-error">入力エラーのある項目を修正してください。</p>}
    {state.status === 'pending' && <button type="button" className="mg-button" disabled={state.checking} onClick={() => void controller.confirm()}>{state.checking ? '保存結果を照会中' : '保存結果を確認'}</button>}
    {state.status === 'conflict' && <>
      <button type="button" className="mg-button" disabled={state.checking} onClick={() => void controller.refreshConflict()}>{state.checking ? '最新情報を確認中' : '最新情報を確認'}</button>
      {state.latest && <div className="mg-settings-conflict"><p>最新の版：{state.latest.version} ／ 編集の基準版：{state.resource?.version}</p>
        {changes.length ? <dl>{changes.map(key => <div key={key}><dt>{fieldLabels[key]}</dt><dd>最新の正本：{displayValue(latestDraft![key as keyof D])}</dd><dd>編集中：{displayValue(state.draft![key as keyof D])}</dd></div>)}</dl> : <p>編集項目の差はありません。版の変更を確認してください。</p>}
        <p className="mg-note">
           最新版との差分を確認してください。続行すると編集中の内容を保持したまま最新の版を基準に再保存します。差分のある項目は、編集中の値で最新版を上書きします。
        </p>
        <button type="button" className="mg-button" onClick={() => controller.acceptLatestVersion()}>編集中の内容で最新版を上書きして続ける</button>
      </div>}
    </>}
  </div>;
}
function EditorForm<R extends { version: string; checked_at: string }, D extends object>({ title, prefix, state, controller, children, latestDraft }: {
  title: string; prefix: string; state: SettingsSectionState<R, D>;
  controller: { load: () => Promise<void>; save: () => Promise<void>; confirm: () => Promise<void>; refreshConflict: () => Promise<void>; acceptLatestVersion: () => void };
  children: ReactNode; latestDraft?: D;
}) {
  return <section className="mg-panel" aria-labelledby={`${prefix}-title`}><h2 id={`${prefix}-title`}>{title}</h2>
    {state.loading ? <p role="status" aria-busy="true">{title}を読み込み中です。</p> : state.loadError ? <div role="alert"><p>{state.loadError}</p><button className="mg-button" type="button" onClick={() => void controller.load()}>再読込</button></div> : <>
      <dl className="mg-settings-meta"><div><dt>編集の基準版</dt><dd>{state.resource?.version}</dd></div><div><dt>正本確認（日本時間）</dt><dd>{state.resource && formatCheckedAt(state.resource.checked_at)}</dd></div></dl>
      <form noValidate onSubmit={e => { e.preventDefault(); void controller.save(); }}>
        <fieldset className="mg-settings-fields" disabled={state.status === 'saving' || state.status === 'pending'}>{children}</fieldset>
        <button className="mg-button" type="submit" disabled={['saving', 'pending', 'conflict'].includes(state.status)}>{title}を保存</button>
        <SaveStatus state={state} controller={controller} latestDraft={latestDraft} />
      </form>
    </>}
  </section>;
}

export function EventSettingsPage({ event, authority, workspace, onGuideSaved }: {
  event: EventGuide; authority: DisplayAuthority; workspace: SettingsWorkspace; onGuideSaved: (guide: EventGuide) => void;
}) {
  const canEdit = ownsEvent(authority, event.event_id);
  const editor: EventSettingsEditor = workspace.editor(event.event_id, () => ownsEvent(authority, event.event_id));
  const g = useSyncExternalStore(editor.guide.subscribe, editor.guide.getSnapshot);
  const s = useSyncExternalStore(editor.settings.subscribe, editor.settings.getSnapshot);
  useEffect(() => { if (canEdit) { void editor.guide.load(); void editor.settings.load(); } }, [editor, canEdit]);
  useEffect(() => { if (g.status === 'saved' && g.resource) onGuideSaved(g.resource); }, [g.status, g.resource, onGuideSaved]);
  if (!canEdit) return <section className="mg-panel"><h1>イベント設定</h1><p>現在の主催者だけが編集できます。最終認可はAPI側で行います。</p></section>;
  const guide = g.draft, settings = s.draft;
  const editGuide = <K extends keyof GuideDraft>(key: K, value: GuideDraft[K]) => { if (guide) editor.guide.edit({ ...guide, [key]: value }); };
  const editSettings = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => { if (settings) editor.settings.edit({ ...settings, [key]: value }); };
  return <div className="mg-settings">
    <div className="mg-page-heading"><div><p className="mg-eyebrow">EVENT SETTINGS / M02</p><h1>イベント設定</h1><p className="mg-event-name">{g.resource?.name ?? event.name}</p></div><Badge tone="purple">DEMO / fixture</Badge></div>
    <div className="mg-scope-note"><p>案内設定と業務設定は別々に保存します。片方の保存は、もう片方の保存成功を意味しません。画面内の切替では編集中の内容と確認中の要求を保持します。再読込するとfixtureは初期化されます。</p></div>
    <p className="mg-note">表示・入力日時は日本時間です。公開メールの所有確認、現在の所有権、追加認証、変更の保護条件はAPI側で最終確認します。実API・MFAは未統合です。</p>
    <EditorForm title="案内設定" prefix="guide" state={g} controller={editor.guide} latestDraft={g.latest ? guideDraft(g.latest) : undefined}>
      {guide && <>
        <div className="mg-settings-grid">
          {(['name', 'organizer_name', 'venue'] as const).map(key => <SettingsField key={key} prefix="guide" field={key} label={fieldLabels[key]} value={guide[key]} onChange={value => editGuide(key, value)} errors={g.fields} help={`最大${key === 'venue' ? 200 : 100}文字`} />)}
        </div>
        <SettingsField prefix="guide" field="description" label="イベントの説明" value={guide.description} onChange={value => editGuide('description', value)} errors={g.fields} multiline help="最大2000文字。プレーンテキストで入力してください。" />
        <SettingsContact prefix="guide" field="contact" label="案内の公開連絡先" value={guide.contact} onChange={value => editGuide('contact', value)} errors={g.fields} />
        <SettingsWindow prefix="guide" field="hosting_window" label="開催期間" value={guide.hosting_window} onChange={value => editGuide('hosting_window', value)} errors={g.fields} />
        <SettingsToggle prefix="guide" field="listed" label="一般一覧に掲載する（非掲載でもURLからの案内アクセス制御にはなりません）" value={guide.listed} onChange={value => editGuide('listed', value)} errors={g.fields} />
        <SettingsToggle prefix="guide" field="guide_public" label="イベント案内を公開する" value={guide.guide_public} onChange={value => editGuide('guide_public', value)} errors={g.fields} />
        <SettingsField prefix="guide" field="reason" label="案内設定の変更理由" value={guide.reason} onChange={value => editGuide('reason', value)} errors={g.fields} multiline help="空白以外を含む1〜1000文字。" />
      </>}
    </EditorForm>
    <EditorForm title="業務設定" prefix="settings" state={s} controller={editor.settings} latestDraft={s.latest ? settingsDraft(s.latest) : undefined}>
      {settings && <>
        <dl className="mg-settings-meta"><div><dt>参加条件の版</dt><dd>{s.resource?.terms_version}</dd></div><div><dt>初回チャージ（日本時間）</dt><dd>{s.resource?.first_charge_at ? formatCheckedAt(s.resource.first_charge_at) : 'まだありません'}</dd></div></dl>
        {s.resource?.first_charge_at && <p className="mg-settings-protection">初回チャージ後です。払戻しOFF、受付期間短縮、失効の新設・前倒しなどはサーバーが拒否します。有利な変更にも理由と版が必要です。</p>}
        <SettingsSelect prefix="settings" field="participation_mode" label="参加方式" value={settings.participation_mode} onChange={value => editSettings('participation_mode', value as SettingsDraft['participation_mode'])} errors={s.fields}><option value="PUBLIC">公開</option><option value="PASSWORD">参加パスワードあり</option></SettingsSelect>
        <SettingsField prefix="settings" field="participation_terms" label="参加条件" value={settings.participation_terms} onChange={value => editSettings('participation_terms', value)} errors={s.fields} multiline help="1〜4000文字。参加条件の新しい版はサーバーが採番します。" />
        <fieldset className="mg-settings-group"><legend>参加パスワードの変更</legend><p className="mg-note">既存の秘密は取得・再表示しません。変更は新規参加に適用し、既参加者の残高は維持します。</p>
          <SettingsSelect prefix="settings" field="passwordAction" label="変更方法" value={settings.passwordAction} onChange={value => { editor.settings.edit({ ...settings, passwordAction: value as SettingsDraft['passwordAction'], newPassword: '' }); }} errors={s.fields}><option value="KEEP">KEEP：変更しない</option><option value="SET">SET：新しく設定する</option><option value="CLEAR">CLEAR：解除する</option></SettingsSelect>
          {settings.passwordAction === 'SET' && <SettingsField prefix="settings" field="newPassword" label="新しい参加パスワード" type="password" value={settings.newPassword} onChange={value => editSettings('newPassword', value)} errors={s.fields} help="8〜64文字。保存後に再表示しません。" />}
        </fieldset>
        {(['charge_window', 'payment_window', 'transfer_window'] as const).map(key => <SettingsWindow key={key} prefix="settings" field={key} label={fieldLabels[key]} value={settings[key]} onChange={value => editSettings(key, value)} errors={s.fields} />)}
        <SettingsToggle prefix="settings" field="transfer_enabled" label="譲渡を有効にする" value={settings.transfer_enabled} onChange={value => editSettings('transfer_enabled', value)} errors={s.fields} />
        <SettingsToggle prefix="settings" field="cash_refund_enabled" label="通常の現金払戻しを有効にする" value={settings.cash_refund_enabled} onChange={value => editSettings('cash_refund_enabled', value)} errors={s.fields} />
        <SettingsWindow prefix="settings" field="cash_refund_window" label="通常払戻し受付期間" value={settings.cash_refund_window} onChange={value => editSettings('cash_refund_window', value)} errors={s.fields} />
        <SettingsField prefix="settings" field="cash_refund_location" label="通常払戻し受付場所" value={settings.cash_refund_location} onChange={value => editSettings('cash_refund_location', value)} errors={s.fields} help="1〜200文字。" />
        <SettingsContact prefix="settings" field="cash_refund_contact" label="通常払戻し連絡先" value={settings.cash_refund_contact} onChange={value => editSettings('cash_refund_contact', value)} errors={s.fields} />
        <p className="mg-note">精算用の払戻し受付は、通常払戻しON/OFFと独立しています。既存請求に不利益な期間短縮はできません。</p>
        <SettingsWindow prefix="settings" field="settlement_cash_refund_window" label="精算用払戻し受付期間" value={settings.settlement_cash_refund_window} onChange={value => editSettings('settlement_cash_refund_window', value)} errors={s.fields} />
        <SettingsField prefix="settings" field="settlement_cash_refund_location" label="精算用払戻し受付場所" value={settings.settlement_cash_refund_location} onChange={value => editSettings('settlement_cash_refund_location', value)} errors={s.fields} help="1〜200文字。" />
        <SettingsContact prefix="settings" field="settlement_cash_refund_contact" label="精算用払戻し連絡先" value={settings.settlement_cash_refund_contact} onChange={value => editSettings('settlement_cash_refund_contact', value)} errors={s.fields} />
        <SettingsField prefix="settings" field="expiration_at" label="残高失効日時（日本時間・空欄なら失効なし）" type="datetime-local" value={settings.expiration_at} onChange={value => editSettings('expiration_at', value)} errors={s.fields} />
        <SettingsField prefix="settings" field="expiration_terms" label="残高失効条件" value={settings.expiration_terms} onChange={value => editSettings('expiration_terms', value)} errors={s.fields} multiline help="最大4000文字。" />
        <fieldset className="mg-settings-group"><legend>機能ポリシー</legend><p className="mg-note">任意の機能だけ店舗がON/OFFを選べます。禁止・必須と店舗設定の矛盾はAPI側で判定します。</p><div className="mg-settings-grid">
          {Object.entries(featureLabels).map(([key, label]) => <SettingsSelect key={key} prefix="settings" field={`features.${key}`} label={label} value={settings.features[key as keyof typeof featureLabels]} onChange={value => editSettings('features', { ...settings.features, [key]: value })} errors={s.fields}><option value="PROHIBITED">禁止</option><option value="OPTIONAL">任意</option><option value="REQUIRED">必須</option></SettingsSelect>)}
        </div></fieldset>
        <SettingsToggle prefix="settings" field="mobile_orders_enabled" label="主催者としてモバイル注文を許可する（店舗の許可と商品・注文機能も必要）" value={settings.mobile_orders_enabled} onChange={value => editSettings('mobile_orders_enabled', value)} errors={s.fields} />
        <SettingsField prefix="settings" field="reason" label="業務設定の変更理由" value={settings.reason} onChange={value => editSettings('reason', value)} errors={s.fields} multiline help="空白以外を含む1〜1000文字。" />
      </>}
    </EditorForm>
  </div>;
}
