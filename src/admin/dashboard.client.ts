/**
 * Dashboard controller (§10.6) — the only JS on `/admin`. Two jobs:
 *
 *  1. Client-side filter/search over the SSR-rendered rows (no refetch): a title
 *     search + status (Alla·Utkast·Publicerat) + locale (Alla·SV·EN) segmented
 *     filters, ANDed together. Rows carry `data-title/-status/-locale`.
 *  2. Delete confirm via the native `<dialog>` (showModal focus-trap + Esc) →
 *     `DELETE /api/admin/posts?id=` → drop the row on success.
 *
 * Pure DOM glue; no framework. Imported by `admin/index.astro`.
 */
import { ADMIN, fmt } from "../lib/admin-strings";
import { isOk } from "../lib/admin-api";

/** Defense-in-depth write token, injected into the Access-gated page (§10.8). */
const ADMIN_TOKEN =
  document.querySelector<HTMLMetaElement>('meta[name="admin-token"]')?.content ?? "";

const root = document.querySelector<HTMLElement>("[data-dashboard]");
if (root) initDashboard(root);

function initDashboard(root: HTMLElement): void {
  const searchInput = root.querySelector<HTMLInputElement>("[data-filter-search]");
  const statusGroup = root.querySelector<HTMLElement>("[data-filter-status]");
  const localeGroup = root.querySelector<HTMLElement>("[data-filter-locale]");
  const rows = Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-row]"));
  const noResults = root.querySelector<HTMLElement>("[data-no-results]");
  const toast = root.querySelector<HTMLElement>("[data-toast]");

  const state = { q: "", status: "", locale: "" };

  function applyFilters(): void {
    let visible = 0;
    const q = state.q.trim().toLowerCase();
    for (const row of rows) {
      const title = row.dataset.title ?? "";
      const status = row.dataset.status ?? "";
      const locale = row.dataset.locale ?? "";
      const ok =
        (!q || title.includes(q)) &&
        (!state.status || status === state.status) &&
        (!state.locale || locale === state.locale);
      row.hidden = !ok;
      if (ok) visible++;
    }
    if (noResults) noResults.hidden = visible !== 0 || rows.length === 0;
  }

  searchInput?.addEventListener("input", () => {
    state.q = searchInput.value;
    applyFilters();
  });

  // Segmented filter: pressed button sets the value; others reset aria-pressed.
  function wireSegmented(group: HTMLElement | null, key: "status" | "locale"): void {
    if (!group) return;
    group.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-value]");
      if (!btn) return;
      state[key] = btn.dataset.value ?? "";
      for (const b of group.querySelectorAll<HTMLButtonElement>("[data-value]")) {
        const on = b === btn;
        b.classList.toggle("seg--on", on);
        b.setAttribute("aria-pressed", String(on));
      }
      applyFilters();
    });
  }
  wireSegmented(statusGroup, "status");
  wireSegmented(localeGroup, "locale");

  // ── Delete via native <dialog> ─────────────────────────────────
  const dialog = root.querySelector<HTMLDialogElement>("[data-delete-dialog]");
  const msg = root.querySelector<HTMLElement>("[data-delete-msg]");
  const confirmBtn = root.querySelector<HTMLButtonElement>("[data-delete-confirm]");
  let pendingId: number | null = null;
  let pendingRow: HTMLTableRowElement | null = null;

  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-delete]");
    if (!btn || !dialog) return;
    pendingId = Number(btn.dataset.id);
    pendingRow = btn.closest<HTMLTableRowElement>("[data-row]");
    if (msg) msg.textContent = fmt(ADMIN.dashboard.deleteConfirm, { title: btn.dataset.title ?? "" });
    dialog.showModal();
  });

  for (const cancel of root.querySelectorAll<HTMLButtonElement>("[data-delete-cancel]")) {
    cancel.addEventListener("click", () => dialog?.close());
  }

  confirmBtn?.addEventListener("click", async () => {
    if (pendingId == null) {
      dialog?.close();
      return;
    }
    confirmBtn.disabled = true;
    try {
      const res = await fetch(`/api/admin/posts?id=${pendingId}`, {
        method: "DELETE",
        headers: { "x-admin-token": ADMIN_TOKEN },
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => null);
      if (res.ok && isOk(data)) {
        pendingRow?.remove();
        const idx = rows.findIndex((r) => r === pendingRow);
        if (idx !== -1) rows.splice(idx, 1);
        applyFilters();
        showToast(ADMIN.dashboard.delete + " ✓");
      } else {
        showToast(ADMIN.errors.generic);
      }
    } catch {
      showToast(ADMIN.errors.generic);
    } finally {
      confirmBtn.disabled = false;
      pendingId = null;
      pendingRow = null;
      dialog?.close();
    }
  });

  function showToast(text: string): void {
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 2600);
  }

  applyFilters();
}
