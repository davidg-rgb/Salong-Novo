/**
 * Editor controller (§10.6) — the one interactive script on the editor page.
 * NO framework, NO markdown-it in the browser. It does DOM reads/writes AROUND
 * the pure `editor.ts` core (which owns ALL caret/transform/validation logic —
 * never duplicated here) and talks to the admin API per `admin-api.ts`.
 *
 * Responsibilities:
 *  - Toolbar → editor.ts: read {value,start,end} off the textarea → call the pure
 *    fn → write back → restore selection → dispatch `input` → mark dirty →
 *    schedule a preview refresh. Keyboard shortcuts (Ctrl/Cmd+B/I/K) only when
 *    the textarea is focused. Roving tabindex on the toolbar.
 *  - Live preview: 250ms-debounced `POST /api/admin/preview` → render returned
 *    HTML into the shared-prose preview pane (preview == production).
 *  - Upload: cover (`kind=cover`) + inline (`kind=inline`, alt-gated) via
 *    `POST /api/admin/upload` → `UploadResponse`. Inline insertion uses
 *    `insertImage` at the caret.
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
  wrapInline,
  prefixBlock,
  insertLink,
  insertImage,
  toggleList,
  nextSlug,
  validateDraft,
  counter,
  toApiBody,
  isDirty,
  type PostDraft,
  type Selection,
  type FieldError,
} from "../lib/editor";
import { ADMIN, fmt } from "../lib/admin-strings";
import {
  isOk,
  type CreatePostResponse,
  type UpdatePostResponse,
  type PreviewResponse,
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
  const previewEl = form.querySelector<HTMLElement>("[data-preview]")!;
  const previewStatus = form.querySelector<HTMLElement>("[data-preview-status]");
  const saveStatus = form.querySelector<HTMLElement>("[data-save-status]");
  const validationBox = form.querySelector<HTMLElement>("[data-validation]");
  const toast = form.querySelector<HTMLElement>("[data-toast]");
  const toolbar = form.querySelector<HTMLElement>("[data-md-toolbar]");

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
  }
  function renderSaveStatus(): void {
    if (!saveStatus) return;
    saveStatus.textContent = dirty() ? "Osparade ändringar" : saveStatus.dataset.saved ?? "";
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

  // ── Body textarea → live preview ──────────────────────────────
  bodyArea.addEventListener("input", () => {
    draft.body = bodyArea.value;
    schedulePreview();
    refreshPublishEnabled();
    markDirty();
  });

  // ── Toolbar → editor.ts (pure transforms) ─────────────────────
  function currentSelection(): Selection {
    return { value: bodyArea.value, start: bodyArea.selectionStart, end: bodyArea.selectionEnd };
  }
  function applyEdit(result: { value: string; start: number; end: number }): void {
    bodyArea.value = result.value;
    bodyArea.setSelectionRange(result.start, result.end);
    bodyArea.focus();
    draft.body = bodyArea.value;
    bodyArea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function runCommand(cmd: string): void {
    const sel = currentSelection();
    switch (cmd) {
      case "bold": applyEdit(wrapInline(sel, "**", "fet text")); break;
      case "italic": applyEdit(wrapInline(sel, "_", "kursiv text")); break;
      case "heading": applyEdit(prefixBlock(sel, "## ")); break;
      case "quote": applyEdit(prefixBlock(sel, "> ")); break;
      case "bullet": applyEdit(toggleList(sel, false)); break;
      case "ordered": applyEdit(toggleList(sel, true)); break;
      case "link": {
        const url = window.prompt("Länkadress (URL):", "https://");
        if (url) applyEdit(insertLink(sel, url));
        break;
      }
      case "image": openImagePicker(); break;
    }
  }
  // Roving tabindex on the toolbar.
  if (toolbar) {
    const tools = Array.from(toolbar.querySelectorAll<HTMLButtonElement>("[data-cmd]"));
    toolbar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cmd]");
      if (btn) runCommand(btn.dataset.cmd!);
    });
    toolbar.addEventListener("keydown", (e) => {
      const idx = tools.indexOf(document.activeElement as HTMLButtonElement);
      if (idx === -1) return;
      let next = -1;
      if (e.key === "ArrowRight") next = (idx + 1) % tools.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + tools.length) % tools.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tools.length - 1;
      if (next !== -1) {
        e.preventDefault();
        tools[idx]!.tabIndex = -1;
        tools[next]!.tabIndex = 0;
        tools[next]!.focus();
      }
    });
  }

  // Keyboard shortcuts — only while the body textarea is focused.
  bodyArea.addEventListener("keydown", (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); runCommand("bold"); }
    else if (k === "i") { e.preventDefault(); runCommand("italic"); }
    else if (k === "k") { e.preventDefault(); runCommand("link"); }
  });

  // ── Live preview (debounced) ──────────────────────────────────
  let previewTimer: number | undefined;
  function schedulePreview(): void {
    if (previewStatus) previewStatus.textContent = ADMIN.states.previewLoading;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(runPreview, 250);
  }
  async function runPreview(): Promise<void> {
    try {
      const res = await fetch("/api/admin/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
        body: JSON.stringify({ body: draft.body }),
      });
      const data = await readJson<PreviewResponse>(res);
      if (isOk(data) && typeof data.html === "string") {
        if (data.html.trim().length === 0) {
          previewEl.innerHTML = `<p class="preview__placeholder">${escapeHtml(ADMIN.editor.previewPlaceholder)}</p>`;
        } else {
          previewEl.innerHTML = data.html;
        }
        if (previewStatus) previewStatus.textContent = "";
      } else {
        throw new Error("preview_failed");
      }
    } catch (err) {
      if (err instanceof SessionExpired) return handleSessionExpiry();
      if (previewStatus) previewStatus.textContent = ADMIN.states.previewError;
    }
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
    const sel = currentSelection();
    applyEdit(insertImage(sel, pickedUrl, alt));
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
    publishBtn.disabled = validateDraft(probe).length > 0;
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
  function setBusy(busy: boolean): void {
    for (const b of form.querySelectorAll<HTMLButtonElement>("[data-action]")) b.disabled = busy;
    if (saveStatus && busy) saveStatus.textContent = ADMIN.states.saving;
    if (busy) form.classList.add("editor--busy"); else { form.classList.remove("editor--busy"); refreshPublishEnabled(); }
  }

  async function persist(targetStatus: "draft" | "published"): Promise<void> {
    const probe: PostDraft = { ...draft, status: targetStatus };
    const errors = validateDraft(probe);
    if (errors.length > 0) { showValidation(errors); return; }
    showValidation([]);
    draft.status = targetStatus;

    setBusy(true);
    try {
      const isCreate = draft.id === undefined;
      const res = await fetch("/api/admin/posts", {
        method: isCreate ? "POST" : "PUT",
        headers: { "Content-Type": "application/json", "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
        body: JSON.stringify(toApiBody(draft)),
      });
      const data = await readJson<CreatePostResponse | UpdatePostResponse>(res);
      if (!res.ok || !isOk(data)) {
        showToast(ADMIN.errors.generic);
        return;
      }
      const post = data.post;
      // Sync the authoritative server values back into the model.
      const wasCreate = isCreate;
      draft.id = post.id;
      draft.slug = post.slug;
      draft.slugManual = true; // server slug is now authoritative
      draft.status = post.status;
      saved = structuredClone(draft);
      clearStash();
      refreshSlugChip();
      stampSaved();
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
    }
  }

  function stampSaved(): void {
    if (!saveStatus) return;
    const time = new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
    const text = fmt(ADMIN.states.saved, { time });
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
    if (draft.id === undefined) { window.location.href = "/admin"; return; }
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
        window.location.href = "/admin";
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
      await persist(draft.status); // create → redirects; preview reachable after.
      return;
    }
    if (dirty()) await persist(draft.status);
    if (draft.id !== undefined) window.open(`/admin/preview/${draft.id}`, "_blank", "noopener");
  }

  // Action bar wiring (delegated, survives the unpublish-button swap).
  form.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!btn) return;
    switch (btn.dataset.action) {
      case "save": void persist(draft.status === "published" ? "published" : "draft"); break;
      case "publish": void persist("published"); break;
      case "unpublish": void persist("draft"); break;
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
    seoTitleInput.value = draft.seoTitle;
    seoDescInput.value = draft.seoDesc;
    refreshSlugChip();
    renderCover();
    renderAllCounters();
    schedulePreview();
  }

  // ── Dirty guard ───────────────────────────────────────────────
  window.addEventListener("beforeunload", (e) => {
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
  if (draft.body.trim().length > 0) schedulePreview();
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
