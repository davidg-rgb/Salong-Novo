/**
 * A hand-rolled fake `Database` (salong's test idiom, generalized).
 *
 * The CMS data layer takes the structural `Database` interface rather than a
 * concrete `D1Database` precisely so it can be driven by this. The fake is a
 * RECORDER plus a RESPONDER: it captures every statement with its final binds so
 * a test can assert on the SQL that was built, and it answers `all()`/`first()`
 * from a function the test supplies.
 *
 * It deliberately does NOT interpret SQL. A test says "this query returns these
 * rows"; writing a SQLite in TypeScript to avoid saying so would be a second
 * database to debug.
 */
import type { Database, PreparedStatement } from "~/lib/cms/db";

export type FakeQuery = { sql: string; binds: unknown[] };

/** Return the rows this statement should yield. `undefined` means "no rows". */
export type FakeResponder = (query: FakeQuery) => unknown[] | undefined;

export class FakeD1 implements Database {
  /** Every statement prepared, in order, with the binds it ended up carrying. */
  readonly queries: FakeQuery[] = [];

  constructor(private readonly respond: FakeResponder = () => []) {}

  get last(): FakeQuery | undefined {
    return this.queries[this.queries.length - 1];
  }

  /** SQL with runs of whitespace collapsed — for readable assertions. */
  sqlAt(index: number): string {
    return (this.queries[index]?.sql ?? "").replace(/\s+/g, " ").trim();
  }

  prepare(sql: string): PreparedStatement {
    const query: FakeQuery = { sql, binds: [] };
    this.queries.push(query);
    const rows = () => this.respond(query) ?? [];
    const stmt: PreparedStatement = {
      bind: (...values: unknown[]) => {
        query.binds = values;
        return stmt;
      },
      all: async <T>() => ({ results: rows() as T[] }),
      first: async <T>() => (rows()[0] ?? null) as T | null,
      run: async () => ({ success: true }),
    };
    return stmt;
  }
}

/** A fake that answers every query with the same rows. */
export function fakeD1(rows: unknown[] = []): FakeD1 {
  return new FakeD1(() => rows);
}

/**
 * A database whose every statement throws — the fault-injection path behind
 * "a query throw degrades to the JSON fallback, it never 500s the public site".
 */
export function throwingD1(message = "D1_ERROR: no such table"): Database {
  return {
    prepare(): PreparedStatement {
      throw new Error(message);
    },
  };
}
