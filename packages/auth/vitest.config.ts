import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
      REDIS_URL: "redis://localhost:6379",
      JWT_SECRET: "test-jwt-secret-test-jwt-secret-1234",
      JWT_REFRESH_SECRET: "test-refresh-secret-test-refresh-1234",
      ENCRYPTION_KEY: "11".repeat(32),
      ENCRYPTION_KEY_PREVIOUS: "22".repeat(32),
    },
  },
});
