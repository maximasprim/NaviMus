import { and, asc, desc, eq, exists, gte, ilike, isNull, lte, or, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { CreatePackageInput, PackageSearchQuery } from "@travel/validation";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class PackageRepository {
  constructor(private readonly db: Database) {}

  /**
   * Spec section 23/24: the schema (`packageSearchQuerySchema`) already
   * accepted `q`, `country`, `destinationId`, `minPrice`/`maxPrice`,
   * `travelers`, and `startDate`/`endDate` - this method only actually
   * applied `type`/`featured`. Closed the gap for the rest:
   *  - `q`: ILIKE over name/short_description/description.
   *  - `destinationId` / `country`: EXISTS against package_destinations
   *    (joined through destinations -> cities -> regions -> countries for
   *    the country case), so "packages that visit Kenya" works without
   *    needing to know which specific destinations are in Kenya.
   *  - `minPrice`/`maxPrice`: EXISTS against package_prices for the
   *    adult/individual rate - the rate a search results page would show
   *    as "from $X" - not every traveler-type/season row.
   *  - `travelers`: packages whose maxGroupSize is null (unlimited) or
   *    >= the requested count.
   *  - `startDate`/`endDate`: EXISTS against package_availability for any
   *    bookable date in range with remaining capacity.
   */
  async search(tenantId: string, query: PackageSearchQuery) {
    const conditions = [
      eq(schema.packages.tenantId, tenantId),
      isNull(schema.packages.deletedAt),
      eq(schema.packages.status, "published"),
    ];
    if (query.type) conditions.push(eq(schema.packages.type, query.type));
    if (query.featured !== undefined) conditions.push(eq(schema.packages.featured, query.featured));

    if (query.q) {
      const term = `%${query.q}%`;
      conditions.push(
        or(ilike(schema.packages.name, term), ilike(schema.packages.shortDescription, term), ilike(schema.packages.description, term))!
      );
    }

    if (query.travelers) {
      conditions.push(
        or(sql`${schema.packages.maxGroupSize} IS NULL`, gte(schema.packages.maxGroupSize, query.travelers))!
      );
    }

    if (query.destinationId) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.packageDestinations)
            .where(
              and(
                eq(schema.packageDestinations.packageId, schema.packages.id),
                eq(schema.packageDestinations.destinationId, query.destinationId)
              )
            )
        )
      );
    }

    if (query.country) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.packageDestinations)
            .innerJoin(schema.destinations, eq(schema.destinations.id, schema.packageDestinations.destinationId))
            .innerJoin(schema.cities, eq(schema.cities.id, schema.destinations.cityId))
            .innerJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId))
            .innerJoin(schema.countries, eq(schema.countries.id, schema.regions.countryId))
            .where(
              and(
                eq(schema.packageDestinations.packageId, schema.packages.id),
                eq(schema.countries.isoCode, query.country.toUpperCase())
              )
            )
        )
      );
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceConditions = [
        eq(schema.packagePrices.packageId, schema.packages.id),
        eq(schema.packagePrices.travelerType, "adult"),
        eq(schema.packagePrices.pricingType, "individual"),
      ];
      if (query.minPrice !== undefined) priceConditions.push(gte(schema.packagePrices.amount, String(query.minPrice)));
      if (query.maxPrice !== undefined) priceConditions.push(lte(schema.packagePrices.amount, String(query.maxPrice)));
      conditions.push(
        exists(this.db.select({ one: sql`1` }).from(schema.packagePrices).where(and(...priceConditions)))
      );
    }

    if (query.startDate || query.endDate) {
      const availabilityConditions = [
        eq(schema.packageAvailability.packageId, schema.packages.id),
        sql`${schema.packageAvailability.bookedCount} < ${schema.packageAvailability.totalCapacity}`,
      ];
      if (query.startDate) availabilityConditions.push(gte(schema.packageAvailability.travelDate, query.startDate));
      if (query.endDate) availabilityConditions.push(lte(schema.packageAvailability.travelDate, query.endDate));
      conditions.push(
        exists(this.db.select({ one: sql`1` }).from(schema.packageAvailability).where(and(...availabilityConditions)))
      );
    }

    const offset = (query.page - 1) * query.pageSize;

    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.packages)
        .where(and(...conditions))
        .orderBy(query.order === "asc" ? asc(schema.packages.createdAt) : desc(schema.packages.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.packages)
        .where(and(...conditions)),
    ]);

    return { items, total: countRows[0]?.count ?? 0 };
  }

  async findBySlug(tenantId: string, slug: string) {
    const [pkg] = await this.db
      .select()
      .from(schema.packages)
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.slug, slug), isNull(schema.packages.deletedAt)))
      .limit(1);
    if (!pkg) return null;
    return this.attachDetails(pkg);
  }

  /**
   * Tenant-scoped so a booking (or any caller) can never resolve a
   * packageId belonging to a different tenant - this is the check that
   * stops a client from, say, booking Tenant B's package while
   * authenticated against Tenant A.
   */
  async findById(tenantId: string, id: string) {
    const [pkg] = await this.db
      .select()
      .from(schema.packages)
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.id, id), isNull(schema.packages.deletedAt)))
      .limit(1);
    if (!pkg) return null;
    return this.attachDetails(pkg);
  }

  /** Operator self-service: all of an operator's OWN packages regardless of status (draft/pending/published), unlike search() which is public-published-only. */
  async listForOperator(tenantId: string, operatorId: string) {
    return this.db
      .select()
      .from(schema.packages)
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.operatorId, operatorId), isNull(schema.packages.deletedAt)))
      .orderBy(desc(schema.packages.createdAt));
  }

  private async attachDetails(pkg: typeof schema.packages.$inferSelect) {
    const [destinations, itineraries, prices, inclusions, exclusions] = await Promise.all([
      this.db
        .select()
        .from(schema.packageDestinations)
        .where(eq(schema.packageDestinations.packageId, pkg.id))
        .orderBy(asc(schema.packageDestinations.sequenceOrder)),
      this.db
        .select()
        .from(schema.packageItineraries)
        .where(eq(schema.packageItineraries.packageId, pkg.id))
        .orderBy(asc(schema.packageItineraries.dayNumber)),
      this.db.select().from(schema.packagePrices).where(eq(schema.packagePrices.packageId, pkg.id)),
      this.db.select().from(schema.packageInclusions).where(eq(schema.packageInclusions.packageId, pkg.id)),
      this.db.select().from(schema.packageExclusions).where(eq(schema.packageExclusions.packageId, pkg.id)),
    ]);
    return { ...pkg, destinations, itineraries, prices, inclusions, exclusions };
  }

  async getPrices(packageId: string) {
    return this.db.select().from(schema.packagePrices).where(eq(schema.packagePrices.packageId, packageId));
  }

  /**
   * Phase 8 hardening (closed): confirms `transportRouteId` is one of the
   * options this specific package actually offers via
   * `package_transport_options`, rather than trusting any transport route
   * id the client sends. Returns the option row (needed for `priceOverride`)
   * or null if the package doesn't offer that route.
   */
  async findTransportOption(packageId: string, transportRouteId: string) {
    const [row] = await this.db
      .select()
      .from(schema.packageTransportOptions)
      .where(
        and(
          eq(schema.packageTransportOptions.packageId, packageId),
          eq(schema.packageTransportOptions.transportRouteId, transportRouteId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  /** Same as findTransportOption, for package_accommodation_options / room types. */
  async findAccommodationOption(packageId: string, roomTypeId: string) {
    const [row] = await this.db
      .select()
      .from(schema.packageAccommodationOptions)
      .where(
        and(
          eq(schema.packageAccommodationOptions.packageId, packageId),
          eq(schema.packageAccommodationOptions.roomTypeId, roomTypeId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async getAvailability(packageId: string, from: string, to: string) {
    return this.db
      .select()
      .from(schema.packageAvailability)
      .where(
        and(
          eq(schema.packageAvailability.packageId, packageId),
          gte(schema.packageAvailability.travelDate, from),
          lte(schema.packageAvailability.travelDate, to)
        )
      )
      .orderBy(asc(schema.packageAvailability.travelDate));
  }

  async getAvailabilityForDate(packageId: string, travelDate: string) {
    const [row] = await this.db
      .select()
      .from(schema.packageAvailability)
      .where(
        and(eq(schema.packageAvailability.packageId, packageId), eq(schema.packageAvailability.travelDate, travelDate))
      )
      .limit(1);
    return row ?? null;
  }

  async upsertAvailability(packageId: string, travelDate: string, totalCapacity: number) {
    const existing = await this.getAvailabilityForDate(packageId, travelDate);
    if (existing) {
      const [updated] = await this.db
        .update(schema.packageAvailability)
        .set({ totalCapacity, updatedAt: new Date() })
        .where(eq(schema.packageAvailability.id, existing.id))
        .returning();
      return updated!;
    }
    const [created] = await this.db
      .insert(schema.packageAvailability)
      .values({ packageId, travelDate, totalCapacity })
      .returning();
    return created!;
  }

  async create(input: CreatePackageInput, operatorId: string, tenantId: string) {
    const slug = input.slug ?? slugify(input.name);
    return this.db.transaction(async (tx) => {
      const [pkg] = await tx
        .insert(schema.packages)
        .values(
          scopedInsert(tenantId, {
            operatorId,
            name: input.name,
            slug,
            type: input.type,
            description: input.description,
            shortDescription: input.shortDescription,
            durationDays: input.durationDays,
            minGroupSize: input.minGroupSize,
            maxGroupSize: input.maxGroupSize,
            baseCurrency: input.baseCurrency,
            termsAndConditions: input.termsAndConditions,
            visaInformation: input.visaInformation,
            insuranceInformation: input.insuranceInformation,
            featured: input.featured,
          })
        )
        .returning();

      await tx.insert(schema.packageDestinations).values(
        input.destinationIds.map((destinationId, index) => ({
          packageId: pkg!.id,
          destinationId,
          sequenceOrder: index,
        }))
      );

      if (input.itineraries?.length) {
        await tx.insert(schema.packageItineraries).values(
          input.itineraries.map((it) => ({
            packageId: pkg!.id,
            dayNumber: it.dayNumber,
            title: it.title,
            description: it.description,
          }))
        );
      }

      await tx.insert(schema.packagePrices).values(
        input.prices.map((p) => ({
          packageId: pkg!.id,
          travelerType: p.travelerType,
          pricingType: p.pricingType,
          seasonLabel: p.seasonLabel,
          seasonStartDate: p.seasonStartDate,
          seasonEndDate: p.seasonEndDate,
          amount: p.amount.toFixed(2),
          currency: p.currency,
        }))
      );

      if (input.inclusions?.length) {
        await tx.insert(schema.packageInclusions).values(
          input.inclusions.map((label) => ({ packageId: pkg!.id, label }))
        );
      }
      if (input.exclusions?.length) {
        await tx.insert(schema.packageExclusions).values(
          input.exclusions.map((label) => ({ packageId: pkg!.id, label }))
        );
      }

      return pkg!;
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.db
      .update(schema.packages)
      .set({ deletedAt: new Date() })
      .where(withTenant(schema.packages.tenantId, tenantId, eq(schema.packages.id, id)));
  }
}
