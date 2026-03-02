import type { QueryCtx, MutationCtx } from "../_generated/server";
import { ConvexError } from "convex/values";

type AuthCtx = Pick<QueryCtx | MutationCtx, "auth">;

export async function requireUser(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    throw new ConvexError("Unauthorized");
  }

  return identity.tokenIdentifier;
}

export function assertOwner<T extends { ownerId?: string }>(
  doc: T | null,
  ownerId: string,
  notFoundMessage = "Record not found",
): T & { ownerId: string } {
  if (!doc || doc.ownerId !== ownerId) {
    throw new ConvexError(notFoundMessage);
  }

  return doc as T & { ownerId: string };
}
