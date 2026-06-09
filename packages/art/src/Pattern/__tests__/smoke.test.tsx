import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Pattern } from '../Pattern';
import { PATTERN_VARIANTS } from '../types';

describe('smoke', () => {
  it.each(PATTERN_VARIANTS)(
    'variant %s renders 50 sequential seeds without throwing',
    (variant) => {
      for (let i = 0; i < 50; i++) {
        const markup = renderToStaticMarkup(
          <Pattern
            seed={String(i)}
            variant={variant}
            width={400}
            height={250}
          />,
        );
        expect(markup.length).toBeGreaterThan(50);
        expect(markup.startsWith('<svg')).toBe(true);
      }
    },
    // 50 heavy renders per variant; the first case also absorbs the jsdom
    // environment warmup, which can exceed the 5s default on cold CI runners.
    30000,
  );
});
