import { useCallback, useMemo, useState } from 'react';
import { createFixtureAdapter, type ManagementAdapter } from './adapter';
import type { EventGuide } from './contracts';
import { profiles, scenarios, type ProfileId, type ScenarioId } from './fixtures';
import { changeEvent, currentGrants, managementNavigation, ownsEvent, validShopId, type ManagementSelection } from './model';
import { loadBootstrap, loadEventContext, useManagementRead, type EventContext } from './useManagement';
import { ManagementLayout } from './components/ManagementLayout';
import { ContextSelectors } from './components/ContextSelectors';
import { Badge, EmptyState, ErrorState, LoadingState } from './components/Status';
import { ShopStatusList } from './components/ShopStatusList';
import { OrganizerHome } from './pages/OrganizerHome';
import { EventSettingsPage } from './pages/EventSettings';
import { settingsScenarios, type SettingsScenario } from './settingsAdapter';
import { createSettingsWorkspace, type SettingsWorkspace } from './settingsState';
import './management.css';

export function ManagementDemo() {
  const [profile, setProfile] = useState<ProfileId>('owner');
  const [scenario, setScenario] = useState<ScenarioId>('normal');
  const [settingsScenario, setSettingsScenario] = useState<SettingsScenario>('success');
  const settingsWorkspace = useMemo(() => {
    const workspace = createSettingsWorkspace(profile);
    workspace.fixture.setScenario(settingsScenario);
    return workspace;
  }, [profile]);
  const adapter = useMemo(() => createFixtureAdapter(profile, scenario), [profile, scenario]);
  const account = profiles.find(p => p.id === profile)!;
  return <div className="management-demo">
    <div className="mg-demo-banner"><strong>DEMO / fixture</strong><span>管理画面の実装確認用 · 架空データのみ · API通信なし</span></div>
    <details className="mg-demo-controls" open><summary>確認用データの切り替え</summary><div className="mg-demo-fields">
      <div className="mg-field"><label htmlFor="management-profile">表示資格のfixture</label><select id="management-profile" value={profile} onChange={e => setProfile(e.target.value as ProfileId)}>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select></div>
      <div className="mg-field"><label htmlFor="management-scenario">データ・取得状態のfixture</label><select id="management-scenario" value={scenario} onChange={e => setScenario(e.target.value as ScenarioId)}>
        {scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select></div>
      <div className="mg-field"><label htmlFor="management-settings-scenario">M02 保存・取得のfixture</label><select id="management-settings-scenario" value={settingsScenario} onChange={e => {
        const value = e.target.value as SettingsScenario;
        settingsWorkspace.fixture.setScenario(value); setSettingsScenario(value);
      }}>{settingsScenarios.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
      <p className="mg-muted">実ログイン・権限変更は行いません。未実装の管理画面はナビに明記しています。</p>
    </div></details>
    <ManagementWorkspace key={`${profile}:${scenario}`} adapter={adapter} accountId={account.accountId} settingsWorkspace={settingsWorkspace} />
  </div>;
}
function ManagementWorkspace({ adapter, accountId, settingsWorkspace }: { adapter: ManagementAdapter; accountId: string; settingsWorkspace: SettingsWorkspace }) {
  const [retry, setRetry] = useState(0);
  const [guideOverrides, setGuideOverrides] = useState<Record<string, EventGuide>>({});
  const onGuideSaved = useCallback((guide: EventGuide) => setGuideOverrides(previous => previous[guide.event_id]?.version === guide.version ? previous : { ...previous, [guide.event_id]: guide }), []);
  const [selection, setSelection] = useState<ManagementSelection>({ eventId: null, shopId: null });
  const load = useCallback((signal: AbortSignal) => loadBootstrap(adapter, signal), [adapter]);
  const bootstrap = useManagementRead(`events:${retry}`, load);
  const events = useMemo(() => bootstrap.status === 'ready' ? bootstrap.data.events.map(event => guideOverrides[event.event_id] ?? event) : [], [bootstrap, guideOverrides]);
  const event = events.find(e => e.event_id === selection.eventId) ?? events[0];
  const selectEvent = (id: string) => { if (events.some(e => e.event_id === id)) setSelection(changeEvent(id)); };
  if (bootstrap.status !== 'ready' || !event) return <ManagementLayout navigation={[]} activeId="context" onNavigate={() => {}}
    selectors={<ContextSelectors events={events} eventId={null} shops={[]} shopId={null} loading={bootstrap.status === 'loading'} onEventChange={selectEvent} onShopChange={() => {}} />}>
    {bootstrap.status === 'loading' ? <LoadingState /> : bootstrap.status === 'error' ? <ErrorState error={bootstrap.error} onRetry={() => setRetry(n => n + 1)} /> :
      <EmptyState title="管理できるイベントがありません">現在の所有・active grantに対応するイベントがありません。主催者ホームや業務集計は表示しません。</EmptyState>}
  </ManagementLayout>;
  return <SelectedEventWorkspace adapter={adapter} accountId={accountId} events={events} event={event} ownedEvents={bootstrap.data.ownedEvents} settingsWorkspace={settingsWorkspace} onGuideSaved={onGuideSaved}
    shopId={selection.shopId} onEventChange={selectEvent} onShopChange={shopId => setSelection({ eventId: event.event_id, shopId })} />;
}
function SelectedEventWorkspace({ adapter, accountId, events, event, ownedEvents, shopId, onEventChange, onShopChange, settingsWorkspace, onGuideSaved }: {
  adapter: ManagementAdapter; accountId: string; events: EventGuide[]; event: EventGuide; ownedEvents: EventGuide[];
  shopId: string | null; onEventChange: (id: string) => void; onShopChange: (id: string | null) => void;
  settingsWorkspace: SettingsWorkspace; onGuideSaved: (guide: EventGuide) => void;
}) {
  const [retry, setRetry] = useState(0);
  const [page, setPage] = useState('M01');
  const load = useCallback((signal: AbortSignal) => loadEventContext(adapter, accountId, ownedEvents, event.event_id, signal), [adapter, accountId, ownedEvents, event.event_id]);
  const result = useManagementRead(`event:${event.event_id}:${retry}`, load);
  const context = result.status === 'ready' ? result.data : null;
  const shops = context?.shops ?? [];
  const selectedShopId = validShopId(event.event_id, shopId, shops);
  const owner = context ? ownsEvent(context.authority, event.event_id) : false;
  const activeId = owner && (page === 'M01' || page === 'M02') ? page : 'context';
  const navigation = context ? managementNavigation(context.authority, event.event_id, selectedShopId) : [];
  return <ManagementLayout navigation={navigation} activeId={activeId} onNavigate={setPage} selectors={
    <ContextSelectors events={events} eventId={event.event_id} shops={shops} shopId={selectedShopId} loading={result.status === 'loading'}
      onEventChange={onEventChange} onShopChange={id => onShopChange(validShopId(event.event_id, id, shops))} />
  }>
    {result.status === 'loading' ? <LoadingState /> : result.status === 'error' ? <ErrorState error={result.error} onRetry={() => setRetry(n => n + 1)} /> : <>
      <AuthoritySummary eventId={event.event_id} context={result.data} />
      {activeId === 'M02' ? <EventSettingsPage key={event.event_id} event={event} authority={result.data.authority} workspace={settingsWorkspace} onGuideSaved={onGuideSaved} /> : activeId === 'M01' ? <OrganizerHome event={event} context={result.data} shopId={selectedShopId} /> : <>
        <div className="mg-page-heading"><div><p className="mg-eyebrow">MANAGEMENT CONTEXT</p><h1>選択中の管理対象</h1><p className="mg-event-name">{event.name}</p></div></div>
        <section className="mg-panel"><h2>現在の表示資格に対応するナビゲーション</h2><p>権限外の管理導線と主催者用の主要指標は表示しません。業務画面は後続の実装で追加します。</p></section>
        <ShopStatusList shops={shops} suspensions={result.data.suspensions} shopId={selectedShopId} />
      </>}
    </>}
  </ManagementLayout>;
}
function AuthoritySummary({ eventId, context }: { eventId: string; context: EventContext }) {
  const grants = currentGrants(context.authority, eventId);
  return <section className="mg-authority" aria-label="現在の表示資格"><strong>表示資格</strong>
    {ownsEvent(context.authority, eventId) && <Badge tone="purple">主催者（現在の所有）</Badge>}
    {grants.map(g => <Badge key={g.grant_id}>{({ EVENT_OPERATOR: '運営担当', SHOP_MANAGER: '店舗管理者', CASHIER: 'レジ担当' })[g.scope.role]} · {g.scope.role}</Badge>)}
    {grants.length > 0 && <span className="mg-authority-permissions">付与権限：{[...new Set(grants.flatMap(g => g.scope.permissions))].join(' / ') || 'なし'}</span>}
    <small>fixtureの表示判定です。API側の現在認可は未統合です。</small>
  </section>;
}
