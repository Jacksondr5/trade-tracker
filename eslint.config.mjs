import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [
      "**/dist",
      "**/node_modules",
      "**/convex/_generated",
      "**/.next/**",
      "**/out-tsc",
      "**/next-env.d.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;
