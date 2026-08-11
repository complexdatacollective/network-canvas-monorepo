import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { PageBackground } from '../PageBackground/PageBackground';

vi.mock('@codaco/art/NetworkWeaveBackground', () => ({
  default: () => <div />,
}));

describe('PageBackground server rendering', () => {
  it('keeps an unresolved zero-axis convergence hidden with a valid mask', () => {
    const markup = renderToStaticMarkup(
      <PageBackground
        convergence={{ x: 0, y: 0 }}
        motionMode="target"
        resolved={false}
      />,
    );

    expect(markup).toContain('circle at 0% 0%');
    expect(markup).not.toContain('circle at % %');
    expect(markup).toContain('visibility:hidden');
  });
});
