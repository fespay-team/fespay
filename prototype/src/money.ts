export const MAX_CHARGE_DIGITS = 30;

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
