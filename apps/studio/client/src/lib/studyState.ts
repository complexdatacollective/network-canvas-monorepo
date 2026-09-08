import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape, MessageDescriptor } from '@codaco/app-i18n/messages';
import type { StudyState } from '@codaco/studio-rpc';

/**
 * How a study's lifecycle state is written for a researcher (#1262's lifecycle
 * table). Whole messages in a lookup rather than a capitalised database value:
 * these are display copy, and the wire values are a schema constraint that
 * nothing should be teaching researchers to read.
 */
const stateMessages = defineMessages({
  draft: {
    id: 'studio.studyState.draft',
    defaultMessage: 'Draft',
    description:
      'Lifecycle state of a study that is still being designed and not yet reachable by participants.',
  },
  live: {
    id: 'studio.studyState.live',
    defaultMessage: 'Live',
    description: 'Lifecycle state of a study participants can currently reach.',
  },
  paused: {
    id: 'studio.studyState.paused',
    defaultMessage: 'Paused',
    description:
      'Lifecycle state of a study whose collection is temporarily stopped.',
  },
  closed: {
    id: 'studio.studyState.closed',
    defaultMessage: 'Closed',
    description:
      'Lifecycle state of a study whose collection is finished and archived.',
  },
});

export const STUDY_STATE_MESSAGES: Record<StudyState, MessageDescriptor> = {
  draft: stateMessages.draft,
  live: stateMessages.live,
  paused: stateMessages.paused,
  closed: stateMessages.closed,
};

/**
 * The two study-size phrases, shared by the study switcher's supporting line
 * and the team studies list — one catalog entry each, not near-duplicates.
 */
export const studyCountMessages = defineMessages({
  waves: {
    id: 'studio.studyState.waveCount',
    defaultMessage: '{count, plural, one {# wave} other {# waves}}',
    description:
      'How many collection timepoints a study has, shown beside its name.',
  },
  participants: {
    id: 'studio.studyState.participantCount',
    defaultMessage:
      '{count, plural, one {# participant} other {# participants}}',
    description: 'How many participants a study has, shown beside its name.',
  },
});

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
 * every caller shows the state label beside the dot; the dot is what makes
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
 * Whole phrases joined by a visual separator rather than one sentence
 * assembled from fragments, and the counts only where there are any — a study
 * nobody has joined yet reads as "Draft", not as "Draft · 0 participants",
 * which says nothing a researcher came for. Takes the caller's intl so the
 * line follows the active locale.
 */
export function studySummaryLine(
  intl: IntlShape,
  study: {
    state: StudyState;
    waveCount: number;
    participantCount: number;
  },
): string {
  const parts = [intl.formatMessage(STUDY_STATE_MESSAGES[study.state])];
  if (study.waveCount > 0) {
    parts.push(
      intl.formatMessage(studyCountMessages.waves, { count: study.waveCount }),
    );
  }
  if (study.participantCount > 0) {
    parts.push(
      intl.formatMessage(studyCountMessages.participants, {
        count: study.participantCount,
      }),
    );
  }
  return parts.join(' · ');
}
