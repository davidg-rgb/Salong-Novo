import { describe, it, expect } from "vitest";
import {
  ENQUIRY_STATUSES,
  countEnquiriesByStatus,
  countNewEnquiries,
  isEnquiryStatus,
  listEnquiries,
  mapEnquiryRow,
  setEnquiryStatus,
  type EnquiryDbRow,
} from "~/lib/enquiries-admin";
import { FakeD1 } from "./helpers/fake-d1";

function dbRow(overrides: Partial<EnquiryDbRow> = {}): EnquiryDbRow {
  return {
    id: 7,
    name: "Anna Berg",
    email: "anna@example.com",
    message: "Hej! Vi söker en kreatör för en kampanj i höst.",
    company: "Norrsken AB",
    locale: "sv",
    status: "new",
    mail_status: "sent",
    ip_hash: "a".repeat(32),
    user_agent: "Mozilla/5.0",
    created_at: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

describe("isEnquiryStatus", () => {
  it("admits exactly the four labels the schema's CHECK allows", () => {
    for (const status of ENQUIRY_STATUSES) expect(isEnquiryStatus(status)).toBe(true);
    for (const value of ["", "NEW", "deleted", 1, null, undefined, {}]) {
      expect(isEnquiryStatus(value), String(value)).toBe(false);
    }
  });
});

describe("mapEnquiryRow", () => {
  it("maps the row the admin renders", () => {
    expect(mapEnquiryRow(dbRow())).toEqual({
      id: 7,
      name: "Anna Berg",
      email: "anna@example.com",
      message: "Hej! Vi söker en kreatör för en kampanj i höst.",
      company: "Norrsken AB",
      locale: "sv",
      status: "new",
      mailStatus: "sent",
      createdAt: "2026-08-09T10:00:00.000Z",
    });
  });

  it("drops ip_hash and user_agent — neither reaches a screen", () => {
    // A salted hash tells Nicole nothing, and a value no template renders should
    // not be handed to a template.
    const mapped = mapEnquiryRow(dbRow()) as Record<string, unknown>;
    expect("ip_hash" in mapped).toBe(false);
    expect("user_agent" in mapped).toBe(false);
  });

  it("falls back to 'new' for a status outside the four", () => {
    // Only reachable by hand-editing the database past its own CHECK; the point
    // is that it renders as unread rather than as an empty chip.
    expect(mapEnquiryRow(dbRow({ status: "weird" })).status).toBe("new");
  });

  it("coerces the id, which SQLite may hand back as a string", () => {
    expect(mapEnquiryRow(dbRow({ id: "12" as unknown as number })).id).toBe(12);
  });
});

describe("listEnquiries", () => {
  it("reads newest first", async () => {
    const db = new FakeD1(() => [dbRow()]);
    const items = await listEnquiries(db);

    expect(items).toHaveLength(1);
    expect(db.sqlAt(0)).toContain("ORDER BY created_at DESC");
    expect(db.sqlAt(0)).not.toContain("WHERE status");
  });

  it("filters by status on the indexed pair", async () => {
    const db = new FakeD1(() => [dbRow({ status: "archived" })]);
    await listEnquiries(db, { status: "archived" });

    // (status, created_at DESC) is idx_enquiries_status_date, both columns.
    expect(db.sqlAt(0)).toContain("WHERE status = ?");
    expect(db.sqlAt(0)).toContain("ORDER BY created_at DESC");
    expect(db.last?.binds[0]).toBe("archived");
  });

  it("caps the read, and takes the cap from the caller", async () => {
    const db = new FakeD1(() => []);
    await listEnquiries(db);
    expect(db.last?.binds).toContain(200);

    await listEnquiries(db, undefined, 5);
    expect(db.last?.binds).toContain(5);
  });

  it("returns an empty list rather than throwing when there is nothing", async () => {
    const db = new FakeD1(() => []);
    await expect(listEnquiries(db)).resolves.toEqual([]);
  });
});

describe("countNewEnquiries", () => {
  it("counts only the unread ones — that is the badge", async () => {
    const db = new FakeD1(() => [{ n: 3 }]);
    await expect(countNewEnquiries(db)).resolves.toBe(3);
    expect(db.sqlAt(0)).toContain("WHERE status = 'new'");
  });

  it("reads no rows as zero, not as NaN", async () => {
    await expect(countNewEnquiries(new FakeD1(() => []))).resolves.toBe(0);
  });
});

describe("countEnquiriesByStatus", () => {
  it("fills every label, including the ones with no rows", async () => {
    const db = new FakeD1(() => [
      { status: "new", n: 2 },
      { status: "spam", n: 1 },
    ]);
    await expect(countEnquiriesByStatus(db)).resolves.toEqual({
      new: 2,
      read: 0,
      archived: 0,
      spam: 1,
    });
  });

  it("ignores a status the schema should have made impossible", async () => {
    const db = new FakeD1(() => [
      { status: "new", n: 1 },
      { status: "weird", n: 9 },
    ]);
    const counts = await countEnquiriesByStatus(db);
    expect(counts).toEqual({ new: 1, read: 0, archived: 0, spam: 0 });
    expect(Object.keys(counts)).toEqual([...ENQUIRY_STATUSES]);
  });
});

describe("setEnquiryStatus", () => {
  it("relabels an enquiry and reports the write", async () => {
    const db = new FakeD1(() => [{ id: 7 }]);
    await expect(setEnquiryStatus(db, 7, "read")).resolves.toBe(true);

    expect(db.sqlAt(0)).toContain("UPDATE enquiries SET status = ?");
    expect(db.sqlAt(0)).toContain("RETURNING id");
    expect(db.last?.binds).toEqual(["read", 7]);
  });

  it("allows ANY transition — triage is a label, not a state machine", async () => {
    // Archived → new, spam → read: being wrong about what a message is must not
    // be permanent, so every pair is legal in both directions.
    for (const from of ENQUIRY_STATUSES) {
      for (const to of ENQUIRY_STATUSES) {
        const db = new FakeD1(() => [{ id: 1 }]);
        await expect(setEnquiryStatus(db, 1, to), `${from} → ${to}`).resolves.toBe(true);
      }
    }
  });

  it("returns false for an unknown id, which the route turns into a 404", async () => {
    // The row was deleted in another tab; nothing was updated, and reporting
    // that as a save would be a lie the client cannot see through.
    const db = new FakeD1(() => []);
    await expect(setEnquiryStatus(db, 999, "read")).resolves.toBe(false);
  });

  it("refuses a status outside the four without touching the database", async () => {
    const db = new FakeD1(() => [{ id: 1 }]);
    await expect(setEnquiryStatus(db, 1, "deleted" as never)).resolves.toBe(false);
    expect(db.queries).toHaveLength(0);
  });
});
