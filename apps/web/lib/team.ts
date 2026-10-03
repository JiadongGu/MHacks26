/** Splits a comma list into trimmed, lower-case, non-empty entries. */
export function parseEmailList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the email is in TEAM_EMAILS. An empty list admits nobody. */
export function isTeamEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.TEAM_EMAILS,
): boolean {
  if (!email) return false;
  return parseEmailList(raw).includes(email.trim().toLowerCase());
}
