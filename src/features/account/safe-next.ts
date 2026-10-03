/** Where to go after signing in: only a path inside this site (never another origin, never a protocol-relative URL). */
export function safeNextPath(value: string | string[] | undefined | null): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\") || candidate.includes("://")) return "/";
  return candidate;
}
