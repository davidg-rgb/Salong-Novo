/**
 * The `getSite()` seam the CMS core imports (RUNBOOK §3.4).
 *
 * With a kv map it returns `mergeSiteOverrides(site.json, kv)` — a deep clone
 * with every `site.*` row applied. With no argument it returns the UNTOUCHED
 * JSON defaults, which is what `/admin/content/[group]` renders as the grey
 * ghost placeholder behind an unedited field. Both callers matter: the merged
 * clone is what the public page shows, the raw defaults are what the admin says
 * the value would be if you cleared it.
 *
 * The site facts themselves still live in `content/site.json` and are also
 * reachable through `src/lib/content.ts`'s `getSite()`, which is the pre-CMS
 * accessor the public components use today. This module is the kv-aware
 * superset; there is one JSON file behind both.
 */
import siteData from "../../content/site.json";
import { mergeSiteOverrides, type KvMap } from "./cms/content";

export type Site = typeof siteData;

export function getSite(kv?: KvMap | null): Site {
  return kv ? mergeSiteOverrides(siteData, kv) : siteData;
}
