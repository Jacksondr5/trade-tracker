import type { QueryCtx, MutationCtx } from "../_generated/server";

type AuthCtx = Pick<QueryCtx | MutationCtx, "auth">;

export async function requireUser(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    throw new Error("Unauthorized");
  }

  return identity.tokenIdentifier;
}

export function assertOwner<T extends { ownerId?: string }>(
  doc: T | null,
  ownerId: string,
  notFoundMessage = "Record not found",
): T & { ownerId: string } {
  if (!doc || doc.ownerId !== ownerId) {
    throw new Error(notFoundMessage);
  }

  return doc as T & { ownerId: string };
}
