import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LegacySessionSummary } from '~/lib/db/legacyLibrary';
import type { StoredSessionLite } from '~/lib/db/types';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  goToLegacyInterviewer: vi.fn(),
  updateSettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('wouter', () => ({ useLocation: () => ['/', mocks.navigate] }));
vi.mock('~/lib/db/api', () => ({ updateSettings: mocks.updateSettings }));
vi.mock('~/lib/legacyInterviewer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/legacyInterviewer')>()),
  goToLegacyInterviewer: mocks.goToLegacyInterviewer,
}));

const { pickResumable, ResumePill } = await import('../ResumePill');

const INTERVIEWER_8 = { version: '8.5.0', path: '/v8/' } as const;

const own = (
  id: string,
  lastUpdatedAt: string,
  finishedAt: string | null = null,
): StoredSessionLite => ({
  id,
  protocolHash: 'hash',
  protocolName: 'Wave Two',
  caseId: `case-${id}`,
  startedAt: lastUpdatedAt,
  lastUpdatedAt,
  finishedAt,
  exportedAt: null,
  currentStep: 1,
  statusKind: finishedAt ? 'complete' : 'in-progress',
  progressPercent: 10,
});

const legacy = (
  id: string,
  lastUpdatedAt: string,
  finishedAt: string | null = null,
): LegacySessionSummary => ({
  id,
  protocolHash: 'legacy-hash',
  protocolName: 'Wave One',
  caseId: `case-${id}`,
  startedAt: lastUpdatedAt,
  lastUpdatedAt,
  finishedAt,
  exportedAt: null,
  currentStep: 2,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pickResumable', () => {
  const sessions = [own('new', '2026-10-01T00:00:00.000Z')];
  const legacySessions = [
    legacy('newer', '2026-10-02T00:00:00.000Z'),
    legacy('finished', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z'),
  ];

  it("takes the most recent unfinished interview, Interviewer 8's included", () => {
    expect(pickResumable(sessions, legacySessions, true)).toMatchObject({
      kind: 'legacy',
      session: { id: 'newer' },
    });
  });

  it("leaves Interviewer 8's out when it is not bundled", () => {
    expect(pickResumable(sessions, legacySessions, false)).toMatchObject({
      kind: 'own',
      session: { id: 'new' },
    });
    expect(pickResumable([], legacySessions, false)).toBeUndefined();
  });
});

describe('ResumePill', () => {
  it('resumes an Interviewer 8 interview in Interviewer 8', async () => {
    render(
      <ResumePill
        sessions={[own('new', '2026-10-01T00:00:00.000Z')]}
        legacySessions={[legacy('older-app', '2026-10-02T00:00:00.000Z')]}
        legacyInterviewer={INTERVIEWER_8}
      />,
    );
    expect(screen.getByText('Wave One – case-older-app')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.goToLegacyInterviewer).toHaveBeenCalledWith(
      '/v8/interview/older-app',
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it("resumes this app's own interview through the router", async () => {
    render(
      <ResumePill
        sessions={[own('new', '2026-10-03T00:00:00.000Z')]}
        legacySessions={[legacy('older-app', '2026-10-02T00:00:00.000Z')]}
        legacyInterviewer={INTERVIEWER_8}
      />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(mocks.navigate).toHaveBeenCalledWith('/interview/new');
    expect(mocks.goToLegacyInterviewer).not.toHaveBeenCalled();
  });
});
