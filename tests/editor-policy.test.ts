import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_MS,
  createAutosave,
  createSaveGate,
  isSaveShortcut,
  linkAction,
  shouldAutosave,
  type PostDraft,
} from "../src/lib/editor";

/**
 * The DOM-free policy the in-place editor runs on (2026-10-10): autosave gate
 * and debounce, the one-request-at-a-time save gate, the Ctrl+S matcher and the
 * link dialog's URL decision. Plain Node; the DOM wiring is in editor-dom.test.ts.
 */
const base: PostDraft = {
  id: 7,
  title: "Höstens färger",
  slug: "hostens-farger",
  slugManual: false,
  locale: "sv",
  excerpt: "",
  coverImage: null,
  body: "Text",
  author: "",
  seoTitle: "",
  seoDesc: "",
  status: "draft",
};

describe("shouldAutosave", () => {
  it("saves a dirty, valid, already-created draft", () => {
    expect(shouldAutosave(base, true)).toBe(true);
  });
  it("never autosaves a PUBLISHED post (a save would go live)", () => {
    expect(shouldAutosave({ ...base, status: "published" }, true)).toBe(false);
  });
  it("never autosaves a new post (its create would redirect under the cursor)", () => {
    const { id: _id, ...fresh } = base;
    expect(shouldAutosave(fresh as PostDraft, true)).toBe(false);
  });
  it("waits while the draft is clean or invalid (empty title)", () => {
    expect(shouldAutosave(base, false)).toBe(false);
    expect(shouldAutosave({ ...base, title: "   " }, true)).toBe(false);
  });
});

describe("createAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires once, AUTOSAVE_MS after the LAST poke", () => {
    const save = vi.fn();
    const a = createAutosave({ allowed: () => true, save });
    a.poke();
    vi.advanceTimersByTime(AUTOSAVE_MS - 1000);
    a.poke(); // typing again restarts the countdown
    vi.advanceTimersByTime(AUTOSAVE_MS - 1);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(AUTOSAVE_MS).toBe(30_000);
  });

  it("does not even schedule when not allowed (published post)", () => {
    const save = vi.fn();
    const a = createAutosave({ allowed: () => shouldAutosave({ ...base, status: "published" }, true), save });
    a.poke();
    vi.advanceTimersByTime(AUTOSAVE_MS * 3);
    expect(save).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-checks at fire time: published (or cleaned) meanwhile → no save", () => {
    let allowed = true;
    const save = vi.fn();
    const a = createAutosave({ allowed: () => allowed, save });
    a.poke();
    allowed = false;
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(save).not.toHaveBeenCalled();
  });

  it("cancel() drops a pending autosave (a manual save just ran)", () => {
    const save = vi.fn();
    const a = createAutosave({ allowed: () => true, save });
    a.poke();
    a.cancel();
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("createSaveGate", () => {
  it("a second call while the first is in flight joins it (one request)", async () => {
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const gate = createSaveGate(fn);
    const a = gate.run();
    const b = gate.run();
    expect(gate.busy()).toBe(true);
    expect(b).toBe(a);
    release();
    await a;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(gate.busy()).toBe(false);
    void gate.run();
    expect(fn).toHaveBeenCalledTimes(2);
    release();
  });

  it("frees the gate after a rejected save, so the next save can run", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(undefined);
    const gate = createSaveGate(fn);
    await expect(gate.run()).rejects.toThrow("network");
    expect(gate.busy()).toBe(false);
    await gate.run();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("isSaveShortcut", () => {
  const k = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    ({ key, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it("matches Ctrl+S and Cmd+S, either case", () => {
    expect(isSaveShortcut(k("s", { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(k("S", { metaKey: true }))).toBe(true);
  });
  it("ignores plain S and Ctrl+Alt+S (AltGr on Swedish keyboards)", () => {
    expect(isSaveShortcut(k("s"))).toBe(false);
    expect(isSaveShortcut(k("s", { ctrlKey: true, altKey: true }))).toBe(false);
    expect(isSaveShortcut(k("b", { ctrlKey: true }))).toBe(false);
  });
});

describe("linkAction", () => {
  it("empty or whitespace URL removes the link", () => {
    expect(linkAction("")).toEqual({ kind: "remove" });
    expect(linkAction("   ")).toEqual({ kind: "remove" });
  });
  it("keeps web, mail, phone, site-relative and anchor links as typed", () => {
    for (const u of ["https://salongnovo.se", "http://x.se", "mailto:info@salongnovo.se", "tel:086633014", "/blogg/x", "#bokning"]) {
      expect(linkAction(u)).toEqual({ kind: "set", href: u });
    }
  });
  it("adds https:// to a bare host (also host:port)", () => {
    expect(linkAction("salongnovo.se")).toEqual({ kind: "set", href: "https://salongnovo.se" });
    expect(linkAction("localhost:4321/x")).toEqual({ kind: "set", href: "https://localhost:4321/x" });
  });
  it("refuses javascript:, data: and other schemes (malformed for a blog link)", () => {
    expect(linkAction("javascript:alert(1)")).toEqual({ kind: "invalid" });
    expect(linkAction("data:text/html,x")).toEqual({ kind: "invalid" });
    expect(linkAction("ftp://x")).toEqual({ kind: "invalid" });
  });
});
