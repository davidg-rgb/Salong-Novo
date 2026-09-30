/**
 * The home refresh's client layer (2026-09-30) — the Desktop-Claude kit's script,
 * rewritten as a module and stripped of everything that rendered content.
 *
 * It ADDS: state classes (html.nr / nr-motion / nr-home, .nr-go, .nr-in, …), CSS
 * custom properties, word-mask spans around text already on the page, and
 * aria-hidden copies of the strip's own five tiles for the marquee. It drives the
 * home header's state, the hero/story parallax and Lenis.
 *
 * It NEVER renders content. The scroll cue, the strip heading, the caption
 * numbers and the owner tag are server-rendered by the components, so a visitor
 * without JS gets the whole page; the kit's "inject it if missing" paths are gone
 * rather than kept "just in case".
 *
 * Loaded on every page by Base.astro. Every step is guarded by the element it
 * needs, because only `/` and `/en` have a .hero, .strip or .team-grid.
 */
import Lenis from "lenis";

const root = document.documentElement;

// Idempotent: a second evaluation must not split words twice or double the marquee.
if (!root.classList.contains("nr")) boot();

function boot(): void {
  root.classList.add("nr");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) root.classList.add("nr-motion");

  const hero = document.querySelector<HTMLElement>(".hero");
  const header = document.querySelector<HTMLElement>(".site-header");
  // The home page's fixed/transparent header (SiteHeader.astro) keys off this.
  if (hero) root.classList.add("nr-home");

  if (hero) wordmark(hero);
  if (!reduce) marquee();
  italicLastWord();
  document.querySelectorAll<HTMLElement>(".story h2, .team-head h2, .strip-head h2").forEach(splitWords);
  reveals(hero, reduce);

  if (!reduce) smoothScroll();
  scrollLinked(hero, header, reduce);
}

/**
 * Wrap every word of `el` in `.nr-w > span` so motion.css can raise it through a
 * clip. Text only — child elements are walked, never replaced — and a run of
 * whitespace stays a plain text node, so the line still wraps where it did.
 */
function splitWords(el: HTMLElement): void {
  if (el.dataset.nrSplit) return;
  el.dataset.nrSplit = "1";
  el.classList.add("nr-split");
  let i = 0;
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of (child.textContent ?? "").split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            continue;
          }
          const mask = document.createElement("span");
          mask.className = "nr-w";
          const word = document.createElement("span");
          word.textContent = part;
          word.style.setProperty("--i", String(i++));
          mask.appendChild(word);
          frag.appendChild(mask);
        }
        child.replaceWith(frag);
      } else if (child instanceof HTMLElement && !child.classList.contains("nr-w")) {
        walk(child);
      }
    }
  };
  walk(el);
}

/**
 * Bucket the hero wordmark's shapes into its letters by horizontal centre, so each
 * letter can rise on its own delay (`--l`). Shapes that are not rendered are
 * skipped: the white logo file carries two `display="none"` alternates of the Os,
 * and a zero box would file them under letter 0.
 */
function wordmark(hero: HTMLElement): void {
  const svg = hero.querySelector<SVGSVGElement>(".hero-brand svg");
  if (!svg) return;
  const vb = (svg.getAttribute("viewBox") ?? "0 0 1 1").trim().split(/[\s,]+/).map(Number);
  const x0 = vb[0] ?? 0;
  const width = vb[2] ?? 0;
  const letters = Math.max(1, (hero.querySelector(".hero-brand-text")?.textContent ?? "NOVO").trim().length);
  if (!(width > 0)) return;
  svg.querySelectorAll<SVGGraphicsElement>("path, polygon, rect").forEach((shape) => {
    if (shape.closest('[display="none"]')) return;
    let box: DOMRect;
    try {
      box = shape.getBBox();
    } catch {
      return; // not laid out (e.g. an ancestor is display: none in CSS)
    }
    if (box.width === 0 && box.height === 0) return;
    const centre = box.x + box.width / 2 - x0;
    const letter = Math.min(letters - 1, Math.max(0, Math.floor(centre / (width / letters))));
    shape.classList.add("nr-letter");
    shape.style.setProperty("--l", String(letter));
  });
  // Start the intro once the fonts are in (so the copy does not reflow mid-rise), or
  // after 900ms, whichever comes first. Two frames let the held state paint first.
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("nr-go")));
  const fonts = document.fonts?.ready ?? Promise.resolve();
  void Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 900))]).then(go);
}

/**
 * Clone the strip's tiles once so a -50% translate loops seamlessly. The copies
 * are decoration: hidden from assistive tech, alt-less, and out of the tab order.
 * Motion only — the static strip stays the five-tile scroll-snap row.
 */
function marquee(): void {
  const track = document.querySelector<HTMLElement>(".strip .strip-track");
  if (!track) return;
  const tiles = Array.from(track.querySelectorAll<HTMLElement>(":scope > .tile"));
  if (tiles.length === 0) return;
  for (const tile of tiles) {
    const copy = tile.cloneNode(true) as HTMLElement;
    copy.setAttribute("aria-hidden", "true");
    copy.querySelectorAll("img").forEach((img) => (img.alt = ""));
    copy
      .querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]")
      .forEach((el) => (el.tabIndex = -1));
    track.appendChild(copy);
  }
  track.style.setProperty("--nr-dur", `${tiles.length * 11}s`);
  track.classList.add("nr-marquee");
}

