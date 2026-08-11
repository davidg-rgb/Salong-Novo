/**
 * Reordering a list (ARCHITECTURE §6.15 / §9.4, F-004).
 *
 * TWO INPUT PATHS, ALWAYS BOTH. Drag-and-drop is the fast one on a desktop; the
 * ▲/▼ buttons are the only one that exists on a phone, which is where Nicole
 * actually works. The buttons are rendered by the markup and are never
 * JS-conditional — so the list is still reorderable if drag events misbehave.
 *
 * The UI is OPTIMISTIC and the rollback is real: the DOM order changes first,
 * the whole new order is posted, and a failure puts the list back exactly as it
 * was and says so. A grid that looks reordered but was not saved is the failure
 * mode worth spending code on.
 *
 * Vanilla TS, Astro-bundled module — never `is:inline`, so the admin CSP's
 * `script-src 'self'` holds.
 */
import { adminString } from "../lib/cms/strings.sv";
import { toast, token } from "./forms.client";

/**
 * Wire one list. Items are `[data-reorder-item]` children carrying `data-id`;
 * `data-category` on the list itself is sent along when present (the portfolio
 * endpoint scopes its UPDATEs by category, §6.9).
 */
export function wireReorder(list: HTMLElement, endpoint: string): void {
  const items = (): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>("[data-reorder-item]"));

  const order = (): string[] => items().map((item) => item.dataset.id ?? "");

  /** Put the list back in `snapshot` order — the rollback after a failed save. */
  function restore(snapshot: string[]): void {
    for (const id of snapshot) {
      const item = list.querySelector<HTMLElement>(`[data-reorder-item][data-id="${id}"]`);
      if (item) list.appendChild(item);
    }
  }

  async function save(snapshot: string[]): Promise<void> {
    const ids = order()
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0);

    const body: Record<string, unknown> = { ids };
    if (list.dataset.category) body.category = list.dataset.category;

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": token() },
        body: JSON.stringify(body),
      });
    } catch {
      restore(snapshot);
      toast(adminString("error.network"), "error");
      return;
    }

    if (!res.ok) {
      restore(snapshot);
      toast(adminString("portfolio.reorderFailed"), "error");
      return;
    }
    toast(adminString("portfolio.reorderSaved"));
  }

  // ── the touch path: ▲ / ▼ ──────────────────────────────────────────────
  list.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      "[data-move-up], [data-move-down]",
    );
    if (!button) return;

    const item = button.closest<HTMLElement>("[data-reorder-item]");
    if (!item) return;

    const snapshot = order();
    const up = button.hasAttribute("data-move-up");
    const sibling = up ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;

    if (up) list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);

    // The button moved with its row; keep the keyboard on it so a second press
    // continues the same movement instead of landing on the neighbour's control.
    button.focus();
    void save(snapshot);
  });

  // ── the pointer path: drag and drop ────────────────────────────────────
  let dragged: HTMLElement | null = null;
  let snapshot: string[] = [];

  for (const item of items()) item.draggable = true;

  list.addEventListener("dragstart", (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-reorder-item]");
    if (!item) return;
    dragged = item;
    snapshot = order();
    item.classList.add("is-dragging");
    event.dataTransfer?.setData("text/plain", item.dataset.id ?? "");
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });

  list.addEventListener("dragover", (event) => {
    if (!dragged) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";

    // Insert before the first item whose midpoint is below the pointer.
    const after = items()
      .filter((item) => item !== dragged)
      .find((item) => {
        const box = item.getBoundingClientRect();
        return event.clientY < box.top + box.height / 2;
      });
    if (after) list.insertBefore(dragged, after);
    else list.appendChild(dragged);
  });

  list.addEventListener("drop", (event) => {
    if (dragged) event.preventDefault();
  });

  list.addEventListener("dragend", () => {
    if (!dragged) return;
    dragged.classList.remove("is-dragging");
    dragged = null;
    const before = snapshot;
    snapshot = [];
    // Nothing actually moved — don't spend a request saying so.
    if (before.join() === order().join()) return;
    void save(before);
  });
}

/** Wire every list on the page that declares its endpoint inline. */
export function wireReorderLists(): void {
  document.querySelectorAll<HTMLElement>("[data-reorder-endpoint]").forEach((list) => {
    wireReorder(list, list.dataset.reorderEndpoint ?? "");
  });
}
