import { readFileSync } from 'node:fs';

import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NativeLink } from '../NativeLink';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';

/**
 * The components here must stay renderable from a Server Component.
 *
 * Each builds its element through Base UI's `useRender`, which runs no React
 * hook of its own — it merges props and picks an element type — so none of
 * them needs the client boundary that `clientBoundary.test.ts` demands of
 * every module that does run a hook. That test only catches the opposite
 * mistake; this one pins the direction it cannot see, so an unnecessary
 * `'use client'` cannot quietly cost a server-rendered primitive.
 *
 * Every component listed here is asserted twice: its source carries no
 * directive, and it renders through `renderToStaticMarkup` — including its
 * `render` override, which is the path most likely to reach for the client.
 */

/**
 * `'use client'` is a directive only as the module's first statement, so this
 * anchors to the start of the file and steps over any leading comments, which
 * may legally precede it.
 *
 * Neither half is optional. Matching per-line (`/m`) would also fire on the
 * string quoted inside a comment or a code example further down. Anchoring
 * without stepping over comments — the form `clientBoundary.test.ts` uses —
 * would miss a directive written under a header comment, and the two guards
 * cannot share a form because their assertions point in opposite directions:
 * a miss there names a module a false offender, loudly, whereas a miss here
 * would let this test pass while the component really had become client-only.
 *
 * The skipping is a scan rather than a regex because expressing it as one
 * nests a quantifier inside a quantifier, which backtracks exponentially on a
 * file of repeated `*/ /*` (CodeQL `js/redos`). This consumes at least two
 * characters per step and never backtracks.
 */
const stripLeadingComments = (source: string): string => {
  let rest = source.trimStart();

  for (;;) {
    const closing = rest.startsWith('//')
      ? { index: rest.indexOf('\n'), width: 1 }
      : rest.startsWith('/*')
        ? { index: rest.indexOf('*/', 2), width: 2 }
        : null;

    if (!closing) return rest;

    // An unterminated comment swallows the rest of the file, leaving nothing
    // for the directive to be found in — which is the honest answer for a
    // module that would not parse.
    rest =
      closing.index === -1
        ? ''
        : rest.slice(closing.index + closing.width).trimStart();
  }
};

const sourceHasUseClientDirective = (sourceFile: string) => {
  const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8');

  return /^(['"])use client\1;?/.test(stripLeadingComments(source));
};

const headingLevels = [
  { level: 'h1', tagName: 'h1', sizeClass: 'text-3xl' },
  { level: 'h2', tagName: 'h2', sizeClass: 'text-2xl' },
  { level: 'h3', tagName: 'h3', sizeClass: 'text-xl' },
  { level: 'h4', tagName: 'h4', sizeClass: 'text-lg' },
  { level: 'label', tagName: 'h4', sizeClass: 'text-base' },
] satisfies ReadonlyArray<{
  level: 'h1' | 'h2' | 'h3' | 'h4' | 'label';
  tagName: string;
  sizeClass: string;
}>;

/**
 * Stands in for the framework router link `NativeLink` exists to compose with:
 * it supplies the `href` from its own prop, so markup carrying `href="/docs"`
 * proves the override was honoured rather than the default `<a>` rendered.
 */
const RouterLink = React.forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentPropsWithoutRef<'a'>, 'href'> & { to: string }
>(({ to, children, ...props }, ref) => (
  <a ref={ref} href={to} {...props}>
    {children}
  </a>
));

RouterLink.displayName = 'RouterLink';

describe('server-safe components', () => {
  it.each([
    '../NativeLink.tsx',
    '../typography/Heading.tsx',
    '../typography/Paragraph.tsx',
  ])('does not mark %s as a client module', (sourceFile) => {
    expect(sourceHasUseClientDirective(sourceFile)).toBe(false);
  });

  it.each(headingLevels)(
    'renders the $level level as a static <$tagName>',
    ({ level, tagName, sizeClass }) => {
      const markup = renderToStaticMarkup(
        <Heading level={level}>Semantic heading</Heading>,
      );

      expect(markup).toMatch(
        new RegExp(`^<${tagName}[^>]*>Semantic heading</${tagName}>$`),
      );
      expect(markup).toContain('font-heading');
      expect(markup).toContain(sizeClass);
    },
  );

  it('preserves the Heading element render override in static markup', () => {
    const markup = renderToStaticMarkup(
      <Heading
        level="h2"
        render={<div data-heading="override" />}
        className="tracking-tight"
      >
        Rendered heading
      </Heading>,
    );

    expect(markup).toMatch(
      /^<div[^>]*data-heading="override"[^>]*>Rendered heading<\/div>$/,
    );
    expect(markup).toContain('font-heading');
    expect(markup).toContain('tracking-tight');
  });

  it('renders Paragraph variants to static markup', () => {
    const paragraph = renderToStaticMarkup(
      <Paragraph className="leading-relaxed">Body copy</Paragraph>,
    );
    const code = renderToStaticMarkup(
      <Paragraph intent="inlineCode">const value = true;</Paragraph>,
    );

    expect(paragraph).toMatch(/^<p[^>]*>Body copy<\/p>$/);
    expect(paragraph).toContain('font-body');
    expect(paragraph).toContain('leading-relaxed');
    expect(code).toMatch(/^<code[^>]*>const value = true;<\/code>$/);
    expect(code).toContain('font-monospace');
  });

  it('renders NativeLink as a static <a> around its animated label', () => {
    const markup = renderToStaticMarkup(
      <NativeLink href="/docs">Documentation</NativeLink>,
    );

    expect(markup).toMatch(
      /^<a [^>]*href="\/docs"[^>]*><span [^>]*>Documentation<\/span><\/a>$/,
    );
    expect(markup).toContain('group/link');
    expect(markup).toContain('group-hover/link:bg-[length:100%_2px]');
  });

  it('preserves the NativeLink router render override in static markup', () => {
    const markup = renderToStaticMarkup(
      <NativeLink
        render={<RouterLink to="/docs" className="tracking-tight" />}
        className="uppercase"
      >
        Documentation
      </NativeLink>,
    );

    expect(markup).toMatch(
      /^<a [^>]*href="\/docs"[^>]*><span [^>]*>Documentation<\/span><\/a>$/,
    );
    expect(markup).toContain('tracking-tight');
    expect(markup).toContain('uppercase');
    expect(markup).toContain('text-link');
  });
});
