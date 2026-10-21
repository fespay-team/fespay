import { useEffect, useState } from "react";
import {
  applyCharge,
  applyTransfer,
  type ChargeOutcome,
  type DemoLedger,
  type LedgerChange,
  type SendReceipt,
} from "../domain/ledger.ts";
import {
  commitDemoLedger,
  LEDGER_STORAGE_KEY,
  loadDemoLedger,
  readLedgerForCommit,
  resetStoredDemoLedger,
} from "../data/demoLedgerRepository.ts";

const SELECTED_ACCOUNT_STORAGE_KEY = "fespay-demo-selected-account-v1";

export function useDemoLedger() {
  const [ledger, setLedger] = useState(loadDemoLedger);
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    try {
      const saved = window.sessionStorage.getItem(SELECTED_ACCOUNT_STORAGE_KEY);
      if (
        saved !== null &&
        ledger.accounts.some((account) => account.id === saved)
      )
        return saved;
    } catch {
      // Account selection remains available for this page when storage is blocked.
    }
    // The persisted ledger supplies the default; this tab's selection is separate.
    return ledger.activeAccountId;
  });
  // A new object for every failed event lets the UI announce repeated failures.
  const [syncError, setSyncError] = useState<{ message: string } | null>(null);
  const activeAccount =
    ledger.accounts.find((account) => account.id === selectedAccountId) ??
    ledger.accounts[0];

  useEffect(() => {
    const syncFromStorage = (event: StorageEvent) => {
      if (event.key !== LEDGER_STORAGE_KEY && event.key !== null) return;
      try {
        setLedger(readLedgerForCommit());
        setSyncError(null);
      } catch {
        setSyncError({
          message: "ほかのタブのデモデータを読み込めませんでした",
        });
      }
    };
    window.addEventListener("storage", syncFromStorage);
    return () => window.removeEventListener("storage", syncFromStorage);
  }, []);

  const commit = async <T>(
    mutate: (latest: DemoLedger) => LedgerChange<T> | null,
  ): Promise<T | null> => {
    const { ledger: next, result } = await commitDemoLedger(mutate);
    setLedger(next);
    return result;
  };

  const completeCharge = (
    outcome: ChargeOutcome,
  ): Promise<ChargeOutcome | null> => {
    const accountId = activeAccount.id;
    return commit((latest) => applyCharge(latest, accountId, outcome));
  };

  const completeTransfer = (
    recipientId: string,
    amount: bigint,
    message: string,
  ): Promise<SendReceipt | null> => {
    const senderId = activeAccount.id;
    return commit((latest) => {
      const completedAt = new Date().toISOString();
      const transactionId = `DEMO-TRF-${
        typeof window.crypto?.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      }`;
      return applyTransfer(
        latest,
        senderId,
        recipientId,
        amount,
        message,
        completedAt,
        transactionId,
      );
    });
  };

  const selectAccount = (accountId: string) => {
    if (!ledger.accounts.some((account) => account.id === accountId)) return;
    setSelectedAccountId(accountId);
    try {
      window.sessionStorage.setItem(SELECTED_ACCOUNT_STORAGE_KEY, accountId);
    } catch {
      // Account selection still works until this page is closed.
    }
  };

  const resetDemoData = async () => {
    const freshLedger = await resetStoredDemoLedger();
    setLedger(freshLedger);
    setSelectedAccountId(freshLedger.activeAccountId);
    try {
      window.sessionStorage.removeItem(SELECTED_ACCOUNT_STORAGE_KEY);
    } catch {
      // Selection still resets for this page.
    }
  };

  return {
    ledger,
    activeAccount,
    syncError,
    selectAccount,
    completeCharge,
    completeTransfer,
    resetDemoData,
  };
}
