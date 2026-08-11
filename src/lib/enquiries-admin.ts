/**
 * The enquiry inbox's data layer (ARCHITECTURE §6.12, F-013).
 *
 * The `enquiries` table has existed since migration 0001 and is written by the
 * PUBLIC endpoint (`src/pages/api/enquiry.ts`), which persists a lead BEFORE
 * attempting the notification mail so a mail outage can never lose one. This
 * module is the read-and-triage half, and it deliberately adds nothing to that
 * write path.
 *
 * STATUS IS A LABEL, NOT A STATE MACHINE. Every transition is legal in both
 * directions — archived → new, spam → read, anything. Triage is someone deciding
 * what a message is, and being wrong about that once must not be permanent. The
 * only invalid status is one outside the four the schema's CHECK allows.
 *
 * Tested in tests/enquiries-admin.test.ts against tests/helpers/fake-d1.ts.
 */
import type { Database } from "./cms/db";

/** The four triage labels, matching migration 0001's CHECK constraint. */
export const ENQUIRY_STATUSES = ["new", "read", "archived", "spam"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export function isEnquiryStatus(value: unknown): value is EnquiryStatus {
  return typeof value === "string" && (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

/** The row as D1 returns it (§7.2). */
export type EnquiryDbRow = {
  id: number;
  name: string;
  email: string;
  message: string;
  company: string;
  locale: string;
  status: string;
  mail_status: string;
  ip_hash: string;
  user_agent: string;
  created_at: string;
};

/**
 * The row as the admin renders it.
 *
 * `ip_hash` is NOT carried through. It is a salted hash kept for abuse triage,
 * it tells Nicole nothing, and a value that reaches no screen should not reach a
 * template either.
 */
export type Enquiry = {
  id: number;
  name: string;
  email: string;
  message: string;
  company: string;
  locale: string;
  status: EnquiryStatus;
  /** Whether the notification mail went out — the reason to check your inbox or not. */
  mailStatus: string;
  createdAt: string;
};

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function mapEnquiryRow(raw: EnquiryDbRow): Enquiry {
  const status = text(raw.status);
  return {
    id: Number(raw.id),
    name: text(raw.name),
    email: text(raw.email),
    message: text(raw.message),
    company: text(raw.company),
    locale: text(raw.locale),
    // The CHECK constraint makes anything else impossible; the fallback exists so
    // a hand-edited row renders as unread rather than as blank chrome.
    status: isEnquiryStatus(status) ? status : "new",
    mailStatus: text(raw.mail_status),
    createdAt: text(raw.created_at),
  };
}

/**
 * The inbox, newest first. A filtered read hits `idx_enquiries_status_date`
 * (0001) on both of its columns.
 *
 * The limit is a guard, not a pager: 200 enquiries is years of a brochure site's
 * traffic, and building pagination for a list that will not reach one page is
 * work spent on a problem nobody has.
 */
export async function listEnquiries(
  db: Database,
  filter?: { status?: EnquiryStatus },
  limit = 200,
): Promise<Enquiry[]> {
  const statement = filter?.status
    ? db
        .prepare(
          `SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
        )
        .bind(filter.status, limit)
    : db.prepare(`SELECT * FROM enquiries ORDER BY created_at DESC, id DESC LIMIT ?`).bind(limit);

  const { results } = await statement.all<EnquiryDbRow>();
  return results.map(mapEnquiryRow);
}

/** The dashboard badge (F-016) — the one number worth putting on the front page. */
export async function countNewEnquiries(db: Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM enquiries WHERE status = 'new'`)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * How many enquiries carry each label, for the inbox's filter tabs.
 *
 * One GROUP BY rather than counting the rendered page: a tab that says "12" when
 * the list is capped at 200 should still say 12 at row 500.
 */
export async function countEnquiriesByStatus(db: Database): Promise<Record<EnquiryStatus, number>> {
  const counts = { new: 0, read: 0, archived: 0, spam: 0 } as Record<EnquiryStatus, number>;
  const { results } = await db
    .prepare(`SELECT status, COUNT(*) AS n FROM enquiries GROUP BY status`)
    .all<{ status: string; n: number }>();

  for (const row of results) {
    if (isEnquiryStatus(row.status)) counts[row.status] = Number(row.n);
  }
  return counts;
}

/**
 * Relabel one enquiry. Returns false when the id is unknown (→404) — a row
 * deleted or never present, which the caller must not report as a save.
 *
 * `UPDATE … RETURNING id` rather than an existence SELECT plus an UPDATE: the
 * §6.2 `Database` interface exposes no row-count metadata, and one statement
 * cannot race with itself.
 */
export async function setEnquiryStatus(
  db: Database,
  id: number,
  status: EnquiryStatus,
): Promise<boolean> {
  if (!isEnquiryStatus(status)) return false;

  const row = await db
    .prepare(`UPDATE enquiries SET status = ? WHERE id = ? RETURNING id`)
    .bind(status, id)
    .first<{ id: number }>();

  return row !== null;
}
