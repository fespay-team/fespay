// EPP-REQ-001: ACC-01, EVT-02, JOIN-01/02, WAL-01/02, PAY-B01/02.
// All values are fictional. Joining an event never grants a balance.
export type MockEvent = {
  id: string;
  name: string;
  description: string;
  organizer: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  refundEndsAt: string;
  reception: string;
  contact: string;
  conditionsVersion: string;
  transferEnabled: boolean;
  mobileOrderingEnabled: boolean;
  participationPassword?: string;
};

export type MockWallet = {
  availableYen: string;
  heldYen: string;
  refundOnlyYen: string;
  checkedAt: string;
};

export const mockEvents: readonly MockEvent[] = [
  {
    id: 'mock-minato',
    name: 'みなと秋まつり',
    description: '地域のお店が集まる秋のイベントです。',
    organizer: 'みなと秋まつり実行委員会',
    venue: 'みなと広場',
    startsAt: '2026-10-14T10:00:00+09:00',
    endsAt: '2026-10-14T16:00:00+09:00',
    refundEndsAt: '2026-10-14T18:00:00+09:00',
    reception: '会場入口の受付',
    contact: 'info@minato.example.test',
    conditionsVersion: '1',
    transferEnabled: true,
    mobileOrderingEnabled: true,
  },
  {
    id: 'mock-sakura',
    name: '桜ヶ丘学園祭',
    description: '模擬店を楽しめる学園祭です。参加パスワードが必要です。',
    organizer: '桜ヶ丘学園祭実行委員会',
    venue: '桜ヶ丘学園 校庭',
    startsAt: '2026-10-14T10:00:00+09:00',
    endsAt: '2026-10-14T16:00:00+09:00',
    refundEndsAt: '2026-10-14T18:00:00+09:00',
    reception: '校門横の受付',
    contact: 'info@sakura.example.test',
    conditionsVersion: '1',
    transferEnabled: false,
    mobileOrderingEnabled: false,
    participationPassword: 'fespay-demo',
  },
];

// The demo account previously joined this event. These amounts represent
// existing records, not money awarded by the prototype's participation step.
export const mockJoinedEventIds: readonly string[] = ['mock-minato'];

export const mockWallets: Readonly<Record<string, MockWallet>> = {
  'mock-minato': {
    availableYen: '2500',
    heldYen: '500',
    refundOnlyYen: '300',
    checkedAt: '2026-10-14T10:30:00+09:00',
  },
  'mock-sakura': {
    availableYen: '0',
    heldYen: '0',
    refundOnlyYen: '0',
    checkedAt: '2026-10-14T10:30:00+09:00',
  },
};

export function formatYen(value: string): string {
  return `${BigInt(value).toLocaleString('ja-JP')} 円`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

// U06-U10 fixtures: CHG/CSH, TRF, PRD/INV/ORD, UI-01. No API or ledger writes.
export type MockProduct = { id: string; name: string; priceYen: string; available: number };
export const mockShop = {
  name: 'こもれびキッチン',
  mobileOrderingEnabled: true,
  products: [
    { id: 'yakisoba', name: '焼きそば', priceYen: '500', available: 20 },
    { id: 'lemonade', name: 'レモネード', priceYen: '300', available: 15 },
    { id: 'cookie', name: 'クッキー', priceYen: '200', available: 0 },
  ] satisfies MockProduct[],
};

export const mockRecipient = { name: 'あおい', verificationCode: '7314' };
export const mockReceptionIdentity = { displayName: '山田 太郎', verificationCode: '4821' };
export type MockOrderLine = { productId: string; name: string; priceYen: string; quantity: number };
export type MockOrder = {
  id: string;
  eventId: string;
  number: string;
  shopName: string;
  lines: MockOrderLine[];
  fulfillment: '受付済み' | '受取待ち';
  receiptCode: string;
  transactionId: string;
  occurredAt: string;
};

export const mockOrders: readonly MockOrder[] = [{
  id: 'MOCK-ORDER-001',
  eventId: 'mock-minato',
  number: '1014-001',
  shopName: mockShop.name,
  lines: [
    { productId: 'yakisoba', name: '焼きそば', priceYen: '500', quantity: 1 },
    { productId: 'lemonade', name: 'レモネード', priceYen: '300', quantity: 1 },
  ],
  fulfillment: '受取待ち',
  receiptCode: '48261573',
  transactionId: 'MOCK-PAYMENT-001',
  occurredAt: '2026-10-14T10:20:00+09:00',
}];

export type MockActivity = {
  id: string;
  eventId: string;
  type: 'チャージ' | '支払い' | '譲渡' | '現金払戻し' | '購入返金';
  amountYen: string;
  counterparty: string;
  status: string;
  occurredAt: string;
  originalTransactionId?: string;
};

export const mockActivities: readonly MockActivity[] = [
  { id: 'MOCK-CASH-002', eventId: 'mock-minato', type: '現金払戻し', amountYen: '500', counterparty: '会場入口の受付', status: '拘束済み・現金交付待ち', occurredAt: '2026-10-14T10:28:00+09:00' },
  { id: 'MOCK-PAYMENT-001', eventId: 'mock-minato', type: '支払い', amountYen: '800', counterparty: mockShop.name, status: '成立', occurredAt: '2026-10-14T10:20:00+09:00' },
  { id: 'MOCK-REFUND-001', eventId: 'mock-minato', type: '購入返金', amountYen: '300', counterparty: 'イベント内店舗', status: '成立・返金専用額', occurredAt: '2026-10-14T10:15:00+09:00', originalTransactionId: 'MOCK-PAYMENT-000' },
  { id: 'MOCK-CHARGE-001', eventId: 'mock-minato', type: 'チャージ', amountYen: '5000', counterparty: '会場入口の受付', status: '成立', occurredAt: '2026-10-14T10:00:00+09:00' },
];

export function orderTotal(lines: readonly MockOrderLine[]): string {
  return lines.reduce((total, line) => total + BigInt(line.priceYen) * BigInt(line.quantity), 0n).toString();
}

export function amountError(value: string, availableYen: string): string {
  if (!/^\d{1,30}$/.test(value) || BigInt(value) < 1n) return '金額は1円以上、30桁以内の整数で入力してください。';
  if (BigInt(value) > BigInt(availableYen)) return '利用可能額が不足しています。金額を確認してください。';
  return '';
}
