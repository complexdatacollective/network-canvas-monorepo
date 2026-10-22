import { act, fireEvent, render, screen } from '@testing-library/react';
import { Component, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import Routes from '../Routes';

// Only the `/protocol` route, with nothing around it but the editor's loader.
vi.mock('wouter', () => ({
  Route: ({ path, children }: { path: string; children?: ReactNode }) =>
    path === '/protocol/*?' ? <>{children}</> : null,
  Switch: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('~/components/Home/Home', () => ({ default: () => null }));

vi.mock('~/components/Home/ProtocolLoadingOverlay', () => ({
  default: () => <div data-testid="loading" />,
}));

vi.mock('~/components/ProjectNav/ActionToolbar', () => ({
  ActionToolbarProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('~/components/ProtocolRouteGuard', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('~/components/RouteFocus', () => ({ default: () => null }));

const { loadProtocolRoutes } = vi.hoisted(() => ({
  loadProtocolRoutes: vi.fn(),
}));

vi.mock('~/components/protocolRoutesLoader', () => ({
  loadProtocolRoutes,
  getLoadedProtocolRoutes: () => null,
}));

// Stands in for the app's error boundary: its dialog replaces the routes, and
// dismissing it renders them again.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  componentDidCatch() {
    this.setState({ failed: true });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <button type="button" onClick={() => this.setState({ failed: false })}>
        Dismiss
      </button>
    );
  }
}

describe('Routes, when the editor fails to load', () => {
  it('fetches the editor again once the error is dismissed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadProtocolRoutes
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({
        default: () => <div data-testid="editor" />,
      });

    render(
      <Boundary>
        <Routes />
      </Boundary>,
    );

    const dismiss = await screen.findByRole('button', { name: 'Dismiss' });
    await act(async () => {
      fireEvent.click(dismiss);
    });

    expect(await screen.findByTestId('editor')).toBeInTheDocument();
    expect(loadProtocolRoutes).toHaveBeenCalledTimes(2);
  });
});
