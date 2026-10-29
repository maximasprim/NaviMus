import { SUPPORTED_CURRENCIES, UnsupportedCurrencyError, type ExchangeRateProvider } from "./provider.js";

/**
 * Indicative rates only (units of USD per 1 unit of the currency),
 * checked in as a working default so the platform never hard-fails on
 * currency conversion just because no external rates API is configured.
 * Update this table periodically, or set CURRENCY_PROVIDER=openexchangerates
 * with EXCHANGE_RATE_API_KEY for live rates. Last reviewed: this build.
 */
const USD_RATES: Record<(typeof SUPPORTED_CURRENCIES)[number], number> = {
  USD: 1,
  KES: 1 / 129,
  EUR: 1.08,
  GBP: 1.27,
  TZS: 1 / 2600,
  UGX: 1 / 3700,
  AED: 1 / 3.67,
  ZAR: 1 / 18.5,
};

export class StaticExchangeRateProvider implements ExchangeRateProvider {
  async getRate(from: string, to: string): Promise<number> {
    const fromRate = USD_RATES[from as keyof typeof USD_RATES];
    const toRate = USD_RATES[to as keyof typeof USD_RATES];
    if (fromRate === undefined) throw new UnsupportedCurrencyError(from);
    if (toRate === undefined) throw new UnsupportedCurrencyError(to);
    // from -> USD -> to
    return toRate / fromRate;
  }
}
