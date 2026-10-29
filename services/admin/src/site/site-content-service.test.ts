import { describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@travel/types";
import { DEFAULT_TENANT_ID } from "@travel/database";
import { DEFAULT_SITE_CONTENT } from "@travel/validation";
import { SiteContentService } from "./site-content-service.js";
import type { SiteContentRepository } from "./site-content-repository.js";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const ACTOR = "22222222-2222-2222-2222-222222222222";

function setup(
  opts: { content?: unknown; tenant?: Partial<{ id: string; name: string; slug: string }> | null; slugTaken?: boolean; allowedVideoHosts?: string[] } = {}
) {
  const tenant =
    opts.tenant === null
      ? null
      : { id: TENANT, name: "Acme Travel", slug: "acme", status: "active", customDomain: null, customDomainVerifiedAt: null, ...opts.tenant };
  const repo = {
    find: vi.fn(async () => (opts.content === undefined ? null : { content: opts.content, updatedAt: new Date("2030-01-01T00:00:00Z") })),
    upsert: vi.fn(async () => ({})),
    findTenant: vi.fn(async () => tenant),
    isSlugTaken: vi.fn(async () => opts.slugTaken ?? false),
    updateTenantIdentity: vi.fn(async (_id: string, patch: { name?: string; slug?: string }) => ({ ...tenant!, ...patch })),
  };
  const ops = { writeAuditLog: vi.fn(async () => undefined) };
  const service = new SiteContentService(repo as unknown as SiteContentRepository, ops as unknown as AdminOperationsRepository, opts.allowedVideoHosts);
  return { service, repo, ops };
}

describe("SiteContentService: reading", () => {
  it("serves the defaults when the tenant has never saved anything", async () => {
    const { service } = setup();
    const res = await service.getPublic(TENANT);
    expect(res.content).toEqual(DEFAULT_SITE_CONTENT);
    expect(res.updatedAt).toBeNull();
  });

  it("serves stored values over the defaults", async () => {
    const { service } = setup({ content: { brand: { siteName: "Acme Safaris" } } });
    const res = await service.getPublic(TENANT);
    expect(res.content.brand?.siteName).toBe("Acme Safaris");
    expect(res.content.brand?.tagline).toBe(DEFAULT_SITE_CONTENT.brand.tagline);
    expect(res.updatedAt).toBe("2030-01-01T00:00:00.000Z");
  });

  it("never takes the public site down over bad stored data: falls back to the defaults", async () => {
    for (const corrupt of [{ brand: { logoUrl: "javascript:alert(1)" } }, { unknownSection: {} }, "not an object", 42, [1, 2]]) {
      const { service } = setup({ content: corrupt });
      const res = await service.getPublic(TENANT);
      expect(res.content, JSON.stringify(corrupt)).toEqual(DEFAULT_SITE_CONTENT);
    }
  });

  it("the admin view returns identity, what is stored, what visitors see, and the defaults", async () => {
    const { service } = setup({ content: { cta: { heading: "Book now" } } });
    const res = await service.getForAdmin(TENANT);
    expect(res.identity.slug).toBe("acme");
    expect(res.stored).toEqual({ cta: { heading: "Book now" } });
    expect(res.effective.cta?.heading).toBe("Book now");
    expect(res.effective.cta?.primary).toEqual(DEFAULT_SITE_CONTENT.cta.primary);
    expect(res.defaults).toEqual(DEFAULT_SITE_CONTENT);
  });

  it("404s for a tenant that does not exist", async () => {
    const { service } = setup({ tenant: null });
    await expect(service.getForAdmin(TENANT)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SiteContentService: updating content", () => {
  it("replaces a provided section, keeps the others, and records which sections changed", async () => {
    const { service, repo, ops } = setup({ content: { brand: { siteName: "Old" }, cta: { heading: "Keep me" } } });
    await service.updateContent(TENANT, { brand: { siteName: "New", tagline: "T" } }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledWith(TENANT, { brand: { siteName: "New", tagline: "T" }, cta: { heading: "Keep me" } }, ACTOR);
    expect(ops.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, actorUserId: ACTOR, action: "site.content_updated", metadata: { saved: ["brand"], reset: [] } })
    );
  });

  it("null resets a section; an untouched section stays", async () => {
    const { service, repo, ops } = setup({ content: { brand: { siteName: "X" }, cta: { heading: "Keep me" } } });
    await service.updateContent(TENANT, { brand: null }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledWith(TENANT, { cta: { heading: "Keep me" } }, ACTOR);
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ metadata: { saved: [], reset: ["brand"] } }));
  });

  it("never writes the content itself into the audit log (only section names)", async () => {
    const { service, ops } = setup();
    await service.updateContent(TENANT, { contact: { email: "private@acme.test" } }, ACTOR);
    expect(JSON.stringify(vi.mocked(ops.writeAuditLog).mock.calls)).not.toContain("private@acme.test");
  });

  it("builds on an empty document for a tenant's first save", async () => {
    const { service, repo } = setup();
    await service.updateContent(TENANT, { about: { headline: "Our story" } }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledWith(TENANT, { about: { headline: "Our story" } }, ACTOR);
  });

  it("refuses to write a document that would not validate, and writes nothing", async () => {
    const { service, repo, ops } = setup();
    await expect(service.updateContent(TENANT, { brand: { logoUrl: "javascript:alert(1)" } } as never, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(ops.writeAuditLog).not.toHaveBeenCalled();
  });

  it("404s (and writes nothing) for a tenant that does not exist", async () => {
    const { service, repo } = setup({ tenant: null });
    await expect(service.updateContent(TENANT, { brand: null }, ACTOR)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});

describe("SiteContentService: identity (name and slug)", () => {
  it("renames without touching the slug, and audits it", async () => {
    const { service, repo, ops } = setup();
    const res = await service.updateIdentity(TENANT, { name: "Acme Travel Ltd" }, ACTOR);
    expect(res.name).toBe("Acme Travel Ltd");
    expect(repo.updateTenantIdentity).toHaveBeenCalledWith(TENANT, { name: "Acme Travel Ltd" });
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "site.identity_updated", resourceType: "tenant" }));
  });

  it("is a no-op (no write, no audit entry) when nothing actually changes", async () => {
    const { service, repo, ops } = setup();
    await service.updateIdentity(TENANT, { name: "Acme Travel", slug: "acme" }, ACTOR);
    expect(repo.updateTenantIdentity).not.toHaveBeenCalled();
    expect(ops.writeAuditLog).not.toHaveBeenCalled();
  });

  it("will not change the address without explicit confirmation", async () => {
    const { service, repo } = setup();
    await expect(service.updateIdentity(TENANT, { slug: "acme-safaris" }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.updateTenantIdentity).not.toHaveBeenCalled();
  });

  it("changes the address when confirmed, and the audit entry records from -> to", async () => {
    const { service, ops } = setup();
    const res = await service.updateIdentity(TENANT, { slug: "acme-safaris", confirmSlugChange: true }, ACTOR);
    expect(res.slug).toBe("acme-safaris");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "site.address_changed", metadata: { slug: { from: "acme", to: "acme-safaris" } } })
    );
  });

  it("rejects an address another tenant already has", async () => {
    const { service, repo } = setup({ slugTaken: true });
    await expect(service.updateIdentity(TENANT, { slug: "taken", confirmSlugChange: true }, ACTOR)).rejects.toBeInstanceOf(ConflictError);
    expect(repo.updateTenantIdentity).not.toHaveBeenCalled();
  });

  it("turns a lost race on the unique index into a clean conflict instead of a 500", async () => {
    const { service, repo } = setup();
    repo.updateTenantIdentity.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    await expect(service.updateIdentity(TENANT, { slug: "raced", confirmSlugChange: true }, ACTOR)).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not swallow unrelated database errors", async () => {
    const { service, repo } = setup();
    repo.updateTenantIdentity.mockRejectedValueOnce(new Error("connection lost"));
    await expect(service.updateIdentity(TENANT, { name: "Whatever Ltd" }, ACTOR)).rejects.toThrow("connection lost");
  });

  it("the seeded default tenant's address is fixed (by id and by slug), but its name may change", async () => {
    const byId = setup({ tenant: { id: DEFAULT_TENANT_ID, slug: "renamed-in-db" } });
    await expect(byId.service.updateIdentity(DEFAULT_TENANT_ID, { slug: "other", confirmSlugChange: true }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    const bySlug = setup({ tenant: { slug: "default" } });
    await expect(bySlug.service.updateIdentity(TENANT, { slug: "other", confirmSlugChange: true }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    const rename = setup({ tenant: { id: DEFAULT_TENANT_ID, slug: "default" } });
    await expect(rename.service.updateIdentity(DEFAULT_TENANT_ID, { name: "Default (Renamed)" }, ACTOR)).resolves.toMatchObject({ name: "Default (Renamed)" });
  });
});

describe("SiteContentService: hero video hosts", () => {
  const OURS = "https://abc.supabase.co/storage/v1/object/public/media/t/hero_video/u/1.mp4";
  const THEIRS = "https://other.example.org/clip.mp4";
  const hosts = ["abc.supabase.co"];

  it("accepts a new link from an allowed host", async () => {
    const { service, repo } = setup({ allowedVideoHosts: hosts });
    await service.updateContent(TENANT, { hero: { videoUrls: [OURS] } }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it("rejects a NEW link from any other host, and writes nothing", async () => {
    const { service, repo } = setup({ allowedVideoHosts: hosts });
    await expect(service.updateContent(TENANT, { hero: { videoUrls: [OURS, THEIRS] } }, ACTOR)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("keeps a previously saved off-host link working, so unrelated saves are not blocked", async () => {
    const { service, repo } = setup({ allowedVideoHosts: hosts, content: { hero: { videoUrls: [THEIRS] } } });
    await service.updateContent(TENANT, { hero: { videoUrls: [THEIRS, OURS] } }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledOnce();
  });

  it("is unrestricted when no hosts are configured (local development, existing deployments)", async () => {
    const { service, repo } = setup();
    await service.updateContent(TENANT, { hero: { videoUrls: [THEIRS] } }, ACTOR);
    expect(repo.upsert).toHaveBeenCalledOnce();
  });
});
