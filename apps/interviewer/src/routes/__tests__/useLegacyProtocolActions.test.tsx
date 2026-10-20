import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProtocolWithCounts } from '~/lib/db/types';
import type { BundledLegacyInterviewer } from '~/lib/legacyInterviewer';

const mocks = vi.hoisted(() => ({
  bundled: null as BundledLegacyInterviewer | null,
  showLegacyProtocolInfo: vi.fn(),
  openDialog: vi.fn(),
}));

vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  getBundledLegacyInterviewer: () => mocks.bundled,
}));
vi.mock('~/components/legacyProtocolDialogs', () => ({
  showLegacyProtocolInfo: mocks.showLegacyProtocolInfo,
}));
vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ openDialog: mocks.openDialog }),
}));
vi.mock('~/lib/pwa/legacyInterviewerOffline', () => ({
  useLegacyInterviewerOffline: () => 'ready',
}));

const { useLegacyProtocolActions } =
  await import('../useLegacyProtocolActions');

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

const schema8Protocol = {
  id: 'row',
  hash: 'schema-8-hash',
  name: 'Wave One',
  schemaVersion: 8,
  importedAt: '2025-05-20T10:00:00.000Z',
  codebook: {},
  protocol: { name: 'Wave One', schemaVersion: 8, codebook: {}, stages: [] },
  sessionCount: 2,
} as ProtocolWithCounts;

const setup = () => renderHook(() => useLegacyProtocolActions());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.bundled = INTERVIEWER_8;
});

describe('useLegacyProtocolActions: schema 8 cards', () => {
  it('says whether Interviewer 8 is there to run their interviews', () => {
    expect(setup().result.current.schema8).toMatchObject({
      interviewer: INTERVIEWER_8,
      offline: 'ready',
    });
    mocks.bundled = null;
    expect(setup().result.current.schema8.interviewer).toBeNull();
  });

  it('shows a protocol’s details', () => {
    const { result } = setup();
    result.current.schema8.onShowInfo(schema8Protocol);
    expect(mocks.showLegacyProtocolInfo).toHaveBeenCalledWith(
      mocks.openDialog,
      schema8Protocol,
    );
  });

  it('offers no upgrade of a schema 8 protocol', () => {
    expect(Object.keys(setup().result.current.schema8).toSorted()).toEqual([
      'interviewer',
      'offline',
      'onShowInfo',
    ]);
  });
});
