import type { EventGuide } from '../contracts';
import type { EventContext } from '../useManagement';
import { eventLifecycleLabels, formatCheckedAt, formatYen, organizerHomeModel } from '../model';
import { Badge } from '../components/Status';
import { Icon } from '../components/Icon';
import { ShopStatusList } from '../components/ShopStatusList';
import { ShopStatusSummary } from '../components/ShopStatusSummary';

export function OrganizerHome({ event, context, shopId }: {
  event: EventGuide; context: EventContext; shopId: string | null;
}) {
  if (!context.dashboard || !context.reconciliation) return null;
  const view = organizerHomeModel(event.event_id, context.dashboard, context.reconciliation);
  const activeEventStops = context.suspensions?.filter(s => s.scope === 'EVENT' && s.active) ?? [];
  return <>
    <div className="mg-page-heading"><div><p className="mg-eyebrow">ORGANIZER HOME / M01</p><h1>主催者ホーム</h1><p className="mg-event-name">{event.name}</p></div><Badge tone="blue">{eventLifecycleLabels[event.lifecycle]} · {event.lifecycle}</Badge></div>
    <div className="mg-scope-note"><Icon name="calendar" /><p>主要指標の対象は選択中の<strong>イベント全体</strong>です。店舗選択では集計範囲を変えません。</p></div>
    <section className="mg-metrics" aria-label="イベント全体の主要指標">
      <article className="mg-metric"><span className="mg-metric-icon"><Icon name="chart" /></span><h2>売上純額</h2><p className="mg-amount" data-testid="net-sales">{formatYen(view.netSales)}</p>
        <p className="mg-muted">売上額 − 返金額</p><p className="mg-note">集計期間は契約確認待ちです。</p><p className="mg-timestamp">正本確認：{formatCheckedAt(view.dashboardCheckedAt)}</p></article>
      <article className="mg-metric mg-metric--balance"><span className="mg-metric-icon"><Icon name="wallet" /></span><h2>利用者残高総額</h2><p className="mg-amount" data-testid="balance-total">{formatYen(view.balanceTotal)}</p>
        <dl className="mg-balance-parts">{view.balanceParts.map(part => <div key={part.label}><dt>{part.label}</dt><dd>{formatYen(part.amount)}</dd></div>)}</dl>
        <p className="mg-note">拘束額・返金専用額は支払いに使える額には含めません。</p><p className="mg-timestamp">正本確認：{formatCheckedAt(view.balanceCheckedAt)}</p></article>
      <article className="mg-metric"><span className="mg-metric-icon"><Icon name="alert" /></span><h2>未解決現金ケース</h2><p className="mg-amount" data-testid="unresolved-cash">{view.unresolvedCashCases.toLocaleString('ja-JP')}<span className="mg-unit">件</span></p>
        <Badge tone={view.unresolvedCashCases > 0 ? 'warning' : 'neutral'}>{view.unresolvedCashCases > 0 ? '未解決ケースあり' : '未解決ケースなし'}</Badge>
        <p className="mg-note">ケースの処理操作は未実装です。</p><p className="mg-timestamp">正本確認：{formatCheckedAt(view.dashboardCheckedAt)}</p></article>
    </section>
    <div className="mg-home-status">
    <section className="mg-panel" aria-labelledby="event-stop-title"><div className="mg-section-heading"><div><span className="mg-eyebrow">EVENT</span><h2 id="event-stop-title">イベントの緊急停止</h2></div><Badge tone={activeEventStops.length ? 'warning' : 'neutral'}>{activeEventStops.length ? '有効な停止あり' : '有効な停止なし'}</Badge></div>
      {activeEventStops.map(stop => <p key={stop.suspension_id}>{stop.reason}</p>)}
      <p className="mg-muted">店舗単位の緊急停止とは別の状態です。精算中であることから精算専用再開の実施状態は判定しません。</p>
    </section>
    {shopId ? <ShopStatusList shops={context.shops} suspensions={context.suspensions} shopId={shopId} /> :
      <ShopStatusSummary shops={context.shops} suspensions={context.suspensions} />}
    </div>
    <p className="mg-boundary-note">金額はfixtureによる表示確認で、実際の残高・売上ではありません。</p>
  </>;
}
