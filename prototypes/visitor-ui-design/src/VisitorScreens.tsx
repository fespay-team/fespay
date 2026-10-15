import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import {
  amountError, formatDateTime, formatYen, mockActivities, mockOrders,
  mockRecipient, mockReceptionIdentity, mockShop, orderTotal,
  type MockActivity, type MockEvent, type MockOrder, type MockOrderLine, type MockWallet,
} from './mock';

type Destination = 'U04' | 'U06' | 'U07' | 'U08' | 'U09' | 'U10';
type ScreenProps = { event: MockEvent; wallet: MockWallet; onNavigate: (screen: Destination) => void };
type CartProps = { cartQuantities: Record<string, number>; onCartChange: Dispatch<SetStateAction<Record<string, number>>> };

function StepTitle({ children }: { children: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [children]);
  return <h2 ref={heading} tabIndex={-1}>{children}</h2>;
}

function QrPreview({ purpose, expiry }: { purpose: string; expiry?: string }) {
  return (
    <>
      <div className="qr-placeholder" role="img" aria-label={`${purpose}の仮表示。読み取りはできません。`}>
        <span className="qr-corner top-left" aria-hidden="true" />
        <span className="qr-corner top-right" aria-hidden="true" />
        <span className="qr-corner bottom-left" aria-hidden="true" />
        <span className="qr-label">QR 仮表示<small>MOCK / 読み取り不可</small></span>
      </div>
      <p className="qr-caption">{purpose}</p>
      {expiry && <p className="qr-expiry">有効期限 {expiry}<span className="hint">MOCK固定表示</span></p>}
    </>
  );
}

function CashScreen({ event, wallet, onNavigate }: ScreenProps) {
  const [step, setStep] = useState<'qr' | 'charge-result' | 'unknown' | 'refund'>('qr');
  const charge = mockActivities.find(item => item.eventId === event.id && item.type === 'チャージ');
  return (
    <>
      <StepTitle>{step === 'qr' ? '受付用QR' : step === 'refund' ? '払戻し手続の確認' : 'チャージの処理状態'}</StepTitle>
      {step === 'qr' && <QrPreview purpose="受付用QR · チャージ・払戻しの本人照合" expiry="00:59" />}
      {step === 'qr' && (
        <dl className="details" aria-label="受付の本人確認用MOCK情報">
          <div><dt>表示名</dt><dd>{mockReceptionIdentity.displayName}（MOCK）</dd></div>
          <div><dt>照合番号</dt><dd>{mockReceptionIdentity.verificationCode}（MOCK）</dd></div>
        </dl>
      )}
      <dl className="details">
        <div><dt>受付場所</dt><dd>{event.reception}</dd></div>
        <div><dt>チャージ受付時間</dt><dd>{formatDateTime(event.startsAt)} ～ {formatDateTime(event.endsAt)}</dd></div>
        <div><dt>通常払戻し受付時間</dt><dd>{formatDateTime(event.startsAt)} ～ {formatDateTime(event.refundEndsAt)}</dd></div>
      </dl>
      {step === 'qr' && (
        <>
          <p className="notice">受付でQRを提示し、イベント・表示名・照合番号を確認します。チャージは担当者が現金を受領してから確定します。</p>
          <button className="primary" onClick={() => setStep('refund')}>払戻し手続を確認する</button>
          <button className="secondary" onClick={() => setStep('charge-result')}>チャージ結果を見る</button>
          <button className="text-button" onClick={() => setStep('unknown')}>結果確認中のMOCK例を見る</button>
        </>
      )}
      {step === 'charge-result' && (charge ? (
        <div className="state-panel" role="status">
          <strong>チャージ成立（MOCK記録）</strong>
          <p>{formatYen(charge.amountYen)}</p>
          <p className="hint">取引ID：{charge.id}<br />{formatDateTime(charge.occurredAt)}</p>
        </div>
      ) : <p className="notice">このイベントには、まだチャージ履歴がありません。</p>)}
      {step === 'unknown' && (
        <div className="state-panel" role="status">
          <strong>結果確認中（MOCK表示）</strong>
          <p>成立・未成立をまだ確認できていません。同じ要求の結果を受付で確認してください。</p>
          <p className="hint">確認用要求ID：MOCK-CHARGE-UNKNOWN<br />現金の再受領・即返却・別の要求での再チャージは行いません。</p>
        </div>
      )}
      {step === 'refund' && (
        <>
          <dl className="details">
            <div><dt>利用可能額</dt><dd>{formatYen(wallet.availableYen)}</dd></div>
            <div><dt>払戻し手続中の拘束額</dt><dd>{formatYen(wallet.heldYen)}</dd></div>
            <div><dt>返金専用額</dt><dd>{formatYen(wallet.refundOnlyYen)}<br /><span className="hint">通常額と混ぜず、主催者の精算用受付で扱います。受付条件は主催者へ確認してください。</span></dd></div>
          </dl>
          <div className="state-panel" role="status">
            <strong>{BigInt(wallet.heldYen) > 0n ? '拘束済み・現金交付待ち（MOCK）' : '未開始（MOCK）'}</strong>
            {BigInt(wallet.heldYen) > 0n ? (
              <><p>対象額：{formatYen(wallet.heldYen)}</p><p className="hint">手続ID：MOCK-CASH-002<br />同時に新しい払戻しを開始せず、現在の手続を受付で確認してください。</p></>
            ) : <p>受付で本人を照合し、担当者が準備した金額を本人が確認・承認します。</p>}
          </div>
          <p className="hint">現金交付は受付担当者が記録します。交付有無が不明な場合は拘束を維持して調査し、自動解除・再交付はしません。</p>
          <button className="secondary" onClick={() => onNavigate('U10')}>履歴・問い合わせを確認する</button>
        </>
      )}
      {step !== 'qr' && <button className="secondary" onClick={() => setStep('qr')}>受付用QRに戻る</button>}
    </>
  );
}

