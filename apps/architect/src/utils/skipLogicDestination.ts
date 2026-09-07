import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const defaultIntl = createAppIntl({ locale: 'en' });

import type { SkipLogicDestination } from '@codaco/protocol-validation';
const localeMessages = defineMessages({
  next: {
    id: 'architect.skipDestination.next',
    defaultMessage: 'Next available stage',
    description:
      'Display of a skip-logic destination, preserving the authored stage label.',
  },
  finish: {
    id: 'architect.skipDestination.finish',
    defaultMessage: 'End interview',
    description:
      'Display of a skip-logic destination, preserving the authored stage label.',
  },
  unknown: {
    id: 'architect.skipDestination.unknown',
    defaultMessage: 'Unknown stage',
    description:
      'Display of a skip-logic destination, preserving the authored stage label.',
  },
  stage: {
    id: 'architect.skipDestination.stage',
    defaultMessage: 'Stage {position, number} — {label}',
    description:
      'Display of a skip-logic destination, preserving the authored stage label.',
  },
  untitled: {
    id: 'architect.skipDestination.untitled',
    defaultMessage: 'Untitled stage',
    description:
      'Display of a skip-logic destination, preserving the authored stage label.',
  },
});

type StageReference = {
  id: string;
  label: string;
};

export const getSkipLogicDestinationLabel = (
  stages: StageReference[],
  destination?: SkipLogicDestination,
  intl: IntlShape = defaultIntl,
) => {
  if (!destination) {
    return intl.formatMessage(localeMessages.next);
  }

  if (destination.type === 'finish') {
    return intl.formatMessage(localeMessages.finish);
  }

  const targetIndex = stages.findIndex(
    (stage) => stage.id === destination.stageId,
  );
  const target = stages[targetIndex];

  if (!target) {
    return intl.formatMessage(localeMessages.unknown);
  }

  return intl.formatMessage(localeMessages.stage, {
    position: targetIndex + 1,
    label: target.label || intl.formatMessage(localeMessages.untitled),
  });
};
