import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { seedCollectionFromDefaults } from "~/lib/collections";
import { listCollectionItems } from "~/lib/cms/collections";
import { STAFF } from "~/cms.config";
import type { CollectionDef } from "~/lib/cms/config-types";
import type { Database, PreparedStatement } from "~/lib/cms/db";

/**
 * "Kopiera standardlistan" — the escape hatch on the no-seed provenance rule.
 *
 * The rule (`src/lib/collections.ts`) is that a list with no rows renders from
 * JSON, so nothing is seeded at deploy. The cost is an admin page that says
 * "Listan är tom" while eighteen stylists are live on the site, and a client who
 * fixes that by typing a nineteenth — at which point D1 wins and the other
 * eighteen disappear. This is the button that makes that impossible, so the
 * properties worth pinning are the ones that make it safe to press: it happens
 * ONCE, it preserves ORDER, and a bad default writes NOTHING.
 *
 * The fake below is a step up from `helpers/fake-d1.ts`: order and idempotency
 * are statements about accumulated state, which a responder that cannot see its
 * own writes cannot express. It interprets exactly the three statements the seed
 * path issues and nothing else.
 */

type Row = {
  id: number;
  collection: string;
  data: string;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

class MemoryD1 implements Database {
  readonly rows: Row[] = [];
  private nextId = 1;

  prepare(sql: string): PreparedStatement {
    const text = sql.replace(/\s+/g, " ").trim();
    let binds: unknown[] = [];
    // Memoized: `first()` on the INSERT must not write a second row if the
    // caller also inspects it, and nothing in the data layer expects a
    // statement to be re-executed per accessor.
    let cached: unknown[] | undefined;

    const run = (): unknown[] => {
      if (text.startsWith("INSERT INTO collection_items")) {
        const [collection, data, sortOrder, createdAt, updatedAt] = binds;
        const row: Row = {
          id: this.nextId++,
          collection: String(collection),
          data: String(data),
          sort_order: Number(sortOrder),
          status: "published",
          created_at: String(createdAt),
          updated_at: String(updatedAt),
        };
        this.rows.push(row);
        return [row];
      }
      if (text.includes("MAX(sort_order)")) {
        const scoped = this.rows.filter((row) => row.collection === binds[0]);
        const max = scoped.reduce<number | null>(
          (acc, row) => (acc === null || row.sort_order > acc ? row.sort_order : acc),
          null,
        );
        return [{ n: max }];
      }
      if (text.startsWith("SELECT * FROM collection_items WHERE collection = ?")) {
        return this.rows
          .filter((row) => row.collection === binds[0])
          .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      }
      return [];
    };

    const stmt: PreparedStatement = {
      bind: (...values: unknown[]) => {
        binds = values;
        return stmt;
      },
      all: async <T>() => ({ results: (cached ??= run()) as T[] }),
      first: async <T>() => ((cached ??= run())[0] ?? null) as T | null,
      run: async () => ({ success: true }),
    };
    return stmt;
  }
}

const NOW = "2026-08-23T09:00:00.000Z";
const AUTHOR = "david@example.com";

/** The names in `content/staff.json`, in file order — the order the site shows. */
const defaultNames = (def: CollectionDef): string[] =>
  (def.jsonFallback() as Record<string, unknown>[]).map((item) => String(item.name));

describe("seedCollectionFromDefaults — copying the JSON defaults into D1", () => {
  it("writes every default of an empty collection", async () => {
    const db = new MemoryD1();
    const result = await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW);

    const expected = defaultNames(STAFF);
    expect(expected.length).toBe(18);
    expect(result).toEqual({ ok: true, inserted: expected.length });
    expect(db.rows.length).toBe(expected.length);
  });

  it("preserves JSON order, so the public page looks the same after seeding", async () => {
    // The whole point of the affordance is that pressing it changes WHO decides
    // the list, not what the visitor sees. An append-ordered insert loop is what
    // buys that: `sort_order` is 0…17 in file order.
    const db = new MemoryD1();
    await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW);

    const stored = await listCollectionItems(db, STAFF.name, { includeDrafts: true });
    expect(stored.map((item) => item.data.name)).toEqual(defaultNames(STAFF));
    expect(stored.map((item) => item.sort_order)).toEqual(stored.map((_, index) => index));
  });

  it("stamps the author and the timestamp it was given", async () => {
    const db = new MemoryD1();
    await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW);
    expect(db.rows.every((row) => row.created_at === NOW && row.updated_at === NOW)).toBe(true);
  });

  it("REFUSES a second run rather than duplicating the list", async () => {
    const db = new MemoryD1();
    await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW);
    const before = db.rows.length;

    const second = await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW);
    expect(second).toEqual({ ok: false, error: "not_empty" });
    expect(db.rows.length).toBe(before);
  });

  it("refuses when a SINGLE row exists — the list is already the client's", async () => {
    const db = new MemoryD1();
    db.rows.push({
      id: 99,
      collection: STAFF.name,
      data: JSON.stringify({ name: "Hon som redan finns" }),
      sort_order: 0,
      status: "published",
      created_at: NOW,
      updated_at: NOW,
    });

    expect(await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW)).toEqual({
      ok: false,
      error: "not_empty",
    });
    expect(db.rows.length).toBe(1);
  });

  it("counts a DRAFT row too — 'has anyone touched this list', not 'is anything live'", async () => {
    const db = new MemoryD1();
    db.rows.push({
      id: 7,
      collection: STAFF.name,
      data: JSON.stringify({ name: "Utkast" }),
      sort_order: 0,
      status: "draft",
      created_at: NOW,
      updated_at: NOW,
    });

    expect(await seedCollectionFromDefaults(db, STAFF, AUTHOR, NOW)).toEqual({
      ok: false,
      error: "not_empty",
    });
  });

  it("an INVALID default writes nothing at all, and names the row and field", async () => {
    // Half a seeded list is worse than none: nine rows in D1 still beat eighteen
    // in JSON on the public page. So validation runs over the whole list first.
    const broken: CollectionDef = {
      ...STAFF,
      jsonFallback: () => {
        const items = STAFF.jsonFallback() as Record<string, unknown>[];
        return items.map((item, index) => (index === 2 ? { ...item, name: "" } : item));
      },
    };

    const db = new MemoryD1();
    const result = await seedCollectionFromDefaults(db, broken, AUTHOR, NOW);

    expect(result).toEqual({ ok: false, error: "invalid_default", index: 2, field: "name" });
    expect(db.rows).toEqual([]);
  });

  it("an empty defaults array is a no-op success, not a failure", async () => {
    const db = new MemoryD1();
    const empty: CollectionDef = { ...STAFF, jsonFallback: () => [] };
    expect(await seedCollectionFromDefaults(db, empty, AUTHOR, NOW)).toEqual({
      ok: true,
      inserted: 0,
    });
  });
});

