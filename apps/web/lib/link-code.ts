// Alphabet without 0, O, 1, I so a person can read the code aloud and type it.
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 6;
export const LINK_CODE_RE = /^PULSE-[A-Z0-9]{6}$/;
/** Pending codes expire after this long. The agent enforces the same window. */
export const LINK_CODE_TTL_MS = 15 * 60 * 1000;

export const LINK_CHANNELS = ["imessage", "asi_one"] as const;
export type LinkChannel = (typeof LINK_CHANNELS)[number];

export function isLinkChannel(value: unknown): value is LinkChannel {
  return typeof value === "string" && (LINK_CHANNELS as readonly string[]).includes(value);
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** Returns a code like PULSE-7QK2MX. `random` returns a float in [0, 1). */
export function generateLinkCode(random: () => number = cryptoRandom): string {
  let suffix = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i++) {
    const idx = Math.min(
      LINK_CODE_ALPHABET.length - 1,
      Math.floor(random() * LINK_CODE_ALPHABET.length),
    );
    suffix += LINK_CODE_ALPHABET[idx];
  }
  return `PULSE-${suffix}`;
}

/** True when the text is a well formed link code. */
export function isLinkCode(value: string): boolean {
  return LINK_CODE_RE.test(value);
}
