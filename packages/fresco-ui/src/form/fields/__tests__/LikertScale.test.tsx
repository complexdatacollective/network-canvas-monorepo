import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LikertScaleField from '../LikertScale';

const options = [
  { label: 'Poor', value: 1 },
  { label: 'Fair', value: 2 },
  { label: 'Good', value: 3 },
];

/**
 * Pinning cover for issue #1385. The scale was reported as sharing the visual
 * analog scale's defect — announcing its resting midpoint as though it had
 * been chosen — but it already announces the unanswered state honestly. These
 * tests hold that in place so the reported defect cannot quietly become true.
 */
describe('LikertScaleField — unanswered state', () => {
  it('does not announce the resting option as a selection', () => {
    render(
      <LikertScaleField
        value={undefined}
        options={options}
        onChange={vi.fn()}
      />,
    );

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', 'No selection');
    // The thumb rests on the middle option, which must not be mistaken for
    // an answer.
    expect(slider).not.toHaveAttribute('aria-valuetext', 'Fair');
  });

  it('announces the chosen option once one is recorded', () => {
    render(<LikertScaleField value={3} options={options} onChange={vi.fn()} />);

    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      'Good',
    );
  });
});
