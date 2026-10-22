import type { ApiError, EventGuide, EventSettings, PublicContact, TimeWindow, UpdateEvent, UpdateEventSettings } from './contracts';

// UI drafts use Japan wall-clock inputs. They are never sent as wire DTOs.
export interface ContactDraft { verified_email: string; https_url: string }
export interface WindowDraft { starts_at: string; ends_at: string }
type DateOrigins = Readonly<Record<string, { readonly utc: string | null; readonly input: string }>>;
export type GuideDraft = Omit<UpdateEvent, 'expected_version' | 'contact' | 'hosting_window'> & { contact: ContactDraft; hosting_window: WindowDraft; readonly dateOrigins: DateOrigins };
export const settingsWindows = ['charge_window', 'payment_window', 'transfer_window', 'cash_refund_window', 'settlement_cash_refund_window'] as const;
export const settingsContacts = ['cash_refund_contact', 'settlement_cash_refund_contact'] as const;
export type SettingsDraft = Omit<UpdateEventSettings, 'expected_version' | 'participation_password_change' | 'expiration_at' | typeof settingsWindows[number] | typeof settingsContacts[number]> &
  Record<typeof settingsWindows[number], WindowDraft> & Record<typeof settingsContacts[number], ContactDraft> & {
    expiration_at: string;
    passwordAction: 'KEEP' | 'SET' | 'CLEAR';
    newPassword: string;
    readonly dateOrigins: DateOrigins;
  };
