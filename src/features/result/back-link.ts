/**
 * Where a part's result page leads back to. The header's link used to say "Dashboard" everywhere, which is wrong for a
 * student who opened one part from a mock's overview or from History: they want to return to where they were.
 *   came from History            → "History"
 *   the part belongs to a mock   → "Mock exam" (that mock's overview)
 *   anything else                → undefined: the shell's own default
 * Browser-safe and pure; the hrefs are constants and the mock id is encoded, so nothing here can point off the site.
 */
export function resultBack({ referer, mockId }: { referer: string | null; mockId: string | null }): { href: string; label: string } | undefined {
  const path = pathOf(referer);
  if (path === "/history" || path?.startsWith("/history/")) return { href: "/history", label: "History" };
  if (mockId) return { href: `/practice/mock/${encodeURIComponent(mockId)}`, label: "Mock exam" };
  return undefined;
}

function pathOf(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).pathname;
  } catch {
    return null;
  }
}
