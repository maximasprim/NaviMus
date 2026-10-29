import { and, asc, desc, eq, exists, ilike, isNull, or, schema, sql, withTenant, scopedInsert, type Database } from "@travel/database";
import type { DestinationSearchQuery, CreateDestinationInput } from "@travel/validation";

type UpdateDestinationInput = Partial<CreateDestinationInput>;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class DestinationRepository {
  constructor(private readonly db: Database) {}

  /**
   * Spec section 23/24 (search & filtering): `q`/`country`/`region`/`city`
   * were accepted by `destinationSearchQuerySchema` but silently dropped
   * here - the schema promised filtering the repository never did. Fixed:
   * `q` does a simple ILIKE over name/short_description/description (a
   * PostgreSQL full-text `tsvector` index is the natural upgrade path
   * flagged in the spec - worth adding once catalog size justifies it,
   * but ILIKE is correct and adequate at current scale). `country`/
   * `region`/`city` filter through the city -> region -> country chain
   * with an EXISTS subquery per level actually supplied, so passing only
   * `country` doesn't require the caller to also know the region.
   * `minPrice`/`maxPrice` are accepted by the schema but destinations
   * themselves have no price column (packages do) - intentionally not
   * applied here rather than filtering against data that doesn't exist.
   */
  async search(tenantId: string, query: DestinationSearchQuery) {
    const conditions = [
      eq(schema.destinations.tenantId, tenantId),
      isNull(schema.destinations.deletedAt),
      eq(schema.destinations.status, "published"),
    ];

    if (query.category) conditions.push(eq(schema.destinations.categoryId, query.category));
    if (query.featured !== undefined) conditions.push(eq(schema.destinations.featured, query.featured));

    if (query.q) {
      const term = `%${query.q}%`;
      conditions.push(
        or(
          ilike(schema.destinations.name, term),
          ilike(schema.destinations.shortDescription, term),
          ilike(schema.destinations.description, term)
        )!
      );
    }

    if (query.city) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.cities)
            .where(and(eq(schema.cities.id, schema.destinations.cityId), ilike(schema.cities.name, `%${query.city}%`)))
        )
      );
    }

    if (query.region) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.cities)
            .innerJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId))
            .where(and(eq(schema.cities.id, schema.destinations.cityId), ilike(schema.regions.name, `%${query.region}%`)))
        )
      );
    }

    if (query.country) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.cities)
            .innerJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId))
            .innerJoin(schema.countries, eq(schema.countries.id, schema.regions.countryId))
            .where(
              and(
                eq(schema.cities.id, schema.destinations.cityId),
                eq(schema.countries.isoCode, query.country.toUpperCase())
              )
            )
        )
      );
    }

    const offset = (query.page - 1) * query.pageSize;

    const [items, countRows] = await Promise.all([
      this.db
        .select()
        .from(schema.destinations)
        .where(and(...conditions))
        .orderBy(query.order === "asc" ? asc(schema.destinations.createdAt) : desc(schema.destinations.createdAt))
        .limit(query.pageSize)
        .offset(offset),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.destinations)
        .where(and(...conditions)),
    ]);

    return { items, total: countRows[0]?.count ?? 0 };
  }

  /** Slugs are unique per-city in the schema, but for a simple public URL
   * (/destinations/:slug) this looks up by slug alone - acceptable while
   * the catalog is small; revisit with a citySlug prefix if collisions
   * appear at scale. */
  async findBySlug(tenantId: string, slug: string) {
    const [destination] = await this.db
      .select()
      .from(schema.destinations)
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.slug, slug), isNull(schema.destinations.deletedAt)))
      .limit(1);
    return destination ?? null;
  }

  async findById(tenantId: string, id: string) {
    const [destination] = await this.db
      .select()
      .from(schema.destinations)
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.id, id), isNull(schema.destinations.deletedAt)))
      .limit(1);
    return destination ?? null;
  }

  async create(tenantId: string, input: CreateDestinationInput) {
    const slug = input.slug ?? slugify(input.name);
    const [destination] = await this.db
      .insert(schema.destinations)
      .values(
        scopedInsert(tenantId, {
          name: input.name,
          slug,
          cityId: input.cityId,
          categoryId: input.categoryId,
          description: input.description,
          shortDescription: input.shortDescription,
          latitude: input.latitude,
          longitude: input.longitude,
          timezone: input.timezone,
          bestTimeToVisit: input.bestTimeToVisit,
          averageDurationHours: input.averageDurationHours,
          minimumAge: input.minimumAge,
          maximumCapacity: input.maximumCapacity,
          featured: input.featured,
        })
      )
      .returning();
    return destination!;
  }

  async update(tenantId: string, id: string, input: UpdateDestinationInput) {
    const [destination] = await this.db
      .update(schema.destinations)
      .set({ ...input, updatedAt: new Date() })
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.id, id)))
      .returning();
    return destination ?? null;
  }

  async softDelete(tenantId: string, id: string) {
    await this.db
      .update(schema.destinations)
      .set({ deletedAt: new Date() })
      .where(withTenant(schema.destinations.tenantId, tenantId, eq(schema.destinations.id, id)));
  }

  async listCategories(tenantId: string) {
    return this.db.select().from(schema.destinationCategories).where(eq(schema.destinationCategories.tenantId, tenantId));
  }

  /**
   * Public geography lookup - the partner portal's "create
   * accommodation" form previously had no way to look up a city id
   * except asking an admin directly. Returns city + region + country
   * name together so a single dropdown label ("Diani, Coast, Kenya")
   * is possible without three separate round trips.
   */
  async listCitiesWithGeography() {
    return this.db
      .select({
        id: schema.cities.id,
        name: schema.cities.name,
        regionName: schema.regions.name,
        countryName: schema.countries.name,
        countryIsoCode: schema.countries.isoCode,
      })
      .from(schema.cities)
      .innerJoin(schema.regions, eq(schema.regions.id, schema.cities.regionId))
      .innerJoin(schema.countries, eq(schema.countries.id, schema.regions.countryId))
      .orderBy(schema.countries.name, schema.cities.name);
  }
}
