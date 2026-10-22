import type { Shop, Suspension } from '../contracts';
import { Badge, EmptyState } from './Status';
import { Icon } from './Icon';

export function ShopStatusList({ shops, suspensions, shopId }: { shops: Shop[]; suspensions: Suspension[] | null; shopId: string | null }) {
  const displayed = shopId ? shops.filter(shop => shop.shop_id === shopId) : shops;
  return <section className="mg-panel" aria-labelledby="shop-status-title">
    <div className="mg-section-heading"><div><span className="mg-eyebrow">SHOPS</span><h2 id="shop-status-title">店舗の状態</h2></div><Icon name="shop" /></div>
    <p className="mg-muted">店舗状態、新規決済の受付設定、店舗の緊急停止は別々に表示しています。受付設定だけで決済の可否は判定しません。</p>
    {displayed.length === 0 ? <EmptyState title="表示できる店舗がありません">選択中のイベントには、現在表示できる店舗がありません。</EmptyState> :
      <ul className="mg-shop-list">{displayed.map(shop => {
        const active = suspensions?.filter(s => s.scope === 'SHOP' && s.shop_id === shop.shop_id && s.active);
        return <li key={shop.shop_id} className="mg-shop-card">
          <h3>{shop.name}</h3><dl className="mg-shop-facts">
            <div><dt>店舗状態</dt><dd><Badge tone={shop.status === 'OPEN' ? 'blue' : 'neutral'}>{({ OPEN: '営業中', CLOSED: '閉店', ARCHIVED: 'アーカイブ' })[shop.status]} · {shop.status}</Badge></dd></div>
            <div><dt>新規決済の受付設定</dt><dd>{shop.accepting_new_payments ? '受付する' : '受付しない'}</dd></div>
            <div><dt>店舗の緊急停止</dt><dd>{active === undefined ? '未取得（表示対象外）' : active.length > 0 ? <Badge tone="warning">有効な停止あり</Badge> : '有効な停止なし'}
              {active?.map(s => <p key={s.suspension_id} className="mg-stop-reason">{s.reason}</p>)}
            </dd></div>
          </dl>
        </li>;
      })}</ul>}
  </section>;
}
