import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatYen,
  parseStoredAmount,
  stringifyMoney,
  validateMoneyInput,
} from "../src/money.ts";

const thirtyDigits = 123456789012345678901234567890n;

test("30桁の金額を丸めずに表示・保存・復元できる", () => {
  assert.equal(
    formatYen(thirtyDigits),
    "¥123,456,789,012,345,678,901,234,567,890",
  );

  const serialized = stringifyMoney({
    balance: thirtyDigits,
    transactions: [{ amount: -thirtyDigits }],
  });
  const stored = JSON.parse(serialized) as {
    balance: string;
    transactions: { amount: string }[];
  };

  assert.equal(parseStoredAmount(stored.balance), thirtyDigits);
  assert.equal(
    parseStoredAmount(stored.transactions[0]?.amount),
    -thirtyDigits,
  );
});

test("旧形式の数値は安全な整数のみ受け付ける", () => {
  assert.equal(
    parseStoredAmount(Number.MAX_SAFE_INTEGER),
    BigInt(Number.MAX_SAFE_INTEGER),
  );
  assert.equal(parseStoredAmount(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(parseStoredAmount(1.5), null);
  assert.equal(parseStoredAmount(Number.POSITIVE_INFINITY), null);
});

test("不正な保存金額を有効な整数へ読み替えない", () => {
  for (const value of ["", "01", "1.5", "1e3", "-0", " 100", "--1"]) {
    assert.equal(parseStoredAmount(value), null, value);
  }
});

test("小数・負数・0・文字・31桁は別の金額に変換せず拒否する", () => {
  for (const value of ["", "1.5", "-100", "0", "abc", "1e3", "9".repeat(31)]) {
    const result = validateMoneyInput(value);
    assert.equal(result.amount, null, value);
    assert.ok(result.error, value);
  }
});

test("10桁と30桁の整数を入力どおりに扱う", () => {
  assert.deepEqual(validateMoneyInput("1000000000"), {
    amount: 1000000000n,
    error: null,
  });
  assert.deepEqual(validateMoneyInput(thirtyDigits.toString()), {
    amount: thirtyDigits,
    error: null,
  });
});

test("画面固有の桁数制限を適用できる", () => {
  assert.deepEqual(validateMoneyInput("123456789", { maxDigits: 9 }), {
    amount: 123456789n,
    error: null,
  });
  const tooLong = validateMoneyInput("1000000000", { maxDigits: 9 });
  assert.equal(tooLong.amount, null);
  assert.match(tooLong.error ?? "", /9桁/);
});
