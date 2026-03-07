import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "shared/**/*.test.ts"],
    exclude: ["tests/**", "node_modules/**", "dist/**", ".next/**", "convex/_generated/**"],
  },
});
