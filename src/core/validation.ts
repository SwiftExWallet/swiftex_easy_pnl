const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Validates a Stellar StrKey public key (56 chars, starts with 'G', Base32 charset A-Z, 2-7).
 */
export function isValidStellarAddress(address: unknown): address is string {
  if (typeof address !== "string") return false;
  return STELLAR_PUBLIC_KEY_REGEX.test(address.trim());
}

export function truncateStellarAddress(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

