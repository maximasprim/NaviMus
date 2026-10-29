import { NotFoundError } from "@travel/types";
import type { CreatePackageInput, PackageSearchQuery } from "@travel/validation";
import { convertForDisplay } from "@travel/currency";
import type { PackageRepository } from "../repositories/package-repository.js";
import { calculatePackageQuote, type TravelerComposition } from "../pricing/quote-engine.js";

export class PackageService {
  constructor(private readonly repo: PackageRepository) {}

  async search(tenantId: string, query: PackageSearchQuery) {
    const { items, total } = await this.repo.search(tenantId, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getBySlug(tenantId: string, slug: string) {
    const pkg = await this.repo.findBySlug(tenantId, slug);
    if (!pkg) throw new NotFoundError("Package");
    return pkg;
  }

  async create(input: CreatePackageInput, operatorId: string, tenantId: string) {
    return this.repo.create(input, operatorId, tenantId);
  }

  async listForOperator(tenantId: string, operatorId: string) {
    return this.repo.listForOperator(tenantId, operatorId);
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Package");
    await this.repo.softDelete(tenantId, id);
  }

  async getAvailability(tenantId: string, packageId: string, from: string, to: string) {
    const pkg = await this.repo.findById(tenantId, packageId);
    if (!pkg) throw new NotFoundError("Package");
    return this.repo.getAvailability(packageId, from, to);
  }

  async setAvailability(tenantId: string, packageId: string, travelDate: string, totalCapacity: number) {
    const pkg = await this.repo.findById(tenantId, packageId);
    if (!pkg) throw new NotFoundError("Package");
    return this.repo.upsertAvailability(packageId, travelDate, totalCapacity);
  }

  /**
   * Public quoting endpoint - this is what the Booking service
   * (and the frontend, for display purposes only) calls to get an
   * authoritative price. The frontend must never compute this
   * itself and send it back as the booking amount.
   *
   * `tenantId` here is what stops a quote (and therefore a booking)
   * from ever being computed against another tenant's package.
   *
   * `displayCurrency` (optional) adds a `display` field showing the same
   * subtotal converted for an international shopper browsing in a second
   * currency (spec section 18/19) - it never changes `subtotal`/`currency`,
   * which stay the figures a booking is actually created against. See
   * @travel/currency's doc comment for why the two are kept strictly
   * separate.
   */
  async getQuote(
    tenantId: string,
    packageId: string,
    travelDate: string,
    travelers: TravelerComposition,
    displayCurrency?: string
  ) {
    const pkg = await this.repo.findById(tenantId, packageId);
    if (!pkg) throw new NotFoundError("Package");
    const prices = await this.repo.getPrices(packageId);
    const quote = calculatePackageQuote(prices, travelDate, travelers);

    if (displayCurrency && displayCurrency !== quote.currency) {
      try {
        const display = await convertForDisplay(quote.subtotal, quote.currency, displayCurrency);
        return { ...quote, display };
      } catch {
        // Unsupported/unreachable currency: omit `display` rather than
        // failing an otherwise-valid quote over a cosmetic conversion.
        return quote;
      }
    }
    return quote;
  }
}
