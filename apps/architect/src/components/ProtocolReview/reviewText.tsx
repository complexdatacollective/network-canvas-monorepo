import { Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';

import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import type {
  FindingCategory,
  FindingSeverity,
} from '@codaco/protocol-review-worker/contract';
import type { FindingLocation, FixPlace } from '~/protocolReview/describeFix';
import { cx } from '~/utils/cva';

/**
 * Words and small pieces shared by every part of the protocol review: the
 * popover, the one-problem dialog and its summary.
 */

const severityMessages = defineMessages({
  serious: {
    id: 'architect.protocolReview.severity.serious',
    defaultMessage: 'Serious',
    description:
      'How serious a problem the automated protocol review found is: the most serious of three levels. Shown beside the problem’s title in the review results.',
  },
  worth_fixing: {
    id: 'architect.protocolReview.severity.worthFixing',
    defaultMessage: 'Worth fixing',
    description:
      'How serious a problem the automated protocol review found is: the middle of three levels. Shown beside the problem’s title in the review results.',
  },
  suggestion: {
    id: 'architect.protocolReview.severity.suggestion',
    defaultMessage: 'Suggestion',
    description:
      'How serious a problem the automated protocol review found is: the least serious of three levels, an idea rather than a fault. Shown beside the problem’s title in the review results.',
  },
});

export const severityMessage = (severity: FindingSeverity): MessageDescriptor =>
  severityMessages[severity];

const categoryMessages = defineMessages({
  research_fit: {
    id: 'architect.protocolReview.category.researchFit',
    defaultMessage: 'Research questions',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: whether the interview answers the researcher’s research questions. Shown as a label on one problem.',
  },
  structure: {
    id: 'architect.protocolReview.category.structure',
    defaultMessage: 'Structure',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: the order and kinds of stages in the interview. Shown as a label on one problem.',
  },
  entities: {
    id: 'architect.protocolReview.category.entities',
    defaultMessage: 'Node and edge types',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: the node and edge types of the codebook. "Node" and "edge" are Network Canvas terms for people (or things) and the connections between them, as Architect names them elsewhere. Shown as a label on one problem.',
  },
  attributes_and_forms: {
    id: 'architect.protocolReview.category.attributesAndForms',
    defaultMessage: 'Attributes and forms',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: the variables recorded and the forms that ask for them. Shown as a label on one problem.',
  },
  skip_logic: {
    id: 'architect.protocolReview.category.skipLogic',
    defaultMessage: 'Skip logic and filters',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: rules that skip stages or filter who appears on them. Shown as a label on one problem.',
  },
  wording: {
    id: 'architect.protocolReview.category.wording',
    defaultMessage: 'Wording',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: how prompts and instructions are worded. Shown as a label on one problem.',
  },
  burden: {
    id: 'architect.protocolReview.category.burden',
    defaultMessage: 'Participant burden',
    description:
      'Which part of the study design a problem found by the automated protocol review is about: how long or tiring the interview is for participants. Shown as a label on one problem.',
  },
});

export const categoryMessage = (category: FindingCategory): MessageDescriptor =>
  categoryMessages[category];

const locationMessages = defineMessages({
  stage: {
    id: 'architect.protocolReview.location.stage',
    defaultMessage: 'Stage {position, number} · {label}',
    description:
      'Where in the protocol a problem found by the automated protocol review is: one stage. {position} is the stage’s number on the Stages screen; {label} is the stage’s name as the researcher wrote it. The dot is a separator.',
  },
  codebookType: {
    id: 'architect.protocolReview.location.codebookType',
    defaultMessage: 'Codebook · {typeName}',
    description:
      'Where in the protocol a problem found by the automated protocol review is: one node or edge type in the codebook. {typeName} is the type’s name as the researcher wrote it. "Codebook" is the name of a page in Architect. The dot is a separator.',
  },
  codebookEgo: {
    id: 'architect.protocolReview.location.codebookEgo',
    defaultMessage: 'Codebook · Ego',
    description:
      'Where in the protocol a problem found by the automated protocol review is: the variables about the participant themselves ("Ego", as the Codebook page names them). "Codebook" is the name of a page in Architect. The dot is a separator.',
  },
  codebook: {
    id: 'architect.protocolReview.location.codebook',
    defaultMessage: 'Codebook',
    description:
      'Where in the protocol a problem found by the automated protocol review is: the codebook as a whole. "Codebook" is the name of a page in Architect.',
  },
  protocol: {
    id: 'architect.protocolReview.location.protocol',
    defaultMessage: 'Whole protocol',
    description:
      'Where in the protocol a problem found by the automated protocol review is: no one stage or type, but the protocol as a whole.',
  },
  openStage: {
    id: 'architect.protocolReview.location.openStage',
    defaultMessage: 'Open stage {position, number}',
    description:
      'Link from a problem found by the automated protocol review to the stage it is about, which the researcher will fix themselves. {position} is the stage’s number on the Stages screen.',
  },
  openStages: {
    id: 'architect.protocolReview.location.openStages',
    defaultMessage: 'Open stages',
    description:
      'Link from a problem found by the automated protocol review to the Stages screen, where the researcher will add, remove or reorder stages to fix it themselves. "Stages" is the name of that screen in Architect.',
  },
  openCodebook: {
    id: 'architect.protocolReview.location.openCodebook',
    defaultMessage: 'Open codebook',
    description:
      'Link from a problem found by the automated protocol review to the Codebook page, where the researcher will fix it themselves.',
  },
});

/** Where a problem is, as one line ("Stage 10 · Who knows whom"). */
export const formatLocation = (
  intl: IntlShape,
  location: FindingLocation,
): string => {
  if (location.kind === 'stage') {
    return intl.formatMessage(locationMessages.stage, {
      position: location.position,
      label: location.label,
    });
  }
  if (location.kind === 'codebook') {
    if (location.typeName !== null) {
      return intl.formatMessage(locationMessages.codebookType, {
        typeName: location.typeName,
      });
    }
    return intl.formatMessage(
      location.entity === 'ego'
        ? locationMessages.codebookEgo
        : locationMessages.codebook,
    );
  }
  return intl.formatMessage(locationMessages.protocol);
};

/**
 * The words of a link to a place in the protocol, such as where a problem
 * would be fixed; null when it has nowhere to go.
 */
export const formatLocationLink = (
  intl: IntlShape,
  location: FixPlace,
): { href: string; label: string } | null => {
  if (location.kind === 'stages') {
    return {
      href: location.href,
      label: intl.formatMessage(locationMessages.openStages),
    };
  }
  if (location.kind === 'stage') {
    return {
      href: location.href,
      label: intl.formatMessage(locationMessages.openStage, {
        position: location.position,
      }),
    };
  }
  if (location.kind === 'codebook') {
    return {
      href: location.href,
      label: intl.formatMessage(locationMessages.openCodebook),
    };
  }
  return null;
};

const severityIcons: Record<
  FindingSeverity,
  ComponentType<{ 'className'?: string; 'aria-hidden'?: boolean }>
> = {
  serious: OctagonAlert,
  worth_fixing: TriangleAlert,
  suggestion: Lightbulb,
};

const severityTones: Record<FindingSeverity, string> = {
  serious: 'bg-destructive text-destructive-contrast',
  worth_fixing: 'bg-warning text-warning-contrast',
  suggestion: 'bg-info text-info-contrast',
};

/**
 * A problem's severity as a round icon. Decorative: the severity is always
 * written out beside it, so colour and shape are never all there is to go on.
 */
export const SeverityIcon = ({
  severity,
  className,
}: {
  severity: FindingSeverity;
  className?: string;
}) => {
  const Icon = severityIcons[severity];
  return (
    <span
      aria-hidden
      className={cx(
        'flex size-8 shrink-0 items-center justify-center rounded-full',
        severityTones[severity],
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
};

/** A problem's severity as a filled label with its icon. */
export const SeverityLabel = ({
  severity,
  children,
}: {
  severity: FindingSeverity;
  children: ReactNode;
}) => {
  const Icon = severityIcons[severity];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-sm font-bold',
        severityTones[severity],
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </span>
  );
};

type CalendarDay = 'today' | 'yesterday' | 'tomorrow' | 'other';

const startOfDay = (time: number) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Which calendar day `time` falls on, seen from `now`, in local time. */
const calendarDay = (time: number, now: number): CalendarDay => {
  const days = Math.round((startOfDay(time) - startOfDay(now)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === -1) return 'yesterday';
  if (days === 1) return 'tomorrow';
  return 'other';
};

const whenMessages = defineMessages({
  when: {
    id: 'architect.protocolReview.when',
    defaultMessage:
      '{day, select, today {today at {time}} yesterday {yesterday at {time}} tomorrow {tomorrow at {time}} other {{date} at {time}}}',
    description:
      'A moment, said relative to today, used inside other protocol review sentences such as "Reviewed {when}" and "You can review again {when}". The sentence around it adds no "at" or "on" of its own. {time} is a time of day and {date} a date, both already formatted for the reader’s language. Keep the four cases (today, yesterday, tomorrow, other) as they are; translate only the words inside them.',
  },
});

/** A moment as "today at 14:32", "tomorrow at 14:32" or "12/11/2026 at 14:32". */
export const formatWhen = (
  intl: IntlShape,
  time: number,
  now: number,
): string =>
  intl.formatMessage(whenMessages.when, {
    day: calendarDay(time, now),
    time: intl.formatTime(time, { hour: 'numeric', minute: '2-digit' }),
    date: intl.formatDate(time, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
  });
