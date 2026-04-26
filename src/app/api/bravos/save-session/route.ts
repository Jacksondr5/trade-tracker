import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "~/convex/_generated/api";
import { env } from "~/env";
import {
  pollBrowserbaseSessionReady,
  releaseBrowserbaseSession,
} from "~/lib/bravos/browserbase";

export const runtime = "nodejs";

export async function POST() {
  const authState = await auth();
  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  convex.setAuth(token);
  const connection = await convex.query(api.bravos.getBravosConnection, {});
  const sessionId = connection?.browserbaseLoginSessionId;
  if (!sessionId || connection.browserbaseLoginSessionReleasedAt !== undefined) {
    return NextResponse.json(
      { error: "No Bravos login session is waiting to be saved" },
      { status: 400 },
    );
  }

  await releaseBrowserbaseSession(sessionId);
  await pollBrowserbaseSessionReady(sessionId);
  await convex.mutation(api.bravos.markBravosBrowserbaseSessionSaved, {
    browserbaseSessionId: sessionId,
  });

  return NextResponse.json({ ok: true });
}
