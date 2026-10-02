import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://wattsup:wattsup@localhost:5432/wattsup_test";

export default defineConfig({
  resolve: { alias },
  test: {
    // Une seule base de test partagée : les fichiers s'exécutent l'un après l'autre.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/domain/**"],
      exclude: ["src/domain/**/types.ts", "src/domain/**/pricer.ts"],
      thresholds: { lines: 90 },
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/setup/global.ts"],
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            BETTER_AUTH_SECRET: "test-secret-not-for-production-0123456789",
            BETTER_AUTH_URL: "http://localhost:3000",
          },
        },
      },
    ],
  },
});
