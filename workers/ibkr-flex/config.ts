import { z } from "zod";
import {
  DEFAULT_TEMPORAL_NAMESPACE,
  DEFAULT_TEMPORAL_TASK_QUEUE,
} from "./types";

const envSchema = z.object({
  BROKERAGE_INGESTION_BASE_URL: z.string().url(),
  BROKERAGE_INGESTION_TOKEN: z.string().min(1),
  IBKR_FLEX_TOKEN: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().min(1),
  TEMPORAL_NAMESPACE: z.string().min(1).default(DEFAULT_TEMPORAL_NAMESPACE),
  TEMPORAL_TASK_QUEUE: z.string().min(1).default(DEFAULT_TEMPORAL_TASK_QUEUE),
});

export type IbkrFlexWorkerConfig = {
  brokerageIngestionBaseUrl: string;
  brokerageIngestionToken: string;
  ibkrFlexBaseUrl: string;
  ibkrFlexToken: string;
  temporalAddress: string;
  temporalNamespace: string;
  temporalTaskQueue: string;
};

export function loadIbkrFlexWorkerConfig(
  env: Record<string, string | undefined> = process.env,
): IbkrFlexWorkerConfig {
  const parsed = envSchema.safeParse({
    BROKERAGE_INGESTION_BASE_URL: env.BROKERAGE_INGESTION_BASE_URL,
    BROKERAGE_INGESTION_TOKEN: env.BROKERAGE_INGESTION_TOKEN,
    IBKR_FLEX_TOKEN: env.IBKR_FLEX_TOKEN,
    TEMPORAL_ADDRESS: env.TEMPORAL_ADDRESS,
    TEMPORAL_NAMESPACE: env.TEMPORAL_NAMESPACE || DEFAULT_TEMPORAL_NAMESPACE,
    TEMPORAL_TASK_QUEUE: env.TEMPORAL_TASK_QUEUE || DEFAULT_TEMPORAL_TASK_QUEUE,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid IBKR Flex worker environment: ${missing}`);
  }

  return {
    brokerageIngestionBaseUrl: parsed.data.BROKERAGE_INGESTION_BASE_URL.replace(
      /\/+$/,
      "",
    ),
    brokerageIngestionToken: parsed.data.BROKERAGE_INGESTION_TOKEN,
    ibkrFlexBaseUrl:
      env.IBKR_FLEX_BASE_URL?.replace(/\/+$/, "") ??
      "https://gdcdyn.interactivebrokers.com/Universal/servlet",
    ibkrFlexToken: parsed.data.IBKR_FLEX_TOKEN,
    temporalAddress: parsed.data.TEMPORAL_ADDRESS,
    temporalNamespace: parsed.data.TEMPORAL_NAMESPACE,
    temporalTaskQueue: parsed.data.TEMPORAL_TASK_QUEUE,
  };
}
