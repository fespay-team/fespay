import type { EventGuide, Shop } from '../contracts';

export function ContextSelectors({ events, ownedEventIds, eventId, shops, shopId, loading, onEventChange, onShopChange }: {
  events: EventGuide[];
  ownedEventIds: readonly string[];
  eventId: string | null;
  shops: Shop[];
  shopId: string | null;
  loading: boolean;
  onEventChange: (id: string) => void;
  onShopChange: (id: string | null) => void;
}) {
  const event = events.find(e => e.event_id === eventId);
  const ownedIds = new Set(ownedEventIds);
  const eventGroups = [
    { label: '主催イベント', events: events.filter(e => ownedIds.has(e.event_id)) },
    { label: '担当イベント', events: events.filter(e => !ownedIds.has(e.event_id)) },
  ];
  const shop = shops.find(s => s.shop_id === shopId);
  return <div className="mg-selectors">
    <div className="mg-field"><label htmlFor="management-event">イベント</label>
      <select id="management-event" aria-describedby="management-event-selection" value={eventId ?? ''} disabled={events.length === 0} onChange={e => onEventChange(e.target.value)}>
        {events.length === 0 && <option value="">選択できるイベントなし</option>}
        {eventGroups.filter(group => group.events.length > 0).map(group => <optgroup key={group.label} label={group.label}>
          {group.events.map(e => <option key={e.event_id} value={e.event_id}>{e.name}</option>)}
        </optgroup>)}
      </select>
      <p id="management-event-selection" className="mg-selection-name">{event ? `${ownedIds.has(event.event_id) ? '主催イベント' : '担当イベント'}：${event.name}` : 'イベント未選択'}</p>
    </div>
    <div className="mg-field"><label htmlFor="management-shop">店舗</label>
      <select id="management-shop" value={shopId ?? ''} disabled={loading || shops.length === 0} onChange={e => onShopChange(e.target.value || null)}>
        <option value="">{loading ? '店舗を確認中' : shops.length === 0 ? '選択できる店舗なし' : '店舗を指定しない'}</option>
        {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.name}</option>)}
      </select>
      <p className="mg-selection-name">{shop?.name ?? '店舗未選択'}{loading ? ' / 読み込み中' : ''}</p>
    </div>
    <div className="mg-mode"><span className="mg-mode-dot" aria-hidden="true" /><span>管理モード<small>DEMO / fixture</small></span></div>
  </div>;
}
