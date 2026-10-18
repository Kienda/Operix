import { getLocale } from './i18n.js';

const DIGITS = { GNF: 0, USD: 2, EUR: 2 };
export const currencyDigits = (currency) => DIGITS[currency] ?? 2;

/** Formats a decimal string from the API without passing through float arithmetic for the digits. */
export function money(amount, currency) {
  if (amount === undefined || amount === null || amount === '') return '—';
  const digits = currencyDigits(currency);
  const [whole, fraction = ''] = String(amount).split('.');
  const grouped = new Intl.NumberFormat(getLocale(), { useGrouping: true }).format(BigInt(whole.replace('-', '')));
  const sign = whole.startsWith('-') ? '-' : '';
  const decimals = digits ? (getLocale().startsWith('fr') ? ',' : '.') + fraction.padEnd(digits, '0').slice(0, digits) : '';
  return `${sign}${grouped}${decimals} ${currency}`;
}

export function date(value) {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', ...(value.length > 10 ? { timeStyle: 'short' } : {}) }).format(d)
    : '—';
}

export const today = () => new Date().toISOString().slice(0, 10);

// ---- exact decimal preview (BigInt fixed-point) for the quotation editor ----
const SCALE = 6n;
const pow = (n) => 10n ** n;
function toFixedPoint(text) {
  if (!/^\d+(\.\d+)?$/.test(String(text ?? '').trim())) return null;
  const [w, f = ''] = String(text).trim().split('.');
  return BigInt(w) * pow(SCALE) + BigInt((f + '000000').slice(0, Number(SCALE)));
}
function roundTo(value, digits) {
  const divisor = pow(SCALE - BigInt(digits));
  return ((value + divisor / 2n) / divisor) * divisor; // half-up, non-negative values
}
function fromFixedPoint(value, digits) {
  const whole = value / pow(SCALE);
  if (!digits) return whole.toString();
  const fraction = (value % pow(SCALE)).toString().padStart(Number(SCALE), '0').slice(0, digits);
  return `${whole}.${fraction}`;
}

/**
 * Mirrors the server's pricing rules for live feedback only. The saved
 * quotation always uses the totals the API computed.
 */
export function previewTotals(items, taxRate, currency) {
  const digits = currencyDigits(currency);
  let subtotal = 0n;
  const lines = items.map((item) => {
    const q = toFixedPoint(item.quantity);
    const p = toFixedPoint(item.unitPrice);
    if (q === null || p === null) return null;
    const line = roundTo((q * p) / pow(SCALE), digits);
    subtotal += line;
    return fromFixedPoint(line, digits);
  });
  const rate = toFixedPoint(taxRate);
  if (rate === null || lines.includes(null)) return { lines, valid: false };
  const tax = roundTo((subtotal * rate) / pow(SCALE) / 100n, digits);
  return {
    valid: true,
    lines,
    subtotal: fromFixedPoint(subtotal, digits),
    tax: fromFixedPoint(tax, digits),
    total: fromFixedPoint(subtotal + tax, digits),
  };
}
