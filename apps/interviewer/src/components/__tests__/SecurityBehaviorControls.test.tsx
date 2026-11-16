import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SecurityBehaviorControls, {
  type Behavior,
} from '../SecurityBehaviorControls';

const baseValue: Behavior = {
  idleTimeoutMinutes: 15,
  requireUnlockOnEnter: true,
  requireUnlockOnExit: false,
  requireUnlockOnExport: false,
};

describe('SecurityBehaviorControls', () => {
  it('shows each unlock toggle in the state its setting holds', () => {
    render(
      <SecurityBehaviorControls
        value={{ ...baseValue, requireUnlockOnExport: true }}
        onChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('switch', { name: /entering an interview/i }),
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: /exiting an interview/i }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: /before exporting data/i }),
    ).toBeChecked();
  });

  it('emits requireUnlockOnExit when the exit toggle is switched on', () => {
    const onChange = vi.fn();
    render(<SecurityBehaviorControls value={baseValue} onChange={onChange} />);
    const exitSwitch = screen.getByRole('switch', {
      name: /exiting an interview/i,
    });
    fireEvent.click(exitSwitch);
    expect(onChange).toHaveBeenCalledWith({
      ...baseValue,
      requireUnlockOnExit: true,
    });
  });
});
