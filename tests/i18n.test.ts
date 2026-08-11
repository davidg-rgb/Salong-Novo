import { describe, it, expect } from "vitest";
import {
  t,
  useT,
  localizePath,
  alternates,
  localeFromPath,
  ROUTES,
} from "../src/i18n";

describe("t()", () => {
  it("resolves dotted keys per locale", () => {
    expect(t("sv", "cta.book")).toBe("Boka tid");
    expect(t("en", "cta.book")).toBe("Book now");
  });
  it("interpolates variables", () => {
    expect(t("sv", "cta.bookWith", { name: "Ellen" })).toBe("Boka tid hos Ellen");
    expect(t("en", "labels.readingTime", { n: 4 })).toBe("4 min read");
  });
  it("falls back to the key when missing", () => {
    expect(t("sv", "does.not.exist")).toBe("does.not.exist");
  });
  it("useT binds a locale", () => {
    const tr = useT("en");
    expect(tr("nav.staff")).toBe("Team");
  });
});

describe("routing", () => {
  it("builds SV root paths without a prefix", () => {
    expect(localizePath("home", "sv")).toBe("/");
    expect(localizePath("about", "sv")).toBe("/om-oss");
  });
  it("prefixes EN paths and uses EN slugs", () => {
    expect(localizePath("home", "en")).toBe("/en");
    expect(localizePath("about", "en")).toBe("/en/about");
    expect(localizePath("work", "en")).toBe("/en/careers");
  });
  it("produces hreflang alternates for both locales", () => {
    const alts = alternates("blog");
    expect(alts).toEqual([
      { locale: "sv", path: "/blogg" },
      { locale: "en", path: "/en/blog" },
    ]);
  });
  it("detects locale from a path", () => {
    expect(localeFromPath("/en/about")).toBe("en");
    expect(localeFromPath("/om-oss")).toBe("sv");
  });
  it("every page key has both locales", () => {
    for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      expect(ROUTES[key]).toHaveProperty("sv");
      expect(ROUTES[key]).toHaveProperty("en");
    }
  });
});
