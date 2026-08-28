import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    // Existing Convex tests use owner-a and owner-b as authenticated mock
    // identities. Keep that test fixture explicit so production remains
    // fail-closed when ALLOWED_USER_IDS is absent.
    env: {
      ALLOWED_USER_IDS: "owner-a,owner-b",
    },
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "shared/**/*.test.ts",
      "convex/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    exclude: [
      "tests/**",
      "node_modules/**",
      "dist/**",
      ".next/**",
      "convex/_generated/**",
    ],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
