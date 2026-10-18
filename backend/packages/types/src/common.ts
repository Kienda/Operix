/**
 * Cross-cutting domain constants that are not database enums.
 * Anything persisted as an enum column lives in the Prisma schema instead.
 */

/** Supported interface languages. The architecture allows adding more. */
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * ISO 4217 codes Operix ships with. Organizations may add others; nothing in
 * the platform hard-codes a currency, and money is never summed across
 * currencies without a configured exchange-rate entry.
 */
export const CURRENCIES = [
  'USD',
  'EUR',
  'GNF',
  'XOF',
  'GBP',
  'CAD',
  'NGN',
  'GHS',
  'MAD',
  'CFA',
  'AED',
  'CNY',
] as const;
export type CurrencyCode = string;

/** Minor-unit exponent per currency. GNF and XOF are zero-decimal. */
export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  CAD: 2,
  NGN: 2,
  GHS: 2,
  MAD: 2,
  AED: 2,
  CNY: 2,
  GNF: 0,
  XOF: 0,
  CFA: 0,
};

export function currencyDecimals(code: string): number {
  return CURRENCY_DECIMALS[code.toUpperCase()] ?? 2;
}

/** Units of measure supported by inventory. */
export const UNITS = [
  'piece',
  'box',
  'pack',
  'roll',
  'meter',
  'square_meter',
  'sheet',
  'liter',
  'milliliter',
  'kilogram',
  'gram',
  'cartridge',
  'bottle',
  'hour',
] as const;
export type Unit = (typeof UNITS)[number];

/** Units measured continuously — quantities may carry decimals. */
export const CONTINUOUS_UNITS: readonly Unit[] = [
  'meter',
  'square_meter',
  'liter',
  'milliliter',
  'kilogram',
  'gram',
  'hour',
];

export function isContinuousUnit(unit: string): boolean {
  return (CONTINUOUS_UNITS as readonly string[]).includes(unit);
}

/**
 * How wide a principal's view of tenant data is. Mirrors the same union in
 * `@operix/permissions`; duplicated here so transport types do not depend on
 * the permissions package.
 */
export type DataScope = 'all' | 'branch' | 'assigned' | 'self' | 'customer';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeoFix extends GeoPoint {
  accuracyMeters: number;
  capturedAt: string;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
}

export interface Money {
  /** Stored as a decimal string to avoid float drift across the wire. */
  amount: string;
  currency: CurrencyCode;
}

export interface Address {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

/** Channels a notification can be delivered through. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'whatsapp', 'push'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Document kinds Operix can generate as a PDF. */
export const DOCUMENT_KINDS = [
  'quotation',
  'proposal',
  'proforma_invoice',
  'invoice',
  'deposit_receipt',
  'payment_receipt',
  'final_receipt',
  'refund_receipt',
  'credit_note',
  'debit_note',
  'delivery_note',
  'purchase_order',
  'customer_statement',
  'work_completion_certificate',
  'payslip',
  'contract',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
