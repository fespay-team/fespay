import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  House,
  Info,
  MapPin,
  Megaphone,
  Plus,
  ReceiptText,
  ScanLine,
  Send,
  Store,
  UserRound,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import ChargeFlow from "./ChargeFlow";
import FittedBalance from "./FittedBalance";
import HistoryView from "./HistoryView";
import SendFlow from "./SendFlow";
import { useDemoLedger } from "./hooks/useDemoLedger.ts";
import type { Transaction } from "./domain/ledger.ts";
import { formatYen as yen } from "./money";
import "./payment.css";
import festivalStalls from "./assets/festival-stalls.png";
import festivalFood from "./assets/festival-food.png";

type Tab = "home" | "pay" | "history" | "account";
type Modal =
  "stores" | "event" | "notice" | "notifications" | "scan" | "reset" | null;
const EVENT_NAME = "みどりの森まつり";
const VERIFICATION_CODE = "4827";
const DEMO_PAYMENT_QR_VALUE = "FESPAY-DEMO-PAYMENT-QR-NOT-VALID";

const modalLabels: Record<Exclude<Modal, null>, string> = {
  stores: "出店一覧",
  event: "イベント詳細",
  notice: "お知らせ",
  notifications: "通知",
  scan: "QRをスキャンする",
  reset: "デモデータの初期化",
};

function FesPayMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 62"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient
          id="fes-mark-gradient"
          x1="6"
          y1="6"
          x2="52"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#17d4e5" />
          <stop offset=".5" stopColor="#3ba6f8" />
          <stop offset="1" stopColor="#8d5df5" />
        </linearGradient>
      </defs>
      <path
        d="M8 55V26C8 13 16 6 31 6h17c-1 9-6 15-17 15H25c-6 0-9 3-9 9v4c6-7 13-10 23-10h8c-2 9-7 15-18 15h-5c-6 0-8 3-8 9v7H8Z"
        fill="url(#fes-mark-gradient)"
      />
      <path
        d="M8 55V39c5-7 12-10 23-10h9c-2 9-8 15-18 15h-1c-5 0-7 3-7 11H8Z"
        fill="#8066f5"
        opacity=".78"
      />
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>9:41</span>
      <div className="status-icons">
        <span className="signal-bars">
          <i />
          <i />
          <i />
          <i />
        </span>
        <svg viewBox="0 0 20 16" fill="none">
          <path
            d="M2 5.5C6.7 1.5 13.3 1.5 18 5.5M5 8.5c3-2.6 7-2.6 10 0M8 11.5c1.2-1 2.8-1 4 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="10" cy="14" r="1.3" fill="currentColor" />
        </svg>
        <span className="battery">
          <span />
        </span>
      </div>
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  return (
    <div className="transaction-row">
      <span className={`transaction-icon ${transaction.kind}`}>
        {transaction.kind === "charge" ? (
          <Plus size={23} strokeWidth={2.6} />
        ) : transaction.kind === "transfer_received" ? (
          <ArrowDownLeft size={21} strokeWidth={2.2} />
        ) : transaction.kind === "transfer_sent" ? (
          <Send size={19} strokeWidth={2.2} />
        ) : (
          <UtensilsCrossed size={20} strokeWidth={2.2} />
        )}
      </span>
      <span className="transaction-main">
        <strong>{transaction.title}</strong>
        <small>{transaction.date}</small>
        {(transaction.charge || transaction.transfer) && (
          <small className="transaction-reference">
            取引ID {transaction.id}
          </small>
        )}
      </span>
      <strong
        className={`transaction-amount${transaction.amount > 0n ? " positive" : ""}${transaction.amount.toString().replace("-", "").length >= 13 ? " is-long" : ""}`}
      >
        {transaction.amount > 0n ? "+" : "−"} {yen(transaction.amount)}
      </strong>
    </div>
  );
}

