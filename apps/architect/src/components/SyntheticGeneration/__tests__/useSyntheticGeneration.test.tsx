import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import { useSyntheticGeneration } from '../useSyntheticGeneration';

/**
 * What the hook does with the archive a finished run leaves behind.
 *
 * The dialog it drives stays mounted under `ProjectActions` for the whole
 * editing session, so "when is the archive let go of" is a question about
 * memory that no rendered output can answer — the dialog unmounts its own
 * contents on close either way. It is asked here, of the state that holds it.
 */

const generateSyntheticExport = vi.hoisted(() => vi.fn());
vi.mock('~/lib/syntheticExport/generateSyntheticExport', () => ({
  generateSyntheticExport,
}));

const protocol = { name: 'Held' } as unknown as CurrentProtocol;

const archive = new Blob(['zip'], { type: 'application/zip' });
const summary = {
  sessionCount: 3,
  seed: 7,
  startWindow: '2026-08-22T00:00:00.000Z',
  fileName: 'Held-synthetic-2026-08-22_10-00.zip',
  failedCount: 0,
  archive,
};

beforeEach(() => {
  generateSyntheticExport.mockReset();
  generateSyntheticExport.mockResolvedValue(summary);
});

const request = {
  count: 3,
  simulateDropOut: false,
  respectSkipLogic: true,
};

describe('useSyntheticGeneration', () => {
  it('lets go of a finished run when its surface closes', async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useSyntheticGeneration({ protocol, protocolId: null, open }),
      { initialProps: { open: true } },
    );

    await act(async () => {
      await result.current.generate(request);
    });
    // The archive really is held: without this the release below proves nothing.
    expect(result.current.state).toMatchObject({
      status: 'done',
      summary: { archive },
    });

    rerender({ open: false });

    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'idle' }),
    );
  });

  it('starts a reopened surface from a clean slate', async () => {
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useSyntheticGeneration({ protocol, protocolId: null, open }),
      { initialProps: { open: true } },
    );

    await act(async () => {
      await result.current.generate(request);
    });
    rerender({ open: false });
    rerender({ open: true });

    // A stale "Generated 3 interviews" over a fresh form would read as though
    // this open had already run.
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'idle' }),
    );
  });
});
