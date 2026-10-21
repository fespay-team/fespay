import {
  CalendarDays,
  ChevronRight,
  Info,
  MapPin,
  Megaphone,
  Plus,
  ScanLine,
  Send,
  Store,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import FittedBalance from "../FittedBalance";
import { formatYen as yen } from "../money";
import type { DemoAccount, Transaction } from "../domain/ledger.ts";
import { DEMO_PAYMENT_QR_VALUE, TransactionRow } from "./AppShared";
import BrandLogo from "./BrandLogo";
import festivalFood320 from "../assets/festival-food-320.jpg";
import festivalFood640 from "../assets/festival-food-640.jpg";
import festivalStalls480 from "../assets/festival-stalls-480.jpg";
import festivalStalls960 from "../assets/festival-stalls-960.jpg";

type HomePageProps = {
  activeAccount: DemoAccount;
  balance: bigint;
  balanceSizeClass: string;
  transactions: Transaction[];
  flipped: boolean;
  onToggleCard: () => void;
  onCharge: () => void;
  onSend: () => void;
  onHistory: () => void;
  onStores: () => void;
  onEvent: () => void;
  onNotice: () => void;
};

export default function HomePage({
  activeAccount,
  balance,
  balanceSizeClass,
  transactions,
  flipped,
  onToggleCard,
  onCharge,
  onSend,
  onHistory,
  onStores,
  onEvent,
  onNotice,
}: HomePageProps) {
  return (
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
            onClick={onToggleCard}
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
                <div className="wallet-brand">
                  <BrandLogo />
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
                    <BrandLogo />
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
          onClick={onCharge}
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
          onClick={onSend}
        >
          <span className="action-orb">
            <Send size={27} strokeWidth={2} />
          </span>
          <strong>送る</strong>
          <small>友だちに送金</small>
        </button>
        <button
          className="quick-action action-stores"
          type="button"
          onClick={onStores}
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
          <button className="more-link" type="button" onClick={onEvent}>
            もっと見る <ChevronRight size={16} />
          </button>
        </div>
        <button className="event-feature" type="button" onClick={onEvent}>
          <img
            src={festivalStalls480}
            srcSet={festivalStalls480 + " 480w, " + festivalStalls960 + " 960w"}
            sizes="(max-width: 460px) calc(100vw - 56px), 404px"
            loading="lazy"
            decoding="async"
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
            <button className="more-link" type="button" onClick={onStores}>
              もっと見る <ChevronRight size={15} />
            </button>
          </div>
          <button className="shop-feature" type="button" onClick={onStores}>
            <img
              src={festivalFood320}
              srcSet={festivalFood320 + " 320w, " + festivalFood640 + " 640w"}
              sizes="(max-width: 350px) calc(100vw - 68px), 200px"
              loading="lazy"
              decoding="async"
              alt="からあげ屋台のイメージ"
            />
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
            <button className="more-link" type="button" onClick={onNotice}>
              もっと見る <ChevronRight size={15} />
            </button>
          </div>
          <button className="notice-feature" type="button" onClick={onNotice}>
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
          <button className="more-link" type="button" onClick={onHistory}>
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
  );
}
