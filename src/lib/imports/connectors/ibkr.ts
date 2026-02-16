export function createIbkrLimiter() {
  let lastCallAt = -5000;

  return async function waitTurn(now = Date.now()): Promise<number> {
    const minGapMs = 5000;
    const waitMs = Math.max(0, minGapMs - (now - lastCallAt));
    lastCallAt = now + waitMs;
    return waitMs;
  };
}

export function mapIbkrPreflightToConnectionStatus(preflight: {
  authenticated: boolean;
}): "active" | "needs_reauth" {
  return preflight.authenticated ? "active" : "needs_reauth";
}
