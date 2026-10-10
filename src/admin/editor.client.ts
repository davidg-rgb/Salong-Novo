/**
 * Editor controller (§10.6) — the one interactive script on the editor page.
 * NO framework, NO markdown-it in the browser. It does DOM reads/writes AROUND
 * the pure `editor.ts` core (which owns ALL caret/transform/validation logic —
 * never duplicated here) and talks to the admin API per `admin-api.ts`.
 *
 * Responsibilities:
 *  - The body (2026-10-10): an in-place Tiptap document (`rich-editor.ts`) on a
 *    white sheet, replacing the Markdown textarea + server-rendered preview pane
 *    (the `/api/admin/preview` route is no longer called from here). The draft's
 *    `body` is ALWAYS Markdown: every document change is serialised with
 *    `getMarkdown()` (150 ms debounce) into `draft.body`, so dirty tracking,
 *    validation, save and publish run exactly as before. A toolbar toggle swaps
 *    the sheet for the `.md-body` textarea (Markdown-source mode); there the
 *    caret helpers in `editor.ts` insert links and images.
 *  - Link dialog (Ctrl/Cmd+K or toolbar): URL + text; empty URL removes the link.
 *  - Save status (Docs-style): "Osparade ändringar" → "Sparar…" → "Sparat 14:32".
 *    Autosave 30 s after the last change, DRAFTS ONLY (`shouldAutosave`); one
 *    request at a time (`createSaveGate`); Ctrl/Cmd+S saves.
 *  - Upload: cover (`kind=cover`) + inline (`kind=inline`, alt-gated) via
 *    `POST /api/admin/upload` → `UploadResponse`. Inline insertion puts an image
 *    node whose `src` is the media URL the upload/picker returned — the same
 *    value `insertImage` wrote into the Markdown before.
 *  - Slug chip: auto from title via `nextSlug` unless the user takes manual control.
 *  - Counters (excerpt/SEO) via `counter`; publish enabled only when
 *    `validateDraft` passes; validation summary on failed publish.
 *  - Dirty guard: `beforeunload` + in-app nav intercept (confirm) via `isDirty`.
 *  - Save/publish/unpublish/delete: serialize via `toApiBody`, POST(create→201)
 *    /PUT(update→200)/DELETE. On create success → redirect to /admin/posts/{id}.
 *  - Session-expiry contract: a non-JSON / opaqueredirect / HTML response (Access
 *    re-login) → persist the draft to localStorage + show the session-expired
 *    state; the draft is never lost.
 */
import {
  insertLink,
  insertImage,
  nextSlug,
  validateDraft,
  counter,
  toApiBody,
  isDirty,
  shouldAutosave,
  createAutosave,
  createSaveGate,
  linkAction,
  type PostDraft,
  type Selection,
  type FieldError,
} from "../lib/editor";
import { createRichEditor, mountToolbar, bindSaveShortcut } from "./rich-editor";
import { ADMIN, fmt } from "../lib/admin-strings";
import {
  isOk,
  type CreatePostResponse,
  type UpdatePostResponse,
  type UploadResponse,
  type MediaItem,
} from "../lib/admin-api";

/**
 * Defense-in-depth write token, injected server-side into the Access-gated admin
 * page (AdminBase `<meta name="admin-token">`). Echoed as `x-admin-token` on every
 * write so the route's `authorized()` check passes (§10.8). Empty when no token is
 * configured (the route then allows — Access still gates).
 */
const ADMIN_TOKEN =
  document.querySelector<HTMLMetaElement>('meta[name="admin-token"]')?.content ?? "";

const form = document.querySelector<HTMLFormElement>("[data-editor]");
if (form) initEditor(form);

/** Session-expiry sentinel: Access bounced us to a login page (HTML/redirect). */
class SessionExpired extends Error {}