function TransferScreen({ event, wallet, onNavigate, onPreview }: ScreenProps & { onPreview: (item: MockActivity) => void }) {
  const [step, setStep] = useState<'entry' | 'receive' | 'scan' | 'recipient' | 'amount' | 'confirm' | 'complete'>('entry');
  const [amount, setAmount] = useState('500');
  const [error, setError] = useState('');

  function confirm(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const message = amountError(amount, wallet.availableYen);
    setError(message);
    if (!message) setStep('confirm');
  }

  function complete() {
    onPreview({ id: 'MOCK-TRANSFER-PREVIEW', eventId: event.id, type: '譲渡', amountYen: BigInt(amount).toString(), counterparty: mockRecipient.name, status: '成立（完了画面のMOCK）', occurredAt: wallet.checkedAt });
    setStep('complete');
  }

  return (
    <>
      <StepTitle>{{ entry: '譲渡の操作を選ぶ', receive: '受取QR', scan: '相手の受取QR', recipient: '相手を確認', amount: '送る金額', confirm: '譲渡内容を確認', complete: '譲渡完了（MOCK）' }[step]}</StepTitle>
      {step === 'entry' && (
        <>
          <p className="intro">同じイベントの参加者へ、利用可能額を譲渡できます。</p>
          {!event.transferEnabled && <p className="notice">このイベントでは主催者が譲渡を有効にしていません。</p>}
          <button className="primary" disabled={!event.transferEnabled} onClick={() => setStep('scan')}>送る</button>
          <button className="secondary" disabled={!event.transferEnabled} onClick={() => setStep('receive')}>受け取る</button>
        </>
      )}
      {step === 'receive' && (
        <>
          <QrPreview purpose="譲渡受取用QR" expiry="04:59" />
          <dl className="details"><div><dt>受取人</dt><dd>デモ来場者</dd></div><div><dt>照合番号</dt><dd>4826（MOCK）</dd></div></dl>
          <p className="notice">受取QRは300秒有効で、1回の譲渡に使います。送信者が相手・金額を確認して承認すると成立します。</p>
        </>
      )}
      {step === 'scan' && (
        <>
          <p className="notice">相手が表示する受取QRを読む入口です。今回はカメラを使わず、読み取り後のMOCK画面へ進みます。</p>
          <button className="primary" onClick={() => setStep('recipient')}>受取QRを読み取った状態を見る（MOCK）</button>
        </>
      )}
      {step === 'recipient' && (
        <>
          <dl className="details"><div><dt>イベント</dt><dd>{event.name}</dd></div><div><dt>相手の表示名</dt><dd>{mockRecipient.name}</dd></div><div><dt>照合番号</dt><dd>{mockRecipient.verificationCode}</dd></div></dl>
          <button className="primary" onClick={() => setStep('amount')}>この相手に送る金額を入力</button>
          <button className="secondary" onClick={() => setStep('scan')}>相手のQRへ戻る</button>
        </>
      )}
      {step === 'amount' && (
        <form className="stack" onSubmit={confirm}>
          <p>相手：{mockRecipient.name}<br />利用可能額：{formatYen(wallet.availableYen)}</p>
          <label className="field"><span>譲渡する金額（円）</span><input name="transferAmount" inputMode="numeric" value={amount} maxLength={30} required aria-invalid={Boolean(error)} aria-describedby="transfer-error" onChange={(change) => { setAmount(change.target.value); setError(''); }} /></label>
          <p id="transfer-error" className="error" role="alert">{error}</p>
          <button className="primary" type="submit">譲渡内容を確認する</button>
          <button className="secondary" type="button" onClick={() => setStep('recipient')}>相手確認に戻る</button>
        </form>
      )}
      {(step === 'confirm' || step === 'complete') && (
        <>
          <dl className="details"><div><dt>イベント</dt><dd>{event.name}</dd></div><div><dt>相手</dt><dd>{mockRecipient.name} · 照合番号 {mockRecipient.verificationCode}</dd></div><div><dt>譲渡額</dt><dd>{formatYen(amount)}</dd></div><div><dt>送信後の利用可能額（参考）</dt><dd>{formatYen((BigInt(wallet.availableYen) - BigInt(amount)).toString())}</dd></div></dl>
          {step === 'confirm' ? (
            <>
              <p className="notice">成立後に送信者だけで取り消すことはできません。イベント・相手・金額を確認してください。</p>
              <button className="primary" onClick={complete}>この相手に譲渡する（MOCK）</button>
              <button className="secondary" onClick={() => setStep('amount')}>金額を修正する</button>
            </>
          ) : (
            <>
              <div className="state-panel" role="status"><strong>完了状態のMOCK表示</strong><p className="hint">取引ID：MOCK-TRANSFER-PREVIEW<br />残高の実更新は行っていません。</p></div>
              <button className="primary" onClick={() => onNavigate('U10')}>履歴を確認する</button>
            </>
          )}
        </>
      )}
      {step !== 'entry' && <button className="text-button" onClick={() => setStep('entry')}>送る・受け取るの入口に戻る</button>}
    </>
  );
}

