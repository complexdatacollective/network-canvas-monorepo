import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import BackgroundBlobs from '../BackgroundBlobs/BackgroundBlobs';

describe('BackgroundBlobs component', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an aria-hidden full-size canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const { container } = render(
      <BackgroundBlobs
        large={1}
        medium={2}
        small={3}
        compositeOperation="color-dodge"
        filter="blur(12px)"
      />,
    );

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute('aria-hidden')).toBe('true');
    expect(canvas?.style.width).toBe('100%');
    expect(canvas?.style.height).toBe('100%');
  });
});
