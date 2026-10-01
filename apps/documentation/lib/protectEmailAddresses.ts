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
 * Everything that is not a text run, in one alternation.
 *
 * - `<script>`/`<style>` hold raw text that Cloudflare does not rewrite either
 *   — the RSC payload carries the same addresses and is served untouched, which
 *   is exactly why the client's render disagrees with the markup.
 * - `<title>` and `<textarea>` hold RCDATA, where the parser does not recognise
 *   comment syntax, so an opt-out comment placed inside one becomes literal
 *   text in the browser's tab title or the field's value. Each is matched with
 *   its own closing tag, never the other's: `</title>` inside a `<textarea>` is
 *   ordinary text and must not end the region.
 * - A tag steps over quoted attribute values rather than stopping at the first
 *   `>`, because `>` is legal inside one — `<div title="1 > 0">` otherwise
 *   tokenized as a tag ending mid-attribute.
 */
const TOKEN =
  /<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<title\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/title\s*>|<textarea\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/textarea\s*>|<!--[\s\S]*?-->|<[a-zA-Z/!?](?:[^>"']|"[^"]*"|'[^']*')*>/gi;

type Token =
  /** A text run: what the CDN rewrites, and what the opt-out has to cover. */
  | { kind: 'text'; value: string }
  /** A comment, which may be one of the opt-out markers. */
  | { kind: 'comment'; value: string }
  /** A `<title>`/`<textarea>` element, whole, wrapped from outside if needed. */
  | { kind: 'rcdata'; value: string }
  /** A tag, or `<script>`/`<style>` with its contents: never touched. */
  | { kind: 'other'; value: string };

const classify = (value: string): Token => {
  if (value.startsWith('<!--')) return { kind: 'comment', value };
  if (/^<(?:title|textarea)\b/i.test(value)) return { kind: 'rcdata', value };
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
const mapRewritableRuns = (html: string, map: (run: string) => string) => {
  let output = '';
  let protectedRegion = false;

  for (const token of tokenize(html)) {
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
    output += map(token.value);
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
  const output = mapRewritableRuns(html, (run) => {
    if (!EMAIL_SHAPED.test(run)) return run;
    protectedRuns += 1;
    return `${EMAIL_OFF_OPEN}${run}${EMAIL_OFF_CLOSE}`;
  });
  return { html: output, protectedRuns };
};
