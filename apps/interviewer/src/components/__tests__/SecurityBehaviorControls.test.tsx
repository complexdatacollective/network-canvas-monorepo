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
  // One setting on at a time, so a toggle bound to the wrong setting shows up.
  const oneHot: [string, [boolean, boolean, boolean]][] = [
    ['requireUnlockOnEnter', [true, false, false]],
    ['requireUnlockOnExit', [false, true, false]],
    ['requireUnlockOnExport', [false, false, true]],
  ];
  it.each(oneHot)(
    'shows only the %s toggle on when only that setting is on',
    (_setting, [enter, exit, exportData]) => {
      render(
        <SecurityBehaviorControls
          value={{
            idleTimeoutMinutes: 15,
            requireUnlockOnEnter: enter,
            requireUnlockOnExit: exit,
            requireUnlockOnExport: exportData,
          }}
          onChange={vi.fn()}
        />,
      );
      const switches = [
        screen.getByRole('switch', { name: /entering an interview/i }),
        screen.getByRole('switch', { name: /exiting an interview/i }),
        screen.getByRole('switch', { name: /before exporting data/i }),
      ];
      expect(
        switches.map((toggle) => toggle.getAttribute('aria-checked')),
      ).toEqual([enter, exit, exportData].map(String));
    },
  );

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
