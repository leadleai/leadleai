// ────────────────────────────────────────────────────────────────────────────
//  DISPLAY-ONLY multi-currency pricing config.
//
//  This is COSMETIC. It controls what price string the marketing pricing page
//  shows a visitor based on their country. It does NOT touch billing/charging —
//  no payment logic reads this file.
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  EDIT PRICES HERE → `PLAN_PRICES` below.                                  │
//  │  ADD A CURRENCY   → see the step-by-step guide at the bottom of the file. │
//  └─────────────────────────────────────────────────────────────────────────┘
// ────────────────────────────────────────────────────────────────────────────

// If detection fails, or a plan has no price in the chosen currency, we use this.
export const FALLBACK_CURRENCY = "USD";

// The currencies we support. `symbol` is what we print; `locale` controls number
// grouping (e.g. Indian 1,00,000 vs Western 100,000). `label` shows in the picker.
export const CURRENCIES = {
  USD: { symbol: "$", locale: "en-US", label: "USD" },
  INR: { symbol: "₹", locale: "en-IN", label: "INR" },
  GBP: { symbol: "£", locale: "en-GB", label: "GBP" },
  EUR: { symbol: "€", locale: "de-DE", label: "EUR" },
};

// ── EDIT PRICES HERE ────────────────────────────────────────────────────────
// One entry per plan (keyed by the plan `name` in mockData.js `pricing`).
// Each plan lists its price in every supported currency. These are independent
// fixed prices — NOT converted from USD — so set whatever you want per market.
//
// A plan with NO entry here (e.g. "Enterprise") renders its original text price
// from mockData (e.g. "Custom") and is left untouched.
export const PLAN_PRICES = {
  Starter: { INR: 999, USD: 15, GBP: 12, EUR: 14 },
  Growth: { INR: 3999, USD: 49, GBP: 39, EUR: 45 },
};
// ────────────────────────────────────────────────────────────────────────────

// Country (ISO 3166-1 alpha-2) → currency. Anything not listed falls back to USD.
// The Eurozone entries all map to EUR. This is the single source of truth for
// "which country pays in which currency".
export const COUNTRY_TO_CURRENCY = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  // Eurozone member states
  AT: "EUR", BE: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR",
  FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
  LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR",
  SI: "EUR", ES: "EUR",
};

// Map an ISO country code to a supported currency (USD fallback).
export function currencyForCountry(countryCode) {
  if (!countryCode) return FALLBACK_CURRENCY;
  return COUNTRY_TO_CURRENCY[countryCode.toUpperCase()] || FALLBACK_CURRENCY;
}

// The list the currency picker renders, in a stable order.
export const CURRENCY_OPTIONS = Object.keys(CURRENCIES);

/**
 * Format a plan's price in the given currency for display.
 * Returns null when the plan has no numeric price (e.g. Enterprise → "Custom"),
 * so the caller can fall back to the plan's original text price.
 *
 *   formatPlanPrice("Starter", "INR") -> "₹999"
 *   formatPlanPrice("Growth",  "USD") -> "$49"
 */
export function formatPlanPrice(planName, currency) {
  const cur = CURRENCIES[currency] ? currency : FALLBACK_CURRENCY;
  const prices = PLAN_PRICES[planName];
  if (!prices) return null; // plan isn't multi-currency (e.g. Enterprise)

  const amount = prices[cur] ?? prices[FALLBACK_CURRENCY];
  if (amount == null) return null;

  const { symbol, locale } = CURRENCIES[cur];
  const hasDecimals = !Number.isInteger(amount);
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
  return `${symbol}${number}`;
}

// ────────────────────────────────────────────────────────────────────────────
//  HOW TO ADD A NEW CURRENCY (e.g. Canadian dollar, CAD):
//
//  1. Add it to CURRENCIES:
//        CAD: { symbol: "$", locale: "en-CA", label: "CAD" },
//  2. Add a price for it to EVERY plan in PLAN_PRICES:
//        Starter: { INR: 999, USD: 15, GBP: 12, EUR: 14, CAD: 20 },
//        Growth:  { INR: 3999, USD: 49, GBP: 39, EUR: 45, CAD: 65 },
//  3. Map the relevant country codes to it in COUNTRY_TO_CURRENCY:
//        CA: "CAD",
//
//  That's it — the picker and geo detection pick it up automatically.
// ────────────────────────────────────────────────────────────────────────────
