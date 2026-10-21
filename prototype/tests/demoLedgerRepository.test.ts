import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCharge,
  applyTransfer,
  initialLedger,
  type ChargeOutcome,
} from "../src/domain/ledger.ts";
import {
  LEDGER_STORAGE_KEY,
  commitDemoLedger,
  loadDemoLedger,
  parseTransaction,
  readLedgerForCommit,
  type StoragePort,
} from "../src/data/demoLedgerRepository.ts";
import { stringifyMoney } from "../src/money.ts";

const completedAt = "2026-10-15T00:00:00.000Z";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  let failWrites = false;
  const storage: StoragePort = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new DOMException("No space", "QuotaExceededError");
      data.set(key, value);
    },
  };
  return {
    data,
    storage,
    rejectWrites: () => {
      failWrites = true;
    },
  };
}

const noLock = async <T>(work: () => T): Promise<T> => work();

test("取引種別と異なる詳細データを保存値として受け付けない", () => {
  const charge = {
    transactionId: "charge-1",
    amount: 1000n,
    completedAt,
    eventName: "test",
    displayName: "test",
    verificationCode: "1",
    balanceAfter: 1000n,
  };
  const paymentWithCharge = JSON.parse(
    stringifyMoney({ ...initialLedger.accounts[0].transactions[0], charge }),
  );
  assert.equal(parseTransaction(paymentWithCharge), null);

  const transfer = {
    counterpartyId: "002",
    counterpartyName: "佐藤 はな",
    message: "test",
    completedAt,
  };
  const chargeWithTransfer = JSON.parse(
    stringifyMoney({ ...initialLedger.accounts[0].transactions[1], transfer }),
  );
  assert.equal(parseTransaction(chargeWithTransfer), null);
});

function serialLock(): <T>(work: () => T) => Promise<T> {
  let tail = Promise.resolve();
  return async <T>(work: () => T): Promise<T> => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return work();
    } finally {
      release();
    }
  };
}

test("旧形式を復元し、破損した現行データは確定時に上書きしない", async () => {
  const oldLedger = {
    ...initialLedger,
    accounts: initialLedger.accounts.map((account) =>
      account.id === "001" ? { ...account, balance: 4700n } : account,
    ),
  };
  const memory = memoryStorage({
    [LEDGER_STORAGE_KEY]: "{broken-json",
    "fespay-demo-ledger-v2": stringifyMoney(oldLedger),
  });
  assert.equal(loadDemoLedger(memory.storage).accounts[0]?.balance, 4700n);
  assert.throws(
    () => readLedgerForCommit(memory.storage),
    /保存済みのデモデータ/,
  );
  await assert.rejects(
    commitDemoLedger(
      (ledger) =>
        applyCharge(ledger, "001", {
          transactionId: "must-not-save",
          amount: 1000n,
          completedAt,
          eventName: "test",
          displayName: "test",
          verificationCode: "1",
          balanceAfter: 0n,
        }),
      { storage: memory.storage, withLock: noLock },
    ),
    /保存済みのデモデータ/,
  );
  assert.equal(memory.data.get(LEDGER_STORAGE_KEY), "{broken-json");
});

test("v1形式から安全な整数の残高と履歴を移行する", () => {
  const memory = memoryStorage({
    "fespay-demo-ledger-v1": stringifyMoney({
      balance: 4700,
      transactions: initialLedger.accounts[0]?.transactions,
    }),
  });
  assert.equal(readLedgerForCommit(memory.storage).accounts[0]?.balance, 4700n);
  assert.equal(
    readLedgerForCommit(memory.storage).accounts[0]?.transactions.length,
    3,
  );
});

test("現行データがなくv2が破損している場合は有効なv1を移行する", () => {
  const memory = memoryStorage({
    "fespay-demo-ledger-v2": "{broken-json",
    "fespay-demo-ledger-v1": stringifyMoney({
      balance: 4700,
      transactions: initialLedger.accounts[0]?.transactions,
    }),
  });
  assert.equal(loadDemoLedger(memory.storage).accounts[0]?.balance, 4700n);
  assert.equal(readLedgerForCommit(memory.storage).accounts[0]?.balance, 4700n);
  assert.equal(memory.data.get(LEDGER_STORAGE_KEY), undefined);
});

