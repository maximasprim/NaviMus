import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apiRequest, uniqueEmail, waitForGateway } from "./client.js";
import { SEED_ADMIN_EMAIL, loginAs } from "./fixtures.js";

/**
 * Per-tenant public site content (admin console -> storefront).
 *
 * Runs against a THROWAWAY tenant created here (never the shared default tenant), and deletes it at the
 * end - which also proves tenant hard-delete still works now that tenants own a site-content row.
 */

interface SiteContent {
  brand?: { siteName?: string; tagline?: string; logoUrl?: string; footerTagline?: string; copyright?: string };
  hero?: { headline?: string };
  testimonials?: { heading?: string; items?: Array<{ quote: string; name: string; trip?: string }> };
  about?: unknown;
  contact?: unknown;
}
interface AdminSite {
  identity: { id: string; name: string; slug: string };
  stored: SiteContent;
  effective: SiteContent;
  defaults: SiteContent;
  updatedAt: string | null;
}

const OWNER_PASSWORD = "Correct-Horse-9!";
const slugOf = () => `e2e-site-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function loginOn(slug: string, email: string, password: string): Promise<string> {
  const res = await apiRequest<{ accessToken: string }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password },
    headers: { "x-tenant-slug": slug },
  });
  if (!res.success || !res.data) throw new Error(`login failed on ${slug}: ${res.error?.code} ${res.error?.message}`);
  return res.data.accessToken;
}

describe("tenant site content", () => {
  let platformToken: string;
  let tenantId: string;
  let slug: string;
  let ownerToken: string;
  let customerToken: string;
  let defaults: SiteContent;
  const on = () => ({ "x-tenant-slug": slug });

  beforeAll(async () => {
    await waitForGateway();
    platformToken = await loginAs(SEED_ADMIN_EMAIL); // seeded super_admin

    slug = slugOf();
    const ownerEmail = uniqueEmail("e2e-site-owner");
    const created = await apiRequest<{ id: string }>("/api/v1/platform/tenants", {
      method: "POST",
      token: platformToken,
      body: {
        name: "E2E Site Tenant",
        slug,
        ownerEmail,
        ownerPassword: OWNER_PASSWORD,
        ownerFirstName: "Site",
        ownerLastName: "Owner",
      },
    });
    expect(created.status, JSON.stringify(created.error)).toBe(201);
    tenantId = created.data!.id;
    ownerToken = await loginOn(slug, ownerEmail, OWNER_PASSWORD);

    // An ordinary customer of that tenant, for the permission checks.
    const customerEmail = uniqueEmail("e2e-site-customer");
    await apiRequest("/api/v1/auth/register", {
      method: "POST",
      headers: on(),
      body: { email: customerEmail, password: OWNER_PASSWORD, firstName: "Cu", lastName: "Stomer" },
    });
    customerToken = await loginOn(slug, customerEmail, OWNER_PASSWORD);
  });

  afterAll(async () => {
    // Suspend then permanently delete: also proves hard-delete is unaffected by the new site-content table.
    await apiRequest(`/api/v1/platform/tenants/${tenantId}/suspend`, {
      method: "POST",
      token: platformToken,
      body: { reason: "e2e cleanup" },
    });
    const del = await apiRequest<{ deleted: boolean }>(`/api/v1/platform/tenants/${tenantId}`, {
      method: "DELETE",
      token: platformToken,
      body: { confirmSlug: slug },
    });
    expect(del.status, JSON.stringify(del.error)).toBe(200);
    expect(del.data?.deleted).toBe(true);
  });

  it("a tenant that has configured nothing serves exactly the built-in defaults (and no About/Contact)", async () => {
    const admin = await apiRequest<AdminSite>("/api/v1/admin/site", { token: ownerToken, headers: on() });
    expect(admin.success, JSON.stringify(admin.error)).toBe(true);
    expect(admin.data!.identity.slug).toBe(slug);
    expect(admin.data!.stored).toEqual({});
    defaults = admin.data!.defaults;

    const pub = await apiRequest<{ content: SiteContent; updatedAt: string | null }>("/api/v1/site", { headers: on() });
    expect(pub.success).toBe(true);
    expect(pub.data!.content).toEqual(defaults);
    expect(pub.data!.updatedAt).toBeNull();
    expect(pub.data!.content.brand?.siteName).toBe("NaviMus");
    expect(pub.data!.content.about).toBeUndefined();
    expect(pub.data!.content.contact).toBeUndefined();
  });

  it("the public endpoint needs no login, but the tenant must resolve", async () => {
    const noTenant = await apiRequest("/api/v1/site", { headers: { "x-tenant-slug": "no-such-tenant-xyz" } });
    expect(noTenant.status).toBe(404);
  });

  it("only admins can read or edit it: anonymous -> 401, customer -> 403", async () => {
    const body = { brand: { siteName: "Hijacked" } };
    expect((await apiRequest("/api/v1/admin/site", { headers: on() })).status).toBe(401);
    expect((await apiRequest("/api/v1/admin/site/content", { method: "PATCH", headers: on(), body })).status).toBe(401);
    expect((await apiRequest("/api/v1/admin/site", { token: customerToken, headers: on() })).status).toBe(403);
    expect((await apiRequest("/api/v1/admin/site/content", { method: "PATCH", token: customerToken, headers: on(), body })).status).toBe(403);
    expect((await apiRequest("/api/v1/admin/site/identity", { method: "PATCH", token: customerToken, headers: on(), body: { name: "Nope" } })).status).toBe(403);
  });

  it("saves sections, and the public site reflects them while untouched sections keep their defaults", async () => {
    const save = await apiRequest<AdminSite>("/api/v1/admin/site/content", {
      method: "PATCH",
      token: ownerToken,
      headers: on(),
      body: {
        brand: { siteName: "Acme Safaris", tagline: "Wild, properly", logoUrl: "https://cdn.acme.test/logo.png" },
        testimonials: { items: [{ quote: "Brilliant trip.", name: "Zawadi M.", trip: "Serengeti week" }] },
        about: { headline: "Our story", paragraphs: ["We started in 1999.", "<b>Not bold</b>, just text."] },
        contact: { email: "hello@acme.test", phone: "+254 700 000 000", social: { instagram: "https://instagram.com/acme" } },
      },
    });
    expect(save.success, JSON.stringify(save.error)).toBe(true);
    expect(save.data!.updatedAt).not.toBeNull();

    const pub = await apiRequest<{ content: SiteContent }>("/api/v1/site", { headers: on() });
    const c = pub.data!.content;
    expect(c.brand?.siteName).toBe("Acme Safaris");
    expect(c.brand?.tagline).toBe("Wild, properly");
    expect(c.brand?.footerTagline).toBe(defaults.brand?.footerTagline); // same section, field not touched
    expect(c.testimonials?.items).toEqual([{ quote: "Brilliant trip.", name: "Zawadi M.", trip: "Serengeti week" }]);
    expect(c.testimonials?.heading).toBe(defaults.testimonials?.heading);
    expect(c.hero).toEqual(defaults.hero); // a section nobody touched
    expect(c.about).toBeDefined();
    expect(c.contact).toBeDefined();
  });

  it("section updates are independent: saving one tab never overwrites another", async () => {
    await apiRequest("/api/v1/admin/site/content", { method: "PATCH", token: ownerToken, headers: on(), body: { hero: { headline: "Fresh headline" } } });
    const admin = await apiRequest<AdminSite>("/api/v1/admin/site", { token: ownerToken, headers: on() });
    expect(admin.data!.stored.hero?.headline).toBe("Fresh headline");
    expect(admin.data!.stored.brand?.siteName).toBe("Acme Safaris"); // untouched by the hero save
    expect(admin.data!.stored.testimonials?.items).toHaveLength(1);
  });

  it("rejects unsafe or malformed content with a 400 and stores nothing", async () => {
    const bad: Array<[string, unknown]> = [
      ["javascript: link", { cta: { primary: { label: "Go", href: "javascript:alert(1)" } } }],
      ["http image", { brand: { logoUrl: "http://insecure.test/logo.png" } }],
      ["protocol-relative link", { cta: { primary: { label: "Go", href: "//evil.test" } } }],
      ["unknown section", { notASection: { a: 1 } }],
      ["unknown field", { brand: { siteName: "X", sneaky: true } }],
      ["empty site name", { brand: { siteName: "" } }],
      ["too many testimonials", { testimonials: { items: Array.from({ length: 13 }, () => ({ quote: "q", name: "n" })) } }],
      ["bad email", { contact: { email: "nope" } }],
      ["empty body", {}],
    ];
    for (const [label, body] of bad) {
      const res = await apiRequest("/api/v1/admin/site/content", { method: "PATCH", token: ownerToken, headers: on(), body });
      expect(res.status, label).toBe(400);
    }
    const admin = await apiRequest<AdminSite>("/api/v1/admin/site", { token: ownerToken, headers: on() });
    expect(admin.data!.stored.brand?.siteName).toBe("Acme Safaris"); // all of the above stored nothing
  });

  it("null resets a section back to the defaults", async () => {
    const res = await apiRequest("/api/v1/admin/site/content", { method: "PATCH", token: ownerToken, headers: on(), body: { brand: null, hero: null } });
    expect(res.success).toBe(true);
    const pub = await apiRequest<{ content: SiteContent }>("/api/v1/site", { headers: on() });
    expect(pub.data!.content.brand).toEqual(defaults.brand);
    expect(pub.data!.content.hero).toEqual(defaults.hero);
    expect(pub.data!.content.testimonials?.items).toHaveLength(1); // not reset
  });

  it("is isolated per tenant: this tenant's edits never appear on the default tenant", async () => {
    const other = await apiRequest<{ content: SiteContent }>("/api/v1/site", { headers: { "x-tenant-slug": "default" } });
    expect(other.success).toBe(true);
    expect(other.data!.content.testimonials?.items).toHaveLength(3); // the built-in three
    expect(other.data!.content.contact).toBeUndefined();
  });

  it("a token from this tenant cannot edit another tenant's site", async () => {
    const res = await apiRequest("/api/v1/admin/site/content", {
      method: "PATCH",
      token: ownerToken,
      headers: { "x-tenant-slug": "default" },
      body: { brand: { siteName: "Cross-tenant takeover" } },
    });
    expect([401, 403]).toContain(res.status);
    const other = await apiRequest<{ content: SiteContent }>("/api/v1/site", { headers: { "x-tenant-slug": "default" } });
    expect(other.data!.content.brand?.siteName).toBe("NaviMus");
  });

  it("records edits in the tenant's audit log", async () => {
    const log = await apiRequest<Array<{ action: string }>>("/api/v1/admin/audit-logs", { token: ownerToken, headers: on() });
    expect(log.success, JSON.stringify(log.error)).toBe(true);
    expect(log.data!.map((e) => e.action)).toContain("site.content_updated");
  });

  describe("identity: name and slug", () => {
    it("renames the internal organisation name", async () => {
      const res = await apiRequest<{ name: string }>("/api/v1/admin/site/identity", { method: "PATCH", token: ownerToken, headers: on(), body: { name: "E2E Site Tenant Ltd" } });
      expect(res.success, JSON.stringify(res.error)).toBe(true);
      expect(res.data!.name).toBe("E2E Site Tenant Ltd");
    });

    it("a slug change must be explicitly confirmed", async () => {
      const res = await apiRequest("/api/v1/admin/site/identity", { method: "PATCH", token: ownerToken, headers: on(), body: { slug: `${slug}-x` } });
      expect(res.status).toBe(400);
      const stillThere = await apiRequest("/api/v1/site", { headers: on() });
      expect(stillThere.success).toBe(true);
    });

    it("rejects reserved, malformed and already-taken addresses", async () => {
      const attempt = (s: string) =>
        apiRequest("/api/v1/admin/site/identity", { method: "PATCH", token: ownerToken, headers: on(), body: { slug: s, confirmSlugChange: true } });
      expect((await attempt("admin")).status).toBe(400);
      expect((await attempt("Has Spaces")).status).toBe(400);
      expect((await attempt("ab")).status).toBe(400);
      expect((await attempt("default")).status).toBe(409); // belongs to the seeded tenant
    });

    it("the seeded default tenant's address cannot be changed", async () => {
      const res = await apiRequest("/api/v1/admin/site/identity", {
        method: "PATCH",
        token: platformToken,
        headers: { "x-tenant-slug": "default" },
        body: { slug: "renamed-default", confirmSlugChange: true },
      });
      expect(res.status).toBe(400);
      const still = await apiRequest("/api/v1/site", { headers: { "x-tenant-slug": "default" } });
      expect(still.success).toBe(true);
    });

    it("moves the site to the new address: new slug works, the old one stops resolving", async () => {
      const oldSlug = slug;
      const newSlug = `${slug}-moved`;
      const res = await apiRequest<{ slug: string }>("/api/v1/admin/site/identity", {
        method: "PATCH",
        token: ownerToken,
        headers: { "x-tenant-slug": oldSlug },
        body: { slug: newSlug, confirmSlugChange: true },
      });
      expect(res.success, JSON.stringify(res.error)).toBe(true);
      expect(res.data!.slug).toBe(newSlug);
      slug = newSlug; // the afterAll cleanup deletes by the current slug

      expect((await apiRequest("/api/v1/site", { headers: { "x-tenant-slug": oldSlug } })).status).toBe(404);
      const fresh = await apiRequest<{ content: SiteContent }>("/api/v1/site", { headers: { "x-tenant-slug": newSlug } });
      expect(fresh.success).toBe(true);
      expect(fresh.data!.content.testimonials?.items?.[0]?.name).toBe("Zawadi M."); // content moved with the tenant
      // The same session keeps working at the new address.
      const admin = await apiRequest<AdminSite>("/api/v1/admin/site", { token: ownerToken, headers: { "x-tenant-slug": newSlug } });
      expect(admin.success).toBe(true);
      expect(admin.data!.identity.slug).toBe(newSlug);

      // The admin console identifies the tenant by id once the address has changed, so the same session
      // must keep working with ONLY the tenant id (no slug at all) - this is what prevents a lock-out.
      const byId = await apiRequest<AdminSite>("/api/v1/admin/site", { token: ownerToken, headers: { "x-tenant-id": tenantId } });
      expect(byId.success, JSON.stringify(byId.error)).toBe(true);
      expect(byId.data!.identity.slug).toBe(newSlug);
      const edit = await apiRequest("/api/v1/admin/site/content", {
        method: "PATCH",
        token: ownerToken,
        headers: { "x-tenant-id": tenantId },
        body: { cta: { heading: "Edited by id after the move" } },
      });
      expect(edit.success, JSON.stringify(edit.error)).toBe(true);

      // The rename and the address move are both in the tenant's audit trail, with before/after values.
      const log = await apiRequest<Array<{ action: string; metadata?: { slug?: { from: string; to: string } } }>>("/api/v1/admin/audit-logs", {
        token: ownerToken,
        headers: { "x-tenant-slug": newSlug },
      });
      const actions = log.data!.map((e) => e.action);
      expect(actions).toContain("site.identity_updated");
      const moved = log.data!.find((e) => e.action === "site.address_changed");
      expect(moved?.metadata?.slug).toEqual({ from: oldSlug, to: newSlug });
    });
  });
});