/** The booking band's heading ends on an italic word (SiteFooter.astro). */
function italicLastWord(): void {
  const head = document.querySelector<HTMLElement>(".fc-head");
  if (!head) return;
  splitWords(head);
  const words = head.querySelectorAll(".nr-w");
  if (words.length > 1) words[words.length - 1]!.classList.add("nr-em");
}

/**
 * Mark the scroll reveals and stagger them. With reduced motion (or no
 * IntersectionObserver) everything is marked revealed at once, which with no
 * html.nr-motion is a no-op anyway — nothing is ever left hidden.
 */
function reveals(hero: HTMLElement | null, reduce: boolean): void {
  const targets: Element[] = [];
  const add = (els: Iterable<Element>, cls: string, step = 0, cols = 1) => {
    let i = 0;
    for (const el of els) {
      el.classList.add(cls);
      if (step && el instanceof HTMLElement) el.style.setProperty("--d", `${(i % cols) * step}ms`);
      targets.push(el);
      i++;
    }
  };
  const all = (selector: string) => document.querySelectorAll(selector);
  add(all(".story .story-frame"), "nr-img");
  add(all(".story-copy > :not(h2), .team-head > :not(h2), .strip-head > a, .fc-inner > :not(.fc-head)"), "nr-r", 90, 4);
  add(all(".team-grid > li.owner"), "nr-r", 140, 2);
  add(all(".team-grid > li:not(.owner)"), "nr-r", 80, 5);
  add(all(".site-footer .foot > *"), "nr-r", 90, 4);
  all(".nr-split").forEach((el) => {
    if (!hero?.contains(el)) targets.push(el);
  });

  if (reduce || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("nr-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("nr-in");
        io.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
  );
  targets.forEach((el) => io.observe(el));
}

/**
 * Lenis smooth scroll (motion only), plus in-page anchors routed through it so a
 * `#target` link glides instead of jumping. Two exceptions keep the browser's own
 * behaviour: the skip link (it must land focus on #main at once, not animate
 * there) and a link whose target does not exist on the page.
 */
function smoothScroll(): void {
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9, autoRaf: true });
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (!link || link.classList.contains("skip-link")) return;
    const target = anchorTarget(link.getAttribute("href") ?? "");
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: -80, duration: 1.4 });
  });
  // The mobile menu locks body overflow while open (SiteHeader.astro), but Lenis
  // scrolls the window programmatically, which overflow does not stop — so the
  // wheel would still move the page under the open panel. Pause it with the menu.
  const toggle = document.querySelector<HTMLElement>("[data-nav-toggle]");
  if (toggle) {
    const sync = () => (toggle.getAttribute("aria-expanded") === "true" ? lenis.stop() : lenis.start());
    new MutationObserver(sync).observe(toggle, { attributes: true, attributeFilter: ["aria-expanded"] });
  }
}

/** The element an in-page `#id` href points at, or null (a bare `#`, a bad escape, no match). */
function anchorTarget(href: string): HTMLElement | null {
  if (!href.startsWith("#") || href.length < 2) return null;
  let id: string;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return null;
  }
  return document.getElementById(id);
}

/**
 * Scroll-linked work, batched to one frame: the home header's state, and (motion
 * only) the hero and story parallax. The header states run with reduced motion
 * too — they are state, not animation; tokens.css zeroes their transitions.
 */
function scrollLinked(hero: HTMLElement | null, header: HTMLElement | null, reduce: boolean): void {
  const toggle = document.querySelector<HTMLElement>("[data-nav-toggle]");
  const menuOpen = () => toggle?.getAttribute("aria-expanded") === "true";
  const soft = hero?.querySelector<HTMLElement>(".hero-soft") ?? null;
  const heroInner = hero?.querySelector<HTMLElement>(".hero-inner") ?? null;
  const frameKids = Array.from(document.querySelectorAll<HTMLElement>(".story .story-frame > *"));
  let lastY = scrollY;
  let ticking = false;

  const frame = () => {
    ticking = false;
    const y = scrollY;
    const vh = innerHeight;
    if (header && hero) {
      const open = menuOpen();
      const heroH = hero.offsetHeight;
      header.classList.toggle("nr-solid", open || y > heroH - header.offsetHeight - 1);
      header.classList.toggle("nr-open", open);
      if (open) header.classList.remove("nr-hide");
      else if (y > lastY + 4 && y > heroH) header.classList.add("nr-hide");
      else if (y < lastY - 4 || y < heroH) header.classList.remove("nr-hide");
    }
    if (!reduce && hero) {
      const p = Math.min(1, Math.max(0, y / hero.offsetHeight));
      if (soft) soft.style.translate = `0 ${(p * 18).toFixed(2)}%`;
      if (heroInner && hero.classList.contains("nr-go")) {
        heroInner.style.transform = `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0)`;
        heroInner.style.opacity = Math.max(0, 1 - p * 1.35).toFixed(3);
      }
    }
    if (!reduce && frameKids.length > 0) {
      const r = frameKids[0]!.parentElement!.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) {
        const q = (r.top + r.height / 2 - vh / 2) / vh;
        frameKids.forEach((kid) => (kid.style.translate = `0 ${(q * -40).toFixed(1)}px`));
      }
    }
    lastY = y;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", onScroll, { passive: true });
  if (toggle) new MutationObserver(onScroll).observe(toggle, { attributes: true, attributeFilter: ["aria-expanded"] });
  // A header tucked away above the viewport must come back when keyboard focus
  // moves into it, or Tab lands on links nobody can see.
  header?.addEventListener("focusin", () => header.classList.remove("nr-hide"));
  frame();
}
