/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Env = {
  DB: D1Database;
  MEDIA: R2Bucket;

  // public vars (wrangler.toml [vars])
  PUBLIC_SITE_URL: string;
  PUBLIC_IMAGE_BASE: string;
  PUBLIC_BOOKING_URL: string;
  PUBLIC_GA4_ID?: string;

  // secrets
  ADMIN_API_TOKEN?: string;

  /** Cloudflare Access Application Audience (AUD) tag — prod only (§10.3). */
  ACCESS_AUD?: string;
  /** Access team domain, e.g. `<team>.cloudflareaccess.com` — prod only (§10.3). */
  ACCESS_TEAM_DOMAIN?: string;

  /** LOCAL DEV ONLY — synthesizes the admin identity; must be absent in prod. */
  DEV_ADMIN_EMAIL?: string;
};

declare namespace App {
  /**
   * NOTE what is NOT here: a `runtime` property. @astrojs/cloudflare v14 removed
   * the adapter's runtime-env accessor and throws if you touch it, so
   * `App.Locals` deliberately does not extend the adapter's `Runtime` type — the
   * compiler then rejects the incorrect pattern outright, which is a stronger ban
   * than a grep. All binding access goes through `src/lib/cms/bindings.ts`.
   *
   * All four are stamped by `src/middleware.ts`. `db`/`getCms` on every request;
   * `adminEmail`/`adminToken` only on an ADMITTED admin request, which is why
   * they are optional and the other two are not.
   */
  interface Locals {
    db: import("./lib/cms/db").Database | null;
    getCms: () => Promise<import("./lib/cms/content").CmsContent>;
    adminEmail?: string;
    adminToken?: string;
  }
}
