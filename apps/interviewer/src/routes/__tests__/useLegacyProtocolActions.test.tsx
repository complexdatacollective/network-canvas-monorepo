import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BundledLegacyInterviewer } from '~/lib/legacyInterviewer';

const mocks = vi.hoisted(() => ({
  bundled: null as BundledLegacyInterviewer | null,
}));

vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => mocks.bundled,
}));

const { useLegacyProtocolActions } =
  await import('../useLegacyProtocolActions');

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

const setup = () => renderHook(() => useLegacyProtocolActions());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bundled = INTERVIEWER_8;
});

describe('useLegacyProtocolActions: schema 8 cards', () => {
  it('says whether Interviewer 8 is there to run their interviews', () => {
    expect(setup().result.current.schema8).toMatchObject({
      interviewer: INTERVIEWER_8,
    });
    mocks.bundled = null;
    expect(setup().result.current.schema8.interviewer).toBeNull();
  });

  it('offers no upgrade of a schema 8 protocol', () => {
    expect(Object.keys(setup().result.current.schema8).toSorted()).toEqual([
      'interviewer',
    ]);
  });
});
