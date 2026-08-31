import { waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  applyFreshLoadServiceWorkerUpdate,
  createRoot,
  registerPwaBuildLease,
  render,
} = vi.hoisted(() => ({
  applyFreshLoadServiceWorkerUpdate: vi.fn<() => Promise<boolean>>(),
  createRoot: vi.fn(),
  registerPwaBuildLease: vi.fn(),
  render: vi.fn(),
}));

vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock(
  '@codaco/fresco-ui/appUpdate/applyFreshLoadServiceWorkerUpdate',
  () => ({ applyFreshLoadServiceWorkerUpdate, registerPwaBuildLease }),
);
vi.mock('../components/Errors', () => ({
  AppErrorBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/PreviewHost/PreviewHost', () => ({
  PreviewHost: () => <div>Preview ready</div>,
}));

describe('preview startup', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('__PWA_BUILD_ID__', 'architect-test-build');
    document.body.innerHTML = '<div id="root"></div>';
    createRoot.mockReturnValue({ render });
  });

  it('completes the no-reload service-worker handoff before rendering', async () => {
    let finishHandoff: (result: boolean) => void = () => undefined;
    applyFreshLoadServiceWorkerUpdate.mockReturnValue(
      new Promise((resolve) => {
        finishHandoff = resolve;
      }),
    );

    await import('../preview-main');

    expect(registerPwaBuildLease).toHaveBeenCalledWith('architect-test-build');
    expect(applyFreshLoadServiceWorkerUpdate).toHaveBeenCalledWith({
      reload: false,
    });
    expect(createRoot).not.toHaveBeenCalled();

    finishHandoff(false);

    await waitFor(() => expect(render).toHaveBeenCalledOnce());
  });
});
