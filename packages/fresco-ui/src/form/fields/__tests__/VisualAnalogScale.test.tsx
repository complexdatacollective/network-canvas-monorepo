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
    fireEvent.keyDown(slider, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('still confirms from the keyboard after the field is cleared', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <VisualAnalogScaleField value={undefined} onChange={onChange} />,
    );
    const slider = screen.getByRole('slider');

    // Choose a value with the keyboard, so the component has seen a change...
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    // (guard against the scenario going vacuous if key handling changes)
    expect(onChange).toHaveBeenCalled();
    // ...then the surrounding form clears the field back to pristine.
    rerender(<VisualAnalogScaleField value={undefined} onChange={onChange} />);

    onChange.mockClear();
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(0.5);
  });

  it('does not record a response for a secondary-button press', () => {
    const onChange = vi.fn();
    render(<VisualAnalogScaleField value={undefined} onChange={onChange} />);
    const slider = screen.getByRole('slider');

    // Base UI only starts a slider interaction for a primary press, so the
    // release of a right-click must not commit the resting midpoint.
    fireEvent.pointerDown(slider, { button: 2 });
    fireEvent.pointerUp(slider, { button: 2 });
    expect(onChange).not.toHaveBeenCalled();
  });
});
