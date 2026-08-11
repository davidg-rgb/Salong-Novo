/**
 * The shared admin form engine (ARCHITECTURE §6.15, F-017).
 *
 * Phases 1 and 2 deliberately wrote `media.client.ts`, `reorder.client.ts` and
 * `portfolio-form.client.ts` small, with their own copies of three helpers, so
 * this module could absorb the generic half without unpicking anything. It now
 * owns `token()`, `toast()` and `failure()`, and all four scripts share one
 * definition of "what does a failed admin write look like on screen".
 *
 * THREE THINGS THIS ADDS BEYOND "fetch and toast":
 *
 *   THE DIRTY GUARD. Typing into a form arms `beforeunload`; a successful save
 *   disarms it. The failure mode worth spending code on is not a lost click, it
 *   is twenty minutes of bio rewritten and then navigated away from.
 *
 *   THE SESSION SENTINEL. An Access session expiring mid-form must not eat the
 *   form. It is keyed on ACCESS-LOGIN MARKERS in the response — not on "the body
 *   wasn't JSON", because Astro's own cross-origin check answers `text/plain`
 *   403 and that is a real error, not an expiry (P1 W-6). On a true expiry the
 *   form is left exactly as it was, with a prompt to log in in a new tab and
 *   press save again.
 *
 *   INLINE FIELD ERRORS. The API's `field` is mapped onto the input that caused
 *   it. One "something is wrong" toast on a twenty-field form is not an answer.
 *
 * Vanilla TS, Astro-bundled module — never `is:inline`, so the admin CSP's
 * `script-src 'self'` holds.
 */
import { adminString } from "../lib/cms/strings.sv";

export type ApiError = { error: string; field?: string; detail?: string };

/**
 * What a Cloudflare Access login response looks like from a `fetch`. Astro's
 * own text/plain 403 matches none of these, which is exactly the distinction
 * the sentinel exists to draw.
 */
const ACCESS_MARKERS = ["cdn-cgi/access", "CF_Authorization", "cf-access"];

export function token(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="admin-token"]')?.content ?? "";
}

/** The one `#admin-toast` AdminBase renders. Never create a second one. */
export function toast(message: string, kind: "ok" | "error" = "ok"): void {
  const el = document.getElementById("admin-toast");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("admin-toast--error", kind === "error");
  el.hidden = false;
}

/**
 * Read a failed response into something showable. A raw error CODE never reaches
 * the screen: everything resolves through `adminString`, and an unmapped code
 * degrades to the generic message rather than leaking `db_unavailable` at Nicole.
 */
export async function failure(
  res: Response,
): Promise<{ message: string; body: ApiError | null; expired: boolean }> {
  const type = res.headers.get("content-type") ?? "";

  if (type.includes("application/json")) {
    try {
      const body = (await res.json()) as ApiError;
      const mapped = adminString(`error.${body.error}`);
      return {
        message: mapped === `error.${body.error}` ? adminString("error.internal") : mapped,
        body,
        expired: false,
      };
    } catch {
      return { message: adminString("error.internal"), body: null, expired: false };
    }
  }

  const text = await res.text().catch(() => "");
  const expired =
    ACCESS_MARKERS.some((marker) => text.includes(marker)) ||
    res.url.includes("cloudflareaccess.com");
  return {
    message: expired ? adminString("form.sessionExpired") : adminString("error.internal"),
    body: null,
    expired,
  };
}

/** Every form with unsaved edits. One `beforeunload` listener serves all of them. */
const dirtyForms = new Set<HTMLFormElement>();

window.addEventListener("beforeunload", (event) => {
  // `preventDefault()` is the whole API now — the browser shows its own wording
  // and ignores any message we supply, so `form.dirtyWarning` is the copy for
  // the in-page confirmations rather than for this prompt.
  if (dirtyForms.size > 0) event.preventDefault();
});

export function markDirty(form: HTMLFormElement): void {
  dirtyForms.add(form);
}

export function markClean(form: HTMLFormElement): void {
  dirtyForms.delete(form);
}

/** Arm the guard on the first edit anywhere in this form. */
export function trackDirty(form: HTMLFormElement): void {
  for (const event of ["input", "change"] as const) {
    form.addEventListener(event, () => markDirty(form));
  }
}

export function clearFieldErrors(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-field-error]").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
  root.querySelectorAll<HTMLElement>("[aria-invalid]").forEach((el) => {
    el.removeAttribute("aria-invalid");
  });
}

/** Put a 400 ON the field that caused it. Returns false when there is no slot for it. */
export function showFieldError(root: HTMLElement, field: string, detail?: string): boolean {
  const slot = root.querySelector<HTMLElement>(`[data-field-error="${CSS.escape(field)}"]`);
  if (!slot) return false;
  const mapped = adminString(`fieldError.${detail ?? "generic"}`);
  slot.textContent = mapped.startsWith("fieldError.") ? adminString("fieldError.generic") : mapped;
  slot.hidden = false;
  root.querySelector(`[name="${CSS.escape(field)}"], [data-prop="${CSS.escape(field)}"]`)
    ?.setAttribute("aria-invalid", "true");
  return true;
}

