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
 * needs, because only `/` and `/en` have a .hero, .strip or .team-grid. Every other
 * page gets innerPage() (2026-10-11): a masthead plus one revealed object.
 */
import Lenis from "lenis";

const root = document.documentElement;

// Idempotent: a second evaluation must not split words twice or double the marquee.
if (!root.classList.contains("nr")) boot();

function boot(): void {
  // Read before anything changes: has motion.css's pre-boot hold already run out?
  const expired = holdExpired();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Base.astro's head script may already have set nr-motion (2026-10-11); toggle so
  // this is the final word either way.
  root.classList.toggle("nr-motion", !reduce);
  // html.nr is added AFTER the inner page's held states are set (below), in the same
  // task: motion.css holds an inner <main> until html.nr, so nothing paints between.

  const hero = document.querySelector<HTMLElement>(".hero");
  const header = document.querySelector<HTMLElement>(".site-header");
  // The home page's fixed/transparent header (SiteHeader.astro) keys off this.
  if (hero) root.classList.add("nr-home");

  if (hero) wordmark(hero, expired);
  if (hero) heroVideo(hero, reduce);
  if (!reduce) marquee();
  italicLastWord();
  document.querySelectorAll<HTMLElement>(".story h2, .team-head h2, .strip-head h2").forEach(splitWords);
  const inner = hero || reduce ? [] : innerPage(expired);
  root.classList.add("nr");
  reveals(hero, reduce, inner);

  if (!reduce) smoothScroll();
  scrollLinked(hero, header, reduce);
}

/**
 * True when this module arrived after motion.css's pre-boot hold (--nr-hold) let the
 * page show (2026-10-11). The visitor has then already seen the finished page, and
 * running the intro would hide it and play it again — a double flash. Callers skip
 * the intro instead. False when the head script never set nr-motion (no hold ran).
 */
function holdExpired(): boolean {
  if (!root.classList.contains("nr-motion")) return false;
  // The hold's own clock first: it starts when the page is first styled, so a slow
  // server response does not count against it (performance.now() runs from the
  // navigation start). The cap in time is only the fallback for a browser without
  // getAnimations().
  if (typeof document.getAnimations === "function") {
    const holds = document
      .getAnimations()
      .filter((a) => /^nr-hold/.test((a as CSSAnimation).animationName ?? ""));
    if (holds.length > 0) return holds.some((a) => a.playState === "finished");
  }
  const raw = getComputedStyle(root).getPropertyValue("--nr-hold").trim();
  const n = parseFloat(raw);
  const cap = Number.isFinite(n) ? (raw.endsWith("ms") ? n : n * 1000) : 2000;
  return performance.now() > cap;
}

/** Apply class changes with transitions off, so held/visible states land without animating. */
function settleInto(els: Iterable<HTMLElement | SVGElement>, change: () => void): void {
  const list = Array.from(els);
  list.forEach((el) => (el.style.transition = "none"));
  change();
  void document.body.offsetHeight;
  list.forEach((el) => (el.style.transition = ""));
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
function wordmark(hero: HTMLElement, expired = false): void {
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
  // A late boot (the pre-boot hold already showed the hero) skips the intro: the hero
  // goes straight to its resting state, with nothing transitioning (2026-10-11).
  if (expired) {
    const held = hero.querySelectorAll<HTMLElement | SVGElement>(
      ".kicker, .hero-tagline, .sub, .cta, .scroll-cue, .hero-soft, .nr-letter",
    );
    settleInto(held, () => hero.classList.add("nr-go"));
    return;
  }
  // Start the intro once the fonts are in (so the copy does not reflow mid-rise), or
  // after 900ms, whichever comes first. Two frames let the held state paint first.
  const go = () => requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add("nr-go")));
  const fonts = document.fonts?.ready ?? Promise.resolve();
  void Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 900))]).then(go);
}

/**
 * The hero's salon film (2026-10-10). Home.astro renders the <video> with a poster
 * and no source, so the browser fetches no mp4 until this attaches one. It does so
 * only with motion allowed, Save-Data off, no 2G connection and both data-src paths
 * present, and only after window load plus an idle period (2026-10-11); 1080p
 * from 900px wide, 720p below. Every other path adds .nr-video-off, which in
 * motion.css hands the plate back to the poster frame.
 *
 * `muted` is set again as a property because autoplay policy reads the property;
 * the attribute in the markup is what iOS needs. A refused play() (autoplay
 * blocked, codec missing) is swallowed: the poster stays and nothing is logged.
 * The hero drifts off-screen as the page scrolls, so an IntersectionObserver
 * pauses the decoder there and resumes it when the hero comes back.
 */
