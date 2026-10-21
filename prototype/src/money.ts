export const MAX_MONEY_DIGITS = 30;
export const MAX_CHARGE_DIGITS = MAX_MONEY_DIGITS;

export type MoneyInputResult =
  { amount: bigint; error: null } | { amount: null; error: string };

export function validateMoneyInput(
  value: string,
  options: { maxDigits?: number } = {},
): MoneyInputResult {
  const maxDigits = options.maxDigits ?? MAX_MONEY_DIGITS;
  if (value === "")
    return { amount: null, error: "1円以上の整数を入力してください" };
  if (value.includes("-"))
    return { amount: null, error: "マイナスの金額は入力できません" };
  if (value.includes("."))
    return {
      amount: null,
      error: "小数は入力できません。1円単位で入力してください",
    };
  if (!/^\d+$/.test(value))
    return { amount: null, error: "半角数字のみで入力してください" };
  if (value.length > maxDigits)
    return {
      amount: null,
      error: `金額は${maxDigits}桁以内で入力してください`,
    };
  const amount = BigInt(value);
  if (amount === 0n)
    return { amount: null, error: "1円以上の整数を入力してください" };
  return { amount, error: null };
}

export function formatYen(amount: bigint): string {
  const absolute = amount < 0n ? -amount : amount;
  return `¥${absolute.toLocaleString("ja-JP")}`;
}

export function parseStoredAmount(value: unknown): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? BigInt(value) : null;
  }
  if (typeof value === "string" && /^(?:0|[1-9]\d*|-[1-9]\d*)$/.test(value)) {
    return BigInt(value);
  }
  return null;
}

export function stringifyMoney(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}
