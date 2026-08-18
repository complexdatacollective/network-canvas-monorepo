import { beforeAll, describe, expect, it, vi } from 'vitest';

const { init, register } = vi.hoisted(() => ({
  init: vi.fn(),
  register: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: { init, register },
}));

describe('Fresco PostHog client', () => {
  beforeAll(async () => {
    await import('../../instrumentation-client');
    await vi.waitFor(() => expect(init).toHaveBeenCalledOnce());
  });

  it('propagates the browser session to same-origin server requests', () => {
    expect(init).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tracing_headers: [window.location.hostname],
      }),
    );
  });
});
