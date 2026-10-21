import { useEffect, useLayoutEffect, useState } from "react";
import {
  Bell,
  Check,
  House,
  ReceiptText,
  ScanLine,
  UserRound,
  X,
} from "lucide-react";
import ChargeFlow from "./ChargeFlow";
import HistoryView from "./HistoryView";
import SendFlow from "./SendFlow";
import { useDemoLedger } from "./hooks/useDemoLedger.ts";
import { AccountPage, HomePage, InfoModal, PaymentPage } from "./pages";
import type { Modal } from "./pages";
import { StatusBar } from "./pages/AppShared";
import BrandLogo from "./pages/BrandLogo";
import "./payment.css";

type Tab = "home" | "pay" | "history" | "account";

const EVENT_NAME = "みどりの森まつり";
const VERIFICATION_CODE = "4827";

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
  const [modal, setModal] = useState<Modal | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [toast, setToast] = useState("");

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
  const selectDemoAccount = (accountId: string) => {
    const account = ledger.accounts.find((item) => item.id === accountId);
    if (!account) return;
    selectAccount(accountId);
    setActiveTab("home");
    setFlipped(false);
    setToast(`${account.name}に切り替えました`);
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
            <BrandLogo className="brand-mark" />
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
        <HomePage
          activeAccount={activeAccount}
          balance={balance}
          balanceSizeClass={balanceSizeClass}
          transactions={transactions}
          flipped={flipped}
          onToggleCard={() => setFlipped((value) => !value)}
          onCharge={() => setChargeOpen(true)}
          onSend={() => setSendOpen(true)}
          onHistory={() => setActiveTab("history")}
          onStores={() => setModal("stores")}
          onEvent={() => setModal("event")}
          onNotice={() => setModal("notice")}
        />
      )}
      {activeTab === "pay" && (
        <PaymentPage
          balance={balance}
          balanceSizeClass={balanceSizeClass}
          eventName={EVENT_NAME}
          onScan={() => setModal("scan")}
        />
      )}
      {activeTab === "history" && <HistoryView transactions={transactions} />}
      {activeTab === "account" && (
        <AccountPage
          activeAccount={activeAccount}
          accounts={ledger.accounts}
          balance={balance}
          balanceSizeClass={balanceSizeClass}
          onSelectAccount={selectDemoAccount}
          onNotifications={() => setModal("notifications")}
          onStores={() => setModal("stores")}
          onReset={() => setModal("reset")}
        />
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
        <InfoModal
          modal={modal}
          onClose={() => setModal(null)}
          onOpenStores={() => setModal("stores")}
          onReset={() => void resetDemoData()}
        />
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
