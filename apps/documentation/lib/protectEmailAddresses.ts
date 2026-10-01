/**
 * Opts the exported documentation HTML out of the CDN's Email Address
 * Obfuscation, which otherwise breaks React hydration.
 *
 * The documentation is a static export served through Cloudflare. With Email
 * Address Obfuscation enabled, Cloudflare rewrites every email-shaped run of
 * text in the HTML it serves into
 *
 *   <a href="/cdn-cgi/l/email-protection" class="__cf_email__"
 *      data-cfemail="…">[email&#160;protected]</a>
 *
 * The browser therefore parses a DOM that React did not produce: on
 * `/en/collect-data/fresco/advanced` the `ACME_EMAIL=you@example.com` line of
 * the Docker environment example became an anchor, React found a text node it
 * had not rendered, and threw a hydration error (React #418, `args[]=text`)
 * that discarded the whole tree — the page kept its server markup and no
 * client behaviour worked. Pages carrying `info@networkcanvas.com` in prose and
 * the Neon connection strings in the Fresco guide take the same rewrite.
 *
 * Cloudflare honours an opt-out: text between `<!--email_off-->` and
 * `<!--/email_off-->` is left alone. Doing it here, over the built HTML, covers
 * prose, code blocks and generated pages (404 included) in one place, so no
 * author has to remember which addresses are safe to write. It costs nothing in
 * scraper protection for the addresses we do publish: a `mailto:` href is an
 * attribute, which Cloudflare never obfuscates, so those addresses were always
 * served in the clear.
 *
 * Wrapping is per text node, around the node in its entirety, which keeps the
 * node itself byte-identical. React skips comment nodes that are not its own
 * streaming markers while hydrating (`getNextHydratable`), so the added
 * comments are invisible to hydration; splitting a text node in two around the
 * address would not be.
 *
 * Everything here runs off ONE tokenizer pass, which is what makes it
 * trustworthy. Review of #2030 found two bugs that both came from deciding
 * something about the HTML without tokenizing it first: a protected-region
 * split over the raw string mistook the marker text inside a `<script>` string
 * for real comments and silently left a page's address exposed, and a single
 * `</(?:title|textarea)>` alternative let `</title>` — which is ordinary text
 * inside a `<textarea>` — end a textarea's RCDATA region early, putting an
 * opt-out comment inside the field's value. Both disappear when regions and
 * elements are read from tokens rather than from the text.
 */

/**
 * Cloudflare's match is wider than a strict address: on the Advanced Deployment
 * page it rewrote `ACME_EMAIL=you@example.com` whole, `=` and all. This mirrors
 * that by allowing the RFC 5322 atext characters in the local part. Erring
 * wider than Cloudflare only protects more text than strictly necessary; erring
 * narrower would leave a rewrite in place.
 */
const EMAIL_SHAPED =
  /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

export const EMAIL_OFF_OPEN = '<!--email_off-->';
export const EMAIL_OFF_CLOSE = '<!--/email_off-->';

/** A `<!--email_off-->` or `<!--/email_off-->` comment, once tokenized. */
const EMAIL_OFF_MARKER = /^<!--\s*(\/?)email_off\s*-->$/;

/**
 * Elements the HTML parser does not read markup inside, so a comment placed
 * within one is literal text rather than a comment node. Putting an opt-out
 * marker inside any of them would show the marker to the reader — in the
 * browser's tab title, a form field's value, or an iframe's fallback text — and
 * leave the DOM disagreeing with what React rendered. Each is therefore matched
 * whole and wrapped from outside.
 *
 * `title` and `textarea` hold escapable raw text (RCDATA); the rest take the
 * HTML spec's generic raw text element parsing algorithm, `noscript` whenever
 * scripting is enabled, which it is in every browser that runs this site.
 * `script` and `style` are raw text too but are handled apart: the CDN does not
 * rewrite them, so their contents want no protection at all.
 */
const OPAQUE_TEXT_ELEMENTS = [
  'title',
  'textarea',
  'iframe',
  'xmp',
  'noembed',
  'noframes',
  'noscript',
];

/**
 * HTML's ASCII whitespace, which is narrower than JavaScript's `\s`. The
 * tokenizer accepts only these between a tag name and its `>`; `\s` also
 * accepts NBSP, the Unicode line separators and friends, so it ended a
 * `<script>` at a `</script\u00a0>` that the browser reads as ordinary script
 * text — putting opt-out comments into executable code while the verifier
 * reported the page clean.
 */
const HTML_SPACE = '[\\t\\n\\f\\r ]';

