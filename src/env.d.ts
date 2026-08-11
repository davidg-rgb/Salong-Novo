/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database;
  IMAGES: R2Bucket;
  PUBLIC_SITE_URL: string;
  PUBLIC_IMAGE_BASE: string;
  PUBLIC_BOOKING_URL: string;
  PUBLIC_GA4_ID?: string;
  ADMIN_API_TOKEN?: string;
  /** Cloudflare Access Application Audience (AUD) tag — prod only (§10.3). */
  ACCESS_AUD?: string;
  /** Access team domain, e.g. `<team>.cloudflareaccess.com` — prod only (§10.3). */
  ACCESS_TEAM_DOMAIN?: string;
  /** LOCAL DEV ONLY — synthesizes the admin identity; must be absent in prod. */
  DEV_ADMIN_EMAIL?: string;
}

declare namespace App {
  /** The authenticated admin identity populated by the middleware (§10.3). */
  interface AdminUser {
    email: string;
    source: "access" | "access-header" | "dev";
  }
  interface Locals {
    runtime: { env: CloudflareEnv };
    /** Set by the admin branch of middleware; null when unauthenticated. */
    user?: AdminUser | null;
  }
}
