// Alphabet without 0, O, 1, I so a person can read the code aloud and type it.
export const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LINK_CODE_RE = /^PULSE-[A-Z0-9]{4}$/;

/** Returns a code like PULSE-7QK2. `random` returns a float in [0, 1). */
export function generateLinkCode(random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 4; i++) {
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
