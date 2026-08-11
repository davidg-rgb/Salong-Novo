import MarkdownIt from "markdown-it";

/**
 * Blog bodies are stored as Markdown and rendered with raw HTML DISABLED
 * (`html: false`). This is the security boundary: no author-supplied HTML —
 * including <script> — can ever reach the page. Edge-safe (pure JS, no DOM),
 * so it runs identically in tests, Astro build, and Cloudflare Workers.
 */
const md = new MarkdownIt({
  html: false, // <-- never pass through raw HTML
  linkify: true,
  typographer: true,
  breaks: false,
});

// Force external links to be safe (noopener) and open in a new tab.
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const href = token.attrGet("href") ?? "";
  if (/^https?:\/\//i.test(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderMarkdown(source: string): string {
  return md.render(source ?? "");
}

/** Plain-text excerpt of the first ~n chars, stripped of Markdown syntax. */
export function excerpt(source: string, n = 160): string {
  const text = (source ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> text
    .replace(/[#>*_`~-]/g, "") // md punctuation
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= n) return text;
  return text.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

export function readingTimeMinutes(source: string): number {
  const words = (source ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