function heroVideo(hero: HTMLElement, reduce: boolean): void {
  const video = hero.querySelector<HTMLVideoElement>("video.hero-video");
  if (!video || video.dataset.nrVideo) return;
  video.dataset.nrVideo = "1";
  const off = () => {
    if (!hero.classList.contains("nr-video-on")) hero.classList.add("nr-video-off");
  };
  const hd = video.dataset.srcHd?.trim() ?? "";
  const sd = video.dataset.srcSd?.trim() ?? "";
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  const saveData = connection?.saveData === true;
  // A 2G link (2026-10-11) is treated like Save-Data: the film is MBs the visitor
  // would wait on and pay for, and the poster is already a complete plate.
  const slow = connection?.effectiveType === "2g" || connection?.effectiveType === "slow-2g";
  if (reduce) return; // no html.nr-motion: the poster is already the opaque plate
  if (saveData || slow || !hd || !sd) {
    off();
    return;
  }
  const play = () => {
    video.play()?.catch(off);
  };
  video.addEventListener(
    "playing",
    () => {
      hero.classList.remove("nr-video-off");
      hero.classList.add("nr-video-on");
    },
    { once: true },
  );
  video.addEventListener("error", off, { once: true });
  // The source is attached only once the page has finished loading AND the main
  // thread is idle (2026-10-11): the film is megabytes, and fetched at boot it
  // competed with the fonts, the CSS and the hero text that is the LCP element. The
  // poster is the plate until then, exactly as on every path that never attaches.
  afterLoadAndIdle(() => {
    video.muted = true;
    video.src = matchMedia("(min-width: 900px)").matches ? hd : sd;
    video.load();
    play();
    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (video.paused) play();
        } else if (!video.paused) {
          video.pause();
        }
      }
    }).observe(hero);
  });
}

/**
 * Run `fn` after the window `load` event and then the next idle period. Browsers
 * without requestIdleCallback (Safari) wait a flat 1.5 s after load instead. The
 * idle wait is capped at 3 s so a page that never goes idle still gets its film.
 */
