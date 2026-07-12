import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NewsTicker } from '../NewsTicker';

describe('NewsTicker', () => {
  it('switches to the compact marquee at tablet portrait width', () => {
    const { container } = render(<NewsTicker />);
    const ticker = container.firstElementChild;
    const desktopTicker = ticker?.children[0];
    const mobileTicker = ticker?.children[1];

    expect(desktopTicker).toHaveClass('tablet-portrait:flex', 'hidden');
    expect(mobileTicker).toHaveClass('tablet-portrait:hidden', 'flex');
  });
});
