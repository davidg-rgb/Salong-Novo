/**
 * Minimal D1-compatible interfaces (ARCHITECTURE §6.2).
 *
 * Every query function in the CMS takes one of these rather than a concrete
 * `D1Database`, so the whole data layer is unit-testable against
 * `tests/helpers/fake-d1.ts`. Cloudflare's real `D1Database` satisfies this
 * shape at runtime.
 */
export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface Database {
  prepare(sql: string): PreparedStatement;
}
