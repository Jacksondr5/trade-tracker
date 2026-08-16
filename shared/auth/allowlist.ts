function parseAllowedUserIds(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((userId) => userId.trim())
      .filter(Boolean),
  );
}

export function isAllowedTokenIdentifier(
  tokenIdentifier: string,
  allowedUserIds: string | undefined,
): boolean {
  return parseAllowedUserIds(allowedUserIds).has(tokenIdentifier);
}

// Clerk's userId is the JWT subject, while Convex authorizes the complete
// issuer|subject tokenIdentifier. This is only for the proxy's explanatory
// redirect; Convex remains the authorization boundary.
export function isAllowedClerkUserId(
  userId: string,
  allowedUserIds: string | undefined,
): boolean {
  return Array.from(parseAllowedUserIds(allowedUserIds)).some(
    (tokenIdentifier) => tokenIdentifier.endsWith(`|${userId}`),
  );
}