function App() {
  const {
    ledger,
    activeAccount,
    syncError,
    selectAccount,
    completeCharge,
    completeTransfer,
    resetDemoData: resetLedger,
  } = useDemoLedger();
  const balance = activeAccount.balance;
  const balanceDigits = balance.toString().length;
  const balanceSizeClass =
    balanceDigits >= 19
      ? "is-massive"
      : balanceDigits >= 13
        ? "is-extra-long"
        : balanceDigits >= 9
          ? "is-long"
          : "";
  const transactions = activeAccount.transactions;
  const [flipped, setFlipped] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [modal, setModal] = useState<Modal>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [toast, setToast] = useState("");
  const modalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (syncError) setToast(syncError.message);
  }, [syncError]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!modal) return;
    const dialog = modalRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const backdrop = dialog.parentElement;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter(
      (element) => element !== backdrop,
    ) as HTMLElement[];
    const originalInert = siblings.map((element) => element.inert);
    const originalOverflow = document.body.style.overflow;
    siblings.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";
    dialog.querySelector<HTMLButtonElement>(".modal-close")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      siblings.forEach((element, index) => {
        element.inert = originalInert[index];
      });
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
    };
  }, [modal]);

  const goHome = () => {
    setActiveTab("home");
    setFlipped(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const showPay = () => {
    setActiveTab("pay");
    window.scrollTo(0, 0);
  };
  const resetDemoData = async () => {
    try {
      await resetLedger();
      setToast("デモデータを初期化しました");
    } catch {
      setToast(
        "デモデータを初期化できませんでした。ブラウザーの保存設定を確認してください",
      );
    }
    setModal(null);
  };

  return (
    <div className="app-shell">
      <StatusBar />
      <header
        className={`topbar${activeTab === "pay" ? " payment-topbar" : ""}`}
      >
        {activeTab === "pay" && (
          <button
            className="payment-close-button"
            type="button"
            onClick={goHome}
            aria-label="支払い画面を閉じてホームに戻る"
          >
            <X size={23} strokeWidth={2.2} />
          </button>
        )}
        {activeTab !== "pay" && (
          <button
            className="brand"
            type="button"
            onClick={goHome}
            aria-label="FesPay ホーム"
          >
            <FesPayMark className="brand-mark" />
            <span className="brand-copy">
              <strong>fespay</strong>
            </span>
          </button>
        )}
        {activeTab !== "pay" && (
          <div className="topbar-actions">
            <button
              className="icon-button notification-button"
              type="button"
              onClick={() => setModal("notifications")}
              aria-label="お知らせ"
            >
              <Bell size={23} strokeWidth={2.1} />
              <span className="notification-dot" />
            </button>
            <button
              className="profile-button"
              type="button"
              onClick={() => setActiveTab("account")}
              aria-label="マイページ"
            >
              <UserRound size={20} strokeWidth={2.3} />
            </button>
          </div>
        )}
      </header>

      {activeTab === "home" && (
        <main className="home-content">
          <div className="intro-line">
            <span className="intro-label">
              <span className="demo-event-tag">DEMO</span> みどりの森まつり
            </span>
            <span className="active-account-name">{activeAccount.name}</span>
          </div>
          <section className="wallet-section" aria-label="残高カード">
            <div className="wallet-scene">
              <button
                className="wallet-toggle"
                type="button"
                onClick={() => setFlipped((value) => !value)}
                aria-label={
                  flipped
                    ? "カードを裏返して残高を表示"
                    : "カードを裏返して支払い用デモQRを表示"
                }
                aria-pressed={flipped}
              >
                <div className={`wallet-card${flipped ? " is-flipped" : ""}`}>
                  <div className="wallet-face wallet-front">
                    <div className="wallet-glow" />
                    <div className="wallet-watermark">
                      <FesPayMark />
                    </div>
                    <div className="wallet-brand">
                      <FesPayMark />
                      <span>fespay</span>
                      <small>DEMO</small>
                    </div>
                    <div className="balance-block">
                      <span>{activeAccount.name}の残高</span>
                      <FittedBalance
                        className={balanceSizeClass}
                        value={yen(balance)}
                      />
                    </div>
                    <div className="wallet-footer">
                      <span className="flip-pill">
                        <ScanLine size={18} /> 支払いQRを表示{" "}
                        <ChevronRight size={16} />
                      </span>
                    </div>
                  </div>
                  <div className="wallet-face wallet-back">
                    <div className="qr-top">
                      <span>
                        <FesPayMark /> fespay
                      </span>
                      <span className="qr-demo-tag">DEMO</span>
                    </div>
                    <div className="qr-content">
                      <QRCodeSVG
                        value={DEMO_PAYMENT_QR_VALUE}
                        size={132}
                        level="M"
                        marginSize={4}
                        bgColor="#ffffff"
                        fgColor="#17234c"
                      />
                    </div>
                    <strong className="qr-title">支払い用デモQR</strong>
                    <span className="qr-warning">
                      実際の支払いには使用できません
                    </span>
                    <span className="qr-flip-hint">タップで残高へ戻る</span>
                  </div>
                </div>
              </button>
            </div>
            <div className="wallet-indicator" aria-hidden="true">
              <span className={!flipped ? "active" : ""} />
              <span className={flipped ? "active" : ""} />
            </div>
            <p className="wallet-caption">
              <Info size={13} /> 残高・QRはプロトタイプ用のサンプルです
            </p>
          </section>
          <section className="quick-actions" aria-label="主なメニュー">
            <button
              className="quick-action action-charge"
              type="button"
              onClick={() => setChargeOpen(true)}
            >
              <span className="action-orb">
                <Plus size={31} strokeWidth={2} />
              </span>
              <strong>チャージ</strong>
              <small>残高を増やす</small>
            </button>
            <button
              className="quick-action action-send"
              type="button"
              onClick={() => setSendOpen(true)}
            >
              <span className="action-orb">
                <Send size={27} strokeWidth={2} />
              </span>
              <strong>送る</strong>
              <small>友だちに送金</small>
            </button>
            <button
              className="quick-action action-history"
              type="button"
              onClick={() => setActiveTab("history")}
            >
              <span className="action-orb">
                <ReceiptText size={27} strokeWidth={2} />
              </span>
              <strong>履歴</strong>
              <small>利用履歴を確認</small>
            </button>
            <button
              className="quick-action action-stores"
              type="button"
              onClick={() => setModal("stores")}
            >
              <span className="action-orb">
                <Store size={28} strokeWidth={2} />
              </span>
              <strong>出店一覧</strong>
              <small>お店を探す</small>
            </button>
          </section>
          <section className="content-card event-card">
            <div className="section-heading">
              <span className="heading-title">
                <span className="section-icon mint">
                  <Megaphone size={17} fill="currentColor" />
                </span>
                注目のイベント <span className="sample-badge">サンプル</span>
              </span>
              <button
                className="more-link"
                type="button"
                onClick={() => setModal("event")}
              >
                もっと見る <ChevronRight size={16} />
              </button>
            </div>
            <button
              className="event-feature"
              type="button"
              onClick={() => setModal("event")}
            >
              <img
                src={festivalStalls}
                alt="学園祭や地域のお祭りの屋台と来場者のイメージ"
              />
              <span className="event-overlay" />
              <span className="event-info">
                <strong>みどりの森まつり 2026</strong>
                <span>
                  <CalendarDays size={15} /> 2026.10.9 (金) - 10.10 (土)
                </span>
                <span>
                  <MapPin size={15} /> みどりの森広場
                </span>
                <em>屋台と体験が集まる、楽しい2日間</em>
              </span>
            </button>
          </section>
          <div className="feature-grid">
            <section className="content-card mini-card shop-card">
              <div className="section-heading">
                <span className="heading-title">
                  <span className="section-icon orange">
                    <Store size={17} />
                  </span>
                  出店紹介
                </span>
                <button
                  className="more-link"
                  type="button"
                  onClick={() => setModal("stores")}
                >
                  もっと見る <ChevronRight size={15} />
                </button>
              </div>
              <button
                className="shop-feature"
                type="button"
                onClick={() => setModal("stores")}
              >
                <img src={festivalFood} alt="からあげ屋台のイメージ" />
                <span className="shop-copy">
                  <small>フードエリア A-01</small>
                  <strong>からあげ屋台</strong>
                </span>
              </button>
            </section>
            <section className="content-card mini-card notice-card">
              <div className="section-heading">
                <span className="heading-title">
                  <span className="section-icon purple">
                    <Megaphone size={17} fill="currentColor" />
                  </span>
                  お知らせ
                </span>
                <button
                  className="more-link"
                  type="button"
                  onClick={() => setModal("notice")}
                >
                  もっと見る <ChevronRight size={15} />
                </button>
              </div>
              <button
                className="notice-feature"
                type="button"
                onClick={() => setModal("notice")}
              >
                <span className="new-badge">NEW</span>
                <span>
                  <strong>
                    出店情報を
                    <br />
                    更新しました！
                  </strong>
                  <small>2026.10.01</small>
                </span>
                <ChevronRight size={17} />
              </button>
            </section>
          </div>
          <section className="content-card recent-card">
            <div className="section-heading">
              <span className="heading-title">最近の利用履歴</span>
              <button
                className="more-link"
                type="button"
                onClick={() => setActiveTab("history")}
              >
                もっと見る <ChevronRight size={16} />
              </button>
            </div>
            {transactions[0] ? (
              <TransactionRow transaction={transactions[0]} />
            ) : (
              <p className="transaction-empty">まだ利用履歴はありません。</p>
            )}
          </section>
        </main>
      )}

      {activeTab === "pay" && (
        <main className="payment-content">
          <section
            className="payment-qr-panel"
            aria-labelledby="payment-qr-heading"
          >
            <div className="payment-qr-panel-top">
              <h1 id="payment-qr-heading">支払い用QR</h1>
              <span className="payment-demo-tag">DEMO</span>
            </div>
            <div
              className="payment-qr-art"
              role="img"
              aria-label="支払い用デモQRコード"
            >
              <QRCodeSVG
                value={DEMO_PAYMENT_QR_VALUE}
                size={190}
                level="M"
                marginSize={4}
                bgColor="#ffffff"
                fgColor="#17234c"
              />
            </div>
            <p>お店のスタッフに、このQRを見せてください。</p>
            <span className="payment-qr-caption">
              読み取りやすいように画面を明るくしてください
            </span>
          </section>
          <section
            className={`payment-balance${balanceSizeClass ? " is-expanded" : ""}`}
            aria-label="現在の残高"
          >
            <span>
              <span>現在の残高</span>
              <small>{EVENT_NAME}</small>
            </span>
            <FittedBalance className={balanceSizeClass} value={yen(balance)} />
          </section>
          <button
            className="payment-scan-button"
            type="button"
            onClick={() => setModal("scan")}
          >
            <span className="payment-scan-icon">
              <ScanLine size={25} />
            </span>
            <span className="payment-scan-copy">
              <strong>QRをスキャンする</strong>
              <small>お店のQRを読み取る</small>
            </span>
            <ChevronRight size={20} />
          </button>
          <p className="payment-note">
            <Info size={15} /> この画面はデモです。実際の支払いはできません。
          </p>
        </main>
      )}

      {activeTab === "history" && <HistoryView transactions={transactions} />}
      {activeTab === "account" && (
        <main className="subpage-content">
          <div className="subpage-header">
            <span className="eyebrow">MY PAGE</span>
            <h1>マイページ</h1>
            <p>FesPay のフロントエンドデモです。</p>
          </div>
          <div className="account-hero">
            <div className="account-avatar">
              <UserRound size={32} />
            </div>
            <span>
              <strong>{activeAccount.name}</strong>
              <small>VISITOR · {activeAccount.id}</small>
            </span>
          </div>
          <div className="content-card account-balance">
            <span>みどりの森まつりの残高</span>
            <FittedBalance className={balanceSizeClass} value={yen(balance)} />
            <small>デモデータはこのブラウザーに保存されます</small>
          </div>
          <section
            className="content-card demo-accounts"
            aria-label="デモアカウントの切り替え"
          >
            <h2>デモアカウントを切り替える</h2>
            <p>送金先の残高と受取履歴を、このブラウザーで確認できます。</p>
            <div className="demo-account-list">
              {ledger.accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  aria-pressed={account.id === activeAccount.id}
                  onClick={() => {
                    selectAccount(account.id);
                    setActiveTab("home");
                    setFlipped(false);
                    setToast(`${account.name}に切り替えました`);
                  }}
                >
                  <span className="demo-account-avatar">
                    <UserRound size={18} />
                  </span>
                  <span className="demo-account-copy">
                    <strong>{account.name}</strong>
                    <small>
                      ID {account.id} · {yen(account.balance)}
                    </small>
                  </span>
                  {account.id === activeAccount.id ? (
                    <Check size={19} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </button>
              ))}
            </div>
          </section>
          <div className="content-card account-links">
            <button type="button" onClick={() => setModal("notifications")}>
              <Bell size={21} /> お知らせ <ChevronRight size={18} />
            </button>
            <button type="button" onClick={() => setModal("stores")}>
              <Store size={21} /> 出店一覧 <ChevronRight size={18} />
            </button>
          </div>
          <button
            className="demo-reset"
            type="button"
            onClick={() => setModal("reset")}
          >
            デモデータを最初からやり直す
          </button>
        </main>
      )}

      {activeTab !== "pay" && (
        <nav className="bottom-nav" aria-label="画面ナビゲーション">
          <button
            className={activeTab === "home" ? "active" : ""}
            type="button"
            onClick={goHome}
          >
            <House
              size={25}
              fill={activeTab === "home" ? "currentColor" : "none"}
            />
            <span>ホーム</span>
          </button>
          <button
            className="payment-nav-button"
            type="button"
            onClick={showPay}
          >
            <ScanLine size={25} />
            <span>支払い</span>
          </button>
          <button
            className={activeTab === "history" ? "active" : ""}
            type="button"
            onClick={() => setActiveTab("history")}
          >
            <ReceiptText size={25} />
            <span>履歴</span>
          </button>
        </nav>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={modalLabels[modal]}
            ref={modalRef}
          >
            <div className="modal-handle" />
            <button
              className="modal-close"
              type="button"
              onClick={() => setModal(null)}
              aria-label="閉じる"
            >
              <X size={20} />
            </button>
            {modal === "stores" && (
              <>
                <span className="modal-icon orange">
                  <Store size={25} />
                </span>
                <h2>出店一覧</h2>
                <p>サンプルイベントの出店イメージです。</p>
                <div className="modal-list">
                  <div>
                    <span>🍙</span>
                    <strong>からあげ屋台</strong>
                    <small>フードエリア A-01</small>
                  </div>
                  <div>
                    <span>🥤</span>
                    <strong>青空ドリンク</strong>
                    <small>フードエリア A-02</small>
                  </div>
                  <div>
                    <span>🎨</span>
                    <strong>手づくり雑貨</strong>
                    <small>マーケット B-03</small>
                  </div>
                </div>
              </>
            )}
            {modal === "event" && (
              <>
                <span className="modal-icon mint">
                  <CalendarDays size={25} />
                </span>
                <h2>みどりの森まつり 2026</h2>
                <p>
                  イベント情報の表示サンプルです。開催内容・日程・会場は仮のデータです。
                </p>
                <div className="event-modal-image">
                  <img
                    src={festivalStalls}
                    alt="学園祭や地域のお祭りの屋台と来場者のイメージ"
                  />
                </div>
                <div className="modal-detail">
                  <CalendarDays size={18} /> 2026年10月9日（金）– 10日（土）
                </div>
                <div className="modal-detail">
                  <MapPin size={18} /> みどりの森広場
                </div>
              </>
            )}
            {modal === "notice" && (
              <>
                <span className="modal-icon purple">
                  <Megaphone size={25} />
                </span>
                <h2>お知らせ</h2>
                <p>サンプルイベントの出店情報を更新しました！</p>
                <div className="notice-detail">
                  屋台や手づくり雑貨など、会場の出店イメージを見られます。
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setModal("stores")}
                >
                  出店一覧を見る
                </button>
              </>
            )}
            {modal === "scan" && (
              <>
                <span className="modal-icon mint">
                  <ScanLine size={25} />
                </span>
                <h2>QRをスキャンする</h2>
                <p>お店のQRを読み取る画面です。</p>
                <div className="scan-demo" aria-label="QRスキャンのデモ画面">
                  <span className="scan-demo-frame">
                    <ScanLine size={54} />
                  </span>
                  <strong>スキャン画面（デモ）</strong>
                </div>
                <div className="notice-detail">
                  このプロトタイプでは、カメラでの読み取りと決済はまだ利用できません。
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setModal(null)}
                >
                  支払い画面に戻る
                </button>
              </>
            )}
            {modal === "notifications" && (
              <>
                <span className="modal-icon purple">
                  <Bell size={25} />
                </span>
                <h2>お知らせ</h2>
                <p>出店情報を更新しました！</p>
                <div className="notice-detail">
                  ホーム画面のイベント・出店・お知らせはサンプル表示です。
                </div>
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => setModal("stores")}
                >
                  出店一覧を見る
                </button>
              </>
            )}
            {modal === "reset" && (
              <>
                <span className="modal-icon purple">
                  <Info size={25} />
                </span>
                <h2>デモデータを初期化</h2>
                <p>
                  このブラウザーに保存したデモ残高と取引履歴を最初の状態に戻します。
                </p>
                <div className="reset-actions">
                  <button type="button" onClick={() => setModal(null)}>
                    やめる
                  </button>
                  <button type="button" onClick={() => void resetDemoData()}>
                    初期化する
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {chargeOpen && (
        <ChargeFlow
          balance={balance}
          eventName={EVENT_NAME}
          displayName={activeAccount.name}
          verificationCode={VERIFICATION_CODE}
          onClose={() => setChargeOpen(false)}
          onComplete={completeCharge}
        />
      )}
      {sendOpen && (
        <SendFlow
          balance={balance}
          senderName={activeAccount.name}
          recipients={ledger.accounts
            .filter((account) => account.id !== activeAccount.id)
            .map(({ id, name }) => ({ id, name }))}
          onClose={() => setSendOpen(false)}
          onSend={completeTransfer}
        />
      )}
    </div>
  );
}

export default App;
