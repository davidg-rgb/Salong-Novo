import { describe, it, expect } from "vitest";
import { resolveRedirect } from "../src/lib/redirects";

describe("resolveRedirect", () => {
  it("maps legacy slugs to the nearest new page", () => {
    expect(resolveRedirect("/team")).toBe("/personal");
    expect(resolveRedirect("/karriar")).toBe("/jobba-pa-novo");
    expect(resolveRedirect("/portfolio")).toBe("/tavlingar");
  });
  it("redirects rebuild slugs renamed by the 2026-06-01 client IA", () => {
    expect(resolveRedirect("/tjanster")).toBe("/priser");
    expect(resolveRedirect("/utmarkelser")).toBe("/tavlingar");
    expect(resolveRedirect("/en/services")).toBe("/en/prices");
    expect(resolveRedirect("/en/awards")).toBe("/en/competitions");
  });
  it("sends retired commerce pages home", () => {
    expect(resolveRedirect("/produkter")).toBe("/");
    expect(resolveRedirect("/presentkort")).toBe("/");
  });
  it("is case- and trailing-slash-insensitive", () => {
    expect(resolveRedirect("/Team/")).toBe("/personal");
  });
  it("returns null for live slugs that map 1:1 (no redirect)", () => {
    expect(resolveRedirect("/om-oss")).toBeNull();
    expect(resolveRedirect("/personal")).toBeNull();
    expect(resolveRedirect("/")).toBeNull();
  });
});