/**
 * A JSON admin write. Returns null when the network itself failed — the toast is
 * already shown by then, and the caller has nothing useful left to say.
 */
export async function sendJson(
  url: string,
  method: string,
  body: unknown,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      method,
      headers: { "content-type": "application/json", "x-admin-token": token() },
      body: JSON.stringify(body),
    });
  } catch {
    toast(adminString("error.network"), "error");
    return null;
  }
}

/**
 * Handle a response uniformly: toast, inline field error, expiry sentinel.
 * Returns the parsed success body, or null when the call failed.
 */
export async function settle<T>(
  res: Response,
  scope: HTMLElement,
): Promise<T | null> {
  if (res.ok) return (await res.json().catch(() => ({}))) as T;

  const { message, body, expired } = await failure(res);
  if (expired) {
    // The form is NOT touched and NOT cleared: re-login in another tab and the
    // same save works. Losing the input to a session timeout is the bug F-017
    // exists to prevent.
    toast(message, "error");
    return null;
  }
  const placed = body?.field ? showFieldError(scope, body.field, body.detail) : false;
  toast(placed ? adminString("error.invalid_input") : message, "error");
  return null;
}

type AdminFormOptions = {
  /** The JSON body to send. Defaults to the form's own fields as an object. */
  payload?: (form: HTMLFormElement) => unknown;
  /** Shown on success unless `onSuccess` takes over the messaging. */
  successMessage?: string;
  onSuccess?: (body: unknown, form: HTMLFormElement) => void;
};

/** The form's named fields as a flat object — the default payload. */
function formPayload(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value === "string") data[key] = value;
  }
  return data;
}

/**
 * Wire one admin form: submit lock, dirty guard, sentinel, inline errors.
 *
 * The endpoint and method come off `data-endpoint` / `data-method`, so the same
 * component renders a create form and an edit form without a branch in here.
 */
export function wireAdminForm(form: HTMLFormElement, options: AdminFormOptions = {}): void {
  trackDirty(form);

  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const submitLabel = submit?.textContent ?? adminString("form.save");
  const method = (form.dataset.method ?? "POST").toUpperCase();
  const endpoint = form.dataset.endpoint ?? "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // Submit lock (ADR-07): a double-fire on a create is a duplicate row.
    if (submit?.disabled) return;

    clearFieldErrors(form);
    if (submit) {
      submit.disabled = true;
      submit.textContent = adminString("form.saving");
    }

    const res = await sendJson(endpoint, method, (options.payload ?? formPayload)(form));

    if (submit) {
      submit.disabled = false;
      submit.textContent = submitLabel;
    }
    if (!res) return;

    const body = await settle<unknown>(res, form);
    if (body === null) return;

    markClean(form);
    if (options.onSuccess) options.onSuccess(body, form);
    else toast(options.successMessage ?? adminString("form.saved"));
  });
}

// ── the grouped content form (/admin/content/[group]) ─────────────────────

type KvEntry = { key: string; value_sv: string; value_en: string };

const sideOf = (field: HTMLElement, side: "sv" | "en"): HTMLInputElement | null =>
  field.querySelector<HTMLInputElement>(`[data-kv-${side}]`);

/** The two sides of one field as an entry. A monolingual field stores `""` in EN. */
function entryOf(field: HTMLElement): KvEntry {
  return {
    key: field.dataset.key ?? "",
    value_sv: sideOf(field, "sv")?.value ?? "",
    value_en: sideOf(field, "en")?.value ?? "",
  };
}

/** Has either side moved off what the server rendered? */
function isEdited(field: HTMLElement): boolean {
  return (["sv", "en"] as const).some((side) => {
    const input = sideOf(field, side);
    return input !== null && input.value !== input.defaultValue;
  });
}

/**
 * Image fields (`seo.ogImage` today) hold a media key. The file input uploads to
 * the same endpoint the media library uses and drops the returned key into the
 * hidden value — so an image slot is editable without leaving the form.
 */
function wireImageField(field: HTMLElement): void {
  const file = field.querySelector<HTMLInputElement>("[data-kv-upload]");
  const value = sideOf(field, "sv");
  const thumb = field.querySelector<HTMLImageElement>("[data-kv-thumb]");
  if (!file || !value) return;

  file.addEventListener("change", async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;

    file.disabled = true;
    const data = new FormData();
    data.set("file", chosen);
    data.set("alt", "");

    let res: Response;
    try {
      res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "x-admin-token": token() },
        body: data,
      });
    } catch {
      file.disabled = false;
      toast(adminString("error.network"), "error");
      return;
    }

    file.disabled = false;
    file.value = "";
    if (!res.ok) {
      toast((await failure(res)).message, "error");
      return;
    }

    const body = (await res.json()) as { media: { key: string; url: string } };
    value.value = body.media.key;
    if (thumb) {
      thumb.src = body.media.url;
      thumb.hidden = false;
    }
    value.dispatchEvent(new Event("input", { bubbles: true }));
    toast(adminString("content.imageUploaded"));
  });
}

