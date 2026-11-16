/**
 * Checks over a whole page shown in Arabic, for the Playwright suites
 * (through `page.evaluate`). The Storybook suites check that each component
 * mirrors (`direction-audit`); these check what only a running app shows: the
 * page as composed, in the translation it actually ships with.
 *
 * `auditArabicPage` is self-contained, with its helpers declared inside it:
 * Playwright sends it to the page as source text, so nothing it uses may come
 * from this module's scope.
 */

export type ArabicPageAuditOptions = Readonly<{
  /**
   * The element shown in Arabic; the document's root when absent. An
   * interview mounted in a host page names its own region.
   */
  root?: string;
  /**
   * Latin words the interface shows as they are in every language: product
   * names, file formats. Matched against each run of Latin letters.
   */
  untranslated?: readonly string[];
  /**
   * Elements whose contents are not the interface's text, with everything
   * inside them.
   */
  exclude?: readonly string[];
}>;

/**
 * What is wrong with a page shown in Arabic, one line per fault:
 *
 * - the region is not marked Arabic and laid out right to left;
 * - a box runs past the left or right edge of the window and nothing clips it
 *   (in a right-to-left page, past the right edge cannot be scrolled to);
 * - Arabic text sits under a `lang` that is not Arabic, so it does not get
 *   the Arabic typeface (`arabic-text.css` applies it by `:lang(ar)`) and a
 *   screen reader reads it in the wrong voice;
 * - Latin text in the Arabic interface that is not set apart. A run of Latin
 *   letters that is not a listed name, outside anything marked as another
 *   language, as code, or as reading in its own direction (`dir="auto"` or
 *   `"ltr"`, `<bdi>`, an inline box with `unicode-bidi: isolate`, a block
 *   with `plaintext`, isolate marks in the text itself, quotation marks) is
 *   either interface text left in English or a name someone wrote shown
 *   without its own direction, where "team-b!" reads "!team-b". Text only a
 *   screen reader reads counts (a visually hidden label, `aria-label`,
 *   `title`, `alt`, `placeholder`, an icon's `<title>`); an attribute that
 *   repeats a name the page shows in its own direction is that name.
 */
