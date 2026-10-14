import { useState } from "react";
import { ArrowDownLeft, ChevronDown, Plus, ReceiptText, Search, Send, UtensilsCrossed, X } from "lucide-react";
import "./history-view.css";

type HistoryTransaction = {
  id: string;
  title: string;
  date: string;
  amount: number;
  kind: "payment" | "charge" | "transfer_sent" | "transfer_received";
  charge?: { completedAt?: string };
  transfer?: {
    counterpartyId: string;
    counterpartyName: string;
    message: string;
    completedAt: string;
  };
};

type HistoryViewProps = {
  transactions: HistoryTransaction[];
};

type Filter = "all" | HistoryTransaction["kind"];

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "payment", label: "支払い" },
  { value: "charge", label: "チャージ" },
  { value: "transfer_sent", label: "送金" },
  { value: "transfer_received", label: "受け取り" },
];

const kindLabel = (kind: HistoryTransaction["kind"]) =>
  filters.find((filter) => filter.value === kind)?.label ?? "取引";

const formatAmount = (amount: number) =>
  `${amount >= 0 ? "+" : "−"} ¥${Math.abs(amount).toLocaleString("ja-JP")}`;

export default function HistoryView({ transactions }: HistoryViewProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase("ja-JP");
  const visibleTransactions = transactions.filter(
    (transaction) =>
      (filter === "all" || transaction.kind === filter) &&
      (!normalizedQuery ||
        transaction.title.toLocaleLowerCase("ja-JP").includes(normalizedQuery) ||
        transaction.id.toLocaleLowerCase("ja-JP").includes(normalizedQuery) ||
        transaction.transfer?.counterpartyId.toLocaleLowerCase("ja-JP").includes(normalizedQuery) ||
        transaction.transfer?.message.toLocaleLowerCase("ja-JP").includes(normalizedQuery)),
  );

  const resetFilters = () => {
    setQuery("");
    setFilter("all");
  };

  return (
    <main className="subpage-content history-view">
      <div className="subpage-header">
        <span className="eyebrow">ACTIVITY</span>
        <h1>利用履歴</h1>
        <p>この履歴はブラウザー内のデモデータです。実際の決済記録ではありません。</p>
      </div>

      <section className="content-card history-view-card" aria-label="利用履歴の検索と一覧">
        <div className="history-search">
          <Search size={18} aria-hidden="true" />
          <label className="history-visually-hidden" htmlFor="history-search-input">
            相手・店舗名・取引IDで検索
          </label>
          <input
            id="history-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="相手・店舗名・取引IDで検索"
          />
          {query && (
            <button
              type="button"
              aria-label="検索語を消去"
              onClick={() => setQuery("")}
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="history-filters" role="group" aria-label="取引の種類で絞り込み">
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="history-list-heading">
          <strong>取引一覧</strong>
          <span aria-live="polite">{visibleTransactions.length}件表示</span>
        </div>

        {visibleTransactions.length > 0 ? (
          <div className="history-list">
            {visibleTransactions.map((transaction) => (
              <details className="history-entry" key={transaction.id}>
                <summary>
                  <span className={`history-entry-icon ${transaction.kind}`} aria-hidden="true">
                    {transaction.kind === "charge" ? (
                      <Plus size={22} strokeWidth={2.5} />
                    ) : transaction.kind === "transfer_sent" ? (
                      <Send size={18} strokeWidth={2.2} />
                    ) : transaction.kind === "transfer_received" ? (
                      <ArrowDownLeft size={20} strokeWidth={2.2} />
                    ) : (
                      <UtensilsCrossed size={18} strokeWidth={2.2} />
                    )}
                  </span>
                  <span className="history-entry-main">
                    <strong>{transaction.title}</strong>
                    <small>{transaction.date} · {kindLabel(transaction.kind)}</small>
                  </span>
                  <span className={`history-entry-amount ${transaction.amount >= 0 ? "positive" : ""}`}>
                    {formatAmount(transaction.amount)}
                  </span>
                  <ChevronDown className="history-entry-chevron" size={17} aria-hidden="true" />
                </summary>
                <dl className="history-entry-details">
                  <div>
                    <dt>取引種別</dt>
                    <dd>{kindLabel(transaction.kind)}</dd>
                  </div>
                  <div>
                    <dt>{transaction.kind === "charge" ? "チャージ名" : "店舗・相手先"}</dt>
                    <dd>{transaction.title}</dd>
                  </div>
                  {transaction.transfer && (
                    <div>
                      <dt>相手のデモID</dt>
                      <dd>{transaction.transfer.counterpartyId}</dd>
                    </div>
                  )}
                  {transaction.transfer?.message && (
                    <div>
                      <dt>メッセージ</dt>
                      <dd>{transaction.transfer.message}</dd>
                    </div>
                  )}
                  <div>
                    <dt>日時</dt>
                    <dd>{transaction.date}</dd>
                  </div>
                  <div>
                    <dt>金額</dt>
                    <dd>{formatAmount(transaction.amount)}</dd>
                  </div>
                  <div>
                    <dt>状態</dt>
                    <dd>{transaction.charge || transaction.transfer ? "デモ操作完了" : "サンプルデータ"}</dd>
                  </div>
                  <div>
                    <dt>取引ID</dt>
                    <dd className="history-entry-id">{transaction.id}</dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
        ) : (
          <div className="history-empty" role="status">
            <ReceiptText size={26} aria-hidden="true" />
            <strong>{transactions.length === 0 ? "取引履歴はまだありません" : "該当する取引がありません"}</strong>
            <p>
              {transactions.length === 0
                ? "デモで取引を行うと、ここに表示されます。"
                : "検索語や絞り込みを変えてお試しください。"}
            </p>
            {transactions.length > 0 && (query || filter !== "all") && (
              <button type="button" onClick={resetFilters}>絞り込みを解除</button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