/**
 * The site-facts / page-copy form.
 *
 * Saves only the fields that actually changed — the PUT is a partial batch, so
 * touching one measurement does not rewrite twenty rows and stamp twenty
 * provenance timestamps.
 *
 * The per-field controls are the other half of F-018. "Bekräfta" writes the
 * shown default as a real row, so a placeholder badge can clear without the
 * client having to invent an edit; "Återställ till standard" deletes the row so
 * the developer default applies again. Both reload, because both change what the
 * badges and buttons on this page should say.
 */
export function wireContentForm(): void {
  const form = document.querySelector<HTMLFormElement>("[data-content-form]");
  if (!form) return;

  const fields = Array.from(form.querySelectorAll<HTMLElement>("[data-kv-field]"));
  for (const field of fields) {
    if (field.dataset.kind === "image") wireImageField(field);
  }

  wireAdminForm(form, {
    payload: () => ({ entries: fields.filter(isEdited).map(entryOf) }),
    onSuccess: (body) => {
      const saved = (body as { saved?: number }).saved ?? 0;
      if (saved === 0) {
        toast(adminString("content.nothingToSave"));
        return;
      }
      toast(adminString("content.saved"));
      // Reload so provenance badges and reset controls reflect the new rows.
      window.setTimeout(() => location.reload(), 400);
    },
  });

  form.querySelectorAll<HTMLButtonElement>("[data-kv-reset]").forEach((button) => {
    const field = button.closest<HTMLElement>("[data-kv-field]");
    if (!field) return;
    button.addEventListener("click", async () => {
      if (!confirm(adminString("content.confirmReset"))) return;
      const res = await sendJson("/api/admin/content", "DELETE", {
        keys: [field.dataset.key ?? ""],
      });
      if (!res) return;
      if ((await settle(res, form)) === null) return;
      markClean(form);
      location.reload();
    });
  });

  form.querySelectorAll<HTMLButtonElement>("[data-kv-confirm]").forEach((button) => {
    const field = button.closest<HTMLElement>("[data-kv-field]");
    if (!field) return;
    button.addEventListener("click", async () => {
      const res = await sendJson("/api/admin/content", "PUT", {
        entries: [
          {
            key: field.dataset.key ?? "",
            value_sv: field.dataset.defaultSv ?? "",
            value_en: field.dataset.defaultEn ?? "",
          },
        ],
      });
      if (!res) return;
      if ((await settle(res, form)) === null) return;
      markClean(form);
      location.reload();
    });
  });
}

// ── the generic collection manager (/admin/collections/[name]) ────────────

/**
 * One item's payload, read off the inputs that declare a `data-prop`.
 *
 * A `readOnly` field renders as static text on an EDIT form and therefore
 * carries no `data-prop` — it is absent from the body on purpose, and the server
 * copies it forward from the stored row. On the CREATE form it is a real input,
 * because that is the one moment the value is set (§6.7).
 */
function collectionPayload(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  form.querySelectorAll<HTMLElement>("[data-prop]").forEach((el) => {
    const prop = el.dataset.prop ?? "";
    const input = el as HTMLInputElement & HTMLTextAreaElement;
    switch (el.dataset.kind) {
      case "list":
        // One entry per line: a repeatable input that costs no JS and survives
        // a phone keyboard. Blank lines are formatting, not content.
        data[prop] = input.value
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line !== "");
        break;
      case "toggle":
        data[prop] = input.checked;
        break;
      case "number":
        data[prop] = Number(input.value || 0);
        break;
      default:
        data[prop] = input.value;
    }
  });
  return data;
}

export function wireCollectionManager(): void {
  document.querySelectorAll<HTMLFormElement>("[data-collection-form]").forEach((form) => {
    wireAdminForm(form, {
      payload: () => ({ data: collectionPayload(form) }),
      onSuccess: () => {
        toast(adminString("collection.saved"));
        // A create has to reload to get its row id, and an edit to re-render the
        // list in whatever order and shape the server actually holds.
        window.setTimeout(() => location.reload(), 400);
      },
    });
  });

  document.querySelectorAll<HTMLButtonElement>("[data-collection-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const endpoint = button.dataset.collectionDelete ?? "";
      if (!endpoint || !confirm(adminString("collection.confirmDelete"))) return;

      button.disabled = true;
      let res: Response;
      try {
        res = await fetch(endpoint, { method: "DELETE", headers: { "x-admin-token": token() } });
      } catch {
        button.disabled = false;
        toast(adminString("error.network"), "error");
        return;
      }

      if (!res.ok) {
        button.disabled = false;
        toast((await failure(res)).message, "error");
        return;
      }
      toast(adminString("collection.deleted"));
      location.reload();
    });
  });
}