function afterLoadAndIdle(fn: () => void): void {
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => fn(), { timeout: 3000 });
    else setTimeout(fn, 1500);
  };
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
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
function reveals(hero: HTMLElement | null, reduce: boolean, inner: Element[] = []): void {
  const targets: Element[] = [...inner];
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
  // A masthead h1 is started by its .nr-go, not by scrolling into view.
  all(".nr-split").forEach((el) => {
    if (!hero?.contains(el) && !el.closest(".nr-mast")) targets.push(el);
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
 * The inner pages (2026-10-11, motion only — boot() skips this under reduced motion
 * and on the home page). Every page opens like a magazine section: the kicker wipes
 * in, the h1's words rise through the home's masks, the lead follows (.nr-go on the
 * h1's parent, the masthead). Then ONE object per page reveals with the home's own
 * .nr-r / .nr-img at the inner-page speed motion.css sets on <main>. Returns the
 * reveal targets for reveals()' observer.
 *
 * Delay = base + column × step. base is 560ms for an element whose top is inside
 * the first viewport at boot (so it follows the masthead), else 0 (it is revealed by
 * scrolling, after the masthead is long done). Grid columns are read from the
 * computed track list, so a phone's one-column grid gets no stagger and a 4-up row
 * gets four. List-like objects use a rolling stagger among the visible items only.
 *
 * Prose pages (ArticlePage without a slotted object: /priser, /om-oss, /integritet,
 * /jobba-pa-novo, /butik) get the masthead and nothing else — the thesis over the
 * per-page table (audit P3, 2026-10-11). `expired` (holdExpired()) is a late boot:
 * no masthead, and what is already on screen is marked revealed with no transition;
 * only below-the-fold objects still reveal on scroll.
 */
function innerPage(expired = false): Element[] {
  const h1 = document.querySelector<HTMLElement>("main h1");
  if (!h1?.parentElement) return [];
  const targets: Element[] = [];
  const marked: HTMLElement[] = [];
  const vh = innerHeight;
  // Marks are collected first and applied in one settle: base() and tracks() read
  // layout, and a read after an earlier mark would start that mark's transition.
  const pending: [HTMLElement, string, number][] = [];
  const mark = (el: Element, cls: string, delay: number) => {
    if (!(el instanceof HTMLElement)) return;
    pending.push([el, cls, delay]);
    marked.push(el);
    targets.push(el);
  };
  const apply = () =>
    pending.forEach(([el, cls, delay]) => {
      el.classList.add(cls);
      el.style.setProperty("--d", `${delay}ms`);
    });
  const base = (el: Element) => (el.getBoundingClientRect().top < vh ? 560 : 0);
  /** Rolling stagger: the nth visible item waits n × step after the masthead. */
  const rolling = (selector: string, step: number) => {
    let k = 0;
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const b = base(el);
      mark(el, "nr-r", b ? b + k++ * step : 0);
    }
  };
  /** Column stagger, columns read from the grid as laid out at boot. */
  const grid = (list: Element, items: string, cls: string, step: number) => {
    const cols = tracks(list);
    Array.from(list.querySelectorAll(items)).forEach((el, i) => mark(el, cls, base(el) + (i % cols) * step));
  };

  // The one object per page. Selectors that miss are no-ops. Measured and marked
  // before the masthead moves anything (base() reads layout).
  document.querySelectorAll(".staff-grid").forEach((list) => grid(list, ":scope > li", "nr-r", 70));
  document.querySelectorAll<HTMLElement>(".year-mark").forEach(splitWords);
  document.querySelectorAll(".shots").forEach((list) => grid(list, ":scope > li", "nr-img", 80));
  document.querySelectorAll(".contact .map").forEach((map) => mark(map, "nr-img", base(map)));
  rolling(".info > address, .info > .dir, .info > .reach, .info > .btn, .info > .cancel", 60);
  document.querySelectorAll(".brand-grid").forEach((list) => grid(list, ":scope > .brand", "nr-r", 70));
  rolling(".course-list > .course, .courses > .empty", 60);
  rolling(".post-list > li, .blog > .empty", 60);
  // A blog cover is clipped only if it already has a height: the <img> carries no
  // size, and a clip on a 0-height box would reveal nothing and then jump.
  const cover = document.querySelector<HTMLImageElement>(".post .cover img");
  if (cover && cover.naturalHeight > 0 && cover.parentElement) mark(cover.parentElement, "nr-img", base(cover));
  const words = Array.from(document.querySelectorAll<HTMLElement>(".year-mark .nr-w > span"));

  if (expired) {
    // Already seen: whatever is on screen stays put, the rest reveals on scroll.
    const seen = [...marked, ...Array.from(document.querySelectorAll<HTMLElement>(".year-mark"))].filter(
      (el) => el.getBoundingClientRect().top < vh,
    );
    settleInto([...marked, ...words], () => {
      apply();
      seen.forEach((el) => el.classList.add("nr-in"));
    });
    return targets;
  }

  // Masthead.
  const mast = h1.parentElement;
  mast.classList.add("nr-mast");
  const kicker = mast.querySelector<HTMLElement>(":scope > .kicker");
  kicker?.classList.add("nr-kick");
  const next = h1.nextElementSibling;
  const lead = next?.matches(".prose")
    ? next.querySelector<HTMLElement>(":scope > p:first-child")
    : next?.matches(".intro")
      ? (next as HTMLElement)
      : null;
  lead?.classList.add("nr-lead");
  // At 360px and below a long single word ("Integritetspolicy") cannot break inside
  // an overflow:hidden mask and would be cut, so the h1 rises whole, like the lead.
  if (matchMedia("(max-width: 360px)").matches) {
    h1.classList.add("nr-lead");
    h1.style.setProperty("--d", "140ms");
    h1.style.setProperty("--nr-ld", "820ms");
  } else {
    splitWords(h1);
  }

  // Set the held states without transitioning INTO them: a reveal that transitions
  // into its hidden state starts fading out and is reversed by its own .nr-in.
  const held = mast.querySelectorAll<HTMLElement>(".nr-kick, .nr-lead, .nr-w > span");
  settleInto([...marked, ...Array.from(held), ...words], apply);

  // Start once the fonts are in or after 900ms, two frames later so the held state
  // paints first — the hero's race in wordmark().
  const go = () =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        mast.classList.add("nr-go");
        h1.classList.add("nr-in");
      }),
    );
  const fonts = document.fonts?.ready ?? Promise.resolve();
  void Promise.race([fonts, new Promise((resolve) => setTimeout(resolve, 900))]).then(go);
  return targets;
}

/** Column count of a grid as laid out (its computed track list), 1 when not a grid. */
function tracks(el: Element): number {
  const list = getComputedStyle(el).gridTemplateColumns;
  if (!list || list === "none") return 1;
  return Math.max(1, list.trim().split(/\s+/).length);
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