function OrderLines({ lines }: { lines: readonly MockOrderLine[] }) {
  return (
    <ul className="item-list">
      {lines.map(line => <li key={line.productId}><span>{line.name}<small>{formatYen(line.priceYen)} × {line.quantity}</small></span><strong>{formatYen((BigInt(line.priceYen) * BigInt(line.quantity)).toString())}</strong></li>)}
    </ul>
  );
}

function ProductsScreen({ event, wallet, onNavigate, onOrder, cartQuantities: quantities, onCartChange }: ScreenProps & CartProps & { onOrder: (order: MockOrder) => void }) {
  const [step, setStep] = useState<'products' | 'cart' | 'confirm'>('products');
  const [error, setError] = useState('');
  const lines: MockOrderLine[] = mockShop.products.filter(product => (quantities[product.id] ?? 0) > 0).map(product => ({
    productId: product.id, name: product.name, priceYen: product.priceYen, quantity: quantities[product.id],
  }));
  const total = orderTotal(lines);
  const mobileAllowed = event.mobileOrderingEnabled && mockShop.mobileOrderingEnabled;

  function updateQuantity(productId: string, delta: number) {
    const product = mockShop.products.find(item => item.id === productId);
    if (!product) return;
    onCartChange(values => ({ ...values, [productId]: Math.max(0, Math.min(999, product.available, (values[productId] ?? 0) + delta)) }));
    setError('');
  }

  function placeOrder() {
    const message = amountError(total, wallet.availableYen);
    setError(message);
    if (message || !mobileAllowed || lines.length === 0) return;
    onCartChange({});
    onOrder({ id: 'MOCK-ORDER-PREVIEW', eventId: event.id, number: '1014-002', shopName: mockShop.name, lines, fulfillment: '受付済み', receiptCode: '', transactionId: 'MOCK-PAYMENT-PREVIEW', occurredAt: wallet.checkedAt });
  }

  return (
    <>
      <StepTitle>{{ products: '商品一覧', cart: 'カート', confirm: '注文・支払内容を確認' }[step]}</StepTitle>
      <p className="event-name">{mockShop.name}</p>
      {!mobileAllowed && <p className="notice">この店舗ではモバイル注文を利用できません。商品を確認し、店舗レジで会計してください。</p>}
      {step === 'products' && (
        <>
          <div className="stack">
            {mockShop.products.map(product => (
              <article key={product.id} className="event-card">
                <h3>{product.name}</h3>
                <p>{formatYen(product.priceYen)}</p>
                <p className="muted">{product.available === 0 ? '売切れ' : '販売中（MOCK）'}</p>
                <button className="secondary" disabled={!mobileAllowed || product.available === 0 || (quantities[product.id] ?? 0) >= product.available} onClick={() => updateQuantity(product.id, 1)} aria-label={`${product.name}をカートに追加`}>カートに追加{(quantities[product.id] ?? 0) > 0 && ` · ${quantities[product.id]}個`}</button>
              </article>
            ))}
          </div>
          <button className="primary spaced" disabled={lines.length === 0} onClick={() => setStep('cart')}>カートを見る · {formatYen(total)}</button>
          <button className="secondary" onClick={() => onNavigate('U09')}>注文・受取を見る</button>
        </>
      )}
      {step === 'cart' && (
        <>
          {lines.length === 0 ? <p className="notice">カートは空です。</p> : (
            <>
              <OrderLines lines={lines} />
              {lines.map(line => (
                <div key={line.productId} className="quantity-row">
                  <span>{line.name}</span>
                  <div className="quantity-controls">
                    <button className="quantity-button" aria-label={`${line.name}を1個減らす`} onClick={() => updateQuantity(line.productId, -1)}>−</button>
                    <span aria-live="polite">{line.quantity}</span>
                    <button className="quantity-button" aria-label={`${line.name}を1個増やす`} disabled={line.quantity >= (mockShop.products.find(product => product.id === line.productId)?.available ?? 0)} onClick={() => updateQuantity(line.productId, 1)}>＋</button>
                  </div>
                </div>
              ))}
              <div className="payment-balance"><span>合計</span><strong>{formatYen(total)}</strong></div>
            </>
          )}
          <p className="hint">この店舗の商品だけをまとめます。カートに入れた時点では在庫を予約しません。</p>
          <button className="primary spaced" disabled={lines.length === 0 || !mobileAllowed} onClick={() => setStep('confirm')}>注文確認へ進む</button>
          <button className="secondary" onClick={() => setStep('products')}>商品一覧に戻る</button>
        </>
      )}
      {step === 'confirm' && (
        <>
          <p className="muted">処理種別：商品の支払い・モバイル注文</p>
          <OrderLines lines={lines} />
          <div className="payment-balance"><span>支払額</span><strong>{formatYen(total)}</strong></div>
          <p className="spaced">利用可能額：{formatYen(wallet.availableYen)}</p>
          <p className="qr-expiry">見積・在庫予約の有効期限 02:59<span className="hint">180秒・MOCK固定表示。実際の予約は行いません。</span></p>
          <p className="notice">イベント・店舗・商品・金額を確認して承認します。実際の注文は前払いの成立時に受付されます。</p>
          <p className="error" role="alert">{error}</p>
          <button className="primary" onClick={placeOrder}>この内容で支払う（MOCK）</button>
          <button className="secondary" onClick={() => { setStep('cart'); setError(''); }}>カートを修正する</button>
        </>
      )}
    </>
  );
}

