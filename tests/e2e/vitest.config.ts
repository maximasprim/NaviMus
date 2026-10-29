import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Black-box HTTP tests hit a real gateway; generous timeouts since each
    // test may cross several services and a real (if scratch) database.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false, // booking/availability tests share seeded inventory - avoid cross-test races
  },
});