/**
 * What may follow a tag name: HTML whitespace, `/` or `>`. A `\b` boundary is
 * wrong here, because `-` is a non-word character — so `<script-widget>` and
 * `<plaintext-viewer>`, both valid custom elements, matched the patterns for
 * `script` and `plaintext`. The first hid an address from the pass and the
 * verifier alike; the second failed the build outright.
 */
const TAG_NAME_END = `(?=${HTML_SPACE}|/|>)`;

/** Attribute soup that steps over a quoted `>`, which is legal inside one. */
const ATTRIBUTES = `(?:[^>"']|"[^"]*"|'[^']*')*`;

/** One element, matched whole, with its own closing tag and never another's. */
const element = (name: string) =>
  `<${name}${TAG_NAME_END}${ATTRIBUTES}>[\\s\\S]*?<\\/${name}${HTML_SPACE}*>`;

/**
 * A CDATA section, which is real character data inside foreign content — an
 * `<svg>` or `<math>` subtree — rather than the bogus comment it would be in
 * ordinary HTML. Its text is literal, so a marker placed within one shows up to
 * the reader as SVG text; it is matched whole and wrapped from outside like the
 * raw-text elements.
 *
 * It must precede the generic tag alternative, which otherwise ends the "tag"
 * at the first `>` inside the section — legal there — and reads the remainder
 * as ordinary text. Chromium confirms both halves: markers inserted inside
 * appear in `textContent` with no comment nodes created, while wrapping from
 * outside leaves the text identical to the untouched baseline.
 */
const CDATA_SECTION = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';

/**
 * Everything that is not a text run, in one alternation: the opaque elements
 * above, `<script>`/`<style>` with their contents, comments, and tags.
 *
 * Every element is name-anchored to its own closing tag. A shared
 * `</(?:title|textarea)>` alternative let either close either, and `</title>`
 * is ordinary text inside a `<textarea>` — so a textarea's region ended early
 * and the opt-out comment went into the field's value.
 */
const TOKEN = new RegExp(
  [
    element('script'),
    element('style'),
    ...OPAQUE_TEXT_ELEMENTS.map(element),
    '<!--[\\s\\S]*?-->',
    CDATA_SECTION,
    `<[a-zA-Z/!?]${ATTRIBUTES}>`,
  ].join('|'),
  'gi',
);

const OPAQUE_OPENING = new RegExp(
  `^<(?:${OPAQUE_TEXT_ELEMENTS.join('|')})${TAG_NAME_END}`,
  'i',
);

/**
 * `<plaintext>` is the one raw-text element that cannot be protected at all, so
 * the pass refuses a document containing it rather than producing output that
 * only looks protected.
 *
 * Its tokenizer state has no exit: `</plaintext>` is ordinary text, and every
 * byte after the start tag — the rest of the body, `</html>` included — is text
 * inside it. Confirmed in Chromium, which parses
 * `<plaintext>x</plaintext><p>TAIL</p>` with no `<p>` element at all. So there
 * is no "outside" to wrap from: an opt-out comment placed after the element
 * renders as visible text exactly like one placed inside it, and the usual fix
 * for the seven elements above does not apply.
 *
 * Refusing is not a false failure. A page carrying this element cannot hydrate
 * whatever this pass does, because React builds its tree through the DOM API
 * and can never produce the all-text parse the browser gives this markup — so
 * failing the build is the right outcome on its own terms, and a louder one
 * than the hydration error it would otherwise ship.
 */
const PLAINTEXT_OPENING = new RegExp(`^<plaintext${TAG_NAME_END}`, 'i');

/**
 * A newline directly after a `<pre>` or `<listing>` start tag is swallowed by
 * the HTML parser, and React compensates by emitting an extra one so the drop
 * leaves the value it rendered: `<pre>{'\nx'}</pre>` is served as
 * `<pre>\n\nx</pre>` and parses back to `\nx`.
 *
 * An opt-out comment placed before that run would become the first node after
 * the start tag, so the parser drops nothing and the element keeps both
 * newlines — a text mismatch of exactly the kind this pass exists to prevent.
 * Chromium: markers inside give `"\n\nfoo@example.com"` where React's tree
 * expects `"\nfoo@example.com"`.
 *
 * So the opening marker goes after that first newline instead. The element is
 * not wrapped from outside, because `<pre>` is ordinary markup rather than a
 * raw-text element — its children are real elements, and treating it as opaque
 * would stop the walk descending into the highlighted spans where the export's
 * addresses actually live. `<textarea>` shares the newline rule but is already
 * wrapped from outside as raw text, which preserves it.
 */
const PREFORMATTED_OPENING = new RegExp(
  `^<(?:pre|listing)${TAG_NAME_END}`,
  'i',
);

