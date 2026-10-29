import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requestUploadUrlSchema } from "@travel/validation";
import { ok } from "@travel/http";
import { requireAuth } from "@travel/auth";
import type { MediaService } from "./services/media-service.js";

export function buildMediaRoutes(service: MediaService) {
  const app = new Hono();

  app.use("*", requireAuth);

  app.post("/upload-url", zValidator("json", requestUploadUrlSchema), async (c) => {
    const authUser = c.get("authUser");
    const input = c.req.valid("json");
    const result = await service.requestUploadUrl(c.get("tenantId"), input, authUser.sub, authUser.roles);
    return ok(c, result, undefined, 201);
  });

  app.get("/public-url/:storageKey{.+}", async (c) => {
    const storageKey = c.req.param("storageKey");
    return ok(c, { url: service.getPublicUrl(storageKey) });
  });

  return app;
}
