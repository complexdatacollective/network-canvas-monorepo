import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import Heading from './Heading';
import Paragraph from './Paragraph';

const sourceHasUseClientDirective = (sourceFile: string) => {
  const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8');

  return /^\s*(['"])use client\1;?/m.test(source);
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

describe('server-safe typography', () => {
  it.each(['./Heading.tsx', './Paragraph.tsx'])(
    'does not mark %s as a client module',
    (sourceFile) => {
      expect(sourceHasUseClientDirective(sourceFile)).toBe(false);
    },
  );

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
});