/**
 * The line ending that start tag makes significant. HTML input preprocessing
 * turns a CRLF pair and a lone CR into a single LF *before* tokenizing, so the
 * newline the parser drops may be spelled `\r\n` or `\r` in the served bytes;
 * matching only `\n` left the marker in front of those two, which is the same
 * mismatch in a different spelling.
 */
const LEADING_NEWLINE = /^(?:\r\n|[\r\n])/;

type Token =
  /** A text run: what the CDN rewrites, and what the opt-out has to cover. */
  | { kind: 'text'; value: string }
  /** A comment, which may be one of the opt-out markers. */
  | { kind: 'comment'; value: string }
  /** An opaque element, whole, wrapped from outside if it holds an address. */
  | { kind: 'opaque'; value: string }
  /** A tag, or `<script>`/`<style>` with its contents: never touched. */
  | { kind: 'other'; value: string };

const classify = (value: string): Token => {
  if (value.startsWith('<!--')) return { kind: 'comment', value };
  if (value.startsWith('<![CDATA[')) return { kind: 'opaque', value };
  if (OPAQUE_OPENING.test(value)) return { kind: 'opaque', value };
  return { kind: 'other', value };
};

const tokenize = (html: string): Token[] => {
  const tokens: Token[] = [];
  let index = 0;
  TOKEN.lastIndex = 0;
  for (let match = TOKEN.exec(html); match !== null; match = TOKEN.exec(html)) {
    if (match.index > index) {
      tokens.push({ kind: 'text', value: html.slice(index, match.index) });
    }
    tokens.push(classify(match[0]));
    index = match.index + match[0].length;
  }
  if (index < html.length)
    tokens.push({ kind: 'text', value: html.slice(index) });
  return tokens;
};

/**
 * Walks the tokens, handing `map` each run of text the CDN would rewrite —
 * text nodes, and RCDATA elements whole — and skipping anything already inside
 * an opt-out region, which keeps the pass idempotent. A region is opened and
 * closed by real comment tokens, so the marker text inside a script or a string
 * cannot be mistaken for one.
 */
const mapRewritableRuns = (
  html: string,
  map: (run: string, afterPreformattedStart: boolean) => string,
) => {
  let output = '';
  let protectedRegion = false;
  let afterPreformattedStart = false;

  for (const token of tokenize(html)) {
    // Carry the previous token's verdict for this run, and compute the next
    // one from the current token. Any intervening token — a comment included —
    // already occupies the position the newline would have been dropped from,
    // so only a run directly after the start tag is affected.
    const runFollowsPreformattedStart = afterPreformattedStart;
    afterPreformattedStart =
      token.kind === 'other' && PREFORMATTED_OPENING.test(token.value);

    if (token.kind === 'other' && PLAINTEXT_OPENING.test(token.value)) {
      throw new Error(
        'cannot be protected: <plaintext> swallows the rest of the document as ' +
          'text, so no opt-out comment can be placed outside it. This page ' +
          'cannot hydrate either way — remove the element.',
      );
    }
    if (token.kind === 'comment') {
      const marker = EMAIL_OFF_MARKER.exec(token.value);
      if (marker) protectedRegion = marker[1] !== '/';
      output += token.value;
      continue;
    }
    if (protectedRegion || token.kind === 'other') {
      output += token.value;
      continue;
    }
    output += map(token.value, runFollowsPreformattedStart);
  }
  return output;
};

/** Every run the CDN would still rewrite. Empty once protected. */
export const findUnprotectedEmailText = (html: string): string[] => {
  const found: string[] = [];
  mapRewritableRuns(html, (run) => {
    const match = EMAIL_SHAPED.exec(run);
    if (match) found.push(match[0]);
    return run;
  });
  return found;
};

/**
 * Wraps every run containing an email-shaped string in the CDN opt-out. An
 * RCDATA element is wrapped as a whole, from outside: the opt-out is a region
 * marker, so it protects the element's text without the comment ever being
 * parsed as that element's content.
 */
export const protectEmailAddresses = (
  html: string,
): { html: string; protectedRuns: number } => {
  let protectedRuns = 0;
  const output = mapRewritableRuns(html, (run, afterPreformattedStart) => {
    if (!EMAIL_SHAPED.test(run)) return run;
    protectedRuns += 1;
    const newline = afterPreformattedStart ? LEADING_NEWLINE.exec(run) : null;
    if (newline) {
      return `${newline[0]}${EMAIL_OFF_OPEN}${run.slice(newline[0].length)}${EMAIL_OFF_CLOSE}`;
    }
    return `${EMAIL_OFF_OPEN}${run}${EMAIL_OFF_CLOSE}`;
  });
  return { html: output, protectedRuns };
};