// ── the route ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({ env: {} as Partial<Env> }));
vi.mock("~/lib/cms/bindings", () => ({ bindings: async () => state.env }));

const { POST } = await import("~/pages/api/admin/collections/[name]");

const SITE = "https://novo.test";
const TOKEN = "test-admin-token";

type PostContext = Parameters<typeof POST>[0];

function context(request: Request, name = STAFF.name): PostContext {
  return {
    request,
    params: { name },
    locals: { adminEmail: AUTHOR },
  } as unknown as PostContext;
}

/** A same-origin JSON write carrying the defense-in-depth token. */
function seedRequest(headers: Record<string, string> = {}): Request {
  return new Request(`${SITE}/api/admin/collections/${STAFF.name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": TOKEN,
      "Sec-Fetch-Site": "same-origin",
      ...headers,
    },
    body: JSON.stringify({ seed: true }),
  });
}

let db: MemoryD1;

beforeEach(() => {
  db = new MemoryD1();
  state.env = {
    DB: db as unknown as D1Database,
    ADMIN_API_TOKEN: TOKEN,
    PUBLIC_SITE_URL: SITE,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/collections/[name] — the seed discriminator", () => {
  it("201s with the count, then 409s on the second press", async () => {
    const first = await POST(context(seedRequest()));
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true, inserted: 18 });

    const second = await POST(context(seedRequest()));
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ error: "not_empty" });
    expect(db.rows.length).toBe(18);
  });

  it("leaves the other two discriminators alone", async () => {
    // `{seed:false}` means nothing, so it must NOT read as "seed" — it falls
    // through to the create branch and is rejected as a malformed item.
    const request = new Request(`${SITE}/api/admin/collections/${STAFF.name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": TOKEN,
        "Sec-Fetch-Site": "same-origin",
      },
      body: JSON.stringify({ seed: false }),
    });

    const res = await POST(context(request));
    expect(res.status).toBe(400);
    expect(db.rows).toEqual([]);
  });

  it("404s an unknown collection before it can write anything", async () => {
    const res = await POST(context(seedRequest(), "nope"));
    expect(res.status).toBe(404);
    expect(db.rows).toEqual([]);
  });

  it("fails CLOSED: no token, no rows", async () => {
    const request = new Request(`${SITE}/api/admin/collections/${STAFF.name}`, {
      method: "POST",
      headers: { "content-type": "application/json", "Sec-Fetch-Site": "same-origin" },
      body: JSON.stringify({ seed: true }),
    });

    const res = await POST(context(request));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(db.rows).toEqual([]);
  });

  it("fails CLOSED: a cross-origin write is 403, no rows", async () => {
    const res = await POST(context(seedRequest({ "Sec-Fetch-Site": "cross-site" })));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden" });
    expect(db.rows).toEqual([]);
  });

  it("503s when the database is unbound", async () => {
    state.env = { ADMIN_API_TOKEN: TOKEN, PUBLIC_SITE_URL: SITE };
    const res = await POST(context(seedRequest()));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "db_unavailable" });
  });
});
