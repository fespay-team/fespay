import { useEffect, useRef, useState, type FormEvent } from 'react';
import VisitorScreens from './VisitorScreens';
import {
  formatDateTime,
  formatYen,
  mockEvents,
  mockJoinedEventIds,
  mockWallets,
  type MockEvent,
} from './mock';

type ScreenId = 'U01' | 'U02' | 'U03' | 'U04' | 'U05' | 'U06' | 'U07' | 'U08' | 'U09' | 'U10';

const screenTitles: Record<ScreenId, string> = {
  U01: '認証',
  U02: 'イベント一覧・案内',
  U03: '参加・条件同意',
  U04: 'イベントホーム',
  U05: '支払いQR',
  U06: 'チャージ・現金払戻し',
  U07: '送る・受け取る',
  U08: '商品・カート',
  U09: '注文・受取',
  U10: '履歴・問い合わせ',
};

function readScreen(): ScreenId {
  const value = window.location.hash.slice(1);
  return Object.hasOwn(screenTitles, value) ? (value as ScreenId) : 'U01';
}

function navigate(screen: ScreenId) {
  window.location.hash = screen;
}

function EventConditions({ event }: { event: MockEvent }) {
  return (
    <dl className="details">
      <div><dt>参加条件</dt><dd>{event.participationPassword ? '参加パスワードあり' : '公開・参加パスワードなし'}</dd></div>
      <div><dt>残高の利用</dt><dd>このイベント内のみ。1円単位で利用できます。</dd></div>
      <div><dt>払戻し受付</dt><dd>{formatDateTime(event.startsAt)} ～ {formatDateTime(event.refundEndsAt)}<br />{event.reception}・手数料0円</dd></div>
      <div><dt>残高失効</dt><dd>自動失効なし</dd></div>
      <div><dt>お問い合わせ</dt><dd>{event.contact}</dd></div>
    </dl>
  );
}

function CartSwitchDialog({ onReturn, onDiscard }: { onReturn: () => void; onDiscard: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialog} className="switch-dialog" aria-labelledby="cart-switch-title" aria-describedby="cart-switch-message" onCancel={(event) => { event.preventDefault(); onReturn(); }}>
      <h2 id="cart-switch-title">イベントの切替</h2>
      <p id="cart-switch-message">イベントを切り替えると現在のカート内容は破棄されます</p>
      <button type="button" className="secondary" onClick={onReturn}>戻る</button>
      <button type="button" className="primary spaced" onClick={onDiscard}>破棄して切り替える</button>
    </dialog>
  );
}

function Participation({ event, alreadyJoined, onJoin, onBack }: {
  event: MockEvent;
  alreadyJoined: boolean;
  onJoin: () => void;
  onBack: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!agreed) return;
    const password = new FormData(formEvent.currentTarget).get('participationPassword');
    if (event.participationPassword && password !== event.participationPassword) {
      setPasswordError('参加パスワードを確認してください。');
      return;
    }
    onJoin();
  }

  return (
    <>
      <p className="event-name">{event.name}</p>
      <p className="muted">条件版：{event.conditionsVersion}</p>
      <EventConditions event={event} />
      {alreadyJoined ? (
        <>
          <p className="notice">このイベントには参加済みです。条件への再同意は不要です。</p>
          <button className="primary" onClick={onJoin}>イベントホームへ</button>
        </>
      ) : (
        <form onSubmit={submit} className="stack">
          {event.participationPassword && (
            <label className="field">
              <span>参加パスワード</span>
              <input
                name="participationPassword"
                type="password"
                autoComplete="off"
                required
                maxLength={64}
                aria-invalid={Boolean(passwordError)}
                aria-describedby="password-hint password-error"
                onChange={() => setPasswordError('')}
              />
              <span id="password-hint" className="hint">MOCK確認用：{event.participationPassword}</span>
              <span id="password-error" className="error" role="alert">{passwordError}</span>
            </label>
          )}
          <label className="consent">
            <input type="checkbox" required checked={agreed} onChange={(change) => setAgreed(change.target.checked)} />
            <span>参加条件・払戻し条件を確認し、同意します</span>
          </label>
          <button className="primary" type="submit" disabled={!agreed}>同意して参加する</button>
        </form>
      )}
      <button className="secondary" onClick={onBack}>イベント案内に戻る</button>
    </>
  );
}

