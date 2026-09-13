import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Unambiguous alphabet (no 0/O, 1/I/L) so codes survive being read aloud or handwritten.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    let out = "";
    for (let i = 0; i < 10; i += 1) {
      out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
      if (i === 4) out += "-";
    }
    return out;
  });
}

export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

// Returns the remaining hashes with the matched one removed, or null when nothing matched.
export function consumeRecoveryCode(hashes: readonly string[], input: string): string[] | null {
  const candidate = Buffer.from(hashRecoveryCode(input));
  let matchIndex = -1;
  hashes.forEach((h, i) => {
    const stored = Buffer.from(h);
    if (stored.length === candidate.length && timingSafeEqual(stored, candidate)) matchIndex = i;
  });
  if (matchIndex === -1) return null;
  return hashes.filter((_, i) => i !== matchIndex);
}
