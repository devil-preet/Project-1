/** Currencies with 2 minor-unit digits. Prices are ALWAYS integers in minor units — never floats. */
export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "AUD", "CAD", "SGD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "INR";
export const MAX_PRICE_CENTS = 1_000_000_000; // 10,000,000.00

export function isCurrency(v: unknown): v is Currency {
  return typeof v === "string" && (CURRENCIES as readonly string[]).includes(v);
}

/** "12", "12.5", "12.50" -> 1250. Returns null for anything else (no floating-point maths). */
export function parseMoney(input: string): number | null {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ""));
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

/** 1250 -> "12.50" (for form inputs). */
export function centsToInput(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function formatMoney(cents: number, currency: string): string {
  const cur = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur }).format(cents / 100);
}
