import type { StudyState } from '@codaco/studio-rpc';

/**
 * How a study's lifecycle state is written for a researcher (#1262's lifecycle
 * table). Whole strings in a lookup rather than a capitalised database value:
 * these are display copy, and the wire values are a schema constraint that
 * nothing should be teaching researchers to read.
 */
export const STUDY_STATE_LABELS: Record<StudyState, string> = {
  draft: 'Draft',
  live: 'Live',
  paused: 'Paused',
  closed: 'Closed',
};

/**
 * The fill for a study's status dot.
 *
 * Ranked the way `TeamStudies`' badge ranks the same states: Live is the one
 * that carries consequence, because participants can reach it, so it is the
 * one that gets a colour of its own. Paused is a caution — reachable
 * yesterday, not today. Draft and Closed are both quiet, and Closed the less
 * quiet of the two because it is finished rather than unstarted; closing a
 * study archives it, and colouring an archive like a failure would be a claim
 * about the work.
 *
 * **Never the only carrier of the state.** Colour alone fails WCAG 1.4.1, so
 * every caller shows `STUDY_STATE_LABELS` beside the dot; the dot is what makes
 * the list scannable once you know what the colours mean.
 */
export const STUDY_STATE_TONES: Record<StudyState, string> = {
  draft: 'bg-input-contrast/30',
  live: 'bg-success',
  paused: 'bg-warning',
  closed: 'bg-input-contrast/60',
};

/**
 * The supporting line under a study's name: its state, and how much of it
 * there is.
 *
 * Whole phrases rather than one sentence assembled from fragments, and the
 * counts only where there are any — a study nobody has joined yet reads as
 * "Draft", not as "Draft · 0 participants", which says nothing a researcher
 * came for.
 */
export function studySummaryLine(study: {
  state: StudyState;
  waveCount: number;
  participantCount: number;
}): string {
  const parts = [STUDY_STATE_LABELS[study.state]];
  if (study.waveCount > 0) {
    parts.push(study.waveCount === 1 ? '1 wave' : `${study.waveCount} waves`);
  }
  if (study.participantCount > 0) {
    parts.push(
      study.participantCount === 1
        ? '1 participant'
        : `${study.participantCount} participants`,
    );
  }
  return parts.join(' · ');
}