export default function App() {
  const [requestedScreen, setRequestedScreen] = useState<ScreenId>(readScreen);
  const [signedIn, setSignedIn] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<MockEvent | null>(null);
  const [showEventDetails, setShowEventDetails] = useState(false);
  const [joinedEventIds, setJoinedEventIds] = useState<readonly string[]>(mockJoinedEventIds);
  const [search, setSearch] = useState('');
  // One cart for the currently selected event/shop; no cross-event storage.
  const [cartQuantities, setCartQuantities] = useState<Record<string, number>>({});
  const [pendingSwitch, setPendingSwitch] = useState<{ kind: 'list' } | { kind: 'event'; event: MockEvent } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hasCart = Object.values(cartQuantities).some(quantity => quantity > 0);

  let screen = requestedScreen;
  if (screen !== 'U01' && !signedIn) screen = 'U01';
  else if (screen !== 'U01' && screen !== 'U02' && !selectedEvent) screen = 'U02';
  else if (screen !== 'U01' && screen !== 'U02' && screen !== 'U03' && selectedEvent && !joinedEventIds.includes(selectedEvent.id)) screen = 'U03';

  useEffect(() => {
    const onHashChange = () => setRequestedScreen(readScreen());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (requestedScreen !== screen) window.location.replace(`#${screen}`);
    document.title = `FesPay | ${screenTitles[screen]}（MOCK）`;
    heading.current?.focus();
    window.scrollTo(0, 0);
  }, [screen, requestedScreen, showEventDetails, selectedEvent?.id]);

  function login() {
    setSignedIn(true);
    navigate('U02');
  }

  function showEventList() {
    setShowEventDetails(false);
    navigate('U02');
  }

  function openList() {
    if (hasCart) setPendingSwitch({ kind: 'list' });
    else showEventList();
  }

  function selectEvent(event: MockEvent) {
    if (selectedEvent?.id !== event.id && hasCart) {
      setPendingSwitch({ kind: 'event', event });
      return;
    }
    if (selectedEvent?.id !== event.id) setCartQuantities({});
    setSelectedEvent(event);
    setShowEventDetails(true);
  }

  function discardAndSwitch() {
    setCartQuantities({});
    if (pendingSwitch?.kind === 'event') {
      setSelectedEvent(pendingSwitch.event);
      setShowEventDetails(true);
    } else showEventList();
    setPendingSwitch(null);
  }

  function joinEvent() {
    if (!selectedEvent) return;
    setJoinedEventIds((ids) => ids.includes(selectedEvent.id) ? ids : [...ids, selectedEvent.id]);
    navigate('U04');
  }

  const query = search.trim().toLocaleLowerCase('ja-JP');
  const filteredEvents = mockEvents.filter((event) => (
    `${event.name} ${event.venue} ${formatDateTime(event.startsAt)}`.toLocaleLowerCase('ja-JP').includes(query)
  ));
  const wallet = selectedEvent ? mockWallets[selectedEvent.id] : undefined;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">FesPay</span>
        <span className="badge">DEMO / MOCK</span>
      </header>
      <p className="prototype-notice">架空データによる操作確認用です。実際のログイン・参加・支払いは行いません。</p>
      <main className="screen">
        <p className="screen-id">{screen} · 来場者</p>
        <h1 ref={heading} tabIndex={-1}>{screenTitles[screen]}</h1>

        {screen === 'U01' && (
          <>
            <p className="intro">イベントを選んで、FesPayをはじめましょう。</p>
            <form className="stack" onSubmit={(formEvent) => { formEvent.preventDefault(); login(); }}>
              <label className="field"><span>メールアドレス</span><input name="email" type="email" autoComplete="off" defaultValue="visitor@example.test" required /><span className="hint">確認用の架空アドレスです。</span></label>
              <label className="field"><span>パスワード</span><input name="password" type="password" autoComplete="off" defaultValue="fespay-prototype" required /><span className="hint">入力内容は送信・保存しません。</span></label>
              <button type="submit" className="primary">メールでログイン（MOCK）</button>
            </form>
            <p className="divider">または</p>
            <button className="secondary" onClick={login}>Googleでログイン（MOCK）</button>
          </>
        )}

        {screen === 'U02' && (!showEventDetails || !selectedEvent) && (
          <>
            <p className="intro">参加するイベントを選んでください。</p>
            <label className="field"><span>イベントを検索</span><input type="search" placeholder="イベント名・開催日・会場" value={search} onChange={(change) => setSearch(change.target.value)} /></label>
            <p className="muted" role="status">{filteredEvents.length}件のイベント</p>
            <div className="stack">
              {filteredEvents.map((event) => (
                <article key={event.id} className="event-card">
                  <div className="card-meta"><span>開催中（MOCK）</span>{joinedEventIds.includes(event.id) && <span className="badge">参加済み</span>}</div>
                  <h2>{event.name}</h2>
                  <p>{formatDateTime(event.startsAt)} ～ {formatDateTime(event.endsAt)}</p>
                  <p>{event.venue}</p>
                  <p className="muted">{event.participationPassword ? '参加パスワードあり' : '公開イベント'}</p>
                  <button className="secondary" onClick={() => selectEvent(event)} aria-label={`${event.name}の案内を見る`}>イベント案内を見る <span aria-hidden="true">→</span></button>
                </article>
              ))}
            </div>
            {filteredEvents.length === 0 && <p className="notice">該当するイベントがありません。検索条件を変えてください。</p>}
            <button className="text-button" onClick={() => { setSignedIn(false); setCartQuantities({}); navigate('U01'); }}>認証画面に戻る</button>
          </>
        )}

        {screen === 'U02' && showEventDetails && selectedEvent && (
          <>
            <p className="event-name">{selectedEvent.name}</p>
            <p className="intro">{selectedEvent.description}</p>
            <dl className="details">
              <div><dt>開催日時</dt><dd>{formatDateTime(selectedEvent.startsAt)} ～ {formatDateTime(selectedEvent.endsAt)}</dd></div>
              <div><dt>会場</dt><dd>{selectedEvent.venue}</dd></div>
              <div><dt>主催者</dt><dd>{selectedEvent.organizer}</dd></div>
            </dl>
            <EventConditions event={selectedEvent} />
            <button className="primary" onClick={() => navigate('U03')}>{joinedEventIds.includes(selectedEvent.id) ? '参加状況を確認する' : '参加条件を確認する'}</button>
            <button className="secondary" onClick={openList}>イベント一覧に戻る</button>
          </>
        )}

        {screen === 'U03' && selectedEvent && (
          <Participation key={selectedEvent.id} event={selectedEvent} alreadyJoined={joinedEventIds.includes(selectedEvent.id)} onJoin={joinEvent} onBack={() => { setShowEventDetails(true); navigate('U02'); }} />
        )}

        {screen === 'U04' && selectedEvent && wallet && (
          <>
            <div className="selected-event"><p className="muted">選択中イベント</p><p className="event-name">{selectedEvent.name}</p><p>{selectedEvent.venue}</p></div>
            <button className="balance-card" onClick={() => navigate('U05')} aria-label="残高を確認して支払いQRを表示する">
              <span className="muted">利用可能額</span>
              <strong className="balance-amount">{formatYen(wallet.availableYen)}</strong>
              <span className="balance-row"><span>拘束額（払戻し手続中）</span><strong>{formatYen(wallet.heldYen)}</strong></span>
              <span className="balance-row"><span>返金専用額</span><strong>{formatYen(wallet.refundOnlyYen)}</strong></span>
              <span className="checked-at">最終確認時刻（MOCK）<br /><time dateTime={wallet.checkedAt}>{formatDateTime(wallet.checkedAt)} JST</time></span>
              <span className="balance-action">支払いQRを表示する <span aria-hidden="true">→</span></span>
            </button>
            <p className="hint">支払いに使えるのは利用可能額です。残高の枠を押すと、支払いQRを表示します。</p>
            <nav className="home-actions" aria-label="イベント内の操作">
              <button className="secondary" onClick={() => navigate('U06')}>チャージ・払戻し <span aria-hidden="true">→</span></button>
              <button className="secondary" onClick={() => navigate('U07')}>送る・受け取る <span aria-hidden="true">→</span></button>
              <button className="secondary" onClick={() => navigate('U08')}>商品・注文 <span aria-hidden="true">→</span></button>
              <button className="secondary" onClick={() => navigate('U10')}>履歴 <span aria-hidden="true">→</span></button>
            </nav>
            <button className="secondary" onClick={openList}>イベントを選び直す</button>
          </>
        )}

        {screen === 'U05' && selectedEvent && wallet && (
          <>
            <p className="event-name">{selectedEvent.name}</p>
            <p className="intro">店員に支払いQRを提示する画面です。</p>
            <div className="qr-placeholder" role="img" aria-label="支払い用QRの仮表示。読み取りはできません。">
              <span className="qr-corner top-left" aria-hidden="true" />
              <span className="qr-corner top-right" aria-hidden="true" />
              <span className="qr-corner bottom-left" aria-hidden="true" />
              <span className="qr-label">QR 仮表示<small>MOCK / 読み取り不可</small></span>
            </div>
            <p className="qr-caption">支払用QR · B方式</p>
            <p className="qr-expiry">有効期限 00:59<span className="hint">60秒有効・MOCK固定表示</span></p>
            <div className="payment-balance"><span>利用可能額</span><strong>{formatYen(wallet.availableYen)}</strong></div>
            <p className="notice">QRを提示するだけでは支払いは成立しません。実際の決済では、店舗・金額・明細を確認して本人が承認します。</p>
            <button className="primary" onClick={() => navigate('U04')}>イベントホームに戻る</button>
          </>
        )}
        {signedIn && selectedEvent && wallet && (
          <VisitorScreens key={`visitor-${selectedEvent.id}`} screen={screen} event={selectedEvent} wallet={wallet} onNavigate={navigate} cartQuantities={cartQuantities} onCartChange={setCartQuantities} />
        )}
      </main>
      {pendingSwitch && <CartSwitchDialog onReturn={() => setPendingSwitch(null)} onDiscard={discardAndSwitch} />}
      <footer className="app-footer">FesPay · 来場者クリックプロトタイプ</footer>
    </div>
  );
}
