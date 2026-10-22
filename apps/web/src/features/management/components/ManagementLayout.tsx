import type { ReactNode } from 'react';
import type { NavigationItem } from '../model';
import { Badge } from './Status';
import { Icon } from './Icon';

const fespayIconUrl = new URL('../assets/fespay-icon.png', import.meta.url).href;

export function ManagementLayout({ navigation, activeId, onNavigate, selectors, children }: {
  navigation: NavigationItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  selectors: ReactNode;
  children: ReactNode;
}) {
  return <div className="mg-shell">
    <a className="mg-skip-link" href="#management-content">本文へ移動</a>
    <aside className="mg-sidebar">
      <div className="mg-brand"><img className="mg-brand-mark" src={fespayIconUrl} alt="" /><div><strong>FesPay</strong><span>管理コンソール</span></div></div>
      <p className="mg-nav-label">MANAGEMENT</p>
      <nav aria-label="管理ナビゲーション">
        {navigation.map(item => <button key={item.id} type="button" className="mg-nav-item" aria-current={activeId === item.id ? 'page' : undefined}
          disabled={!item.available} onClick={() => onNavigate(item.id)}>
          <Icon name={item.id === 'M01' ? 'home' : item.id === 'context' ? 'grid' : item.id === 'M10' ? 'chart' : 'shop'} />
          <span className="mg-nav-item-text"><span>{item.label}</span>{!item.available && <small>未実装</small>}</span>
        </button>)}
        {navigation.length === 0 && <p className="mg-muted">管理対象の確認後に表示します。</p>}
      </nav>
      <div className="mg-sidebar-note"><Badge tone="purple">DEMO</Badge><p>架空データによる確認用です。実際の業務操作は行えません。</p></div>
    </aside>
    <div className="mg-workspace">
      <header className="mg-context-header">{selectors}</header>
      <main id="management-content" className="mg-content" tabIndex={-1}>{children}</main>
      <footer className="mg-footer">FesPay · 管理画面の第一段階 / fixtureのみ · 実API認可・MFA・金銭処理は未統合</footer>
    </div>
  </div>;
}