function OrdersScreen({ orders, initialOrder, onNavigate }: { orders: readonly MockOrder[]; initialOrder: MockOrder | null; onNavigate: ScreenProps['onNavigate'] }) {
  const [selected, setSelected] = useState<MockOrder | null>(initialOrder);
  const [showReceipt, setShowReceipt] = useState(false);
  return (
    <>
      <StepTitle>{showReceipt ? '受取画面' : selected ? '注文詳細' : '注文一覧'}</StepTitle>
      {!selected ? (
        <>
          {orders.length === 0 && <p className="notice">このイベントの注文はまだありません。</p>}
          <div className="stack">
            {orders.map(order => (
              <article className="event-card" key={order.id}>
                <h3>注文番号 {order.number}</h3>
                <p>{order.shopName}</p>
                <p>提供状況：{order.fulfillment}（MOCK）</p>
                <p>{formatYen(orderTotal(order.lines))}</p>
                <button className="secondary" aria-label={`注文 ${order.number}の詳細を見る`} onClick={() => { setSelected(order); setShowReceipt(false); }}>注文詳細を見る</button>
              </article>
            ))}
          </div>
          <button className="secondary" onClick={() => onNavigate('U08')}>商品・カートへ</button>
        </>
      ) : (
        <>
          <div className="order-number"><span className="muted">注文番号</span><strong>{selected.number}</strong><span>{selected.shopName}</span></div>
          <OrderLines lines={selected.lines} />
          <div className="payment-balance"><span>合計</span><strong>{formatYen(orderTotal(selected.lines))}</strong></div>
          <dl className="details">
            <div><dt>支払状態</dt><dd>成立（MOCK）</dd></div>
            <div><dt>提供状況</dt><dd>{selected.fulfillment}（MOCK）</dd></div>
            <div><dt>取消・返金状態</dt><dd>取消・返金なし</dd></div>
            <div><dt>取引ID</dt><dd>{selected.transactionId}</dd></div>
          </dl>
          {showReceipt ? (
            <>
              <QrPreview purpose="注文受取用QR" />
              <p className="receipt-code">照合コード <strong>{selected.receiptCode}</strong><span className="hint">8桁・MOCK表示</span></p>
              <p className="notice">注文番号とこの受取画面を店員に提示します。受取完了は店舗の担当者が確定します。</p>
              <button className="secondary" onClick={() => setShowReceipt(false)}>注文詳細に戻る</button>
            </>
          ) : (
            <>
              <button className="primary" disabled={selected.fulfillment !== '受取待ち'} onClick={() => setShowReceipt(true)}>受取画面を表示する</button>
              {selected.fulfillment !== '受取待ち' && <p className="hint spaced">店舗で準備が完了すると受取画面へ進めます。</p>}
            </>
          )}
          <button className="secondary" onClick={() => { setSelected(null); setShowReceipt(false); }}>注文一覧に戻る</button>
          <button className="text-button" onClick={() => onNavigate('U10')}>履歴・問い合わせへ</button>
        </>
      )}
    </>
  );
}

