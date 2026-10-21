import { Bell, Check, ChevronRight, Store, UserRound } from "lucide-react";
import FittedBalance from "../FittedBalance";
import { formatYen as yen } from "../money";
import type { DemoAccount } from "../domain/ledger.ts";

type AccountPageProps = {
  activeAccount: DemoAccount;
  accounts: DemoAccount[];
  balance: bigint;
  balanceSizeClass: string;
  onSelectAccount: (accountId: string) => void;
  onNotifications: () => void;
  onStores: () => void;
  onReset: () => void;
};

export default function AccountPage({
  activeAccount,
  accounts,
  balance,
  balanceSizeClass,
  onSelectAccount,
  onNotifications,
  onStores,
  onReset,
}: AccountPageProps) {
  return (
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
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              aria-pressed={account.id === activeAccount.id}
              onClick={() => onSelectAccount(account.id)}
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
        <button type="button" onClick={onNotifications}>
          <Bell size={21} /> お知らせ <ChevronRight size={18} />
        </button>
        <button type="button" onClick={onStores}>
          <Store size={21} /> 出店一覧 <ChevronRight size={18} />
        </button>
      </div>
      <button className="demo-reset" type="button" onClick={onReset}>
        デモデータを最初からやり直す
      </button>
    </main>
  );
}
