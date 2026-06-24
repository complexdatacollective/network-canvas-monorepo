import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import VisualAnalogScaleField from '../VisualAnalogScale';

describe('VisualAnalogScaleField — normalised 0-1 scale', () => {
  it('renders on a 0-1 scale by default', () => {
    render(<VisualAnalogScaleField value={0.5} onChange={vi.fn()} />);
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '1');
  });

  it('commits the pristine midpoint as 0.5, not 50', () => {
    const onChange = vi.fn();
    render(<VisualAnalogScaleField value={undefined} onChange={onChange} />);
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider.closest('[role="slider"]') ?? slider);
    // commitPristineValue is wired to onPointerDown of the root.
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });
});
