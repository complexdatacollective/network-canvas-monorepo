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

  it('does not treat a comment as a text run', () => {
    // React's streaming markers and any other comment must survive untouched.
    const html = '<!--$--><p>you@example.com</p><!--/$-->';

    expect(protectEmailAddresses(html).html).toBe(
      `<!--$--><p>${EMAIL_OFF_OPEN}you@example.com${EMAIL_OFF_CLOSE}</p><!--/$-->`,
    );
  });
});
