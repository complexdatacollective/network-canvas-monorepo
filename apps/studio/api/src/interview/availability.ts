import type { StudyState } from '@codaco/studio-contract/schema/study';

type Unavailable = 'not_open' | 'expired' | 'revoked' | 'paused' | 'closed';

type StudyGate = {
  readonly studyState: StudyState;
  readonly studyPausedAt: Date | null;
  readonly pauseGraceMinutes: number;
};

export const redemptionRefusal = (
  link: StudyGate & {
    readonly revokedAt: Date | null;
    readonly expiresAt: Date | null;
    readonly protocolVersionId: string | null;
    readonly waveOpensAt: Date | null;
    readonly waveClosesAt: Date | null;
  },
  now: Date,
): Unavailable | null => {
  if (link.revokedAt !== null) return 'revoked';
  if (link.expiresAt !== null && link.expiresAt <= now) return 'expired';
  if (link.studyState === 'closed') return 'closed';
  if (link.studyState === 'paused') return 'paused';
  if (link.studyState === 'draft') return 'not_open';
  if (link.protocolVersionId === null) return 'not_open';
  if (link.waveOpensAt !== null && link.waveOpensAt > now) return 'not_open';
  if (link.waveClosesAt !== null && link.waveClosesAt <= now) return 'closed';
  return null;
};

export const sessionRefusal = (
  study: StudyGate,
  now: Date,
): Unavailable | null => {
  if (study.studyState === 'closed') return 'closed';
  if (study.studyState === 'draft') return 'not_open';
  if (study.studyState === 'paused') {
    const pausedAt = study.studyPausedAt ?? now;
    const graceEnds = pausedAt.getTime() + study.pauseGraceMinutes * 60_000;
    return now.getTime() >= graceEnds ? 'paused' : null;
  }
  return null;
};
