export type ChargeOutcome = {
  transactionId: string;
  amount: bigint;
  completedAt: string;
  eventName: string;
  displayName: string;
  verificationCode: string;
  balanceAfter: bigint;
};

export type SendReceipt = {
  transactionId: string;
  recipientName: string;
  amount: bigint;
  completedAt: string;
  balanceAfter: bigint;
};

// Older sample entries have no charge/transfer details; new transactions add
// details only for their matching kind.
export type Transaction = {
  id: string;
  title: string;
  date: string;
  amount: bigint;
  kind: "payment" | "charge" | "transfer_sent" | "transfer_received";
  charge?: ChargeOutcome;
  transfer?: {
    counterpartyId: string;
    counterpartyName: string;
    message: string;
    completedAt: string;
  };
};

export type DemoAccount = {
  id: string;
  name: string;
  balance: bigint;
  transactions: Transaction[];
};

export type DemoLedger = { activeAccountId: string; accounts: DemoAccount[] };
export type LedgerChange<T> = { next: DemoLedger; result: T };

const initialTransactions: Transaction[] = [
  {
    id: "sample-payment-1",
    title: "からあげ屋台",
    date: "10月9日 13:21",
    amount: -850n,
    kind: "payment",
  },
  {
    id: "sample-charge-1",
    title: "デモチャージ",
    date: "10月9日 12:05",
    amount: 3000n,
    kind: "charge",
  },
  {
    id: "sample-payment-2",
    title: "青空ドリンク",
    date: "10月9日 11:38",
    amount: -500n,
    kind: "payment",
  },
];

export const initialLedger: DemoLedger = {
  activeAccountId: "001",
  accounts: [
    {
      id: "001",
      name: "デモ来場者",
      balance: 12800n,
      transactions: initialTransactions,
    },
    { id: "002", name: "佐藤 はな", balance: 3200n, transactions: [] },
    { id: "003", name: "田中 そうた", balance: 7600n, transactions: [] },
    { id: "004", name: "山本 りん", balance: 1400n, transactions: [] },
  ],
};

const displayDate = (completedAt: string): string =>
  new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(completedAt));

// These functions only derive a new ledger. The repository handles locking and
// persistence, so both decisions are made against the latest stored balance.
export function applyCharge(
  latest: DemoLedger,
  accountId: string,
  outcome: ChargeOutcome,
): LedgerChange<ChargeOutcome> | null {
  const account = latest.accounts.find((item) => item.id === accountId);
  if (
    !account ||
    outcome.amount <= 0n ||
    account.transactions.some((item) => item.id === outcome.transactionId)
  )
    return null;

  const charge: ChargeOutcome = {
    ...outcome,
    balanceAfter: account.balance + outcome.amount,
  };
  return {
    next: {
      ...latest,
      accounts: latest.accounts.map((item) =>
        item.id === accountId
          ? {
              ...item,
              balance: charge.balanceAfter,
              transactions: [
                {
                  id: outcome.transactionId,
                  title: "現金チャージ（デモ）",
                  date: displayDate(outcome.completedAt),
                  amount: outcome.amount,
                  kind: "charge" as const,
                  charge,
                },
                ...item.transactions,
              ],
            }
          : item,
      ),
    },
    result: charge,
  };
}

export function applyTransfer(
  latest: DemoLedger,
  senderId: string,
  recipientId: string,
  amount: bigint,
  message: string,
  completedAt: string,
  transactionId: string,
): LedgerChange<SendReceipt> | null {
  const sender = latest.accounts.find((account) => account.id === senderId);
  const recipient = latest.accounts.find(
    (account) => account.id === recipientId,
  );
  if (
    !sender ||
    !recipient ||
    recipientId === senderId ||
    amount <= 0n ||
    amount > sender.balance ||
    message.length > 50
  )
    return null;

  const date = displayDate(completedAt);
  const balanceAfter = sender.balance - amount;
  return {
    next: {
      ...latest,
      accounts: latest.accounts.map((account) => {
        if (account.id === senderId) {
          return {
            ...account,
            balance: balanceAfter,
            transactions: [
              {
                id: transactionId,
                title: `${recipient.name}さんへ送金`,
                date,
                amount: -amount,
                kind: "transfer_sent" as const,
                transfer: {
                  counterpartyId: recipient.id,
                  counterpartyName: recipient.name,
                  message,
                  completedAt,
                },
              },
              ...account.transactions,
            ],
          };
        }
        if (account.id === recipientId) {
          return {
            ...account,
            balance: account.balance + amount,
            transactions: [
              {
                id: transactionId,
                title: `${sender.name}さんから受け取り`,
                date,
                amount,
                kind: "transfer_received" as const,
                transfer: {
                  counterpartyId: sender.id,
                  counterpartyName: sender.name,
                  message,
                  completedAt,
                },
              },
              ...account.transactions,
            ],
          };
        }
        return account;
      }),
    },
    result: {
      transactionId,
      recipientName: recipient.name,
      amount,
      completedAt,
      balanceAfter,
    },
  };
}
