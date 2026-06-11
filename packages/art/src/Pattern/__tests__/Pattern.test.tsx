import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Pattern } from '../Pattern';

describe('Pattern', () => {
  it('renders an svg pattern for a non-empty seed', () => {
    const markup = renderToStaticMarkup(
      <Pattern seed="Sample Protocol" className="size-full" />,
    );
    expect(markup).toContain('<svg');
    expect(markup).toContain('size-full');
  });

  it('renders a plain platinum-dark surface for an empty seed', () => {
    const markup = renderToStaticMarkup(
      <Pattern seed="" className="size-full" />,
    );
    expect(markup).not.toContain('<svg');
    expect(markup).toContain('--platinum--dark');
    expect(markup).toContain('size-full');
  });
});
