import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextValue } from '../AuthContext';

// Interviewer 8 inside Interviewer 9's deploy runs under /v8/, where the
// browser path of an interview is /v8/interview/<id>. The rule that keeps a
// destructive reset away from a step-up opened during an interview must hold
// there too. The dialog is replaced by a probe of the policy the provider
// hands it, so the provider's own path check is what is under test.

let mockAuth: Pick<AuthContextValue, 'kind' | 'mode'>;
vi.mock('../AuthContext', () => ({
  useAuth: () => mockAuth,
}));

vi.mock('../StepUpAuthDialog', () => ({
  default: ({
    open,
    allowDestructiveRecovery,
  }: {
    open: boolean;
    allowDestructiveRecovery: boolean;
  }) =>
    open ? (
      <output data-testid="destructive-recovery">
        {String(allowDestructiveRecovery)}
      </output>
    ) : null,
}));

const renderUnder = async (baseUrl: string, path: string) => {
  vi.stubEnv('BASE_URL', baseUrl);
  window.history.replaceState({}, '', path);
  const [{ default: DialogProvider }, { Router }, provider] = await Promise.all(
    [
      import('@codaco/fresco-ui/dialogs/DialogProvider'),
      import('wouter'),
      import('../StepUpAuthProvider'),
    ],
  );
  const { StepUpAuthProvider, useStepUpAuth } = provider;

  function StepUpRequester() {
    const { requireFreshUnlock } = useStepUpAuth();
    return (
      <button type="button" onClick={() => void requireFreshUnlock()}>
        request-step-up
      </button>
    );
  }

  render(
    <Router base={baseUrl === '/' ? '' : baseUrl.replace(/\/$/, '')}>
      <DialogProvider>
        <StepUpAuthProvider>
          <StepUpRequester />
        </StepUpAuthProvider>
      </DialogProvider>
    </Router>,
  );
  await act(async () => {
    screen.getByText('request-step-up').click();
  });
  return screen.getByTestId('destructive-recovery').textContent;
};

beforeEach(() => {
  vi.resetModules();
  window.sessionStorage.clear();
  mockAuth = { kind: 'unlocked', mode: 'pin' };
});
afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState({}, '', '/');
});

describe('StepUpAuthProvider recovery restriction under a /v8/ base', () => {
  it('withholds destructive recovery from a step-up opened during an interview', async () => {
    expect(await renderUnder('/v8/', '/v8/interview/s1')).toBe('false');
  });

  it('still allows it on the home page, so the check is the path, not the base', async () => {
    expect(await renderUnder('/v8/', '/v8/')).toBe('true');
  });
});

describe('StepUpAuthProvider recovery restriction at the root', () => {
  it('withholds destructive recovery during an interview', async () => {
    expect(await renderUnder('/', '/interview/s1')).toBe('false');
  });

  it('allows it on the home page', async () => {
    expect(await renderUnder('/', '/')).toBe('true');
  });
});
