import { auth } from "@clerk/nextjs/server";

export async function getConvexTokenOrThrow(): Promise<string> {
  const authState = await auth();
  const token = await authState.getToken({ template: "convex" });

  if (!token) {
    throw new Error(
      "Missing Clerk token for Convex. Ensure the Clerk JWT template named 'convex' is configured.",
    );
  }

  return token;
}
