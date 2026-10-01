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

/**
 * `<title>` and `<textarea>` hold RCDATA: the parser does not recognise comment
 * syntax inside them, so an opt-out comment placed there becomes literal text
 * in the browser's tab title or the field's value. They are matched whole so
 * the wrap can go around the element instead of inside it.
 */
const RCDATA_ELEMENT =
  /^<(title|textarea)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*<\/\1\s*>$/i;

/**
 * Splits HTML into text runs and everything that is not a text run: comments,
 * tags, RCDATA elements, and the contents of `<script>`/`<style>` (which
 * Cloudflare does not rewrite either — the RSC payload carries the same
 * addresses and is served untouched, which is exactly why the client's render
 * disagrees with the markup).
 *
 * The tag arm steps over quoted attribute values rather than stopping at the
 * first `>`, because `>` is legal inside one. Review of this pass found that a
 * plain `<[^>]*>` turned `<div title="1 > 0">foo@example.com</div>` into a tag
 * ending mid-attribute and a text run beginning inside it, so the opt-out
 * comment was inserted into the start tag and corrupted the markup.
 */
const NON_TEXT =
  /(<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<(?:title|textarea)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/(?:title|textarea)\s*>|<!--[\s\S]*?-->|<[a-zA-Z/!?](?:[^>"']|"[^"]*"|'[^']*')*>)/i;

/** Regions the HTML already opts out of rewriting, so the pass is idempotent. */
const ALREADY_PROTECTED =
  /(<!--\s*email_off\s*-->[\s\S]*?<!--\s*\/email_off\s*-->)/;

const isProtectedRegion = (part: string) =>
  /^<!--\s*email_off\s*-->/.test(part);

const mapUnprotectedRegions = (html: string, map: (region: string) => string) =>
  html
    .split(ALREADY_PROTECTED)
    .map((part) => (isProtectedRegion(part) ? part : map(part)))
    .join('');

const mapTextRuns = (
  region: string,
  map: (text: string) => string,
  mapRcdata: (element: string) => string = (element) => element,
) =>
  region
    .split(NON_TEXT)
    // `split` on a pattern with one capture group alternates text run,
    // separator, text run, …, so the even indices are the text runs.
    .map((part, index) => {
      if (index % 2 === 0) return map(part);
      return RCDATA_ELEMENT.test(part) ? mapRcdata(part) : part;
    })
    .join('');

/** Every text run that the CDN would still rewrite. Empty once protected. */
export const findUnprotectedEmailText = (html: string): string[] => {
  const found: string[] = [];
  const record = (text: string) => {
    const match = EMAIL_SHAPED.exec(text);
    if (match) found.push(match[0]);
    return text;
  };
  mapUnprotectedRegions(html, (region) => mapTextRuns(region, record, record));
  return found;
};

/** Wraps every text run containing an email-shaped string in the CDN opt-out. */
export const protectEmailAddresses = (
  html: string,
): { html: string; protectedRuns: number } => {
  let protectedRuns = 0;
  const wrap = (text: string) => {
    if (!EMAIL_SHAPED.test(text)) return text;
    protectedRuns += 1;
    return `${EMAIL_OFF_OPEN}${text}${EMAIL_OFF_CLOSE}`;
  };
  // An RCDATA element is wrapped as a whole, from outside: the opt-out is a
  // region marker, so it protects the element's text without the comment ever
  // being parsed as that element's content.
  const output = mapUnprotectedRegions(html, (region) =>
    mapTextRuns(region, wrap, wrap),
  );
  return { html: output, protectedRuns };
};
