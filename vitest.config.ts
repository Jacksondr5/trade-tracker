import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    environmentMatchGlobs: [["convex/**/*.test.ts", "edge-runtime"]],
    include: ["src/**/*.test.ts", "shared/**/*.test.ts", "convex/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", "dist/**", ".next/**", "convex/_generated/**"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
});
