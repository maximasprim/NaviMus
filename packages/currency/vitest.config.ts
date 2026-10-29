import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // @travel/config validates env at import time; supply the minimum so
    // tests never depend on a developer's local .env.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-1234",
    },
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
