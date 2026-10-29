import { ValidationError } from "@travel/types";
import type { schema } from "@travel/database";

type PackagePriceRow = typeof schema.packagePrices.$inferSelect;

export interface TravelerComposition {
  adult: number;
  child: number;
  infant: number;
}

export interface QuoteLineItem {
  travelerType: "adult" | "child" | "infant";
  count: number;
  unitPrice: number;
  subtotal: number;
  currency: string;
}

export interface Quote {
  lineItems: QuoteLineItem[];
  subtotal: number;
  currency: string;
}

/**
 * Picks the applicable price row for a traveler type on a given
 * travel date: a season-specific row whose date range contains
 * travelDate takes priority over the year-round default row
 * (seasonLabel/seasonStartDate/seasonEndDate all null).
 */
function selectPriceRow(
  prices: PackagePriceRow[],
  travelerType: string,
  pricingType: string,
  travelDate: string
): PackagePriceRow | null {
  const candidates = prices.filter((p) => p.travelerType === travelerType && p.pricingType === pricingType);

  const seasonal = candidates.find(
    (p) =>
      p.seasonStartDate &&
      p.seasonEndDate &&
      travelDate >= p.seasonStartDate &&
      travelDate <= p.seasonEndDate
  );
  if (seasonal) return seasonal;

  const yearRound = candidates.find((p) => !p.seasonStartDate && !p.seasonEndDate);
  return yearRound ?? candidates[0] ?? null;
}

/**
 * Computes a package's total price server-side from its price
 * matrix. This is the ONLY place a booking price is calculated -
 * the Booking service always calls this rather than accepting any
 * amount from the client (rule #8/#10 in the engineering brief).
 */
export function calculatePackageQuote(
  prices: PackagePriceRow[],
  travelDate: string,
  travelers: TravelerComposition,
  pricingType: "individual" | "group" | "private" = "individual"
): Quote {
  const lineItems: QuoteLineItem[] = [];
  let currency: string | null = null;

  for (const [travelerType, count] of Object.entries(travelers) as [keyof TravelerComposition, number][]) {
    if (count <= 0) continue;
    const priceRow = selectPriceRow(prices, travelerType, pricingType, travelDate);
    if (!priceRow) {
      throw new ValidationError(`No price configured for traveler type "${travelerType}" on ${travelDate}`);
    }
    if (currency && priceRow.currency !== currency) {
      throw new ValidationError("Mixed currencies in a single package price matrix are not supported");
    }
    currency = priceRow.currency;

    const unitPrice = Number(priceRow.amount);
    const subtotal = Math.round(unitPrice * count * 100) / 100;
    lineItems.push({ travelerType, count, unitPrice, subtotal, currency: priceRow.currency });
  }

  if (lineItems.length === 0) {
    throw new ValidationError("At least one traveler is required to calculate a price");
  }

  const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.subtotal, 0) * 100) / 100;

  return { lineItems, subtotal, currency: currency! };
}
