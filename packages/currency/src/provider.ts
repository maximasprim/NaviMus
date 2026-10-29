/**
 * Spec section 18 (multi-currency): "Create an exchange-rate abstraction
 * that can later connect to an external provider." Same shape as every
 * other provider interface in this codebase (payments, email, SMS,
 * storage) - business logic never imports a concrete provider, only this
 * interface, via `getExchangeRateProvider()`.
 *
 * IMPORTANT: this is a *display/estimate* conversion layer only. It is
 * never used to decide how much a customer is actually charged or
 * refunded - `bookings.currency` / `payments.original_currency` and their
 * amounts are authoritative and immutable once written (see section 18:
 * "Never overwrite the original transaction amount"). This module exists
 * so the frontend can show "~$120" next to a KES price, not to convert
 * money that moves.
 */
export interface ExchangeRateProvider {
  /** Returns units of `to` per 1 unit of `from`. Throws if either currency is unsupported. */
  getRate(from: string, to: string): Promise<number>;
}

export const SUPPORTED_CURRENCIES = ["KES", "USD", "EUR", "GBP", "TZS", "UGX", "AED", "ZAR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export class UnsupportedCurrencyError extends Error {
  constructor(code: string) {
    super(`Unsupported currency: ${code}`);
    this.name = "UnsupportedCurrencyError";
  }
}
