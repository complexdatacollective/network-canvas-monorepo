import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredSessionLite } from '~/lib/db/types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('wouter', () => ({ useLocation: () => ['/', mocks.navigate] }));
vi.mock('~/lib/db/api', () => ({ updateSettings: mocks.updateSettings }));

const { pickResumable, ResumePill } = await import('../ResumePill');

const session = (
  id: string,
  lastUpdatedAt: string,
  {
    finishedAt = null,
    protocolHash = 'schema-9-hash',
    protocolName = 'Wave Two',
  }: {
    finishedAt?: string | null;
    protocolHash?: string;
    protocolName?: string;
  } = {},
): StoredSessionLite => ({
  id,
  protocolHash,
  protocolName,
  caseId: `case-${id}`,
  startedAt: lastUpdatedAt,
  lastUpdatedAt,
  finishedAt,
  exportedAt: null,
  currentStep: 1,
  statusKind: finishedAt ? 'complete' : 'in-progress',
  progressPercent: 10,
});

const schema8 = (id: string, lastUpdatedAt: string) =>
  session(id, lastUpdatedAt, {
    protocolHash: 'schema-8-hash',
    protocolName: 'Wave One',
  });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pickResumable', () => {
  const sessions = [
    session('older', '2026-10-01T00:00:00.000Z'),
    schema8('newer', '2026-10-02T00:00:00.000Z'),
    session('finished', '2026-10-03T00:00:00.000Z', {
      finishedAt: '2026-10-03T00:00:00.000Z',
    }),
  ];

  it('takes the most recent unfinished interview of any schema it can open', () => {
    expect(
      pickResumable(sessions, new Set(['schema-9-hash', 'schema-8-hash'])),
    ).toMatchObject({ id: 'newer' });
  });

  it('leaves out interviews whose protocol cannot be opened here', () => {
    expect(pickResumable(sessions, new Set(['schema-9-hash']))).toMatchObject({
      id: 'older',
    });
    expect(
      pickResumable([schema8('newer', '2026-10-02T00:00:00.000Z')], new Set()),
    ).toBeUndefined();
  });
});

describe('ResumePill', () => {
  it('resumes a schema 8 interview through the interview route, like any other', async () => {
    render(
      <ResumePill
        sessions={[schema8('older-schema', '2026-10-02T00:00:00.000Z')]}
        runnableProtocolHashes={new Set(['schema-8-hash'])}
      />,
    );
    expect(
      screen.getByText('Wave One – case-older-schema'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      lastActiveSessionId: 'older-schema',
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/interview/older-schema');
  });

  it('shows nothing when no interview can be resumed', () => {
    const { container } = render(
      <ResumePill
        sessions={[schema8('older-schema', '2026-10-02T00:00:00.000Z')]}
        runnableProtocolHashes={new Set()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