function HistoryScreen({ event, items }: { event: MockEvent; items: readonly MockActivity[] }) {
  const [selected, setSelected] = useState<MockActivity | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [filter, setFilter] = useState('すべて');
  const visibleItems = filter === 'すべて' ? items : items.filter(item => item.type === filter);
  return (
    <>
      <StepTitle>{showContact ? '問い合わせ先' : selected ? '取引詳細' : '取引履歴一覧'}</StepTitle>
      {showContact ? (
        <>
          <p className="notice">問い合わせ時はイベント名と追跡IDを受付・主催者に伝えてください。</p>
          <dl className="details"><div><dt>連絡先</dt><dd>{event.contact}</dd></div><div><dt>受付場所</dt><dd>{event.reception}</dd></div>{selected && <div><dt>問い合わせ用追跡ID</dt><dd>{selected.id}</dd></div>}</dl>
          <p className="hint">連絡先は架空のMOCKです。この画面から問い合わせの送信は行いません。</p>
          <button className="secondary" onClick={() => setShowContact(false)}>{selected ? '取引詳細に戻る' : '履歴一覧に戻る'}</button>
        </>
      ) : selected ? (
        <>
          <dl className="details">
            <div><dt>処理種別</dt><dd>{selected.type}</dd></div>
            <div><dt>金額</dt><dd>{formatYen(selected.amountYen)}</dd></div>
            <div><dt>日時</dt><dd>{formatDateTime(selected.occurredAt)} JST</dd></div>
            <div><dt>相手・店舗</dt><dd>{selected.counterparty}</dd></div>
            <div><dt>状態</dt><dd>{selected.status}（MOCK）</dd></div>
            {selected.originalTransactionId && <div><dt>元取引ID</dt><dd>{selected.originalTransactionId}</dd></div>}
            <div><dt>取引・手続の追跡ID</dt><dd>{selected.id}</dd></div>
          </dl>
          <button className="primary" onClick={() => setShowContact(true)}>この取引について問い合わせ先を確認</button>
          <button className="secondary" onClick={() => setSelected(null)}>履歴一覧に戻る</button>
        </>
      ) : (
        <>
          <label className="field"><span>取引の種類</span><select value={filter} onChange={(change) => setFilter(change.target.value)}>{['すべて', 'チャージ', '支払い', '譲渡', '現金払戻し', '購入返金'].map(type => <option key={type}>{type}</option>)}</select></label>
          <p className="muted spaced" role="status">{visibleItems.length}件のMOCK履歴</p>
          <div className="stack">
            {visibleItems.map(item => (
              <article className="event-card" key={item.id}>
                <h3>{item.type} · {formatYen(item.amountYen)}</h3>
                <p>{item.counterparty}</p>
                <p className="muted">{formatDateTime(item.occurredAt)}<br />{item.status}</p>
                <button className="secondary" aria-label={`${item.id}の取引詳細を見る`} onClick={() => setSelected(item)}>取引詳細を見る</button>
              </article>
            ))}
          </div>
          {visibleItems.length === 0 && <p className="notice">該当する取引履歴はありません。</p>}
          <button className="secondary" onClick={() => setShowContact(true)}>問い合わせ先を確認する</button>
        </>
      )}
    </>
  );
}

