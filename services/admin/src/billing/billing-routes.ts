import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ok } from "@travel/http";
import { requireRoles } from "@travel/auth";
import type { BillingService } from "./billing-service.js";

const checkoutSchema = z.object({ planCode: z.string().min(1).max(30) });

/**
 * A tenant's own billing screen. Mounted under the admin app's `requireAuth`,
 * so the caller is authenticated and tenant-matched. Reading is open to any
 * tenant admin (and super_admin, who may be looking at a tenant); anything that
 * spends or cancels money is the tenant's own `admin` only - a platform
 * super_admin must not be able to subscribe a tenant to a paid plan.
 */
export function buildTenantBillingRoutes(billing: BillingService) {
  const app = new Hono();

  app.get("/", requireRoles("admin", "super_admin"), async (c) => {
    return ok(c, await billing.getOverview(c.get("tenantId")));
  });

  app.post("/checkout", requireRoles("admin"), zValidator("json", checkoutSchema), async (c) => {
    const authUser = c.get("authUser");
    const { planCode } = c.req.valid("json");
    return ok(c, await billing.startCheckout(c.get("tenantId"), planCode, authUser.sub, authUser.email));
  });

  app.post("/portal", requireRoles("admin"), async (c) => {
    return ok(c, await billing.openPortal(c.get("tenantId")));
  });

  return app;
}

/**
 * Stripe's callbacks for plan billing. Mounted OUTSIDE tenant resolution (the
 * path contains /webhooks/, which the gateway exempts) because Stripe sends no
 * tenant header. Authentication is Stripe's signature over the raw body, with
 * this endpoint's own signing secret.
 */
export function buildBillingWebhookRoutes(billing: BillingService) {
  const app = new Hono();

  app.post("/webhooks/stripe", async (c) => {
    // The signature covers the exact bytes; read the body as text, never re-serialised JSON.
    const rawBody = await c.req.text();
    const result = await billing.handleWebhook(rawBody, c.req.header("stripe-signature"));
    return c.json({ received: true, ...result });
  });

  return app;
}
