/**
 * Redirect map for the launch cutover. The live site's 5 Swedish slugs map 1:1
 * to the rebuild, so most need no redirect. This table covers (a) legacy slugs
 * from the abandoned heavy build that may be indexed, and (b) normalization.
 * Returns the target path (301) or null if no redirect applies.
 */
export const REDIRECTS: Record<string, string> = {
  // Legacy heavy-build slugs -> nearest new page
  "/team": "/personal",
  "/en/team": "/en/staff",
  "/karriar": "/jobba-pa-novo",
  "/portfolio": "/tavlingar",
  "/villkor": "/integritet",
  // Rebuild slugs renamed by the 2026-06-01 client IA (ARCHITECTURE §2A / §12)
  "/tjanster": "/priser",
  "/en/services": "/en/prices",
  "/utmarkelser": "/tavlingar",
  "/en/awards": "/en/competitions",
  // Retired commerce pages -> home (no replacement)
  "/produkter": "/",
  "/presentkort": "/",
  "/kassa": "/",
  "/konsultation": "/kontakt",
  "/forsta-besoket": "/om-oss",
  "/rekommendera": "/",
};

function normalize(pathname: string): string {
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return pathname.toLowerCase() || "/";
}

/** Resolve a redirect target for a given pathname, or null. */
export function resolveRedirect(pathname: string): string | null {
  const p = normalize(pathname);
  return REDIRECTS[p] ?? null;
}
