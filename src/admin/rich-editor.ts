/**
 * The in-place blog body editor (2026-10-10, ARCHITECTURE §10.6). Replaces the
 * Markdown textarea + server-rendered preview pane: the owner asked for a
 * "Google Docs" editor (click and type, Style dropdown, B/I/lists/quote/link/
 * image, undo/redo), not Markdown syntax next to a preview.
 *
 * Engine: Tiptap 3 (MIT, ProseMirror) with the official `@tiptap/markdown`
 * extension, so STORAGE STAYS MARKDOWN — `getMarkdown()` is what the draft model
 * carries and what the API saves; markdown.ts (markdown-it, html:false) still
 * renders the public page. The parser here is `marked`, the site's is
 * markdown-it: `tests/editor-roundtrip.test.ts` pins that the two agree on every
 * construct this toolbar can produce.
 *
 * This module owns the editor CONFIG and the toolbar wiring so the DOM tests
 * (happy-dom) exercise exactly what ships; `editor.client.ts` owns the page.
 */
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { isSaveShortcut, type BlockStyle } from "../lib/editor";

export interface RichEditorOptions {
  element: HTMLElement;
  /** Initial Markdown body (the draft's `body`). */
  markdown: string;
  placeholder?: string;
  /** Fires on every document change (the caller debounces). */
  onUpdate?: (editor: Editor) => void;
}

/** The extension set, shared by the page and the round-trip tests. */
export function richExtensions(placeholder = "") {
  return [
    StarterKit.configure({
      // The public post sits under an H1 title; the body only ever has H2/H3.
      heading: { levels: [2, 3] },
      // Underline has no Markdown form markdown-it renders (it would save as
      // literal `++text++`), so it is off rather than silently lost.
      underline: false,
      link: {
        openOnClick: false,
        linkOnPaste: true,
        autolink: true,
        defaultProtocol: "https",
      },
    }),
    // Block images: `![alt](src)` on its own line, the shape insertImage() wrote.
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder }),
    Markdown,
  ];
}

export function createRichEditor(opts: RichEditorOptions): Editor {
  return new Editor({
    element: opts.element,
    extensions: richExtensions(opts.placeholder),
    content: opts.markdown,
    contentType: "markdown",
    editorProps: {
      attributes: { class: "sheet__doc body", role: "textbox", "aria-multiline": "true" },
    },
    onUpdate: ({ editor }) => opts.onUpdate?.(editor),
  });
}

/** Style dropdown → command. Levels are [2,3] only (see `richExtensions`). */
export function applyStyle(editor: Editor, style: BlockStyle): void {
  const chain = editor.chain().focus();
  if (style === "h2") chain.setHeading({ level: 2 }).run();
  else if (style === "h3") chain.setHeading({ level: 3 }).run();
  else chain.setParagraph().run();
}

/** The block style under the caret, for the dropdown to reflect. */
export function currentStyle(editor: Editor): BlockStyle {
  if (editor.isActive("heading", { level: 2 })) return "h2";
  if (editor.isActive("heading", { level: 3 })) return "h3";
  return "p";
}

export interface ToolbarHandlers {
  /** Ctrl/Cmd+K or the link button. */
  onLink: () => void;
  /** The image button (opens the existing ImagePicker). */
  onImage: () => void;
}

/** Toolbar commands that toggle a mark/node, and how to read their state. */
const TOGGLES: Record<string, { run: (e: Editor) => void; active: (e: Editor) => boolean }> = {
  bold: { run: (e) => e.chain().focus().toggleBold().run(), active: (e) => e.isActive("bold") },
  italic: { run: (e) => e.chain().focus().toggleItalic().run(), active: (e) => e.isActive("italic") },
  bullet: { run: (e) => e.chain().focus().toggleBulletList().run(), active: (e) => e.isActive("bulletList") },
  ordered: { run: (e) => e.chain().focus().toggleOrderedList().run(), active: (e) => e.isActive("orderedList") },
  quote: { run: (e) => e.chain().focus().toggleBlockquote().run(), active: (e) => e.isActive("blockquote") },
  link: { run: () => {}, active: (e) => e.isActive("link") },
};

/**
 * Wire a `[data-rich-toolbar]` element to the editor: Style select, toggle
 * buttons (`data-cmd`), undo/redo, roving tabindex, `aria-pressed` sync on every
 * transaction, and the Ctrl/Cmd+K shortcut on the editor surface. Returns a
 * `sync` the caller may re-run (e.g. after a mode switch).
 */
export function mountToolbar(editor: Editor, toolbar: HTMLElement, handlers: ToolbarHandlers): { sync: () => void } {
  // Cast, not a type argument: the DOM lib's HTMLSelectElement.remove() overload
  // fails querySelector's `extends Element` constraint under this tsconfig.
  const select = toolbar.querySelector("[data-style]") as HTMLSelectElement | null;
  const tools = Array.from(toolbar.querySelectorAll<HTMLElement>("[data-cmd], [data-style], [data-mode-toggle]"));

  function sync(): void {
    if (select) select.value = currentStyle(editor);
    for (const btn of toolbar.querySelectorAll<HTMLButtonElement>("[data-cmd]")) {
      const t = TOGGLES[btn.dataset.cmd!];
      if (t) btn.setAttribute("aria-pressed", String(t.active(editor)));
      if (btn.dataset.cmd === "undo") btn.disabled = !editor.can().undo();
      if (btn.dataset.cmd === "redo") btn.disabled = !editor.can().redo();
    }
  }

  select?.addEventListener("change", () => applyStyle(editor, select.value as BlockStyle));

  toolbar.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cmd]");
    if (!btn || btn.disabled) return;
    const cmd = btn.dataset.cmd!;
    if (cmd === "link") handlers.onLink();
    else if (cmd === "image") handlers.onImage();
    else if (cmd === "undo") editor.chain().focus().undo().run();
    else if (cmd === "redo") editor.chain().focus().redo().run();
    else TOGGLES[cmd]?.run(editor);
    sync();
  });

  // Roving tabindex (WAI-ARIA toolbar pattern): one tab stop, arrows move.
  toolbar.addEventListener("keydown", (e) => {
    const idx = tools.indexOf(document.activeElement as HTMLElement);
    if (idx === -1) return;
    // The select owns its own arrow keys (it changes value with them).
    if (tools[idx] === (select as HTMLElement | null) &&(e.key === "ArrowUp" || e.key === "ArrowDown")) return;
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

  // Ctrl/Cmd+K on the document surface. B/I/Z/Y are Tiptap's own keymaps; S is
  // bound once for the whole form by `bindSaveShortcut`. Never Ctrl+Alt+digit:
  // AltGr on a Swedish keyboard IS Ctrl+Alt and types @ { [ there.
  editor.view.dom.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      handlers.onLink();
    }
  });

  editor.on("transaction", sync);
  sync();
  return { sync };
}

/**
 * Ctrl/Cmd+S anywhere in `root` (the document, the Markdown textarea, the title,
 * the side fields) saves instead of opening the browser's "Save page" dialog.
 * One listener on the root, so a keystroke inside the document never fires twice.
 */
export function bindSaveShortcut(root: HTMLElement, onSave: () => void): void {
  root.addEventListener("keydown", (e) => {
    if (!isSaveShortcut(e)) return;
    e.preventDefault();
    onSave();
  });
}
