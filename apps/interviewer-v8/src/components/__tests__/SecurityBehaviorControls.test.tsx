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
  it('renders the three unlock toggles', () => {
    render(<SecurityBehaviorControls value={baseValue} onChange={vi.fn()} />);
    expect(
      screen.getByText('Require unlock when entering an interview'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Require unlock when exiting an interview'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Require unlock before exporting data'),
    ).toBeInTheDocument();
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
