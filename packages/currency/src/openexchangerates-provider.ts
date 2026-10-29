import { ExternalServiceError } from "@travel/types";
import { UnsupportedCurrencyError, type ExchangeRateProvider } from "./provider.js";

/**
 * Real implementation against openexchangerates.org's /latest.json
 * endpoint. The free tier only quotes rates against USD, so a
 * from!=USD-and-to!=USD request is computed as from->USD->to, same as
 * the static provider - the two are drop-in interchangeable.
 */
export class OpenExchangeRatesProvider implements ExchangeRateProvider {
  constructor(private readonly apiKey: string) {}

  async getRate(from: string, to: string): Promise<number> {
    const res = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${this.apiKey}&base=USD`);
    if (!res.ok) {
      throw new ExternalServiceError("OpenExchangeRates", `Rate fetch failed (${res.status})`);
    }
    const data = (await res.json()) as { rates: Record<string, number> };
    const usdToFrom = from === "USD" ? 1 : data.rates[from];
    const usdToTo = to === "USD" ? 1 : data.rates[to];
    if (usdToFrom === undefined) throw new UnsupportedCurrencyError(from);
    if (usdToTo === undefined) throw new UnsupportedCurrencyError(to);
    return usdToTo / usdToFrom;
  }
}
