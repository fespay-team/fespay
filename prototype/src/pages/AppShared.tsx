import { ArrowDownLeft, Plus, Send, UtensilsCrossed } from "lucide-react";
import { formatYen as yen } from "../money";
import type { Transaction } from "../domain/ledger.ts";

export const DEMO_PAYMENT_QR_VALUE = "FESPAY-DEMO-PAYMENT-QR-NOT-VALID";

export function StatusBar() {
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

export function TransactionRow({ transaction }: { transaction: Transaction }) {
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
