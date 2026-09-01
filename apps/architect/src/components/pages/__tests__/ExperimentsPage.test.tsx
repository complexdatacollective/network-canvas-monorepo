import { render, screen } from '@testing-library/react';
import { useMemo, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ToolbarButton } from '@codaco/fresco-ui/SegmentedToolbar';
import {
  ActionToolbarProvider,
  useActionToolbar,
} from '~/components/ProjectNav/ActionToolbar';

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

import ExperimentsPage from '../ExperimentsPage';

// Another route's controls, published the same way this page's are.
const OtherRouteToolbar = () => {
  const props = useMemo(
    () => ({
      'aria-label': 'Codebook actions',
      'children': [<ToolbarButton key="download">Download</ToolbarButton>],
    }),
    [],
  );
  useActionToolbar(props);
  return null;
};

const renderInWorkspace = (children: ReactNode) =>
  render(<ActionToolbarProvider>{children}</ActionToolbarProvider>);

/**
 * `ToggleField` renders a bare `<button role="switch">`. A button takes its
 * accessible name from `aria-labelledby`, then `aria-label`, then its own
 * contents, then `title` — and this switch had none of them, so assistive
 * technology met a switch with no name at all.
 */
describe('<ExperimentsPage />', () => {
  it('names its switch after the feature it turns on', () => {
    renderInWorkspace(<ExperimentsPage />);

    expect(
      screen.getByRole('switch', { name: 'Encrypted Attributes' }),
    ).toBeVisible();
  });

  it('leaves no switch unnamed', () => {
    renderInWorkspace(<ExperimentsPage />);

    for (const toggle of screen.getAllByRole('switch')) {
      expect(toggle).toHaveAccessibleName();
    }
  });

  // The toolbar is `fixed`, so a route that renders its own puts a second one
  // over the workspace's — and the registry that exists to prevent that only
  // works if every route publishes through it.
  it('publishes its controls to the one workspace toolbar', () => {
    renderInWorkspace(<ExperimentsPage />);

    // The one toolbar on screen is the workspace's, and it is carrying this
    // page's control. (No `toBeVisible`: the host enters from its `hidden`
    // variant, so it is mid-animation at opacity 0 on the first frame.)
    const toolbars = screen.getAllByRole('toolbar');
    expect(toolbars).toHaveLength(1);
    expect(toolbars[0]).toHaveAccessibleName('Experiments actions');
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeInTheDocument();
  });

  it("does not put a second toolbar on screen beside another route's", () => {
    renderInWorkspace(
      <>
        <ExperimentsPage />
        <OtherRouteToolbar />
      </>,
    );

    // The registry holds one registration at a time; a page rendering its own
    // surface as well would show up here as a second toolbar.
    expect(screen.getAllByRole('toolbar')).toHaveLength(1);
  });
});
