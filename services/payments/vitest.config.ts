import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // @travel/config validates env at import time and exits on failure.
    // Supply the minimum so unit tests never depend on a developer's .env.
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-1234",
    },
  },
});
