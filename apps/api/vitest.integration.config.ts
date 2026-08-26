import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/integration/**/*.integration.test.ts"],
    // Integration tests share one real Postgres instance and create/query
    // real rows — run them sequentially to avoid cross-test interference,
    // not in parallel workers.
    fileParallelism: false,
  },
});
