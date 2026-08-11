import { describe, it, expect } from "vitest";
import { CMS } from "~/cms.config";
import { STRINGS, adminString } from "~/lib/cms/strings.sv";
import { getSite } from "~/lib/site";
import { t } from "~/i18n";
import { LOCALES } from "~/i18n/routes";

/**
 * The config is data, so these are the authoring rules a typo would otherwise
 * break in Nicole's browser rather than in CI.
 */

describe("CMS config — authoring rules", () => {
  it("group keys and copy page keys are unique across BOTH arrays", () => {
    // They share the /admin/content/[group] param namespace, so a collision
    // silently shadows one form with the other.
    const keys = [
      ...CMS.contentGroups.map((g) => g.key),
      ...CMS.editableCopy.map((c) => c.page),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("collection names are unique", () => {
    const names = CMS.collections.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("field keys are unique within each content group", () => {
    for (const group of CMS.contentGroups) {
      const keys = group.fields.map((f) => f.key);
      expect(new Set(keys).size, `duplicate field key in group "${group.key}"`).toBe(keys.length);
    }
  });

  it("editable copy keys are BARE dictionary keys — the copy. prefix is applied at one seam", () => {
    for (const page of CMS.editableCopy) {
      for (const entry of page.keys) {
        expect(entry.key.startsWith("copy."), `${entry.key} must not carry the prefix`).toBe(false);
      }
    }
  });

  it("content group keys are namespaced under site.", () => {
    for (const group of CMS.contentGroups) {
      for (const field of group.fields) {
        expect(field.key.startsWith("site."), `${field.key} must be a site.* key`).toBe(true);
      }
    }
  });
});

describe("CMS config — every key points at something real", () => {
  /**
   * The check the blueprint asks for by name (§6.6): iterate EVERY allowlisted
   * content key and assert it resolves to an existing path in `site.json`. A
   * typo here would be a field Nicole edits that changes nothing on the page,
   * and nothing else in the system would notice.
   */
  it("every content-group key resolves to a leaf that exists in site.json", () => {
    const site = getSite() as unknown as Record<string, unknown>;
    const missing: string[] = [];

    for (const group of CMS.contentGroups) {
      for (const field of group.fields) {
        const parts = field.key.split(".");
        parts.shift();
        const leaf = parts.pop() ?? "";
        let node: unknown = site;
        for (const part of parts) {
          node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
        }
        const target = node && typeof node === "object" ? (node as Record<string, unknown>) : null;
        if (!target || (!(leaf in target) && !(`${leaf}_sv` in target))) missing.push(field.key);
      }
    }

    expect(missing).toEqual([]);
  });

  it("a bilingual content field is one whose JSON leaf is actually a locale pair", () => {
    // `mergeSiteOverrides` detects pairing from the JSON shape; the FORM cannot,
    // so the flag is explicit — and a disagreement between the two would render
    // two inputs that write one value, or one input that leaves English behind.
    const site = getSite() as unknown as Record<string, unknown>;
    const mismatched: string[] = [];

    for (const group of CMS.contentGroups) {
      for (const field of group.fields) {
        if (field.kind === "image") continue;
        const parts = field.key.split(".");
        parts.shift();
        const leaf = parts.pop() ?? "";
        let node: unknown = site;
        for (const part of parts) {
          node = node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined;
        }
        const target = (node ?? {}) as Record<string, unknown>;
        if (`${leaf}_sv` in target !== (field.bilingual === true)) mismatched.push(field.key);
      }
    }

    expect(mismatched).toEqual([]);
  });

  it("every allowlisted copy key exists in BOTH dictionaries", () => {
    // `t()` echoes the key when it cannot resolve it, which is exactly what a
    // typo in the allowlist would look like on Nicole's screen.
    const unresolved: string[] = [];
    for (const page of CMS.editableCopy) {
      for (const entry of page.keys) {
        for (const locale of LOCALES) {
          if (t(locale, entry.key) === entry.key) unresolved.push(`${locale}:${entry.key}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("the allowlist keeps mechanism out — no meta, form, nav, spec or placeholder keys", () => {
    // Those are plumbing the page depends on, not copy: an override there breaks
    // a page rather than rewording it (§6.14).
    const forbidden = /^(meta|form|nav|spec|placeholder|category)\./;
    const leaked = CMS.editableCopy.flatMap((page) =>
      page.keys.map((entry) => entry.key).filter((key) => forbidden.test(key)),
    );
    expect(leaked).toEqual([]);
  });

  it("copy keys are unique across every page group", () => {
    const keys = CMS.editableCopy.flatMap((page) => page.keys.map((entry) => entry.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every collection declares a label, orderability and a working jsonFallback", () => {
    for (const collection of CMS.collections) {
      expect(collection.label.trim(), `${collection.name} needs a label`).not.toBe("");
      expect(Array.isArray(collection.jsonFallback())).toBe(true);
      expect(collection.fields.length).toBeGreaterThan(0);
      const names = collection.fields.map((field) => field.name);
      expect(new Set(names).size, `duplicate field in ${collection.name}`).toBe(names.length);
    }
  });

  it("no jsonFallback leaks a `_`-prefixed provenance note into an editable field", () => {
    // The seed script strips them; the fallback has to match, or the admin would
    // render "PLACEHOLDER — needs Nicole's real number" as an editable value.
    for (const collection of CMS.collections) {
      for (const item of collection.jsonFallback() as Record<string, unknown>[]) {
        expect(Object.keys(item).filter((key) => key.startsWith("_"))).toEqual([]);
      }
    }
  });
});

describe("CMS config — the Phase-1 surface", () => {
  it("mediaPrefix is a non-empty R2 prefix ending in a slash", () => {
    expect(CMS.mediaPrefix).toBe("blog/");
    expect(CMS.mediaPrefix.endsWith("/")).toBe(true);
  });

  it("declares a usage query for every table that can reference a media key", () => {
    const tables = CMS.usageQueries.map((q) => q.sql.match(/FROM\s+(\w+)/i)?.[1]);
    expect(tables).toEqual(
      expect.arrayContaining(["posts", "content_kv", "collection_items"]),
    );
  });

  it("every usage query is a single-bind COUNT returning column n", () => {
    for (const query of CMS.usageQueries) {
      expect(query.label.trim(), "a usage query needs a human label").not.toBe("");
      expect(query.sql).toMatch(/SELECT\s+COUNT\(\*\)\s+AS\s+n/i);
      // One bind value — the key — referenced as ?1 however many times it appears.
      expect(query.sql).toContain("?1");
      expect(query.sql).not.toMatch(/\?(?!1)/);
    }
  });

  it("every clearSql is a single-bind mutation on the same table it counts", () => {
    for (const query of CMS.usageQueries) {
      if (!query.clearSql) continue;
      expect(query.clearSql).toMatch(/^\s*(UPDATE|DELETE)/i);
      expect(query.clearSql).toContain("?1");
      expect(query.clearSql).not.toMatch(/\?(?!1)/);
      const counted = query.sql.match(/FROM\s+(\w+)/i)?.[1];
      expect(query.clearSql).toContain(counted!);
    }
  });

  it("the JSON-payload collection query is deliberately unclearable", () => {
    // SQL string surgery on a JSON document risks corrupting the payload, so
    // force-delete surfaces the label instead of silently breaking the data.
    const collections = CMS.usageQueries.find((q) => q.sql.includes("collection_items"));
    expect(collections?.clearSql).toBeUndefined();
  });

  it("every adminNav entry points into /admin and names a real string key", () => {
    expect(CMS.adminNav.length).toBeGreaterThan(0);
    for (const item of CMS.adminNav) {
      expect(item.href.startsWith("/admin")).toBe(true);
      expect(item.icon.trim()).not.toBe("");
      expect(STRINGS[item.labelKey], `missing string for ${item.labelKey}`).toBeDefined();
    }
  });

  it("adminNav hrefs are unique", () => {
    const hrefs = CMS.adminNav.map((n) => n.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("adminString", () => {
  it("resolves a known key", () => {
    expect(adminString("form.save")).toBe("Spara");
  });

  it("echoes an unknown key rather than rendering blank chrome", () => {
    expect(adminString("nope.not.here")).toBe("nope.not.here");
  });

  it("carries a Swedish message for every §11.1 error code", () => {
    const codes = [
      "unauthorized",
      "forbidden",
      "invalid_input",
      "file_required",
      "not_found",
      "too_large",
      "unsupported_type",
      "content_mismatch",
      "db_unavailable",
      "media_unbound",
      "misconfigured",
      "internal",
    ];
    for (const code of codes) {
      expect(STRINGS[`error.${code}`], `no message for ${code}`).toBeDefined();
      expect(adminString(`error.${code}`)).not.toBe(`error.${code}`);
    }
  });

  it("carries the F-017 session-expiry sentinel copy", () => {
    expect(adminString("form.sessionExpired")).toMatch(/session/i);
  });

  it("has no blank values — a blank string is worse than an echoed key", () => {
    for (const [key, value] of Object.entries(STRINGS)) {
      expect(value.trim(), `${key} is blank`).not.toBe("");
    }
  });
});
