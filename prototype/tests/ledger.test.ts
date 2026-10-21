import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyCharge,
  applyTransfer,
  initialLedger,
  type ChargeOutcome,
} from "../src/domain/ledger.ts";

const thirtyDigits = 123456789012345678901234567890n;
const completedAt = "2026-10-15T00:00:00.000Z";

function chargeOutcome(amount: bigint, transactionId: string): ChargeOutcome {
  return {
    transactionId,
    amount,
    completedAt,
    eventName: "みどりの森まつり",
    displayName: "デモ来場者",
    verificationCode: "4827",
    balanceAfter: 0n,
  };
}

test("30桁のチャージと同額の送金を丸めずに記録する", () => {
  const charged = applyCharge(
    initialLedger,
    "001",
    chargeOutcome(thirtyDigits, "test-charge"),
  );
  assert.ok(charged);
  assert.equal(charged.result.balanceAfter, 12800n + thirtyDigits);
  assert.equal(charged.next.accounts[0]?.transactions[0]?.amount, thirtyDigits);

  const transferred = applyTransfer(
    charged.next,
    "001",
    "002",
    thirtyDigits,
    "屋台代",
    completedAt,
    "test-transfer",
  );
  assert.ok(transferred);
  assert.equal(transferred.next.accounts[0]?.balance, 12800n);
  assert.equal(transferred.next.accounts[1]?.balance, 3200n + thirtyDigits);
  assert.deepEqual(
    transferred.next.accounts
      .slice(0, 2)
      .map((account) => account.transactions[0]?.id),
    ["test-transfer", "test-transfer"],
  );
  assert.deepEqual(
    transferred.next.accounts
      .slice(0, 2)
      .map((account) => account.transactions[0]?.amount),
    [-thirtyDigits, thirtyDigits],
  );
  assert.equal(initialLedger.accounts[0]?.balance, 12800n);
  assert.equal(initialLedger.accounts[1]?.balance, 3200n);
});

test("最新残高で足りない二件目の送金は成立しない", () => {
  const first = applyTransfer(
    initialLedger,
    "001",
    "002",
    9000n,
    "",
    completedAt,
    "first",
  );
  assert.ok(first);
  assert.equal(first.next.accounts[0]?.balance, 3800n);
  assert.equal(
    applyTransfer(first.next, "001", "003", 9000n, "", completedAt, "second"),
    null,
  );
});

test("重複チャージ、自己送金、0円、過長メッセージを拒否する", () => {
  const outcome = chargeOutcome(1000n, "once");
  const first = applyCharge(initialLedger, "001", outcome);
  assert.ok(first);
  assert.equal(applyCharge(first.next, "001", outcome), null);
  assert.equal(
    applyTransfer(initialLedger, "001", "001", 100n, "", completedAt, "self"),
    null,
  );
  assert.equal(
    applyTransfer(initialLedger, "001", "002", 0n, "", completedAt, "zero"),
    null,
  );
  assert.equal(
    applyTransfer(
      initialLedger,
      "001",
      "002",
      100n,
      "x".repeat(51),
      completedAt,
      "long",
    ),
    null,
  );
});
