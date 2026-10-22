import type { ReactNode } from 'react';
import type { ContactDraft, WindowDraft } from '../settingsModel';

export function SettingsField({ prefix, field, label, value, onChange, errors, type = 'text', multiline = false, help }: {
  prefix: string; field: string; label: string; value: string; onChange: (value: string) => void; errors: Record<string, string>;
  type?: 'text' | 'email' | 'url' | 'password' | 'datetime-local'; multiline?: boolean; help?: string;
}) {
  if (type === 'datetime-local') help = `${help ? `${help} ` : ''}日本時間の入力値：${value ? value.replace('T', ' ') : '未指定'}。入力形式は年-月-日 時:分:秒です。`;
  const id = `${prefix}-${field.replaceAll('.', '-')}`, error = errors[field];
  const common = { id, value, 'aria-invalid': error ? true as const : undefined,
    'aria-describedby': [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  return <div className="mg-field"><label htmlFor={id}>{label}</label>
    {multiline ? <textarea {...common} rows={4} /> : <input {...common} type={type} step={type === 'datetime-local' ? 0.001 : undefined} autoComplete={type === 'password' ? 'new-password' : undefined} />}
    {help && <p id={`${id}-help`} className="mg-note">{help}</p>}
    {error && <p id={`${id}-error`} className="mg-field-error">入力エラー：{error}</p>}
  </div>;
}
export function SettingsSelect({ prefix, field, label, value, onChange, errors, children }: {
  prefix: string; field: string; label: string; value: string; onChange: (value: string) => void; errors: Record<string, string>; children: ReactNode;
}) {
  const id = `${prefix}-${field.replaceAll('.', '-')}`;
  return <div className="mg-field"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)} aria-invalid={errors[field] ? true : undefined} aria-describedby={errors[field] ? `${id}-error` : undefined}>{children}</select>
    {errors[field] && <p id={`${id}-error`} className="mg-field-error">入力エラー：{errors[field]}</p>}
  </div>;
}
export function SettingsToggle({ prefix, field, label, value, onChange, errors }: {
  prefix: string; field: string; label: string; value: boolean; onChange: (value: boolean) => void; errors: Record<string, string>;
}) {
  const id = `${prefix}-${field}`;
  return <div className="mg-field"><label className="mg-settings-toggle" htmlFor={id}><input id={id} type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} aria-invalid={errors[field] ? true : undefined} aria-describedby={errors[field] ? `${id}-error` : undefined} /><span>{label}</span></label>
    {errors[field] && <p id={`${id}-error`} className="mg-field-error">入力エラー：{errors[field]}</p>}
  </div>;
}
export function SettingsWindow({ prefix, field, label, value, onChange, errors }: {
  prefix: string; field: string; label: string; value: WindowDraft; onChange: (value: WindowDraft) => void; errors: Record<string, string>;
}) {
  return <fieldset className="mg-settings-group"><legend>{label}（日本時間）</legend><div className="mg-settings-grid">
    <SettingsField prefix={prefix} field={`${field}.starts_at`} label="開始日時" type="datetime-local" value={value.starts_at} onChange={starts_at => onChange({ ...value, starts_at })} errors={errors} />
    <SettingsField prefix={prefix} field={`${field}.ends_at`} label="終了日時（この時刻は含まない）" type="datetime-local" value={value.ends_at} onChange={ends_at => onChange({ ...value, ends_at })} errors={errors} />
  </div></fieldset>;
}
export function SettingsContact({ prefix, field, label, value, onChange, errors }: {
  prefix: string; field: string; label: string; value: ContactDraft; onChange: (value: ContactDraft) => void; errors: Record<string, string>;
}) {
  return <fieldset className="mg-settings-group"><legend>{label}</legend><p className="mg-note">所有確認済み公開メールまたはHTTPS URLを最低1つ指定してください。メールの所有確認はAPI側で検証します。</p><div className="mg-settings-grid">
    <SettingsField prefix={prefix} field={`${field}.verified_email`} label="所有確認済み公開メール" type="email" value={value.verified_email} onChange={verified_email => onChange({ ...value, verified_email })} errors={errors} />
    <SettingsField prefix={prefix} field={`${field}.https_url`} label="公開HTTPS URL" type="url" value={value.https_url} onChange={https_url => onChange({ ...value, https_url })} errors={errors} />
  </div></fieldset>;
}
