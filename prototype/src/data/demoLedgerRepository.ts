import {
  initialLedger,
  type DemoAccount,
  type DemoLedger,
  type LedgerChange,
  type Transaction,
} from "../domain/ledger.ts";
import { parseStoredAmount, stringifyMoney } from "../money.ts";

export const LEDGER_STORAGE_KEY = "fespay-demo-ledger-v3";
const PREVIOUS_LEDGER_STORAGE_KEY = "fespay-demo-ledger-v2";
const LEGACY_LEDGER_STORAGE_KEY = "fespay-demo-ledger-v1";

export type StoragePort = Pick<Storage, "getItem" | "setItem">;
export type CommitDependencies = {
  storage?: StoragePort;
  withLock?: <T>(work: () => T) => Promise<T>;
};

export function parseTransaction(value: unknown): Transaction | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const amount = parseStoredAmount(raw.amount);
  const kind = raw.kind;
  const outgoing = kind === "payment" || kind === "transfer_sent";
  const incoming = kind === "charge" || kind === "transfer_received";
  if (
    typeof raw.id !== "string" ||
    typeof raw.title !== "string" ||
    typeof raw.date !== "string" ||
    amount === null ||
    (!outgoing && !incoming) ||
    (outgoing && amount >= 0n) ||
    (incoming && amount <= 0n)
  )
    return null;

  let charge: Transaction["charge"];
  if (raw.charge !== undefined) {
    if (!raw.charge || typeof raw.charge !== "object") return null;
    const item = raw.charge as Record<string, unknown>;
    const chargeAmount = parseStoredAmount(item.amount);
    const balanceAfter = parseStoredAmount(item.balanceAfter);
    if (
      typeof item.transactionId !== "string" ||
      typeof item.completedAt !== "string" ||
      typeof item.eventName !== "string" ||
      typeof item.displayName !== "string" ||
      typeof item.verificationCode !== "string" ||
      chargeAmount === null ||
      chargeAmount <= 0n ||
      balanceAfter === null ||
      balanceAfter < 0n
    )
      return null;
    charge = {
      transactionId: item.transactionId,
      amount: chargeAmount,
      completedAt: item.completedAt,
      eventName: item.eventName,
      displayName: item.displayName,
      verificationCode: item.verificationCode,
      balanceAfter,
    };
  }

  let transfer: Transaction["transfer"];
  if (raw.transfer !== undefined) {
    if (!raw.transfer || typeof raw.transfer !== "object") return null;
    const item = raw.transfer as Record<string, unknown>;
    if (
      typeof item.counterpartyId !== "string" ||
      typeof item.counterpartyName !== "string" ||
      typeof item.message !== "string" ||
      typeof item.completedAt !== "string"
    )
      return null;
    transfer = {
      counterpartyId: item.counterpartyId,
      counterpartyName: item.counterpartyName,
      message: item.message,
      completedAt: item.completedAt,
    };
  }

  if (
    (charge && kind !== "charge") ||
    (transfer && kind !== "transfer_sent" && kind !== "transfer_received")
  )
    return null;

  return {
    id: raw.id,
    title: raw.title,
    date: raw.date,
    amount,
    kind,
    ...(charge ? { charge } : {}),
    ...(transfer ? { transfer } : {}),
  };
}

export function parseTransactions(value: unknown): Transaction[] | null {
  if (!Array.isArray(value)) return null;
  const transactions: Transaction[] = [];
  for (const item of value) {
    const transaction = parseTransaction(item);
    if (!transaction) return null;
    transactions.push(transaction);
  }
  return transactions;
}

export function parseDemoLedger(value: unknown): DemoLedger | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.activeAccountId !== "string" ||
    !Array.isArray(raw.accounts) ||
    raw.accounts.length !== initialLedger.accounts.length
  )
    return null;
  // The demo has a fixed account roster. Reject reordered or renamed entries
  // rather than silently assigning a saved balance to another sample person.
  const accounts: DemoAccount[] = [];
  for (const [index, value] of raw.accounts.entries()) {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const balance = parseStoredAmount(item.balance);
    const transactions = parseTransactions(item.transactions);
    if (
      item.id !== initialLedger.accounts[index].id ||
      item.name !== initialLedger.accounts[index].name ||
      balance === null ||
      balance < 0n ||
      !transactions
    )
      return null;
    accounts.push({ id: item.id, name: item.name, balance, transactions });
  }
  if (!accounts.some((account) => account.id === raw.activeAccountId))
    return null;
  return { activeAccountId: raw.activeAccountId, accounts };
}

