import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { expect, it, vi } from 'vitest';

import { useRequests } from './useRequests.ts';

it('runs live commands but refuses callbacks retained after their private surface unmounts', async () => {
  const hook = renderHook(useRequests, { wrapper: StrictMode });
  const command = vi.fn(async (_signal: AbortSignal) => 'accepted');
  const retained = hook.result.current.run;
  await expect(retained(command)).resolves.toBe('accepted');
  expect(command).toHaveBeenCalledTimes(1);
  expect(command.mock.calls[0]?.[0].aborted).toBe(false);

  hook.unmount();
  await expect(retained(command)).resolves.toBeUndefined();
  expect(command).toHaveBeenCalledTimes(1);
});

it.each(['resolve', 'reject'] as const)(
  'discards a cancelled command that ignores AbortSignal and later %ss',
  async (outcome) => {
    const hook = renderHook(useRequests, { wrapper: StrictMode });
    const pending = Promise.withResolvers<string>();
    let signal: AbortSignal | undefined;
    const result = hook.result.current.run((current) => {
      signal = current;
      return pending.promise;
    });
    expect(signal?.aborted).toBe(false);
    act(() => hook.result.current.cancel());
    expect(signal?.aborted).toBe(true);
    if (outcome === 'resolve') pending.resolve('private-result-canary');
    else pending.reject(new Error('private-provider-error-canary'));
    await expect(result).resolves.toBeUndefined();
    await expect(
      hook.result.current.run(async () => 'new-live-result'),
    ).resolves.toBe('new-live-result');
  },
);