export function auditArabicPage(
  options: ArabicPageAuditOptions = {},
): string[] {
  const issues: string[] = [];
  const region = options.root
    ? document.querySelector(options.root)
    : document.documentElement;
  if (!region) return [`no element for ${options.root}`];
  const regionLanguage =
    region.closest('[lang]')?.getAttribute('lang')?.toLowerCase() ?? '';
  if (!regionLanguage.startsWith('ar')) {
    issues.push(`the page's language is "${regionLanguage}", not Arabic`);
  }
  if (getComputedStyle(region).direction !== 'rtl') {
    issues.push('the page is not laid out right to left');
  }
  const body = region === document.documentElement ? document.body : region;

  const excluded = [
    'script',
    'style',
    'noscript',
    'template',
    ...(options.exclude ?? []),
  ].join(', ');
  const allowed = new Set(
    (options.untranslated ?? []).flatMap((entry) =>
      entry.toLowerCase().split(/[^a-z]+/),
    ),
  );

  const describe = (element: Element) => {
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 3).join('.');
    const text = (element.textContent ?? '').trim().slice(0, 40);
    return `<${element.tagName.toLowerCase()}${id}${classes ? `.${classes}` : ''}> “${text}”`;
  };

  // Read by someone: drawn, or left for a screen reader (a visually hidden
  // label is a 1px box, but it is read). Not when it or any ancestor is
  // hidden: `display: none` anywhere above it, `visibility: hidden`, or
  // `content-visibility: hidden` (the inside of a closed `<details>`), which
  // `checkVisibility` answers for the whole chain, or kept from assistive
  // technology by an attribute.
  const isRead = (element: Element) => {
    if (element.closest('[aria-hidden="true"], [hidden], [inert]')) {
      return false;
    }
    return element.checkVisibility({ visibilityProperty: true });
  };
  const isDrawn = (element: Element) => {
    if (!isRead(element)) return false;
    if (element.closest('svg')) return false;
    if (Number(getComputedStyle(element).opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  };

  // Boxes outside the window. The part of a box that shows is what is left
  // after every ancestor that clips its overflow; a fixed box escapes the
  // ancestors that are not its containing block, so it is measured alone.
  const width = window.innerWidth;
  const shownSpan = (element: Element): [number, number] | null => {
    const rect = element.getBoundingClientRect();
    let left = rect.left;
    let right = rect.right;
    if (getComputedStyle(element).position === 'fixed') return [left, right];
    for (
      let ancestor = element.parentElement;
      ancestor && ancestor !== document.body;
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      if (style.overflowX !== 'visible' || style.contain.includes('paint')) {
        const box = ancestor.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
        if (right <= left) return null;
      }
      if (style.position === 'fixed') break;
    }
    return [left, right];
  };
  const outside: Element[] = [];
  for (const element of body.querySelectorAll('*')) {
    if (element.closest(excluded) || !isDrawn(element)) continue;
    const span = shownSpan(element);
    if (!span) continue;
    const [left, right] = span;
    if (left < -1 || right > width + 1) {
      // Report the outermost: its contents are outside with it.
      if (outside.some((parent) => parent.contains(element))) continue;
      outside.push(element);
      issues.push(
        `${describe(element)} runs from ${Math.round(left)}px to ${Math.round(right)}px in a ${width}px window`,
      );
    }
  }

  const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
  const LATIN_WORD = /[A-Za-z]{2,}/g;
  const ARABIC_SCRIPT_LANGUAGES = /^(ar|fa|ur|ps|ckb|sd|ug)\b/i;
  // A language tag with a script (`zh-Hans`), a region (`en-US`, `es-419`)
  // or both; a lowercase hyphenated token (`ord-color-seq-6`) is not one.
  const LANGUAGE_TAG =
    /\b[a-z]{2,3}-(?:[A-Z][a-z]{3}(?:-(?:[A-Z]{2}|\d{3}))?|[A-Z]{2}|\d{3})\b/g;
  const inArabic = (element: Element) =>
    ARABIC_SCRIPT_LANGUAGES.test(
      element.closest('[lang]')?.getAttribute('lang') ?? '',
    );

  // Text someone typed or wrote, laid out in its own direction: in a typed
  // box or code, under a `dir` of its own, in an inline box that isolates it
  // (`<bdi>`, `unicode-bidi: isolate`), or in a block whose lines each take
  // their own direction (`plaintext`). An isolating block does not count: a
  // block's own text still takes the paragraph's direction, and browsers
  // isolate most blocks by default.
  const readsOnItsOwn = (element: Element) => {
    let inline = true;
    for (
      let current: Element | null = element;
      current && current !== document.documentElement;
      current = current.parentElement
    ) {
      const tag = current.tagName.toLowerCase();
      if (['code', 'kbd', 'samp', 'pre', 'textarea', 'input'].includes(tag)) {
        return true;
      }
      const dir = current.getAttribute('dir');
      if (dir === 'auto' || dir === 'ltr') return true;
      const style = getComputedStyle(current);
      if (style.unicodeBidi === 'plaintext') return true;
      if (!style.display.startsWith('inline') && style.display !== 'contents') {
        inline = false;
      }
      if (
        inline &&
        (style.unicodeBidi === 'isolate' ||
          style.unicodeBidi === 'isolate-override')
      ) {
        return true;
      }
    }
    return false;
  };

  // The Latin words in a text that nothing sets apart: a value isolated
  // where it was interpolated (FSI … PDI) reads in its own direction, a word
  // in quotation marks («name») is mentioned rather than used and its marks
  // keep it in place, and a language tag (`en-US`) is a code.
  const looseLatin = (text: string) =>
    (
      text
        .replace(/[⁦-⁨][^⁩]*⁩?/g, ' ')
        .replace(/«[^»]*»|“[^”]*”/g, ' ')
        .replace(LANGUAGE_TAG, ' ')
        .match(LATIN_WORD) ?? []
    ).filter((word) => !allowed.has(word.toLowerCase()));

  // Text: Arabic marked as another language, and Latin left loose in the
  // Arabic interface.
  const names = new Set<string>();
  const unseen: [Element, string][] = [];
  const reported = new Set<Element>();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    const parent = node.parentElement;
    if (!parent || !text.trim()) continue;
    if (parent.closest(excluded) || !isRead(parent)) continue;
    // An icon's title is read through its `<svg>`, checked below.
    if (parent.closest('svg')) continue;
    const arabicRegion = inArabic(parent);
    if (
      ARABIC_LETTER.test(text) &&
      !arabicRegion &&
      isDrawn(parent) &&
      !reported.has(parent)
    ) {
      reported.add(parent);
      issues.push(
        `${describe(parent)} is Arabic under lang="${parent.closest('[lang]')?.getAttribute('lang') ?? ''}", so it misses the Arabic typeface`,
      );
    }
    if (!arabicRegion) continue;
    if (readsOnItsOwn(parent)) {
      names.add(text.trim());
      continue;
    }
    // Text nobody sees laid out (a visually hidden heading, an option of a
    // closed native select) has no direction to get wrong: it is read like an
    // attribute, below.
    if (!isDrawn(parent)) {
      unseen.push([parent, text]);
      continue;
    }
    const english = looseLatin(text);
    if (english.length > 0 && !reported.has(parent)) {
      reported.add(parent);
      issues.push(
        `${describe(parent)} shows Latin text that is neither translated nor set apart in its own direction: ${english.slice(0, 5).join(' ')}`,
      );
    }
  }
  // Typed boxes hold their values as properties, not text.
  for (const box of body.querySelectorAll('input, textarea')) {
    const value = (box as HTMLInputElement).value.trim();
    if (value) names.add(value);
  }

  // What a screen reader reads that the page does not draw. An attribute
  // cannot mark a direction, so a name someone wrote there is fine as long
  // as it is a name the page shows in its own direction.
  const ATTRIBUTES = ['aria-label', 'title', 'alt', 'placeholder'];
  const isName = (value: string) => {
    const bare = value.replace(/[⁦-⁩]/g, '').trim();
    return names.has(bare);
  };
  const read = (element: Element, label: string, value: string) => {
    if (!value.trim() || isName(value)) return;
    const english = looseLatin(value);
    if (english.length > 0) {
      issues.push(
        `${describe(element)} has ${label} “${value.slice(0, 60)}”, Latin text that is neither translated nor a name the page shows: ${english.slice(0, 5).join(' ')}`,
      );
    }
  };
  for (const [element, text] of unseen) read(element, 'hidden text', text);
  for (const element of body.querySelectorAll('*')) {
    if (element.closest(excluded) || !isRead(element)) continue;
    if (!inArabic(element)) continue;
    for (const attribute of ATTRIBUTES) {
      const value = element.getAttribute(attribute);
      if (value !== null) read(element, attribute, value);
    }
    if (element.tagName.toLowerCase() === 'svg') {
      const title = element.querySelector(':scope > title')?.textContent;
      if (title) read(element, 'an icon title', title);
    }
  }
  return issues;
}