export function migrateLegacyLedger(value: unknown): DemoLedger | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const balance = parseStoredAmount(raw.balance);
  const transactions = parseTransactions(raw.transactions);
  if (balance === null || balance < 0n || !transactions) return null;
  // v1 stored one balance/history, belonging to the original active account.
  return {
    ...initialLedger,
    accounts: initialLedger.accounts.map((account) =>
      account.id === initialLedger.activeAccountId
        ? { ...account, balance, transactions }
        : account,
    ),
  };
}

type VersionRead =
  { status: "missing" | "invalid" } | { status: "valid"; ledger: DemoLedger };

function readVersion(
  storage: StoragePort,
  key: string,
  decode: (value: unknown) => DemoLedger | null,
): VersionRead {
  const stored = storage.getItem(key);
  if (stored === null) return { status: "missing" };
  try {
    const ledger = decode(JSON.parse(stored));
    return ledger ? { status: "valid", ledger } : { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
}

function readStoredLedger(
  storage: StoragePort,
  mode: "startup" | "commit",
): DemoLedger {
  const current = readVersion(storage, LEDGER_STORAGE_KEY, parseDemoLedger);
  if (current.status === "valid") return current.ledger;
  // Startup may recover from damaged data. A commit must leave a damaged v3
  // untouched, rather than replacing it with an older version or sample data.
  if (mode === "commit" && current.status === "invalid") {
    throw new Error("保存済みのデモデータを読み込めません。");
  }

  const previous = readVersion(
    storage,
    PREVIOUS_LEDGER_STORAGE_KEY,
    parseDemoLedger,
  );
  if (previous.status === "valid") return previous.ledger;

  const legacy = readVersion(
    storage,
    LEGACY_LEDGER_STORAGE_KEY,
    migrateLegacyLedger,
  );
  return legacy.status === "valid" ? legacy.ledger : initialLedger;
}

// Startup may fall back through older versions and ultimately to sample data.
export function loadDemoLedger(storage?: StoragePort): DemoLedger {
  try {
    // Accessing the storage property itself can throw when browser storage is
    // disabled. Startup still needs to render the sample ledger in that case.
    return readStoredLedger(storage ?? window.localStorage, "startup");
  } catch {
    return initialLedger;
  }
}

// Commits must reject damaged current data so they cannot erase it silently.
export function readLedgerForCommit(
  storage: StoragePort = window.localStorage,
): DemoLedger {
  return readStoredLedger(storage, "commit");
}

function withBrowserLock<T>(work: () => T): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("このブラウザーでは安全にデモデータを保存できません。");
  }
  return navigator.locks.request(
    LEDGER_STORAGE_KEY,
    { mode: "exclusive" },
    work,
  );
}

export async function commitDemoLedger<T>(
  mutate: (latest: DemoLedger) => LedgerChange<T> | null,
  deps: CommitDependencies = {},
): Promise<{ ledger: DemoLedger; result: T | null }> {
  const storage = deps.storage ?? window.localStorage;
  const withLock = deps.withLock ?? withBrowserLock;
  return withLock(() => {
    const latest = readLedgerForCommit(storage);
    const change = mutate(latest);
    if (!change) return { ledger: latest, result: null };
    storage.setItem(LEDGER_STORAGE_KEY, stringifyMoney(change.next));
    return { ledger: change.next, result: change.result };
  });
}

export async function resetStoredDemoLedger(
  deps: CommitDependencies = {},
): Promise<DemoLedger> {
  const storage = deps.storage ?? window.localStorage;
  const withLock = deps.withLock ?? withBrowserLock;
  return withLock(() => {
    storage.setItem(LEDGER_STORAGE_KEY, stringifyMoney(initialLedger));
    return initialLedger;
  });
}
