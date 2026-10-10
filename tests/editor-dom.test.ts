// @vitest-environment happy-dom-ssr
/**
 * The in-place editor as it ships (2026-10-10): PostEditor.astro rendered through
 * Astro's Container API into happy-dom, then the real `editor.client.ts` boots
 * on it with `fetch` stubbed. Pins the toolbar's Style select, Ctrl+S, the save
 * gate, autosave (drafts only), the link dialog and the image picker paths.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { experimental_AstroContainer } from "astro/container";
import type { Editor } from "@tiptap/core";
import PostEditor from "~/components/admin/PostEditor.astro";
import type { PostDraft } from "~/lib/editor";
import { ADMIN } from "~/lib/admin-strings";

let container: Awaited<ReturnType<typeof experimental_AstroContainer.create>>;
beforeAll(async () => {
  container = await experimental_AstroContainer.create();
});

const DRAFT: PostDraft = {
  id: 7,
  title: "Höstens färger",
  slug: "hostens-farger",
  slugManual: true,
  locale: "sv",
  excerpt: "Ett utdrag.",
  coverImage: null,
  body: "Första stycket.",
  author: "nicole@example.com",
  seoTitle: "",
  seoDesc: "",
  status: "draft",
};

type FetchCall = { url: string; init: RequestInit | undefined };
let calls: FetchCall[];
let respond: () => Promise<Response>;

function postResponse(status: PostDraft["status"] = "draft"): Promise<Response> {
  return Promise.resolve(new Response(
    JSON.stringify({ ok: true, post: { ...DRAFT, status } }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
}

async function boot(draft: Partial<PostDraft> = {}): Promise<{ form: HTMLFormElement; editor: Editor }> {
  const html = await container.renderToString(PostEditor, {
    props: { draft: { ...DRAFT, ...draft }, mode: "edit", imageBase: "" },
  });
  document.body.innerHTML = html;
  vi.resetModules();
  await import("~/admin/editor.client.ts");
  const form = document.querySelector<HTMLFormElement>("[data-editor]")!;
  const dom = form.querySelector<HTMLElement>(".ProseMirror") as HTMLElement & { editor: Editor };
  return { form, editor: dom.editor };
}
const posts = () => calls.filter((c) => c.url === "/api/admin/posts");
const ctrlS = (target: Element) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true }));
/** Type into the document and let the 150 ms Markdown sync run. */
function type(editor: Editor, text: string): void {
  editor.commands.focus("end");
  editor.commands.insertContent(text);
  vi.advanceTimersByTime(200);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  calls = [];
  respond = () => postResponse();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("/api/admin/media")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true, media: [] }), { headers: { "content-type": "application/json" } }));
    }
    return respond();
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("mount", () => {
  it("replaces the textarea with the document, no preview pane, no preview fetch", async () => {
    const { form, editor } = await boot();
    expect(form.querySelector<HTMLTextAreaElement>("#md-body")!.hidden).toBe(true);
    expect(form.querySelector<HTMLElement>("[data-rich-surface]")!.hidden).toBe(false);
    expect(form.querySelector("[data-preview]")).toBeNull();
    expect(editor.getMarkdown()).toBe("Första stycket.");
    vi.advanceTimersByTime(1000);
    expect(calls.filter((c) => c.url.includes("/preview"))).toHaveLength(0);
  });

  it("empty body: mounts empty, shows the placeholder, publish stays disabled", async () => {
    const { form, editor } = await boot({ body: "" });
    expect(editor.isEmpty).toBe(true);
    expect(form.querySelector(".is-editor-empty")?.getAttribute("data-placeholder")).toBe(ADMIN.editor.bodyPlaceholder);
    expect(form.querySelector<HTMLButtonElement>('[data-action="publish"]')!.disabled).toBe(true);
  });

  it("every hook the client queries sits before the first </form> (the nested-form rule)", async () => {
    // ImagePicker's <dialog> holds a nested <form method="dialog">; a browser
    // ignores that start tag but honours its </form>, closing the editor form.
    // happy-dom does not emulate this, so the order is pinned on the raw HTML.
    const html = await container.renderToString(PostEditor, {
      props: { draft: DRAFT, mode: "edit", imageBase: "" },
    });
    const firstClose = html.indexOf("</form>");
    for (const hook of ["data-link-dialog", "data-toast", "data-rich-toolbar", "data-actions", "data-cover-picker", "data-validation"]) {
      expect(html.indexOf(hook), hook).toBeGreaterThan(-1);
      expect(html.indexOf(hook), hook).toBeLessThan(firstClose);
    }
  });

  it("actions come first in the rail, the save status right under them", async () => {
    const { form } = await boot();
    const rail = form.querySelector(".editor__rail")!;
    expect(rail.firstElementChild!.matches("[data-actions]")).toBe(true);
    expect(form.querySelector("[data-actions] .action-bar + [data-save-status]")).not.toBeNull();
  });
});

