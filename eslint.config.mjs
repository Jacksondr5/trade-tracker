import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "**/dist",
      "**/node_modules",
      "**/.worktrees/**",
      "**/convex/_generated",
      "**/.next/**",
      "**/out-tsc",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/output/playwright/**",
    ],
  },
  {
    files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.mjs", "**/*.cjs"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
