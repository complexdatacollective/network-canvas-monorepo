import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import SkipDestinationBadge from '../SkipDestinationBadge';

describe('SkipDestinationBadge', () => {
  it('allows an unbroken destination label to shrink and wrap', () => {
    const destinationLabel =
      'Stage 12 — A-deliberately-unbroken-destination-label-that-must-not-overflow-the-timeline';

    render(<SkipDestinationBadge destinationLabel={destinationLabel} />);

    const text = screen.getByText(`If skipped: ${destinationLabel}`);
    expect(text).toHaveClass('min-w-0', 'wrap-break-word');
    expect(text.parentElement).toHaveClass(
      'max-w-md',
      'min-w-0',
      'whitespace-normal',
    );
  });
});