describe("Style select", () => {
  it("maps Brödtext / Rubrik / Underrubrik to paragraph / H2 / H3", async () => {
    const { form, editor } = await boot();
    const select = form.querySelector("[data-style]") as unknown as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Brödtext", "Rubrik", "Underrubrik"]);
    for (const [value, md] of [["h2", "## Första stycket."], ["h3", "### Första stycket."], ["p", "Första stycket."]] as const) {
      select.value = value;
      select.dispatchEvent(new Event("change"));
      // trimEnd: StarterKit 3's TrailingNode keeps an empty paragraph after a
      // final heading (so the owner can click below it); it serialises as a
      // trailing blank line, which renders nothing.
      expect(editor.getMarkdown().trimEnd()).toBe(md);
    }
  });

  it("reflects the block under the caret on selection change", async () => {
    const { form, editor } = await boot({ body: "## Rubrik\n\n### Under\n\nText" });
    const select = form.querySelector("[data-style]") as unknown as HTMLSelectElement;
    editor.commands.setTextSelection(2);
    expect(select.value).toBe("h2");
    editor.commands.focus("end");
    expect(select.value).toBe("p");
    const underPos = editor.getText().indexOf("Under");
    editor.commands.setTextSelection(underPos + 2);
    expect(select.value).toBe("h3");
  });

  it("bold button toggles and reports aria-pressed", async () => {
    const { form, editor } = await boot();
    editor.commands.selectAll();
    const bold = form.querySelector<HTMLButtonElement>('[data-cmd="bold"]')!;
    bold.click();
    expect(editor.getMarkdown()).toBe("**Första stycket.**");
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("saving", () => {
  it("Ctrl+S in the document calls the save path exactly once and blocks the browser dialog", async () => {
    const { editor } = await boot();
    type(editor, " Mer.");
    const notCancelled = ctrlS(editor.view.dom);
    expect(notCancelled).toBe(false); // preventDefault ran
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.init!.method).toBe("PUT");
    expect(JSON.parse(String(posts()[0]!.init!.body)).body).toBe("Första stycket. Mer.");
  });

  it("Ctrl+S while a save is in flight does not send a second request", async () => {
    let release!: (r: Response) => void;
    respond = () => new Promise<Response>((r) => { release = r; });
    const { form, editor } = await boot();
    type(editor, " Mer.");
    ctrlS(editor.view.dom);
    ctrlS(editor.view.dom);
    form.querySelector<HTMLButtonElement>('[data-action="save"]')!.click();
    expect(posts()).toHaveLength(1);
    expect(form.querySelector("[data-save-status]")!.textContent).toBe(ADMIN.states.saving);
    release(await postResponse());
    await vi.waitFor(() => expect(form.querySelector("[data-save-status]")!.textContent).toMatch(/^Sparat \d\d:\d\d$/));
    expect(posts()).toHaveLength(1);
  });

  it("status reads Osparade ändringar after an edit", async () => {
    const { form, editor } = await boot();
    expect(form.querySelector("[data-save-status]")!.textContent).toBe("");
    type(editor, " x");
    expect(form.querySelector("[data-save-status]")!.textContent).toBe(ADMIN.states.unsaved);
  });

  it("opening and not editing leaves the post clean (serialiser normalisation is not a change)", async () => {
    const { form, editor } = await boot({ body: "Ett _kursivt_ ord" });
    editor.commands.insertContent("x");
    editor.commands.undo();
    vi.advanceTimersByTime(200);
    expect(form.querySelector("[data-save-status]")!.textContent).toBe("");
  });
});

describe("autosave", () => {
  it("autosaves a dirty draft 30 s after the last change, quietly", async () => {
    const { form, editor } = await boot();
    type(editor, " Mer.");
    vi.advanceTimersByTime(29_000);
    expect(posts()).toHaveLength(0);
    vi.advanceTimersByTime(1_000);
    expect(posts()).toHaveLength(1);
    expect(form.classList.contains("editor--busy")).toBe(false); // typing is not blocked
    await vi.waitFor(() => expect(form.querySelector("[data-save-status]")!.textContent).toMatch(/^Sparat automatiskt/));
  });

  it("never autosaves a published post", async () => {
    const { editor } = await boot({ status: "published" });
    type(editor, " Mer.");
    vi.advanceTimersByTime(120_000);
    expect(posts()).toHaveLength(0);
  });

  it("never autosaves a post that has not been created yet", async () => {
    const { editor } = await boot({ id: undefined });
    type(editor, " Mer.");
    vi.advanceTimersByTime(120_000);
    expect(posts()).toHaveLength(0);
  });
});

describe("link dialog", () => {
  it("Ctrl+K with a selection prefills the text; applying sets the link", async () => {
    const { form, editor } = await boot({ body: "Boka här idag" });
    editor.commands.setTextSelection({ from: 6, to: 9 }); // "här"
    editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
    const dialog = form.querySelector<HTMLDialogElement>("[data-link-dialog]")!;
    expect(dialog.open).toBe(true);
    expect(form.querySelector<HTMLInputElement>("[data-link-text]")!.value).toBe("här");
    form.querySelector<HTMLInputElement>("[data-link-url]")!.value = "bokning.voady.se/novo";
    form.querySelector<HTMLButtonElement>("[data-link-apply]")!.click();
    expect(dialog.open).toBe(false);
    expect(editor.getMarkdown()).toBe("Boka [här](https://bokning.voady.se/novo) idag");
  });

  it("an EMPTY URL on an existing link removes the link, keeps the text", async () => {
    const { form, editor } = await boot({ body: "Boka [här](https://x.se) idag" });
    editor.commands.setTextSelection(7);
    form.querySelector<HTMLButtonElement>('[data-cmd="link"]')!.click();
    expect(form.querySelector<HTMLInputElement>("[data-link-url]")!.value).toBe("https://x.se");
    expect(form.querySelector<HTMLButtonElement>("[data-link-remove]")!.hidden).toBe(false);
    form.querySelector<HTMLInputElement>("[data-link-url]")!.value = "";
    form.querySelector<HTMLButtonElement>("[data-link-apply]")!.click();
    expect(editor.getMarkdown()).toBe("Boka här idag");
  });

  it("a javascript: URL is refused with a message, the dialog stays open", async () => {
    const { form, editor } = await boot();
    editor.commands.selectAll();
    form.querySelector<HTMLButtonElement>('[data-cmd="link"]')!.click();
    form.querySelector<HTMLInputElement>("[data-link-url]")!.value = "javascript:alert(1)";
    form.querySelector<HTMLButtonElement>("[data-link-apply]")!.click();
    expect(form.querySelector<HTMLDialogElement>("[data-link-dialog]")!.open).toBe(true);
    expect(form.querySelector<HTMLElement>("[data-link-error]")!.hidden).toBe(false);
    expect(editor.getMarkdown()).toBe("Första stycket.");
  });
});

describe("image picker", () => {
  it("cancelled: nothing is inserted and the body is unchanged", async () => {
    const { form, editor } = await boot();
    form.querySelector<HTMLButtonElement>('[data-cmd="image"]')!.click();
    const picker = form.querySelector<HTMLDialogElement>("[data-image-picker]")!;
    expect(picker.open).toBe(true);
    form.querySelector<HTMLButtonElement>("[data-picker-cancel]")!.click();
    expect(picker.open).toBe(false);
    vi.advanceTimersByTime(200);
    expect(editor.getMarkdown()).toBe("Första stycket.");
  });
});

describe("image picker: choosing inserts the media URL", () => {
  const MEDIA = { id: 1, key: "blog/abc.webp", url: "/api/media/blog/abc.webp", alt: "Salongen", variants: [], createdAt: "" };
  function mediaFetch(): void {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return Promise.resolve(new Response(JSON.stringify({ ok: true, media: [MEDIA] }), { headers: { "content-type": "application/json" } }));
    }));
  }

  it("in the document: an image node whose src is the picked media URL (as insertImage wrote)", async () => {
    mediaFetch();
    const { form, editor } = await boot();
    editor.commands.focus("end");
    form.querySelector<HTMLButtonElement>('[data-cmd="image"]')!.click();
    await vi.waitFor(() => expect(form.querySelector("[data-recent-item]")).not.toBeNull());
    form.querySelector<HTMLButtonElement>("[data-recent-item]")!.click();
    form.querySelector<HTMLButtonElement>("[data-picker-insert]")!.click();
    // trimEnd: TrailingNode adds an empty paragraph after a final image.
    expect(editor.getMarkdown().trimEnd()).toBe("Första stycket.\n\n![Salongen](/api/media/blog/abc.webp)");
  });

  it("in Markdown-source mode: insertImage + insertLink at the textarea caret", async () => {
    mediaFetch();
    const { form } = await boot();
    form.querySelector<HTMLButtonElement>("[data-mode-toggle]")!.click();
    const area = form.querySelector<HTMLTextAreaElement>("#md-body")!;
    area.setSelectionRange(area.value.length, area.value.length);
    form.querySelector<HTMLButtonElement>('[data-cmd="image"]')!.click();
    await vi.waitFor(() => expect(form.querySelector("[data-recent-item]")).not.toBeNull());
    form.querySelector<HTMLButtonElement>("[data-recent-item]")!.click();
    form.querySelector<HTMLButtonElement>("[data-picker-insert]")!.click();
    expect(area.value).toBe("Första stycket.![Salongen](/api/media/blog/abc.webp)");
    area.setSelectionRange(0, 6); // "Första"
    form.querySelector<HTMLButtonElement>('[data-cmd="link"]')!.click();
    expect(form.querySelector<HTMLInputElement>("[data-link-text]")!.value).toBe("Första");
    form.querySelector<HTMLInputElement>("[data-link-url]")!.value = "https://salongnovo.se";
    form.querySelector<HTMLButtonElement>("[data-link-apply]")!.click();
    expect(area.value.startsWith("[Första](https://salongnovo.se) stycket.")).toBe(true);
  });
});

describe("Markdown-source mode", () => {
  it("Text → Markdown writes the Markdown; Markdown → Text parses it back", async () => {
    const { form, editor } = await boot();
    const toggle = form.querySelector<HTMLButtonElement>("[data-mode-toggle]")!;
    const area = form.querySelector<HTMLTextAreaElement>("#md-body")!;
    type(editor, " Mer.");
    toggle.click();
    expect(area.hidden).toBe(false);
    expect(area.value).toBe("Första stycket. Mer.");
    expect(toggle.textContent).toBe(ADMIN.editor.textMode);
    expect(form.querySelector<HTMLButtonElement>('[data-cmd="bold"]')!.disabled).toBe(true);
    area.value = "## Ny rubrik\n\nText";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    toggle.click();
    expect(area.hidden).toBe(true);
    expect(editor.getMarkdown()).toBe("## Ny rubrik\n\nText");
    expect(form.querySelector<HTMLButtonElement>('[data-cmd="bold"]')!.disabled).toBe(false);
  });
});
