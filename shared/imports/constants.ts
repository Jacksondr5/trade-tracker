export const KRAKEN_DEFAULT_ACCOUNT_ID = "__kraken_default__";
export const KRAKEN_DEFAULT_ACCOUNT_FRIENDLY_NAME = "Kraken";

export function isKrakenDefaultAccountId(
  accountId: string | undefined,
): boolean {
  return accountId === KRAKEN_DEFAULT_ACCOUNT_ID;
}
