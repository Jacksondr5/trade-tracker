import { chromium, type Browser } from "playwright-core";
import { env } from "~/env";

const BROWSERBASE_API_URL = "https://api.browserbase.com/v1";
const BRAVOS_LOGIN_URL = "https://bravosresearch.com";

interface BrowserbaseSession {
  connectUrl?: string;
  contextId?: string;
  id: string;
  status?: string;
  projectId?: string;
}

interface BrowserbaseLiveViewLinks {
  debuggerFullscreenUrl?: string;
  debuggerUrl?: string;
  pages?: Array<{
    debuggerFullscreenUrl?: string;
    debuggerUrl?: string;
  }>;
}

async function browserbaseRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BROWSERBASE_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-BB-API-Key": env.BROWSERBASE_API_KEY,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Browserbase request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function createBrowserbaseContext(): Promise<string> {
  const context = await browserbaseRequest<{ id: string }>("/contexts", {
    body: JSON.stringify({}),
    method: "POST",
  });
  return context.id;
}

export async function createBrowserbaseSession(args: {
  contextId?: string;
  keepAlive?: boolean;
}): Promise<BrowserbaseSession> {
  return await browserbaseRequest<BrowserbaseSession>("/sessions", {
    body: JSON.stringify({
      browserSettings: args.contextId
        ? {
            context: {
              id: args.contextId,
              persist: true,
            },
          }
        : undefined,
      keepAlive: args.keepAlive ?? false,
      projectId: env.BROWSERBASE_PROJECT_ID,
    }),
    method: "POST",
  });
}

export async function getBrowserbaseLiveViewUrl(
  sessionId: string,
): Promise<string> {
  const links = await browserbaseRequest<BrowserbaseLiveViewLinks>(
    `/sessions/${sessionId}/debug`,
  );
  return (
    links.debuggerFullscreenUrl ??
    links.pages?.[0]?.debuggerFullscreenUrl ??
    links.debuggerUrl ??
    links.pages?.[0]?.debuggerUrl ??
    `https://browserbase.com/sessions/${sessionId}`
  );
}

export async function releaseBrowserbaseSession(sessionId: string) {
  await browserbaseRequest<BrowserbaseSession>(`/sessions/${sessionId}`, {
    body: JSON.stringify({
      projectId: env.BROWSERBASE_PROJECT_ID,
      status: "REQUEST_RELEASE",
    }),
    method: "POST",
  });
}

const SESSION_RELEASE_PENDING_STATUSES = new Set([
  "CREATED",
  "REQUEST_RELEASE",
  "RUNNING",
]);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSessionReleased(status: string | undefined): boolean {
  if (!status) {
    return false;
  }
  return !SESSION_RELEASE_PENDING_STATUSES.has(status.toUpperCase());
}

export async function pollBrowserbaseSessionReady(
  sessionId: string,
  options?: {
    initialIntervalMs?: number;
    maxIntervalMs?: number;
    timeoutMs?: number;
  },
) {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  const initialIntervalMs = options?.initialIntervalMs ?? 500;
  const maxIntervalMs = options?.maxIntervalMs ?? 5_000;
  const startedAt = Date.now();
  let intervalMs = initialIntervalMs;
  let lastStatus: string | undefined;
  let lastError: unknown = undefined;

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      const session = await browserbaseRequest<BrowserbaseSession>(
        `/sessions/${sessionId}`,
        { method: "GET" },
      );
      lastStatus = session.status;
      if (isSessionReleased(session.status)) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(intervalMs);
    intervalMs = Math.min(maxIntervalMs, Math.round(intervalMs * 1.7));
  }

  const errorSuffix = lastError instanceof Error
    ? ` Last error: ${lastError.message}`
    : "";
  throw new Error(
    `Timed out waiting for Browserbase session ${sessionId} to release. Last status: ${lastStatus ?? "unknown"}.${errorSuffix}`,
  );
}

async function navigateBrowserbaseSession(args: {
  session: BrowserbaseSession;
  url: string;
}) {
  if (!args.session.connectUrl) {
    throw new Error("Browserbase session did not return a connect URL");
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(args.session.connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(args.url, { waitUntil: "domcontentloaded" });
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

export async function createBravosLoginSession(): Promise<{
  contextId: string;
  liveViewUrl: string;
  sessionId: string;
}> {
  const contextId = await createBrowserbaseContext();
  const session = await createBrowserbaseSession({
    contextId,
    keepAlive: true,
  });
  await navigateBrowserbaseSession({
    session,
    url: BRAVOS_LOGIN_URL,
  });
  const liveViewUrl = await getBrowserbaseLiveViewUrl(session.id);
  return {
    contextId,
    liveViewUrl,
    sessionId: session.id,
  };
}

export async function captureBrowserbasePage(args: {
  contextId?: string;
  sourceUrl: string;
}): Promise<{
  finalUrl: string;
  html: string;
  postHtml?: string;
}> {
  const session = await createBrowserbaseSession({
    contextId: args.contextId,
    keepAlive: false,
  });
  const connectUrl = session.connectUrl;
  if (!connectUrl) {
    throw new Error("Browserbase session did not return a connect URL");
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.connectOverCDP(connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(args.sourceUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {
      // Some feeds keep long-polling connections open; DOM content is enough.
    });
    const postHtml = await page.evaluate(() => {
      const selectors = [
        "body article main article",
        "article",
      ];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element?.outerHTML) {
          return element.outerHTML;
        }
      }
      return null;
    });
    return {
      finalUrl: page.url(),
      html: await page.content(),
      postHtml: postHtml ?? undefined,
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
