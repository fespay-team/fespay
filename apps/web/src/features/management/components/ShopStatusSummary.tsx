import type { Shop, Suspension } from '../contracts';
import { Icon } from './Icon';

export function ShopStatusSummary({ shops, suspensions }: { shops: Shop[]; suspensions: Suspension[] | null }) {
  const activeShopIds = new Set(suspensions?.filter(stop => stop.scope === 'SHOP' && stop.active).map(stop => stop.shop_id));
  return <section className="mg-panel mg-home-shop-panel" aria-labelledby="shop-summary-title">
    <div className="mg-section-heading"><div><span className="mg-eyebrow">SHOPS</span><h2 id="shop-summary-title">店舗状況</h2></div><Icon name="shop" /></div>
    <dl className="mg-home-shop-summary">
      <div><dt>店舗数</dt><dd>{shops.length.toLocaleString('ja-JP')}</dd></div>
      <div><dt>営業中</dt><dd>{shops.filter(shop => shop.status === 'OPEN').length.toLocaleString('ja-JP')}</dd></div>
      <div><dt>新規決済受付停止</dt><dd>{shops.filter(shop => shop.accepting_new_payments === false).length.toLocaleString('ja-JP')}</dd></div>
      <div><dt>緊急停止中</dt><dd>{suspensions === null ? '未取得（表示対象外）' : shops.filter(shop => activeShopIds.has(shop.shop_id)).length.toLocaleString('ja-JP')}</dd></div>
    </dl>
    <p className="mg-note">店舗状態、新規決済の受付設定、店舗の緊急停止は別々の状態です。受付設定だけで決済の可否は判定しません。</p>
    <p className="mg-note">上部で店舗を選択すると、その店舗の詳細を確認できます。</p>
  </section>;
}
