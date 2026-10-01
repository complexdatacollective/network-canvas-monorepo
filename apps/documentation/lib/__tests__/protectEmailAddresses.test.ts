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