export class SettingsValidationError extends Error {
  constructor(readonly fields: Record<string, string>) { super('入力内容を確認してください。'); }
}
export function japanInput(utc: string): string {
  return new Date(Date.parse(utc) + 9 * 60 * 60 * 1000).toISOString().replace(/\.000Z$/, '').replace(/Z$/, '');
}
export function utcFromJapan(value: string): string {
  const full = value.length === 16 ? `${value}:00` : value;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/.exec(full);
  if (!match) throw new Error('日時形式');
  const date = new Date(`${full}+09:00`);
  const normalized = match[1] + (match[2] && /[1-9]/.test(match[2]) ? `.${match[2].padEnd(3, '0')}` : '');
  if (!Number.isFinite(date.getTime()) || japanInput(date.toISOString()) !== normalized) throw new Error('存在しない日時');
  return date.toISOString();
}
const contactDraft = (c: PublicContact): ContactDraft => ({ verified_email: c.verified_email ?? '', https_url: c.https_url ?? '' });
const windowDraft = (w: TimeWindow): WindowDraft => ({ starts_at: japanInput(w.starts_at), ends_at: japanInput(w.ends_at) });
const dateOrigin = (utc: string | null) => ({ utc, input: utc === null ? '' : japanInput(utc) });
const windowOrigins = (key: string, w: TimeWindow): DateOrigins => ({ [`${key}.starts_at`]: dateOrigin(w.starts_at), [`${key}.ends_at`]: dateOrigin(w.ends_at) });
// Validation compares whole seconds and fractional digits separately, without rounding.
function compareUtc(left: string, right: string): number {
  const [l, lf = ''] = left.replace(/Z$/, '').split('.'), [r, rf = ''] = right.replace(/Z$/, '').split('.');
  const seconds = Date.parse(`${l}Z`) - Date.parse(`${r}Z`);
  if (seconds !== 0) return seconds;
  const length = Math.max(lf.length, rf.length), a = lf.padEnd(length, '0'), b = rf.padEnd(length, '0');
  return a === b ? 0 : a < b ? -1 : 1;
}
export function guideDraft(g: EventGuide): GuideDraft {
  return { name: g.name, description: g.description, organizer_name: g.organizer_name, venue: g.venue,
    contact: contactDraft(g.contact), hosting_window: windowDraft(g.hosting_window), listed: g.listed, guide_public: g.guide_public, reason: '',
    dateOrigins: windowOrigins('hosting_window', g.hosting_window) };
}
export function settingsDraft(s: EventSettings): SettingsDraft {
  return {
    participation_mode: s.participation_mode, participation_terms: s.participation_terms,
    passwordAction: 'KEEP', newPassword: '',
    charge_window: windowDraft(s.charge_window), payment_window: windowDraft(s.payment_window), transfer_window: windowDraft(s.transfer_window),
    transfer_enabled: s.transfer_enabled, cash_refund_enabled: s.cash_refund_enabled,
    cash_refund_window: windowDraft(s.cash_refund_window), cash_refund_location: s.cash_refund_location, cash_refund_contact: contactDraft(s.cash_refund_contact),
    settlement_cash_refund_window: windowDraft(s.settlement_cash_refund_window), settlement_cash_refund_location: s.settlement_cash_refund_location,
    settlement_cash_refund_contact: contactDraft(s.settlement_cash_refund_contact),
    expiration_at: s.expiration_at ? japanInput(s.expiration_at) : '', expiration_terms: s.expiration_terms,
    features: { ...s.features }, mobile_orders_enabled: s.mobile_orders_enabled, reason: '',
    dateOrigins: Object.assign({ expiration_at: dateOrigin(s.expiration_at) }, ...settingsWindows.map(key => windowOrigins(key, s[key]))),
  };
}
function validator(origins: DateOrigins) {
  const fields: Record<string, string> = {};
  const text = (key: string, value: string, min: number, max: number, nonblank = false) => {
    const length = [...value].length;
    if (length < min || length > max || (nonblank && !value.trim())) fields[key] = `${min}〜${max}文字で${nonblank ? '空白以外を含めて' : ''}入力してください。`;
    return value;
  };
  const contact = (key: string, c: ContactDraft): PublicContact => {
    if (!c.verified_email && !c.https_url) fields[`${key}.https_url`] = '所有確認済みメールまたはHTTPS URLを1つ以上入力してください。';
    if (c.verified_email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.verified_email) || [...c.verified_email].length > 254)) fields[`${key}.verified_email`] = '有効な所有確認済み公開メールを254文字以内で入力してください。';
    if (c.https_url) {
      try { const url = new URL(c.https_url); if (!c.https_url.startsWith('https://') || url.protocol !== 'https:' || [...c.https_url].length > 2048) throw new Error(); }
      catch { fields[`${key}.https_url`] = 'https://で始まる有効なURLを2048文字以内で入力してください。'; }
    }
    return { ...(c.verified_email ? { verified_email: c.verified_email } : {}), ...(c.https_url ? { https_url: c.https_url } : {}) } as PublicContact;
  };
  const date = (key: string, value: string) => {
    const original = origins[key];
    // Each field retains its own GET value. Never rebuild an unchanged wire value from Date.
    if (original && original.utc !== null && value === original.input) return original.utc;
    try { return utcFromJapan(value); } catch { fields[key] = '日本時間の実在する日時を入力してください。'; return ''; }
  };
  const window = (key: string, value: WindowDraft): TimeWindow => {
    const starts_at = date(`${key}.starts_at`, value.starts_at), ends_at = date(`${key}.ends_at`, value.ends_at);
    if (starts_at && ends_at && compareUtc(starts_at, ends_at) >= 0) fields[`${key}.ends_at`] = '終了日時を開始日時より後にしてください（終了時刻は含みません）。';
    return { starts_at, ends_at };
  };
  return { fields, text, contact, date, window, finish() { if (Object.keys(fields).length) throw new SettingsValidationError(fields); } };
}
export function updateGuideBody(d: GuideDraft, version: string): UpdateEvent {
  const v = validator(d.dateOrigins);
  const body: UpdateEvent = {
    expected_version: version, name: v.text('name', d.name, 1, 100), description: v.text('description', d.description, 0, 2000),
    organizer_name: v.text('organizer_name', d.organizer_name, 1, 100), venue: v.text('venue', d.venue, 1, 200),
    contact: v.contact('contact', d.contact), hosting_window: v.window('hosting_window', d.hosting_window),
    listed: d.listed, guide_public: d.guide_public, reason: v.text('reason', d.reason, 1, 1000, true),
  };
  v.finish(); return body;
}
export function updateSettingsBody(d: SettingsDraft, current: EventSettings): UpdateEventSettings {
  const v = validator(d.dateOrigins);
  if (d.passwordAction === 'SET') v.text('newPassword', d.newPassword, 8, 64);
  if (d.participation_mode === 'PASSWORD' && (d.passwordAction === 'CLEAR' || (current.participation_mode === 'PUBLIC' && d.passwordAction !== 'SET'))) {
    v.fields.passwordAction = 'パスワード方式への移行はSETで新しいパスワードを設定してください。既存の方式ではKEEPまたはSETを選んでください。';
  }
  if (d.participation_mode === 'PUBLIC' && (d.passwordAction === 'SET' || (current.participation_mode === 'PASSWORD' && d.passwordAction !== 'CLEAR'))) {
    v.fields.passwordAction = '公開方式への移行はCLEARを選んでください。公開方式にパスワードは設定できません。';
  }
  const body: UpdateEventSettings = {
    expected_version: current.version, participation_mode: d.participation_mode,
    participation_terms: v.text('participation_terms', d.participation_terms, 1, 4000),
    participation_password_change: d.passwordAction === 'SET' ? { action: 'SET', password: d.newPassword } : { action: d.passwordAction },
    charge_window: v.window('charge_window', d.charge_window), payment_window: v.window('payment_window', d.payment_window), transfer_window: v.window('transfer_window', d.transfer_window),
    transfer_enabled: d.transfer_enabled, cash_refund_enabled: d.cash_refund_enabled,
    cash_refund_window: v.window('cash_refund_window', d.cash_refund_window), cash_refund_location: v.text('cash_refund_location', d.cash_refund_location, 1, 200),
    cash_refund_contact: v.contact('cash_refund_contact', d.cash_refund_contact),
    settlement_cash_refund_window: v.window('settlement_cash_refund_window', d.settlement_cash_refund_window),
    settlement_cash_refund_location: v.text('settlement_cash_refund_location', d.settlement_cash_refund_location, 1, 200),
    settlement_cash_refund_contact: v.contact('settlement_cash_refund_contact', d.settlement_cash_refund_contact),
    expiration_at: d.expiration_at ? v.date('expiration_at', d.expiration_at) : null,
    expiration_terms: v.text('expiration_terms', d.expiration_terms, 0, 4000),
    features: { ...d.features }, mobile_orders_enabled: d.mobile_orders_enabled, reason: v.text('reason', d.reason, 1, 1000, true),
  };
  if (compareUtc(body.transfer_window.ends_at, body.payment_window.ends_at) > 0) v.fields['transfer_window.ends_at'] = '譲渡の終了日時は支払受付の終了日時以前にしてください。';
  if (body.expiration_at && compareUtc(body.expiration_at, body.cash_refund_window.ends_at) < 0) v.fields.expiration_at = '残高失効日時は通常払戻し受付の終了日時以降にしてください。';
  if (body.expiration_at && !body.expiration_terms.trim()) v.fields.expiration_terms = '残高失効を設定するときは、その条件を入力してください。';
  v.finish(); return body;
}
export function settingsErrorMessage(error: ApiError): string {
  switch (error.code) {
    case 'FEATURE_DEPENDENCY': return `機能の依存関係を確認してください。${error.message} 影響店舗の設定と主催者の禁止・必須指定を見直してください。`;
    case 'VERSION_CONFLICT': return '他の更新と競合しました。編集内容は保持しています。最新情報を確認し、差分を確認してから再保存してください。';
    case 'PROTECTED_POLICY_CHANGE': return `初回チャージ後の保護条件により保存できません。${error.message} 期間延長など利用者に不利益のない内容へ修正してください。`;
    case 'AUTH_REQUIRED': case 'AUTH_INVALID': return '再ログインして現在の主催者資格を確認してください。編集内容は保持しています。';
    case 'FORBIDDEN': case 'MFA_REQUIRED': case 'MFA_EXPIRED': return '主催者資格・追加認証を確認してください。権限についてはイベント主催者へお問い合わせください。編集内容は保持しています。';
    default: return error.message;
  }
}
export function serverFieldErrors(error: ApiError): Record<string, string> {
  return Object.fromEntries((error.field_errors ?? []).filter(e => e.location === 'BODY').map(e => [
    e.field.replace(/^\//, '').replaceAll('/', '.').replace('participation_password_change.password', 'newPassword').replace('participation_password_change.action', 'passwordAction'),
    error.code === 'FEATURE_DEPENDENCY' ? '影響店舗と機能の依存条件を確認して、この指定を修正してください。' : '入力形式・長さ・他の設定との組合せを確認して修正してください。',
  ]));
}
