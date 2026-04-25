import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { api } from "~/convex/_generated/api";
import { env } from "~/env";
import { createBravosLoginSession } from "~/lib/bravos/browserbase";

export const runtime = "nodejs";

export async function POST() {
  const authState = await auth();
  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await createBravosLoginSession();
  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  convex.setAuth(token);
  await convex.mutation(api.bravos.saveBravosBrowserbaseSession, {
    browserbaseContextId: session.contextId,
    liveViewUrl: session.liveViewUrl,
  });

  return NextResponse.json(session);
}
