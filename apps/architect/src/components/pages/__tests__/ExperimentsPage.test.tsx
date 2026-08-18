import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ dispatch: vi.fn(), setLocation: vi.fn() }));

vi.mock('wouter', () => ({
  useLocation: () => ['/protocol/experiments', mocks.setLocation],
}));
vi.mock('react-redux', () => ({
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
vi.mock('~/selectors/protocol', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/selectors/protocol')>()),
  getExperiments: () => ({}),
}));
vi.mock('~/ducks/hooks', () => ({ useAppDispatch: () => mocks.dispatch }));
vi.mock('~/components/EditorLayout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('~/components/ProjectNav/ActionToolbar', () => ({
  default: () => null,
}));

import ExperimentsPage from '../ExperimentsPage';

/**
 * `ToggleField` renders a bare `<button role="switch">`. A button takes its
 * accessible name from `aria-labelledby`, then `aria-label`, then its own
 * contents, then `title` — and this switch had none of them, so assistive
 * technology met a switch with no name at all.
 */
describe('<ExperimentsPage />', () => {
  it('names its switch after the feature it turns on', () => {
    render(<ExperimentsPage />);

    expect(
      screen.getByRole('switch', { name: 'Encrypted Attributes' }),
    ).toBeVisible();
  });

  it('leaves no switch unnamed', () => {
    render(<ExperimentsPage />);

    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAccessibleName();
    }
  });
});
