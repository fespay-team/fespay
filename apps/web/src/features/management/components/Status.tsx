import type { ReactNode } from 'react';
import { ManagementReadError } from '../adapter';

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'purple' | 'warning' }) {
  return <span className={`mg-badge mg-badge--${tone}`}>{children}</span>;
}
export function LoadingState() {
  return <section className="mg-state" role="status" aria-live="polite" aria-busy="true">
    <span className="mg-spinner" aria-hidden="true" /><h2>管理情報を読み込んでいます</h2>
    <p>選択中のイベントの情報を確認しています。</p>
  </section>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mg-state" role="status"><span className="mg-state-mark" aria-hidden="true">○</span><h2>{title}</h2><p>{children}</p></section>;
}
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof ManagementReadError ? error.body.message : '表示に必要な情報を確認できませんでした。';
  return <section className="mg-state mg-state--error" role="alert">
    <h2>管理情報を取得できませんでした</h2><p>{message}</p>
    <p>前のイベントの情報は表示していません。</p>
    <button className="mg-button" onClick={onRetry}>再読み込み</button>
  </section>;
}