test("初期表示だけは破損した保存データから初期値へ戻れる", () => {
  const memory = memoryStorage({
    [LEDGER_STORAGE_KEY]: "{broken-json",
    "fespay-demo-ledger-v2": "{broken-json",
    "fespay-demo-ledger-v1": "{broken-json",
  });
  assert.equal(loadDemoLedger(memory.storage).accounts[0]?.balance, 12800n);
  assert.throws(
    () => readLedgerForCommit(memory.storage),
    /保存済みのデモデータ/,
  );
});

test("保存領域へのアクセス自体が拒否されても初期画面を表示できる", () => {
  const existingWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      get localStorage() {
        throw new DOMException("Denied", "SecurityError");
      },
    },
  });
  try {
    assert.equal(loadDemoLedger().accounts[0]?.balance, 12800n);
  } finally {
    if (existingWindow) {
      Object.defineProperty(globalThis, "window", existingWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("30桁チャージを保存してから読み直しても金額が一致する", async () => {
  const memory = memoryStorage();
  const amount = 123456789012345678901234567890n;
  const outcome: ChargeOutcome = {
    transactionId: "thirty-digit-charge",
    amount,
    completedAt,
    eventName: "test",
    displayName: "test",
    verificationCode: "1",
    balanceAfter: 0n,
  };
  const committed = await commitDemoLedger(
    (ledger) => applyCharge(ledger, "001", outcome),
    { storage: memory.storage, withLock: noLock },
  );
  assert.equal(committed.result?.balanceAfter, 12800n + amount);
  assert.equal(
    readLedgerForCommit(memory.storage).accounts[0]?.balance,
    12800n + amount,
  );
  assert.equal(
    loadDemoLedger(memory.storage).accounts[0]?.transactions[0]?.amount,
    amount,
  );
});

test("保存が失敗した取引を完了扱いにしない", async () => {
  const memory = memoryStorage({
    [LEDGER_STORAGE_KEY]: stringifyMoney(initialLedger),
  });
  memory.rejectWrites();
  const outcome: ChargeOutcome = {
    transactionId: "failed-charge",
    amount: 1000n,
    completedAt,
    eventName: "test",
    displayName: "test",
    verificationCode: "1",
    balanceAfter: 0n,
  };
  await assert.rejects(
    commitDemoLedger((ledger) => applyCharge(ledger, "001", outcome), {
      storage: memory.storage,
      withLock: noLock,
    }),
    { name: "QuotaExceededError" },
  );
  assert.equal(
    readLedgerForCommit(memory.storage).accounts[0]?.balance,
    12800n,
  );
  assert.equal(
    readLedgerForCommit(memory.storage).accounts[0]?.transactions[0]?.id,
    "sample-payment-1",
  );
});

test("同時送金は排他下で最新残高を読み、片方だけを保存する", async () => {
  const memory = memoryStorage({
    [LEDGER_STORAGE_KEY]: stringifyMoney(initialLedger),
  });
  const withLock = serialLock();
  const transfer = (recipientId: string, id: string) =>
    commitDemoLedger(
      (ledger) =>
        applyTransfer(ledger, "001", recipientId, 9000n, "", completedAt, id),
      { storage: memory.storage, withLock },
    );
  const [first, second] = await Promise.all([
    transfer("002", "first"),
    transfer("003", "second"),
  ]);
  assert.equal(
    [first, second].filter((entry) => entry.result !== null).length,
    1,
  );
  const stored = readLedgerForCommit(memory.storage);
  assert.equal(stored.accounts[0]?.balance, 3800n);
  assert.equal(
    stored.accounts[0]?.transactions.filter(
      (item) => item.kind === "transfer_sent",
    ).length,
    1,
  );
  assert.equal(
    stored.accounts
      .slice(1)
      .flatMap((account) =>
        account.transactions.filter(
          (item) => item.kind === "transfer_received",
        ),
      ).length,
    1,
  );
});
