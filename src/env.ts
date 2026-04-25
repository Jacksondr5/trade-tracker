import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables schema.
   */
  server: {
    BRAVOS_WORKER_SECRET: z.string(),
    BROWSERBASE_API_KEY: z.string(),
    BROWSERBASE_PROJECT_ID: z.string().optional(),
    CLERK_SECRET_KEY: z.string(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    VERCEL_GATEWAY_API_KEY: z.string(),
  },

  /**
   * Client-side environment variables schema.
   * Prefix with `NEXT_PUBLIC_` to expose to the client.
   */
  client: {
    NEXT_PUBLIC_CLERK_FRONTEND_API_URL: z.string().trim().min(1),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
    NEXT_PUBLIC_CONVEX_URL: z.string().min(1),
  },

  /**
   * Runtime environment variables.
   */
  runtimeEnv: {
    BRAVOS_WORKER_SECRET: process.env.BRAVOS_WORKER_SECRET,
    BROWSERBASE_API_KEY: process.env.BROWSERBASE_API_KEY,
    BROWSERBASE_PROJECT_ID: process.env.BROWSERBASE_PROJECT_ID,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    VERCEL_GATEWAY_API_KEY: process.env.VERCEL_GATEWAY_API_KEY,
    NEXT_PUBLIC_CLERK_FRONTEND_API_URL:
      process.env.NEXT_PUBLIC_CLERK_FRONTEND_API_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
    NODE_ENV: process.env.NODE_ENV,
  },

  /**
   * Skip validation for CI/Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Treat empty strings as undefined.
   */
  emptyStringAsUndefined: true,
});
