/**
 * The media library's client behaviour (ARCHITECTURE §6.16 / §9.6).
 *
 * Vanilla TypeScript, no framework, bundled by Astro as a module — never
 * `is:inline`, so the admin CSP's `script-src 'self'` holds.
 *
 * The generic half — `token`, `toast`, `failure` and with them the session
 * sentinel — now lives in `forms.client.ts`, which Phase 3 built around the
 * content forms. This file kept only its own wiring, which was the point of
 * writing it small.
 *
 * One rule it follows beyond the shared ones: after a mutation the page RELOADS
 * rather than patching the DOM. The grid is then whatever the server actually
 * holds, which is the only version worth showing after a delete that may have
 * cleared other references.
 */
import { adminString } from "../lib/cms/strings.sv";
import { failure, toast, token } from "./forms.client";

type UsageHit = { label: string; count: number };

/** `{usage}` → "Portfolioposter (1), Sidinnehåll (2)". */
function fill(key: string, usage: UsageHit[] | string[]): string {
  const rendered = usage
    .map((hit) => (typeof hit === "string" ? hit : `${hit.label} (${hit.count})`))
    .join(", ");
  return adminString(key).replace("{usage}", rendered);
}

async function send(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, {
      ...init,
      headers: { "x-admin-token": token(), ...(init.headers ?? {}) },
    });
  } catch {
    toast(adminString("error.network"), "error");
    return null;
  }
}

function wireUpload(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const original = button?.textContent ?? adminString("media.upload");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    // Submit lock (ADR-07): a double-fire would leave an orphan R2 object.
    if (button?.disabled) return;
    if (button) {
      button.disabled = true;
      button.textContent = adminString("media.uploading");
    }

    const res = await send("/api/admin/upload", { method: "POST", body: new FormData(form) });
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
    if (!res) return;
    if (!res.ok) {
      toast((await failure(res)).message, "error");
      return;
    }
    toast(adminString("media.uploaded"));
    location.reload();
  });
}

function wireAltSave(button: HTMLButtonElement): void {
  const card = button.closest<HTMLElement>("[data-media-key]");
  const input = card?.querySelector<HTMLInputElement>("[data-media-alt]");
  if (!card || !input) return;

  button.addEventListener("click", async () => {
    const key = card.dataset.mediaKey ?? "";
    const res = await send(`/api/admin/media/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alt: input.value }),
    });
    if (!res) return;
    toast(res.ok ? adminString("media.altSaved") : (await failure(res)).message, res.ok ? "ok" : "error");
  });
}

function wireDelete(button: HTMLButtonElement): void {
  const card = button.closest<HTMLElement>("[data-media-key]");
  if (!card) return;

  button.addEventListener("click", async () => {
    const key = card.dataset.mediaKey ?? "";
    if (!confirm(adminString("media.confirmDelete"))) return;

    const endpoint = `/api/admin/media/${encodeURIComponent(key)}`;
    let res = await send(endpoint, { method: "DELETE" });
    if (!res) return;
    if (!res.ok) {
      toast((await failure(res)).message, "error");
      return;
    }

    // The soft in-use warning is a 200 carrying data, not an error (§11.1):
    // the first call reports what references the image and changes nothing.
    let body = (await res.json()) as
      | { ok: false; inUse: UsageHit[] }
      | { ok: true; cleared: UsageHit[]; unclearable: string[] };

    if (body.ok === false) {
      if (!confirm(fill("media.inUse", body.inUse))) return;
      res = await send(`${endpoint}?force=1`, { method: "DELETE" });
      if (!res) return;
      if (!res.ok) {
        toast((await failure(res)).message, "error");
        return;
      }
      body = (await res.json()) as { ok: true; cleared: UsageHit[]; unclearable: string[] };
    }

    if (body.ok === true && body.unclearable.length) {
      // A dangling reference the force path could not release must be VISIBLE.
      alert(fill("media.unclearable", body.unclearable));
    }
    toast(
      body.ok === true && body.cleared.length
        ? fill("media.cleared", body.cleared)
        : adminString("media.deleted"),
    );
    location.reload();
  });
}

export function wireMediaLibrary(): void {
  const upload = document.querySelector<HTMLFormElement>("[data-media-upload]");
  if (upload) wireUpload(upload);
  document
    .querySelectorAll<HTMLButtonElement>("[data-media-alt-save]")
    .forEach((button) => wireAltSave(button));
  document
    .querySelectorAll<HTMLButtonElement>("[data-media-delete]")
    .forEach((button) => wireDelete(button));
}
