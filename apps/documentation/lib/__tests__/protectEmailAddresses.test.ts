import { describe, expect, it } from 'vitest';

import {
  EMAIL_OFF_CLOSE,
  EMAIL_OFF_OPEN,
  findUnprotectedEmailText,
  protectEmailAddresses,
} from '../protectEmailAddresses.ts';

describe('protectEmailAddresses', () => {
  it('wraps an email-bearing text node in the CDN opt-out', () => {
    const { html, protectedRuns } = protectEmailAddresses(
      '<p>Write to info@networkcanvas.com for help.</p>',
    );

    expect(protectedRuns).toBe(1);
    expect(html).toBe(
      `<p>${EMAIL_OFF_OPEN}Write to info@networkcanvas.com for help.${EMAIL_OFF_CLOSE}</p>`,
    );
  });

  it('wraps the text node whole rather than splitting it around the address', () => {
    const { html } = protectEmailAddresses(
      '<code>ACME_EMAIL=you@example.com\n</code>',
    );

    // The text node has to stay byte-identical: React hydrates it by comparing
    // the node's value, and skips the comments either side of it.
    expect(html).toContain(
      `${EMAIL_OFF_OPEN}ACME_EMAIL=you@example.com\n${EMAIL_OFF_CLOSE}`,
    );
    expect(html).not.toContain(`${EMAIL_OFF_CLOSE}\n`);
  });

  it('protects the whole token the CDN matches, including a leading assignment', () => {
    // Cloudflare rewrote `ACME_EMAIL=you@example.com` entirely, `=` and all.
    expect(
      findUnprotectedEmailText('<pre>ACME_EMAIL=you@example.com</pre>'),
    ).toEqual(['ACME_EMAIL=you@example.com']);
  });

  it('leaves attributes alone, so a mailto link is protected only in its text', () => {
    const { html, protectedRuns } = protectEmailAddresses(
      '<a href="mailto:info@networkcanvas.com">info@networkcanvas.com</a>',
    );

    expect(protectedRuns).toBe(1);
    expect(html).toBe(
      `<a href="mailto:info@networkcanvas.com">${EMAIL_OFF_OPEN}info@networkcanvas.com${EMAIL_OFF_CLOSE}</a>`,
    );
  });

  it('leaves script contents alone', () => {
    // The RSC payload repeats every address; the CDN does not rewrite it, and
    // wrapping it would corrupt the payload.
    const payload =
      '<script>self.__next_f.push([1,"a:[\\"you@example.com\\"]"])</script>';

    expect(protectEmailAddresses(payload).html).toBe(payload);
    expect(findUnprotectedEmailText(payload)).toEqual([]);
  });

  it('leaves style contents alone', () => {
    const styleTag = '<style>.a{content:"you@example.com"}</style>';

    expect(protectEmailAddresses(styleTag).html).toBe(styleTag);
  });

  it('counts every text run it protects', () => {
    const { protectedRuns } = protectEmailAddresses(
      '<p>a@b.com</p><p>no address</p><p>c@d.com</p>',
    );

    expect(protectedRuns).toBe(2);
  });

  it('ignores text that only looks like an address', () => {
    // A Postgres URL has no dotted domain after the `@`, and the CDN leaves it
    // alone; wrapping it would be noise in the output.
    const url =
      '<code>postgres://postgres:CHANGE_ME@postgres:5432/postgres</code>';

    expect(protectEmailAddresses(url).protectedRuns).toBe(0);
    expect(findUnprotectedEmailText(url)).toEqual([]);
  });

  it("ends a textarea's RCDATA at its own closing tag, not a title's", () => {
    // `</title>` is ordinary text inside a `<textarea>`. A single
    // `</(?:title|textarea)>` alternative ended the region there and put the
    // opt-out comment inside the field's value.
    const { html } = protectEmailAddresses(
      '<textarea>literal </title> foo@example.com</textarea>',
    );

    expect(html).toBe(
      `${EMAIL_OFF_OPEN}<textarea>literal </title> foo@example.com</textarea>${EMAIL_OFF_CLOSE}`,
    );
    expect(/<textarea[^>]*>[\s\S]*?<!--email_off-->/.test(html)).toBe(false);
  });

  it('does not read the marker text inside a script as an opt-out region', () => {
    // Splitting the raw string on the markers took these script strings for
    // real comments, left the paragraph unprotected, and reported nothing
    // unprotected either — so the build-time assertion was fooled too.
    const page =
      '<script>const a="<!--email_off-->"</script>' +
      '<p>foo@example.com</p>' +
      '<script>const b="<!--/email_off-->"</script>';

    expect(findUnprotectedEmailText(page)).toEqual(['foo@example.com']);

    const { html, protectedRuns } = protectEmailAddresses(page);

    expect(protectedRuns).toBe(1);
    expect(html).toContain(
      `<p>${EMAIL_OFF_OPEN}foo@example.com${EMAIL_OFF_CLOSE}</p>`,
    );
    expect(findUnprotectedEmailText(html)).toEqual([]);
  });

  it.each(['iframe', 'xmp', 'noembed', 'noframes', 'noscript'])(
    'wraps a <%s> from outside, since the parser reads no markup inside it',
    (name) => {
      // The HTML spec gives these the generic raw text parsing algorithm
      // (`noscript` whenever scripting is enabled), so a comment placed inside
      // one is literal text the reader would see.
      const page = `<${name}>Contact foo@example.com</${name}>`;

      expect(findUnprotectedEmailText(page)).toEqual(['foo@example.com']);

      const { html, protectedRuns } = protectEmailAddresses(page);

      expect(protectedRuns).toBe(1);
      expect(html).toBe(`${EMAIL_OFF_OPEN}${page}${EMAIL_OFF_CLOSE}`);
      expect(findUnprotectedEmailText(html)).toEqual([]);
    },
  );

  it('is idempotent', () => {
    const once = protectEmailAddresses('<p>info@networkcanvas.com</p>').html;
    const twice = protectEmailAddresses(once);

    expect(twice.protectedRuns).toBe(0);
    expect(twice.html).toBe(once);
  });

  it('reports nothing unprotected once protected', () => {
    const page =
      '<p>info@networkcanvas.com</p><pre>ACME_EMAIL=you@example.com</pre><a href="mailto:x@y.com">mail</a>';

    expect(findUnprotectedEmailText(page)).toHaveLength(2);
    expect(findUnprotectedEmailText(protectEmailAddresses(page).html)).toEqual(
      [],
    );
  });

  it('steps over a `>` inside a quoted attribute', () => {
    // A plain `<[^>]*>` ended the tag mid-attribute and began a text run
    // inside it, inserting the opt-out comment into the start tag.
    const { html } = protectEmailAddresses(
      '<div title="1 > 0">foo@example.com</div>',
    );

    expect(html).toBe(
      `<div title="1 > 0">${EMAIL_OFF_OPEN}foo@example.com${EMAIL_OFF_CLOSE}</div>`,
    );
  });

  it('steps over a `>` inside a single-quoted attribute', () => {
    const { html } = protectEmailAddresses("<p data-note='a > b'>x@y.com</p>");

    expect(html).toBe(
      `<p data-note='a > b'>${EMAIL_OFF_OPEN}x@y.com${EMAIL_OFF_CLOSE}</p>`,
    );
  });

  it('reports nothing unprotected for an attribute holding a `>` and an address', () => {
    const page = '<a href="mailto:x@y.com" title="a > b">x@y.com</a>';

    expect(findUnprotectedEmailText(page)).toEqual(['x@y.com']);
    expect(findUnprotectedEmailText(protectEmailAddresses(page).html)).toEqual(
      [],
    );
  });

  it('wraps a <title> from outside, never inside it', () => {
    // `<title>` holds RCDATA: a comment placed inside it is literal text, so
    // the browser tab would show the marker.
    const { html, protectedRuns } = protectEmailAddresses(
      '<title>Mail foo@example.com</title>',
    );

    expect(protectedRuns).toBe(1);
    expect(html).toBe(
      `${EMAIL_OFF_OPEN}<title>Mail foo@example.com</title>${EMAIL_OFF_CLOSE}`,
    );
    expect(findUnprotectedEmailText(html)).toEqual([]);
  });

  it('wraps a <textarea> from outside too', () => {
    const { html } = protectEmailAddresses('<textarea>a@b.com</textarea>');

    expect(html).toBe(
      `${EMAIL_OFF_OPEN}<textarea>a@b.com</textarea>${EMAIL_OFF_CLOSE}`,
    );
  });

  it('reports an address inside a <title> as unprotected before the pass', () => {
    expect(
      findUnprotectedEmailText('<title>Mail foo@example.com</title>'),
    ).toEqual(['foo@example.com']);
  });

  it('leaves an RCDATA element with no address alone', () => {
    const svg = '<svg><title>Info</title></svg>';

    expect(protectEmailAddresses(svg).protectedRuns).toBe(0);
    expect(protectEmailAddresses(svg).html).toBe(svg);
  });

  it('does not treat a comment as a text run', () => {
    // React's streaming markers and any other comment must survive untouched.
    const html = '<!--$--><p>you@example.com</p><!--/$-->';

    expect(protectEmailAddresses(html).html).toBe(
      `<!--$--><p>${EMAIL_OFF_OPEN}you@example.com${EMAIL_OFF_CLOSE}</p><!--/$-->`,
    );
  });

  // `<plaintext>` is the one raw-text element with no closing tag: everything
  // after the start tag is text inside it, so there is no position for the
  // closing opt-out comment. Wrapping it from outside — the fix for every other
  // raw-text element — leaves `<!--/email_off-->` as visible page text, which
  // Chromium confirms. Both entry points therefore refuse the document, because
  // a checker that calls such a page clean is the failure mode that matters.
  it('refuses a document containing <plaintext> rather than protecting it', () => {
    const html = '<plaintext>Contact foo@example.com';

    expect(() => protectEmailAddresses(html)).toThrow(/<plaintext>/);
  });

  it('refuses to report on a <plaintext> document instead of calling it clean', () => {
    const html = '<plaintext>Contact foo@example.com';

    expect(() => findUnprotectedEmailText(html)).toThrow(/<plaintext>/);
  });

  it('refuses even when a closing tag makes the element look terminated', () => {
    // `</plaintext>` is ordinary text, so this is the same unprotectable page.
    expect(() =>
      protectEmailAddresses('<plaintext>Contact foo@example.com</plaintext>'),
    ).toThrow(/<plaintext>/);
  });

  it('refuses a <plaintext> page carrying no address at all', () => {
    // The refusal is unconditional: the element makes the page unhydratable on
    // its own, whether or not the CDN rewrite would have been the trigger.
    expect(() => protectEmailAddresses('<p>hi</p><plaintext>nothing')).toThrow(
      /<plaintext>/,
    );
  });

  // A CDATA section is character data in foreign content, not the bogus comment
  // it would be in ordinary HTML, so it is wrapped from outside like raw text.
  // The generic tag arm used to end at the `>` inside it and read the remainder
  // as text, putting the opening marker into the section.
  it('wraps an svg CDATA section from outside', () => {
    const html = '<svg><text><![CDATA[1 > foo@example.com]]></text></svg>';

    expect(findUnprotectedEmailText(html)).toEqual(['foo@example.com']);
    expect(protectEmailAddresses(html).html).toBe(
      `<svg><text>${EMAIL_OFF_OPEN}<![CDATA[1 > foo@example.com]]>${EMAIL_OFF_CLOSE}</text></svg>`,
    );
  });

  it('leaves a CDATA section with no address alone', () => {
    const html = '<svg><text><![CDATA[1 > 0]]></text></svg>';

    expect(protectEmailAddresses(html).protectedRuns).toBe(0);
    expect(protectEmailAddresses(html).html).toBe(html);
  });

  // The parser drops a newline directly after `<pre>`/`<listing>`, and React
  // emits a second one to survive that. The opening marker has to go after it,
  // or the parser drops nothing and the element keeps a newline React did not
  // render.
  it('places the marker after the newline a pre start tag makes significant', () => {
    expect(protectEmailAddresses('<pre>\n\nfoo@example.com</pre>').html).toBe(
      `<pre>\n${EMAIL_OFF_OPEN}\nfoo@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
    expect(
      protectEmailAddresses('<listing>\n\nfoo@example.com</listing>').html,
    ).toBe(
      `<listing>\n${EMAIL_OFF_OPEN}\nfoo@example.com${EMAIL_OFF_CLOSE}</listing>`,
    );
  });

  it('only moves the marker for the run the start tag makes significant', () => {
    // No leading newline, a newline that is not the first node, a newline
    // inside a child element, and an element with no such parser rule: all
    // wrap normally. Moving the marker in these cases would be its own bug.
    expect(protectEmailAddresses('<pre>foo@example.com</pre>').html).toBe(
      `<pre>${EMAIL_OFF_OPEN}foo@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
    expect(
      protectEmailAddresses('<pre><!--x-->\nfoo@example.com</pre>').html,
    ).toBe(
      `<pre><!--x-->${EMAIL_OFF_OPEN}\nfoo@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
    expect(
      protectEmailAddresses('<pre><code>\nfoo@example.com</code></pre>').html,
    ).toBe(
      `<pre><code>${EMAIL_OFF_OPEN}\nfoo@example.com${EMAIL_OFF_CLOSE}</code></pre>`,
    );
    expect(protectEmailAddresses('<p>\nfoo@example.com</p>').html).toBe(
      `<p>${EMAIL_OFF_OPEN}\nfoo@example.com${EMAIL_OFF_CLOSE}</p>`,
    );
  });

  // HTML's whitespace is narrower than JavaScript's `\s`: the tokenizer does not
  // accept NBSP between a tag name and its `>`, so `</script\u00a0>` is ordinary
  // script text. Chromium keeps the whole string inside the script.
  it('does not end a raw-text element at a non-HTML-whitespace closing tag', () => {
    const html =
      '<script>const fake="</script\u00a0>"; const mail="foo@example.com";</script>';

    expect(protectEmailAddresses(html).protectedRuns).toBe(0);
    expect(protectEmailAddresses(html).html).toBe(html);
    expect(findUnprotectedEmailText(html)).toEqual([]);
  });

  // `-` is not a word character, so a `\b` boundary let a custom element match
  // the pattern for the special name it starts with. Both directions were bugs:
  // an address hidden from the pass, and a build failed on valid markup.
  it('does not mistake a custom element for the special name it starts with', () => {
    const widget =
      '<script-widget>foo@example.com<script></script></script-widget>';

    expect(findUnprotectedEmailText(widget)).toEqual(['foo@example.com']);
    expect(protectEmailAddresses(widget).html).toBe(
      `<script-widget>${EMAIL_OFF_OPEN}foo@example.com${EMAIL_OFF_CLOSE}<script></script></script-widget>`,
    );
  });

  it('does not refuse a custom element whose name starts with plaintext', () => {
    const html =
      '<plaintext-viewer>hi</plaintext-viewer><p>foo@example.com</p>';

    expect(protectEmailAddresses(html).html).toBe(
      `<plaintext-viewer>hi</plaintext-viewer><p>${EMAIL_OFF_OPEN}foo@example.com${EMAIL_OFF_CLOSE}</p>`,
    );
  });

  // Input preprocessing normalises CRLF and a lone CR to one LF before the
  // initial-newline rule applies, so the significant newline may be spelled
  // either way in the served bytes.
  it('places the marker after a CRLF or a bare CR a pre start tag makes significant', () => {
    expect(
      protectEmailAddresses('<pre>\r\n\r\nfoo@example.com</pre>').html,
    ).toBe(
      `<pre>\r\n${EMAIL_OFF_OPEN}\r\nfoo@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
    expect(protectEmailAddresses('<pre>\r\rfoo@example.com</pre>').html).toBe(
      `<pre>\r${EMAIL_OFF_OPEN}\rfoo@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
    expect(
      protectEmailAddresses('<listing>\r\n\r\nfoo@example.com</listing>').html,
    ).toBe(
      `<listing>\r\n${EMAIL_OFF_OPEN}\r\nfoo@example.com${EMAIL_OFF_CLOSE}</listing>`,
    );
  });

  it('does not refuse marker text inside a script or a raw-text element', () => {
    // The refusal reads tokens, like everything else here: only a real start
    // tag counts. Deciding this from the raw text would fail the build on a
    // page that merely mentions the element.
    const inScript =
      '<script>const a = "<plaintext>"</script><p>you@example.com</p>';
    const inTitle = '<title>About <plaintext></title><p>you@example.com</p>';

    expect(protectEmailAddresses(inScript).protectedRuns).toBe(1);
    expect(protectEmailAddresses(inTitle).protectedRuns).toBe(1);
  });

  it('does not refuse a closing tag or an attribute that merely reads plaintext', () => {
    // Only a `<plaintext …>` start tag opens the state; a stray `</plaintext>`
    // or a `plaintext`-valued attribute must not fail the build.
    const html = '<pre data-format="plaintext">you@example.com</pre>';

    expect(protectEmailAddresses(html).html).toBe(
      `<pre data-format="plaintext">${EMAIL_OFF_OPEN}you@example.com${EMAIL_OFF_CLOSE}</pre>`,
    );
  });
});

/**
 * The correctness condition of the whole pass, asserted directly: wrapping must
 * not change the document the browser parses. Comment nodes are excluded from
 * `textContent`, so an opt-out that lands where it belongs is invisible here,
 * and one that lands anywhere the parser reads differently is not.
 *
 * This exists because eight rounds of review found the same class of bug —
 * markers inserted where the parser does not treat them as comments — one
 * element at a time. A guard on the property catches the next one without
 * anybody having to think of it first. jsdom is parse5, and was checked to
 * reproduce both subtle rules this covers: it drops the newline after `<pre>`
 * (and keeps both when a comment precedes it), and reads `<![CDATA[` inside
 * `<svg>` as character data.
 */
describe('protectEmailAddresses parse equivalence', () => {
  const parsedText = (html: string) =>
    new DOMParser().parseFromString(
      `<!doctype html><html><body>${html}</body></html>`,
      'text/html',
    ).body.textContent;

  // Each entry is markup as React would serve it.
  const SHAPES: Record<string, string> = {
    'a plain paragraph': '<p>Mail foo@example.com now</p>',
    // React emits the doubled newline so the parser's drop leaves one.
    'pre whose text starts with a newline': '<pre>\n\nfoo@example.com</pre>',
    'listing whose text starts with a newline':
      '<listing>\n\nfoo@example.com</listing>',
    'pre with no leading newline': '<pre>foo@example.com</pre>',
    "pre > code, the export's own shape":
      '<pre><code>\nfoo@example.com</code></pre>',
    'pre whose first node is already a comment':
      '<pre><!--x-->\nfoo@example.com</pre>',
    'textarea whose value starts with a newline':
      '<textarea>\n\nfoo@example.com</textarea>',
    'svg CDATA holding a > before the address':
      '<svg><text><![CDATA[1 > foo@example.com]]></text></svg>',
    'a quoted attribute holding a >':
      '<div title="1 > 0">foo@example.com</div>',
    'an iframe fallback': '<iframe>Contact foo@example.com</iframe>',
    'a script repeating the address':
      '<script>var a = "foo@example.com"</script><p>foo@example.com</p>',
    'pre whose text starts with CRLF': '<pre>\r\n\r\nfoo@example.com</pre>',
    'pre whose text starts with a bare CR': '<pre>\r\rfoo@example.com</pre>',
    'a script closed with a non-HTML-whitespace tag':
      '<script>const fake="</script\u00a0>"; const mail="foo@example.com";</script>',
    'a custom element starting with a special name':
      '<script-widget>foo@example.com<script></script></script-widget>',
    'a custom element starting with plaintext':
      '<plaintext-viewer>hi</plaintext-viewer><p>foo@example.com</p>',
  };

  it.each(Object.entries(SHAPES))(
    'leaves the parsed text unchanged: %s',
    (_label, html) => {
      expect(parsedText(protectEmailAddresses(html).html)).toBe(
        parsedText(html),
      );
    },
  );

  it('would catch a marker the parser does not read as a comment', () => {
    // Guards the guard: the same comparison fails for a deliberately wrong
    // placement, so a passing suite above is not vacuous.
    const broken =
      '<pre><!--email_off-->\n\nfoo@example.com<!--/email_off--></pre>';

    expect(parsedText(broken)).not.toBe(
      parsedText('<pre>\n\nfoo@example.com</pre>'),
    );
  });
});
