import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { version } from '../../package.json';

const fixture = vi.hoisted(() => ({
  failure: new Error('React render failure canary'),
  status: vi.fn(),
  capture: vi.fn(),
  start: vi.fn(),
  caught: false,
}));
vi.mock('../lib/queryClient.ts', () => ({
  queryClient: { fetchQuery: fixture.status },
}));
vi.mock('../lib/deployment.ts', () => ({ statusQueryOptions: {} }));
vi.mock('../lib/telemetry.ts', () => ({
  clientTelemetry: {
    capture: fixture.capture,
    start: fixture.start,
    close: vi.fn(),
  },
}));
vi.mock('../router.tsx', () => ({ router: {} }));
vi.mock('@tanstack/react-query', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@tanstack/react-router', async () => {
  const { Component, createElement } = await import('react');
  class Boundary extends Component<
    { children?: ReactNode },
    { failed: boolean }
  > {
    state = { failed: false };
    static getDerivedStateFromError() {
      return { failed: true };
    }
    render() {
      return this.state.failed ? 'Caught render failure' : this.props.children;
    }
  }
  function Failure(): never {
    throw fixture.failure;
  }
  return {
    RouterProvider: () =>
      fixture.caught
        ? createElement(Boundary, null, createElement(Failure))
        : createElement(Failure),
  };
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  fixture.caught = false;
});

describe('React root error reporting', () => {
  it.each(['disabled', 'pending'])(
    'retains console diagnostics for a caught render failure while telemetry is %s',
    async (mode) => {
      vi.resetModules();
      fixture.caught = true;
      fixture.status.mockReturnValue(
        mode === 'pending'
          ? new Promise(() => {})
          : Promise.resolve({
              telemetry: false,
              deployment: { mode: 'self-hosted' },
              version: '99.98.97',
            }),
      );
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
      const container = document.createElement('div');
      container.id = 'root';
      document.body.append(container);
      await import('../main.tsx');
      await vi.waitFor(() =>
        expect(logged.mock.calls.flat()).toContain(fixture.failure),
      );
      expect(document.body.textContent).toContain('Caught render failure');
      expect(fixture.capture).toHaveBeenCalledWith(
        'client_render',
        fixture.failure,
      );
    },
  );

  it('attributes client telemetry to its own build when the server version differs', async () => {
    vi.resetModules();
    fixture.caught = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fixture.status.mockResolvedValue({
      telemetry: true,
      deployment: { mode: 'managed' },
      version: '99.98.97',
    });
    expect(version).not.toBe('99.98.97');
    const container = document.createElement('div');
    container.id = 'root';
    document.body.append(container);
    await import('../main.tsx');
    await vi.waitFor(() =>
      expect(fixture.start).toHaveBeenCalledWith(true, {
        mode: 'managed',
        runtime: 'client',
        version,
      }),
    );
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('Caught render failure'),
    );
  });

  it.each(['disabled', 'pending'])(
    'retains browser uncaught-error reporting while telemetry is %s',
    async (mode) => {
      vi.resetModules();
      fixture.status.mockReturnValue(
        mode === 'pending'
          ? new Promise(() => {})
          : Promise.resolve({
              telemetry: false,
              deployment: { mode: 'self-hosted' },
              version: '0.2.0',
            }),
      );
      const container = document.createElement('div');
      container.id = 'root';
      document.body.append(container);
      const reported: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        reported.push(event.error);
        // The assertion consumes the browser report, avoiding an unrelated
        // unhandled-error failure in the runner.
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      try {
        await import('../main.tsx');
        await vi.waitFor(() => expect(reported).toEqual([fixture.failure]));
        expect(fixture.capture).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('error', onError);
      }
    },
  );
});
