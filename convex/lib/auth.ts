import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { ConvexError } from "convex/values";
import { isAllowedTokenIdentifier } from "../../shared/auth/allowlist";

type AuthCtx = Pick<ActionCtx | MutationCtx | QueryCtx, "auth">;

export async function requireUser(ctx: AuthCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.tokenIdentifier) {
    throw new ConvexError("Unauthorized");
  }

  if (
    !isAllowedTokenIdentifier(
      identity.tokenIdentifier,
      process.env.ALLOWED_USER_IDS,
    )
  ) {
    console.warn("Denied identity not in ALLOWED_USER_IDS", {
      tokenIdentifier: identity.tokenIdentifier,
    });
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
