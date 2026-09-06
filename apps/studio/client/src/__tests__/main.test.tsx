import { afterEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  failure: new Error('React render failure canary'),
  status: vi.fn(),
  capture: vi.fn(),
  start: vi.fn(),
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
  QueryClientProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => {
    throw fixture.failure;
  },
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('React root error reporting', () => {
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
