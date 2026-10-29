import { env } from "@travel/config";
import { createServiceLogger } from "@travel/logger";
import { StaticExchangeRateProvider } from "./static-provider.js";
import { OpenExchangeRatesProvider } from "./openexchangerates-provider.js";
import type { ExchangeRateProvider } from "./provider.js";

export {
  type ExchangeRateProvider,
  SUPPORTED_CURRENCIES,
  type SupportedCurrency,
  UnsupportedCurrencyError,
} from "./provider.js";
export { StaticExchangeRateProvider } from "./static-provider.js";
export { OpenExchangeRatesProvider } from "./openexchangerates-provider.js";

const logger = createServiceLogger("currency");
let cached: ExchangeRateProvider | null = null;

/**
 * Same selection pattern as getPaymentProvider()/getStorageProvider()
 * elsewhere: business/display code calls this instead of constructing a
 * concrete provider, so swapping providers is a config change, not a
 * code change. Falls back to the static table (with a warning) if
 * "openexchangerates" is selected but no API key is configured, rather
 * than crashing a page that just wants to show an estimate.
 */
export function getExchangeRateProvider(): ExchangeRateProvider {
  if (cached) return cached;
  if (env.CURRENCY_PROVIDER === "openexchangerates" && env.EXCHANGE_RATE_API_KEY) {
    cached = new OpenExchangeRatesProvider(env.EXCHANGE_RATE_API_KEY);
  } else {
    if (env.CURRENCY_PROVIDER === "openexchangerates") {
      logger.warn("CURRENCY_PROVIDER=openexchangerates but EXCHANGE_RATE_API_KEY is not set - falling back to static rates");
    }
    cached = new StaticExchangeRateProvider();
  }
  return cached;
}

/**
 * Converts a display amount from one currency to another. Never call
 * this to determine what a customer is charged/refunded - see the
 * warning on `ExchangeRateProvider`. Rounds to 2 decimal places, which
 * is correct for every currency in `SUPPORTED_CURRENCIES` (none of them
 * are zero-decimal currencies like JPY).
 */
export async function convertForDisplay(
  amount: number,
  from: string,
  to: string,
  provider: ExchangeRateProvider = getExchangeRateProvider()
): Promise<{ amount: number; currency: string; rate: number }> {
  if (from === to) return { amount: Math.round(amount * 100) / 100, currency: to, rate: 1 };
  const rate = await provider.getRate(from, to);
  return { amount: Math.round(amount * rate * 100) / 100, currency: to, rate };
}
