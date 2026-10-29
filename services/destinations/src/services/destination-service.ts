import { NotFoundError } from "@travel/types";
import type { CreateDestinationInput, DestinationSearchQuery } from "@travel/validation";
import type { DestinationRepository } from "../repositories/destination-repository.js";

export class DestinationService {
  constructor(private readonly repo: DestinationRepository) {}

  async search(tenantId: string, query: DestinationSearchQuery) {
    const { items, total } = await this.repo.search(tenantId, query);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getBySlug(tenantId: string, slug: string) {
    const row = await this.repo.findBySlug(tenantId, slug);
    if (!row) throw new NotFoundError("Destination");
    return row;
  }

  async create(tenantId: string, input: CreateDestinationInput) {
    return this.repo.create(tenantId, input);
  }

  async update(tenantId: string, id: string, input: Partial<CreateDestinationInput>) {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Destination");
    const updated = await this.repo.update(tenantId, id, input);
    return updated!;
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Destination");
    await this.repo.softDelete(tenantId, id);
  }

  async listCategories(tenantId: string) {
    return this.repo.listCategories(tenantId);
  }

  /** Geography (cities/regions/countries) is shared platform-wide reference data, not tenant-scoped - see Phase 1's schema notes. */
  async listCities() {
    return this.repo.listCitiesWithGeography();
  }
}
