import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "~/convex/_generated/api";
import { env } from "~/env";

const fetchPostRequestSchema = z.object({
  sourceUrl: z.string().url(),
});

export async function POST(request: Request) {
  const authState = await auth();
  const token = await authState.getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = fetchPostRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Bravos URL" }, { status: 400 });
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  convex.setAuth(token);
  const syncRunId = await convex.mutation(
    api.bravos.requestSpecificBravosPostFetch,
    {
      sourceUrl: parsed.data.sourceUrl,
    },
  );

  return NextResponse.json({ syncRunId });
}
