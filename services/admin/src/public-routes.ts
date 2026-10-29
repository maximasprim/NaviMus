import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { selfServeSignupSchema } from "@travel/validation";
import { ok } from "@travel/http";
import { NotFoundError } from "@travel/types";
import { runInBypassContext, type Database } from "@travel/database";
import type { TenantService } from "./services/tenant-service.js";

/**
 * Public - no requireAuth, since nobody is logged in yet (this IS how a
 * new business gets its first login). Mounted at /api/v1/signup, which
 * the gateway both exempts from tenant-context resolution (there's no
 * tenant yet) and rate-limits more strictly than the general API traffic
 * (see apps/api-gateway/src/index.ts) - an unauthenticated,
 * account-creating endpoint is exactly the kind of thing worth throttling
 * harder than an authenticated read.
 */
export function buildPublicSignupRoutes(service: TenantService, db: Database) {
  const app = new Hono();

  app.post("/tenant", zValidator("json", selfServeSignupSchema), async (c) => {
    const input = c.req.valid("json");
    // A brand-new tenant has no tenant context yet, and provisioning writes
    // users/roles for it. Bypass is scoped to exactly this one operation.
    const tenant = await runInBypassContext(db, () => service.signUp(input));
    return ok(c, tenant, undefined, 201);
  });

  /** Public pricing tiers for the signup page - active plans only, unlike the super_admin listing which shows retired ones too. */
  app.get("/plans", async (c) => {
    const plans = await service.listPlans(true);
    return ok(c, plans);
  });

  /**
   * Maps a custom domain (e.g. "acmetravel.com") to the tenant slug it
   * belongs to - only when that domain is verified, per
   * TenantRepository.findByVerifiedDomain. Called by apps/web on every
   * server-rendered request whose Host header isn't a subdomain of the
   * platform's own domain (see apps/web/lib/tenant-server.ts), so it
   * needs to stay cheap and side-effect-free; unlike /tenant above this
   * never creates anything.
   *
   * Deliberately returns 404 (via NotFoundError, same as everywhere
   * else) rather than 200 with { slug: null } for an unresolved domain -
   * matches the gateway's own resolveTenant, which 404s the whole
   * request rather than silently falling back to a default tenant.
   */
  app.get("/resolve-domain", zValidator("query", z.object({ domain: z.string().min(1).max(255) })), async (c) => {
    const { domain } = c.req.valid("query");
    const resolved = await service.resolveByDomain(domain);
    if (!resolved) throw new NotFoundError("Tenant for this domain");
    return ok(c, resolved);
  });

  return app;
}
