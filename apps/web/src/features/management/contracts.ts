/** Management-local wire DTOs. Source: docs/design/api/openapi.yaml.
 * No UI flags, owner role, auth context, or shared API client are defined here.
 */
export type ResourceId = string;
export type Decimal = string;
export type Version = string;
export type UtcDateTime = string;
export interface Page<T> {
  items: T[];
  next_cursor: string | null;
  checked_at: UtcDateTime;
}
export interface TimeWindow { starts_at: UtcDateTime; ends_at: UtcDateTime }
export type PublicContact = { verified_email: string; https_url?: string } | { https_url: string; verified_email?: string };
export interface PublicEventPolicy {
  version: Version;
  charge_window: TimeWindow;
  payment_window: TimeWindow;
  transfer_window: TimeWindow;
  transfer_enabled: boolean;
  cash_refund_enabled: boolean;
  cash_refund_window: TimeWindow;
  cash_refund_location: string;
  cash_refund_contact: PublicContact;
  expiration_at: UtcDateTime | null;
  expiration_terms: string;
  mobile_orders_enabled: boolean;
  settlement_cash_refund_window: TimeWindow;
  settlement_cash_refund_location: string;
  settlement_cash_refund_contact: PublicContact;
}
export interface EventGuide {
  event_id: ResourceId;
  name: string;
  description: string;
  organizer_name: string;
  venue: string;
  contact: PublicContact;
  hosting_window: TimeWindow;
  listed: boolean;
  guide_public: boolean;
  participation_mode: 'PUBLIC' | 'PASSWORD';
  lifecycle: 'DRAFT' | 'PUBLISHED' | 'RUNNING' | 'SALES_ENDED' | 'SETTLING' | 'COMPLETED';
  version: Version;
  terms_version: Version;
  participation_terms: string;
  noindex: boolean;
  checked_at: UtcDateTime;
  public_policy: PublicEventPolicy;
}
interface DashboardFields {
  event_id: ResourceId;
  sales_amount: Decimal;
  refund_amount: Decimal;
  net_sales_amount: Decimal;
  open_order_count: number;
  unresolved_cash_case_count: number;
  checked_at: UtcDateTime;
}
export type BusinessDashboard = DashboardFields & (
  { scope: 'EVENT'; shop_id?: never } | { scope: 'SHOP'; shop_id: ResourceId }
);
export interface ShopFeatures {
  amount_input: boolean;
  payment_a: boolean;
  payment_b: boolean;
  fixed_qr: boolean;
  products: boolean;
  inventory: boolean;
  orders: boolean;
  mobile_orders: boolean;
}
export interface Shop {
  shop_id: ResourceId;
  event_id: ResourceId;
  name: string;
  description: string;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  visible: boolean;
  accepting_new_payments: boolean;
  features: ShopFeatures;
  version: Version;
  checked_at: UtcDateTime;
}
export type Suspension = {
  suspension_id: ResourceId;
  event_id: ResourceId;
  active: boolean;
  reason: string;
  version: Version;
  checked_at: UtcDateTime;
} & ({ scope: 'EVENT'; shop_id?: never } | { scope: 'SHOP'; shop_id: ResourceId });
export type Permission =
  | 'CREATE_PAYMENT_REQUEST' | 'FULFILL_ORDER' | 'CHARGE' | 'CASH_REFUND'
  | 'MANAGE_CASH_REFUNDS' | 'CORRECT_CASH' | 'INVESTIGATE_CASH' | 'RECONCILE_CASH'
  | 'PURCHASE_REFUND' | 'MANAGE_PRODUCTS' | 'MANAGE_INVENTORY'
  | 'READ_REPORT' | 'EXPORT' | 'READ_AUDIT';
export type GrantScope = { permissions: Permission[] } & (
  | { role: 'EVENT_OPERATOR'; shop_id?: never; register_ids?: never }
  | { role: 'SHOP_MANAGER'; shop_id: ResourceId; register_ids?: ResourceId[] }
  | { role: 'CASHIER'; shop_id: ResourceId; register_ids: ResourceId[] }
);
export interface Grant {
  grant_id: ResourceId;
  event_id: ResourceId;
  account_id: ResourceId;
  scope: GrantScope;
  active: boolean;
  version: Version;
  checked_at: UtcDateTime;
}
export interface Reconciliation {
  event_id: ResourceId;
  snapshot_id: ResourceId;
  charged_amount: Decimal;
  cash_refund_paid_amount: Decimal;
  available_amount: Decimal;
  held_amount: Decimal;
  refund_only_amount: Decimal;
  net_shop_sales_amount: Decimal;
  expired_amount: Decimal;
  ledger_sum: Decimal;
  money_difference: Decimal;
  cash_difference: Decimal;
  unresolved_case_count: Decimal;
  balanced: boolean;
  checked_at: UtcDateTime;
}
export interface ApiError {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
  field_errors?: { location: 'BODY' | 'QUERY' | 'HEADER' | 'PATH'; field: string; reason: 'REQUIRED' | 'TYPE' | 'FORMAT' | 'OUT_OF_RANGE' | 'UNKNOWN_FIELD' | 'DUPLICATE' | 'INVALID_COMBINATION' }[];
  current_state_or_query?: { resource_id?: ResourceId; status?: string; query_path?: string };
}

/** M02 wire contracts; complete replacement bodies, not partial PATCH DTOs. */
export interface UpdateEvent {
  expected_version: Version;
  name: string;
  description: string;
  organizer_name: string;
  venue: string;
  contact: PublicContact;
  hosting_window: TimeWindow;
  listed: boolean;
  guide_public: boolean;
  reason: string;
}
export type FeatureRequirement = 'PROHIBITED' | 'OPTIONAL' | 'REQUIRED';
export type FeaturePolicy = { [K in keyof ShopFeatures]: FeatureRequirement };
export type ParticipationPasswordChange = { action: 'KEEP' } | { action: 'CLEAR' } | { action: 'SET'; password: string };
export interface UpdateEventSettings {
  expected_version: Version;
  participation_mode: 'PUBLIC' | 'PASSWORD';
  participation_terms: string;
  participation_password_change: ParticipationPasswordChange;
  charge_window: TimeWindow;
  payment_window: TimeWindow;
  transfer_window: TimeWindow;
  transfer_enabled: boolean;
  cash_refund_enabled: boolean;
  cash_refund_window: TimeWindow;
  cash_refund_location: string;
  cash_refund_contact: PublicContact;
  settlement_cash_refund_window: TimeWindow;
  settlement_cash_refund_location: string;
  settlement_cash_refund_contact: PublicContact;
  expiration_at: UtcDateTime | null;
  expiration_terms: string;
  features: FeaturePolicy;
  mobile_orders_enabled: boolean;
  reason: string;
}
export interface EventSettings extends Omit<UpdateEventSettings, 'expected_version' | 'reason' | 'participation_password_change'> {
  settings_id: ResourceId;
  event_id: ResourceId;
  version: Version;
  terms_version: Version;
  first_charge_at: UtcDateTime | null;
  checked_at: UtcDateTime;
}
export interface CommandReference {
  resource_type: 'event' | 'settings';
  resource_id: ResourceId;
  query_path: string;
  version?: Version;
  status?: string;
}
/** RequestResult subset used by the two M02 commands (no money transaction). */
export type EventSettingsRequestResult =
  | { status: 'SUCCEEDED'; resource: CommandReference; checked_at: UtcDateTime }
  | { status: 'REJECTED'; rejection: { code: string; message: string }; checked_at: UtcDateTime }
  | { status: 'PENDING' | 'UNKNOWN'; checked_at: UtcDateTime };