function initEditor(form: HTMLFormElement): void {
  // ── Read the SSR-serialized draft (no edit-load fetch) ─────────
  const dataEl = document.getElementById("draft-data");
  const draft: PostDraft = JSON.parse(dataEl?.textContent || "{}");
  // The last-saved snapshot for dirty tracking (clone).
  let saved: PostDraft = structuredClone(draft);

  // ── Element handles ────────────────────────────────────────────
  const imageBase = (form.querySelector<HTMLElement>("[data-image-base]")?.dataset.imageBase) ?? "";
  const titleInput = form.querySelector<HTMLInputElement>('[data-field="title"]')!;
  const excerptInput = form.querySelector<HTMLTextAreaElement>('[data-field="excerpt"]')!;
  const bodyArea = form.querySelector<HTMLTextAreaElement>("#md-body")!;
  const seoTitleInput = form.querySelector<HTMLInputElement>('[data-field="seoTitle"]')!;
  const seoDescInput = form.querySelector<HTMLTextAreaElement>('[data-field="seoDesc"]')!;
  const localeGroup = form.querySelector<HTMLElement>('[data-field="locale"]')!;
  const saveStatus = form.querySelector<HTMLElement>("[data-save-status]");
  const validationBox = form.querySelector<HTMLElement>("[data-validation]");
  const toast = form.querySelector<HTMLElement>("[data-toast]");
  const toolbar = form.querySelector<HTMLElement>("[data-rich-toolbar]")!;
  const sheet = form.querySelector<HTMLElement>("[data-sheet]")!;
  const surface = form.querySelector<HTMLElement>("[data-rich-surface]")!;
  const modeToggle = toolbar.querySelector<HTMLButtonElement>("[data-mode-toggle]")!;

  // Slug chip
  const slugPrefix = form.querySelector<HTMLElement>("[data-slug-prefix]");
  const slugDisplay = form.querySelector<HTMLElement>("[data-slug-display]");
  const slugInput = form.querySelector<HTMLInputElement>("[data-slug-input]");
  const slugToggle = form.querySelector<HTMLButtonElement>("[data-slug-toggle]");

  // ── Helpers ────────────────────────────────────────────────────
  function dirty(): boolean {
    return isDirty(draft, saved);
  }
  function markDirty(): void {
    // Reflected only through isDirty(draft, saved); no extra flag needed.
    renderSaveStatus();
    autosave.poke();
  }
  function renderSaveStatus(): void {
    if (!saveStatus || saver.busy()) return;
    saveStatus.textContent = dirty() ? ADMIN.states.unsaved : saveStatus.dataset.saved ?? "";
  }

  function showToast(text: string): void {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    window.setTimeout(() => { toast.hidden = true; }, 2800);
  }

  // ── Slug chip (auto from title unless manual) ─────────────────
  function refreshSlugChip(): void {
    if (slugDisplay) slugDisplay.textContent = nextSlug(draft);
    if (slugPrefix) slugPrefix.textContent = draft.locale === "en" ? "/en/blog/" : "/blogg/";
    if (slugToggle) slugToggle.textContent = draft.slugManual ? ADMIN.editor.slugAuto : ADMIN.editor.slugEdit;
  }
  slugToggle?.addEventListener("click", () => {
    draft.slugManual = !draft.slugManual;
    if (draft.slugManual) {
      // Enter manual mode: seed the input with the current resolved slug.
      draft.slug = nextSlug(draft);
      if (slugInput) {
        slugInput.value = draft.slug;
        slugInput.hidden = false;
        if (slugDisplay) slugDisplay.hidden = true;
        slugInput.focus();
      }
    } else {
      // Back to auto.
      if (slugInput) slugInput.hidden = true;
      if (slugDisplay) slugDisplay.hidden = false;
      draft.slug = nextSlug(draft);
    }
    refreshSlugChip();
    markDirty();
  });
  slugInput?.addEventListener("input", () => {
    draft.slug = slugInput.value;
    if (slugDisplay) slugDisplay.textContent = slugInput.value;
    markDirty();
  });

  // ── Counters ──────────────────────────────────────────────────
  const COUNTERS: Record<string, { ideal: [number, number]; hard: number }> = {
    excerpt: { ideal: [40, 200], hard: 200 },
    seoTitle: { ideal: [30, 60], hard: 70 },
    seoDesc: { ideal: [70, 160], hard: 200 },
  };
  function renderCounter(name: keyof typeof COUNTERS, text: string): void {
    const el = form.querySelector<HTMLElement>(`[data-counter="${name}"]`);
    if (!el) return;
    const cfg = COUNTERS[name]!;
    const { len, state } = counter(text, cfg.ideal, cfg.hard);
    const cap = name === "excerpt" ? 200 : cfg.hard;
    el.textContent = `${len}/${cap}`;
    el.dataset.state = state;
  }

  // ── Plain field bindings ──────────────────────────────────────
  titleInput.addEventListener("input", () => {
    draft.title = titleInput.value;
    if (!draft.slugManual) refreshSlugChip();
    refreshPublishEnabled();
    markDirty();
  });
  excerptInput.addEventListener("input", () => {
    draft.excerpt = excerptInput.value;
    renderCounter("excerpt", draft.excerpt);
    refreshPublishEnabled();
    markDirty();
  });
  seoTitleInput.addEventListener("input", () => {
    draft.seoTitle = seoTitleInput.value;
    renderCounter("seoTitle", draft.seoTitle);
    markDirty();
  });
  seoDescInput.addEventListener("input", () => {
    draft.seoDesc = seoDescInput.value;
    renderCounter("seoDesc", draft.seoDesc);
    markDirty();
  });

  // Locale segmented control.
  localeGroup.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-value]");
    if (!btn) return;
    const next = btn.dataset.value === "en" ? "en" : "sv";
    if (next === draft.locale) return;
    if (draft.id !== undefined) {
      const moveMsg = draft.locale === "sv"
        ? "Inlägget flyttas till den engelska bloggen. Fortsätt?"
        : "Inlägget flyttas till den svenska bloggen. Fortsätt?";
      if (!window.confirm(moveMsg)) return;
    }
    draft.locale = next;
    for (const b of localeGroup.querySelectorAll<HTMLButtonElement>("[data-value]")) {
      const on = b === btn;
      b.classList.toggle("seg--on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    refreshSlugChip();
    refreshPublishEnabled();
    markDirty();
  });

  // Excerpt suggestion. A lightweight, Markdown-stripping excerpt — deliberately
  // NOT lib/markdown's `excerpt`, which would drag markdown-it (~40KB) into the
  // browser bundle (§10.6: no markdown-it client-side). The server re-derives the
  // authoritative excerpt; this is a UX convenience only.
  function suggestExcerpt(source: string, n = 200): string {
    const text = (source ?? "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // links → text
      .replace(/[#>*_`~-]/g, "")                 // md punctuation
      .replace(/\s+/g, " ")
      .trim();
    if (text.length <= n) return text;
    return text.slice(0, n).replace(/\s+\S*$/, "") + "…";
  }
  form.querySelector<HTMLButtonElement>("[data-excerpt-suggest]")?.addEventListener("click", () => {
    const suggestion = suggestExcerpt(draft.body, 200);
    if (!suggestion) return;
    excerptInput.value = suggestion;
    draft.excerpt = suggestion;
    renderCounter("excerpt", suggestion);
    refreshPublishEnabled();
    markDirty();
  });

  // ── Body: the in-place document ───────────────────────────────
  // `baseline` hides the serialiser's normalisation (e.g. `_x_` → `*x*`) from
  // dirty tracking: while the document still serialises to what it did at load,
  // the body stays the stored string byte for byte.
  let mdMode = false;
  let bodyTimer: number | undefined;
  const editor = createRichEditor({
    element: surface,
    markdown: draft.body,
    placeholder: ADMIN.editor.bodyPlaceholder,
    onUpdate: () => {
      window.clearTimeout(bodyTimer);
      bodyTimer = window.setTimeout(flushBody, 150);
    },
  });
  let baseline = { md: editor.getMarkdown(), body: draft.body };
  function flushBody(): void {
    if (bodyTimer === undefined) return;
    window.clearTimeout(bodyTimer);
    bodyTimer = undefined;
    if (mdMode) return;
    const md = editor.getMarkdown();
    draft.body = md === baseline.md ? baseline.body : md;
    refreshPublishEnabled();
    markDirty();
  }
  // Mounted: the document replaces the textarea (which stays the no-JS fallback).
  surface.hidden = false;
  bodyArea.hidden = true;
  sheet.classList.add("sheet--ready");

  const toolbarApi = mountToolbar(editor, toolbar, {
    onLink: () => openLinkDialog(),
    onImage: () => void openImagePicker(),
  });

  // Markdown-source mode: the same sheet, the raw text.
  bodyArea.addEventListener("input", () => {
    draft.body = bodyArea.value;
    refreshPublishEnabled();
    markDirty();
  });
  bodyArea.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      openLinkDialog();
    }
  });
  function setMarkdownMode(on: boolean): void {
    if (on === mdMode) return;
    if (on) {
      flushBody();
      bodyArea.value = draft.body;
    } else {
      editor.commands.setContent(bodyArea.value, { contentType: "markdown", emitUpdate: false });
      baseline = { md: editor.getMarkdown(), body: draft.body };
    }
    mdMode = on;
    surface.hidden = on;
    bodyArea.hidden = !on;
    modeToggle.textContent = on ? ADMIN.editor.textMode : ADMIN.editor.markdownMode;
    modeToggle.title = on ? ADMIN.editor.textModeHint : ADMIN.editor.markdownModeHint;
    // Formatting acts on the document; in source mode only link + image apply.
    for (const el of toolbar.querySelectorAll<HTMLElement>("[data-cmd], [data-style]")) {
      const keep = el.dataset.cmd === "link" || el.dataset.cmd === "image";
      (el as HTMLButtonElement).disabled = on && !keep;
    }
    if (!on) toolbarApi.sync();
    focusBody();
  }
  modeToggle.addEventListener("click", () => setMarkdownMode(!mdMode));
  function focusBody(): void {
    if (mdMode) bodyArea.focus();
    else editor.commands.focus();
  }

  // ── Link dialog ───────────────────────────────────────────────
  const linkDialog = form.querySelector<HTMLDialogElement>("[data-link-dialog]")!;
  const linkUrl = linkDialog.querySelector<HTMLInputElement>("[data-link-url]")!;
  const linkText = linkDialog.querySelector<HTMLInputElement>("[data-link-text]")!;
  const linkError = linkDialog.querySelector<HTMLElement>("[data-link-error]")!;
  const linkRemove = linkDialog.querySelector<HTMLButtonElement>("[data-link-remove]")!;
  /** The range the dialog acts on, captured at open (focus moves into the dialog). */
  let linkRange: { from: number; to: number } | null = null;
  let mdSel: Selection | null = null;

  function openLinkDialog(): void {
    linkError.hidden = true;
    if (mdMode) {
      mdSel = currentSelection();
      linkUrl.value = "";
      linkText.value = mdSel.value.slice(mdSel.start, mdSel.end);
      linkRemove.hidden = true;
    } else {
      if (editor.isActive("link")) editor.chain().extendMarkRange("link").run();
      const { from, to } = editor.state.selection;
      linkRange = { from, to };
      linkUrl.value = (editor.getAttributes("link").href as string | undefined) ?? "";
      linkText.value = editor.state.doc.textBetween(from, to, " ");
      linkRemove.hidden = !editor.isActive("link");
    }
    linkDialog.showModal();
    linkUrl.focus();
  }
  function applyLink(): void {
    const action = linkAction(linkUrl.value);
    if (action.kind === "invalid") {
      linkError.textContent = ADMIN.editor.linkInvalid;
      linkError.hidden = false;
      return;
    }
    const text = linkText.value.trim();
    if (mdMode) {
      if (action.kind === "set" && mdSel) applyEdit(insertLink(mdSel, action.href, text || undefined));
      linkDialog.close();
      return;
    }
    const range = linkRange ?? { from: editor.state.selection.from, to: editor.state.selection.to };
    if (action.kind === "remove") {
      editor.chain().focus().setTextSelection(range).unsetLink().run();
    } else {
      const current = editor.state.doc.textBetween(range.from, range.to, " ");
      if (range.from === range.to || (text && text !== current)) {
        // New text (or nothing selected): write the label carrying the link.
        editor.chain().focus().insertContentAt(range, {
          type: "text",
          text: text || action.href,
          marks: [{ type: "link", attrs: { href: action.href } }],
        }).run();
      } else {
        editor.chain().focus().setTextSelection(range).setLink({ href: action.href }).run();
      }
    }
    linkDialog.close();
  }
  linkDialog.querySelector("[data-link-apply]")!.addEventListener("click", applyLink);
  linkDialog.querySelector("[data-link-cancel]")!.addEventListener("click", () => linkDialog.close());
  linkRemove.addEventListener("click", () => { linkUrl.value = ""; applyLink(); });
  for (const input of [linkUrl, linkText]) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); applyLink(); }
    });
  }
  linkDialog.addEventListener("close", () => {
    linkRange = null;
    mdSel = null;
    focusBody();
  });

  // Source-mode caret plumbing for the editor.ts helpers.
  function currentSelection(): Selection {
    return { value: bodyArea.value, start: bodyArea.selectionStart, end: bodyArea.selectionEnd };
  }
  function applyEdit(result: { value: string; start: number; end: number }): void {
    bodyArea.value = result.value;
    bodyArea.setSelectionRange(result.start, result.end);
    bodyArea.focus();
    bodyArea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ── Image picker (inline) ─────────────────────────────────────
  const picker = form.querySelector<HTMLDialogElement>("[data-image-picker]");
  const pickerFile = picker?.querySelector<HTMLInputElement>("[data-picker-file]");
  const pickerAlt = picker?.querySelector<HTMLInputElement>("[data-picker-alt]");
  const pickerInsert = picker?.querySelector<HTMLButtonElement>("[data-picker-insert]");
  const pickerError = picker?.querySelector<HTMLElement>("[data-picker-error]");
  const pickerPreview = picker?.querySelector<HTMLElement>("[data-picker-preview]");
  const pickerPreviewImg = picker?.querySelector<HTMLImageElement>("[data-picker-preview-img]");
  const dropzone = picker?.querySelector<HTMLElement>("[data-dropzone]");
  const recentGrid = picker?.querySelector<HTMLElement>("[data-picker-recent]");
  const recentEmpty = picker?.querySelector<HTMLElement>("[data-picker-recent-empty]");

  // Pending inline pick: either a freshly-uploaded key/url or a chosen media item.
  let pickedUrl: string | null = null;
  let pickedKey: string | null = null;

  function setPickerError(text: string | null): void {
    if (!pickerError) return;
    pickerError.textContent = text ?? "";
    pickerError.hidden = !text;
  }
  function refreshInsertEnabled(): void {
    if (!pickerInsert) return;
    const altOk = (pickerAlt?.value.trim().length ?? 0) > 0;
    pickerInsert.disabled = !(pickedUrl && altOk);
  }
  pickerAlt?.addEventListener("input", refreshInsertEnabled);

  async function openImagePicker(): Promise<void> {
    if (!picker) return;
    pickedUrl = null;
    pickedKey = null;
    setPickerError(null);
    if (pickerAlt) pickerAlt.value = "";
    if (pickerPreview) pickerPreview.hidden = true;
    refreshInsertEnabled();
    picker.showModal();
    await loadRecentMedia();
  }
  for (const c of picker?.querySelectorAll<HTMLButtonElement>("[data-picker-cancel]") ?? []) {
    c.addEventListener("click", () => picker?.close());
  }
  // Cancelled or chosen, the caret goes back where the owner was writing.
  picker?.addEventListener("close", focusBody);
  dropzone?.addEventListener("click", () => pickerFile?.click());
  dropzone?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickerFile?.click(); }
  });
  dropzone?.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dropzone--over"); });
  dropzone?.addEventListener("dragleave", () => dropzone.classList.remove("dropzone--over"));
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dropzone--over");
    const file = e.dataTransfer?.files?.[0];
    if (file) void uploadInline(file);
  });
  pickerFile?.addEventListener("change", () => {
    const file = pickerFile.files?.[0];
    if (file) void uploadInline(file);
  });

  async function uploadInline(file: File): Promise<void> {
    setPickerError(null);
    try {
      const data = await uploadFile(file, "inline", pickerAlt?.value ?? "");
      pickedUrl = data.media.url;
      pickedKey = data.media.key;
      if (pickerPreviewImg && pickerPreview) {
        pickerPreviewImg.src = data.media.url;
        pickerPreview.hidden = false;
      }
      // Prefill alt from server-stored alt if present.
      if (pickerAlt && !pickerAlt.value && data.media.alt) pickerAlt.value = data.media.alt;
      refreshInsertEnabled();
      void loadRecentMedia();
    } catch (err) {
      if (err instanceof SessionExpired) { handleSessionExpiry(); return; }
      handleUploadError(err, setPickerError);
    }
  }

  pickerInsert?.addEventListener("click", () => {
    if (!pickedUrl) return;
    const alt = pickerAlt?.value.trim() ?? "";
    if (!alt) { setPickerError("Alt-text krävs."); return; }
    if (mdMode) applyEdit(insertImage(currentSelection(), pickedUrl, alt));
    else editor.chain().focus().setImage({ src: pickedUrl, alt }).run();
    picker?.close();
  });

  async function loadRecentMedia(): Promise<void> {
    if (!recentGrid) return;
    try {
      const res = await fetch("/api/admin/media?limit=24", {
        headers: { "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
      });
      const data = await readJson<{ ok: true; media: MediaItem[] }>(res);
      if (!isOk(data)) return;
      const media = data.media ?? [];
      // Clear previous thumbnails (keep the empty-state node).
      for (const t of recentGrid.querySelectorAll("[data-recent-item]")) t.remove();
      if (recentEmpty) recentEmpty.hidden = media.length > 0;
      for (const item of media) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "recent__item";
        btn.dataset.recentItem = "";
        btn.title = item.alt || item.key;
        const img = document.createElement("img");
        img.src = item.url;
        img.alt = item.alt || "";
        img.loading = "lazy";
        btn.appendChild(img);
        btn.addEventListener("click", () => {
          pickedUrl = item.url;
          pickedKey = item.key;
          if (pickerAlt && item.alt) pickerAlt.value = item.alt;
          if (pickerPreviewImg && pickerPreview) {
            pickerPreviewImg.src = item.url;
            pickerPreview.hidden = false;
          }
          for (const el of recentGrid.querySelectorAll(".recent__item--on")) el.classList.remove("recent__item--on");
          btn.classList.add("recent__item--on");
          refreshInsertEnabled();
        });
        recentGrid.appendChild(btn);
      }
    } catch (err) {
      if (err instanceof SessionExpired) handleSessionExpiry();
    }
  }

  // ── Cover picker ──────────────────────────────────────────────
  const coverRoot = form.querySelector<HTMLElement>("[data-cover-picker]");
  const coverThumb = coverRoot?.querySelector<HTMLImageElement>("[data-cover-thumb]");
  const coverAdd = coverRoot?.querySelector<HTMLButtonElement>("[data-cover-add]");
  const coverActions = coverRoot?.querySelector<HTMLElement>("[data-cover-actions]");
  const coverChange = coverRoot?.querySelector<HTMLButtonElement>("[data-cover-change]");
  const coverRemove = coverRoot?.querySelector<HTMLButtonElement>("[data-cover-remove]");
  const coverFile = coverRoot?.querySelector<HTMLInputElement>("[data-cover-file]");
  const coverError = coverRoot?.querySelector<HTMLElement>("[data-cover-error]");

  function renderCover(): void {
    const has = !!draft.coverImage;
    if (coverThumb) {
      coverThumb.hidden = !has;
      coverThumb.src = has ? servedUrl(draft.coverImage!) : "";
    }
    if (coverAdd) coverAdd.hidden = has;
    if (coverActions) coverActions.hidden = !has;
  }
  function servedUrl(key: string): string {
    return imageBase ? `${imageBase.replace(/\/+$/, "")}/${key}` : `/api/media/${key}`;
  }
  coverAdd?.addEventListener("click", () => coverFile?.click());
  coverChange?.addEventListener("click", () => coverFile?.click());
  coverRemove?.addEventListener("click", () => {
    draft.coverImage = null;
    renderCover();
    markDirty();
  });
  coverFile?.addEventListener("change", async () => {
    const file = coverFile.files?.[0];
    if (!file) return;
    if (coverError) coverError.hidden = true;
    try {
      const data = await uploadFile(file, "cover", draft.title);
      draft.coverImage = data.media.key;
      renderCover();
      markDirty();
    } catch (err) {
      if (err instanceof SessionExpired) { handleSessionExpiry(); return; }
      handleUploadError(err, (msg) => {
        if (coverError) { coverError.textContent = msg ?? ""; coverError.hidden = !msg; }
      });
    } finally {
      coverFile.value = "";
    }
  });

  // ── Shared upload ─────────────────────────────────────────────
  async function uploadFile(file: File, kind: "inline" | "cover", alt: string): Promise<UploadResponse> {
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) throw new UploadError(ADMIN.errors.uploadTooLarge);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt", alt);
    fd.append("kind", kind);
    if (draft.id !== undefined) fd.append("postId", String(draft.id));
    let res: Response;
    try {
      res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
        body: fd,
      });
    } catch {
      throw new UploadError(ADMIN.errors.uploadNetwork);
    }
    if (res.status === 413) throw new UploadError(ADMIN.errors.uploadTooLarge);
    if (res.status === 415) throw new UploadError(ADMIN.errors.uploadBadType);
    const data = await readJson<UploadResponse>(res);
    if (!res.ok || !isOk(data)) throw new UploadError(ADMIN.errors.uploadNetwork);
    return data;
  }

  // ── Validation + publish gating ───────────────────────────────
  function refreshPublishEnabled(): void {
    const publishBtn = form.querySelector<HTMLButtonElement>('[data-action="publish"]');
    if (!publishBtn) return;
    // validateDraft against a published-status copy so the gate reflects publish rules.
    const probe: PostDraft = { ...draft, status: "published" };
    const missing = validateDraft(probe).length;
    publishBtn.disabled = missing > 0;
    // The disabled state is neutral by design, so the button itself says why.
    publishBtn.title = missing > 0 ? ADMIN.states.fixFields.replace("{n}", String(missing)) : "";
  }
  const ERROR_TEXT: Record<string, string> = {
    title_required: "Titel krävs.",
    invalid_locale: "Ogiltigt språk.",
    body_required: "Brödtext krävs för publicering.",
    excerpt_required: "Utdrag krävs för publicering.",
  };
  function showValidation(errors: FieldError[]): void {
    if (!validationBox) return;
    if (errors.length === 0) { validationBox.hidden = true; validationBox.textContent = ""; return; }
    validationBox.hidden = false;
    validationBox.innerHTML =
      `<p class="validation-summary__title">${escapeHtml(fmt(ADMIN.states.fixFields, { n: errors.length }))}</p>` +
      `<ul>${errors.map((e) => `<li>${escapeHtml(ERROR_TEXT[e.code] ?? e.code)}</li>`).join("")}</ul>`;
  }

  // ── Save / publish / unpublish / delete ───────────────────────
  /**
   * `quiet` (autosave) keeps the document editable: the owner is typing, so the
   * page must not dim or swallow clicks — only the action buttons pause.
   */
  function setBusy(busy: boolean, quiet = false): void {
    for (const b of form.querySelectorAll<HTMLButtonElement>("[data-action]")) b.disabled = busy;
    if (saveStatus && busy) saveStatus.textContent = ADMIN.states.saving;
    if (busy) { if (!quiet) form.classList.add("editor--busy"); }
    else { form.classList.remove("editor--busy"); refreshPublishEnabled(); }
  }

  async function persist(targetStatus: "draft" | "published", auto = false): Promise<void> {
    flushBody(); // a keystroke inside the 150 ms debounce is part of this save
    const probe: PostDraft = { ...draft, status: targetStatus };
    const errors = validateDraft(probe);
    if (errors.length > 0) { if (!auto) showValidation(errors); return; }
    showValidation([]);
    draft.status = targetStatus;
    autosave.cancel();
    // What is SENT becomes the saved snapshot — not the draft at response time,
    // which may already hold words typed during the request (autosave).
    const sent: PostDraft = structuredClone(draft);

    setBusy(true, auto);
    try {
      const isCreate = draft.id === undefined;
      const res = await fetch("/api/admin/posts", {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
        body: JSON.stringify(toApiBody(sent)),
      });
      const data = await readJson<CreatePostResponse | UpdatePostResponse>(res);
      if (!res.ok || !isOk(data)) {
        showToast(ADMIN.errors.generic);
        return;
      }
      const post = data.post;
      // Sync the authoritative server values back into the model.
      const wasCreate = isCreate;
      for (const d of [draft, sent]) {
        d.id = post.id;
        d.slug = post.slug;
        d.slugManual = true; // server slug is now authoritative
        d.status = post.status;
      }
      saved = sent;
      clearStash();
      refreshSlugChip();
      stampSaved(auto);
      if (wasCreate) {
        // Redirect so subsequent saves PUT against /admin/posts/{id}.
        window.location.href = `/admin/posts/${post.id}`;
        return;
      }
      // Re-render the action bar state if publish/unpublish changed status.
      reflectStatusButtons();
    } catch (err) {
      if (err instanceof SessionExpired) return handleSessionExpiry();
      showToast(ADMIN.errors.generic);
    } finally {
      setBusy(false);
      renderSaveStatus(); // edits made during the request show as unsaved again
      if (dirty()) autosave.poke();
    }
  }

  // One save at a time: a second Ctrl+S / click / autosave while a request is
  // in flight joins it instead of sending a parallel PUT (or a duplicate POST).
  const saver = createSaveGate(persist);
  const autosave = createAutosave({
    allowed: () => shouldAutosave(draft, dirty()) && !saver.busy(),
    save: () => void saver.run("draft", true),
  });
  const saveCurrent = () => saver.run(draft.status === "published" ? "published" : "draft");
  bindSaveShortcut(form, () => void saveCurrent());

  function stampSaved(auto = false): void {
    if (!saveStatus) return;
    const time = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    const text = fmt(auto ? ADMIN.states.autosaved : ADMIN.states.saved, { time });
    saveStatus.dataset.saved = text;
    saveStatus.textContent = text;
  }

  function reflectStatusButtons(): void {
    // Swap the primary/secondary action labels to match the new status without a reload.
    // Both branches rely on the delegated form-click handler to route the new
    // button's [data-action]; no direct listeners (a direct listener here would
    // double-fire alongside the delegated one).
    const saveBtn = form.querySelector<HTMLButtonElement>('[data-action="save"]');
    const publishBtn = form.querySelector<HTMLButtonElement>('[data-action="publish"]');
    const unpublishBtn = form.querySelector<HTMLButtonElement>('[data-action="unpublish"]');
    if (draft.status === "published") {
      if (saveBtn) { saveBtn.textContent = ADMIN.editor.saveChanges; saveBtn.classList.add("btn-primary"); saveBtn.classList.remove("btn-ghost"); }
      publishBtn?.remove();
      if (!unpublishBtn && saveBtn) {
        const u = document.createElement("button");
        u.type = "button"; u.className = "btn-ghost"; u.dataset.action = "unpublish";
        u.textContent = ADMIN.editor.unpublish;
        saveBtn.parentElement?.insertBefore(u, saveBtn.nextSibling);
      }
    } else {
      // Back to draft (e.g. after Avpublicera): restore the draft action bar so the
      // owner can re-publish without reloading the page (regression fixed 2026-06-01).
      if (saveBtn) { saveBtn.textContent = ADMIN.editor.saveDraft; saveBtn.classList.add("btn-ghost"); saveBtn.classList.remove("btn-primary"); }
      unpublishBtn?.remove();
      if (!publishBtn && saveBtn) {
        const p = document.createElement("button");
        p.type = "button"; p.className = "btn-primary"; p.dataset.action = "publish";
        p.textContent = ADMIN.editor.publish;
        saveBtn.parentElement?.insertBefore(p, saveBtn.nextSibling);
      }
      refreshPublishEnabled();
    }
  }

  async function remove(): Promise<void> {
    if (draft.id === undefined) { window.location.href = "/admin/posts"; return; }
    if (!window.confirm(fmt(ADMIN.dashboard.deleteConfirm, { title: draft.title || "" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/posts?id=${draft.id}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
      });
      const data = await readJson<{ ok: true }>(res);
      if (res.ok && isOk(data)) {
        saved = structuredClone(draft); // suppress the dirty guard on navigate-away
        clearStash();
        window.location.href = "/admin/posts";
      } else {
        showToast(ADMIN.errors.generic);
      }
    } catch (err) {
      if (err instanceof SessionExpired) return handleSessionExpiry();
      showToast(ADMIN.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function preview(): Promise<void> {
    // Förhandsgranska: save first if new (need an id), then open the preview route.
    if (draft.id === undefined) {
      await saver.run(draft.status); // create → redirects; preview reachable after.
      return;
    }
    flushBody();
    if (dirty()) await saver.run(draft.status);
    if (draft.id !== undefined) window.open(`/admin/preview/${draft.id}`, "_blank", "noopener");
  }

  // Action bar wiring (delegated, survives the unpublish-button swap).
  form.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "save": void saveCurrent(); break;
      case "publish": void saver.run("published"); break;
      case "unpublish": void saver.run("draft"); break;
      case "preview": void preview(); break;
      case "delete": void remove(); break;
    }
  });

  // ── Session expiry contract ───────────────────────────────────
  function stashKey(): string {
    return `novo-draft-stash:${draft.id ?? "new"}`;
  }
  function stashDraft(): void {
    try { localStorage.setItem(stashKey(), JSON.stringify(draft)); } catch { /* ignore quota */ }
  }
  function clearStash(): void {
    try { localStorage.removeItem(stashKey()); } catch { /* ignore */ }
  }
  function handleSessionExpiry(): void {
    stashDraft();
    setBusy(false);
    if (validationBox) {
      validationBox.hidden = false;
      validationBox.textContent = ADMIN.states.sessionExpired;
    } else {
      showToast(ADMIN.states.sessionExpired);
    }
  }
  // Restore a stashed draft (e.g. after re-login) if newer text exists.
  (function restoreStash() {
    try {
      const raw = localStorage.getItem(stashKey());
      if (!raw) return;
      const stashed = JSON.parse(raw) as PostDraft;
      // Only offer restore when it actually differs from what loaded.
      if (isDirty(stashed, draft)) {
        if (window.confirm("Vi hittade osparade ändringar från en avbruten session. Återställ dem?")) {
          Object.assign(draft, stashed);
          syncDomFromDraft();
          markDirty();
        } else {
          clearStash();
        }
      } else {
        clearStash();
      }
    } catch { /* ignore */ }
  })();

  function syncDomFromDraft(): void {
    titleInput.value = draft.title;
    excerptInput.value = draft.excerpt;
    bodyArea.value = draft.body;
    editor.commands.setContent(draft.body, { contentType: "markdown", emitUpdate: false });
    seoTitleInput.value = draft.seoTitle;
    seoDescInput.value = draft.seoDesc;
    refreshSlugChip();
    renderCover();
    renderAllCounters();
  }

  // ── Dirty guard ───────────────────────────────────────────────
  window.addEventListener("beforeunload", (e) => {
    flushBody();
    if (dirty()) { e.preventDefault(); e.returnValue = ADMIN.states.unsavedGuard; }
  });
  // In-app nav intercept: any same-origin link click while dirty.
  document.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!link || link.target === "_blank") return;
    if (!dirty()) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname) return;
    if (!window.confirm(ADMIN.states.unsavedGuard)) e.preventDefault();
  }, true);

  // ── JSON read with session-expiry detection ───────────────────
  async function readJson<T>(res: Response): Promise<T | null> {
    // Access bounced us to an HTML login (or an opaque redirect): not our JSON.
    if (res.type === "opaqueredirect") throw new SessionExpired();
    const ct = res.headers.get("content-type") ?? "";
    if (res.redirected && !ct.includes("application/json")) throw new SessionExpired();
    if (!ct.includes("application/json")) {
      // 401/403 with an HTML body from Access → session expired.
      if (res.status === 401 || res.status === 403) throw new SessionExpired();
      const text = await res.text().catch(() => "");
      if (/<html/i.test(text)) throw new SessionExpired();
      return null;
    }
    return (await res.json().catch(() => null)) as T | null;
  }

  // ── Init render ───────────────────────────────────────────────
  function renderAllCounters(): void {
    renderCounter("excerpt", draft.excerpt);
    renderCounter("seoTitle", draft.seoTitle);
    renderCounter("seoDesc", draft.seoDesc);
  }
  refreshSlugChip();
  renderAllCounters();
  renderCover();
  refreshPublishEnabled();
  renderSaveStatus();
}

/** Upload-specific error so the caller can surface the SV-mapped message. */
class UploadError extends Error {}

function handleUploadError(err: unknown, show: (msg: string | null) => void): void {
  if (err instanceof UploadError) { show(err.message); return; }
  show(ADMIN.errors.uploadNetwork);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