export default function VisitorScreens({ screen, cartQuantities, onCartChange, ...props }: ScreenProps & CartProps & { screen: string }) {
  const [previewOrder, setPreviewOrder] = useState<MockOrder | null>(null);
  const [previewActivity, setPreviewActivity] = useState<MockActivity[]>([]);
  const [openNewOrder, setOpenNewOrder] = useState(false);
  const orders = [...(previewOrder ? [previewOrder] : []), ...mockOrders.filter(order => order.eventId === props.event.id)];
  const activities = [...previewActivity, ...mockActivities.filter(item => item.eventId === props.event.id)];

  function addPreview(item: MockActivity) {
    setPreviewActivity(items => [item, ...items.filter(previous => previous.id !== item.id)]);
  }

  function openOrder(order: MockOrder) {
    setPreviewOrder(order);
    setOpenNewOrder(true);
    addPreview({ id: order.transactionId, eventId: order.eventId, type: '支払い', amountYen: orderTotal(order.lines), counterparty: order.shopName, status: '成立（注文結果のMOCK）', occurredAt: order.occurredAt });
    props.onNavigate('U09');
  }

  if (!['U06', 'U07', 'U08', 'U09', 'U10'].includes(screen)) return null;
  return (
    <>
      <p className="event-name">{props.event.name}</p>
      {screen === 'U06' && <CashScreen {...props} />}
      {screen === 'U07' && <TransferScreen {...props} onPreview={addPreview} />}
      {screen === 'U08' && <ProductsScreen {...props} cartQuantities={cartQuantities} onCartChange={onCartChange} onOrder={openOrder} onNavigate={(destination) => { if (destination === 'U09') setOpenNewOrder(false); props.onNavigate(destination); }} />}
      {screen === 'U09' && <OrdersScreen orders={orders} initialOrder={openNewOrder ? previewOrder : null} onNavigate={props.onNavigate} />}
      {screen === 'U10' && <HistoryScreen event={props.event} items={activities} />}
      <p className="hint prototype-detail">画面状態のみのMOCKです。残高・在庫・現金・実取引は更新しません。</p>
      <button className="secondary" onClick={() => props.onNavigate('U04')}>イベントホームに戻る</button>
    </>
  );
}
