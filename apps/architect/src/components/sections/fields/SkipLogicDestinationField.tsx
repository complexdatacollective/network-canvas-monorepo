import {
  type IntlShape,
  createAppIntl,
  defineMessages,
} from '@codaco/app-i18n/messages';

const defaultIntl = createAppIntl({ locale: 'en' });

import { useAppIntl } from '@codaco/app-i18n/react';
import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import type { SkipLogicDestination } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import NativeSelect from '~/components/Form/Fields/NativeSelect';
const utilityMessages = defineMessages({
  nextAvailableStage: {
    id: 'architect.utility.sections.fields.skipLogicDestinationField.nextAvailableStage',
    defaultMessage: 'Next available stage',
    description:
      'The label text in components / sections / fields / SkipLogicDestinationField.',
  },
  stage: {
    id: 'architect.utility.sections.fields.skipLogicDestinationField.stage',
    defaultMessage: 'Stage {prospectiveStageNumber, number} — {value2}',
    description:
      'The label text in components / sections / fields / SkipLogicDestinationField.',
  },
  endTheInterview: {
    id: 'architect.utility.sections.fields.skipLogicDestinationField.endTheInterview',
    defaultMessage: 'End the interview',
    description:
      'The label text in components / sections / fields / SkipLogicDestinationField.',
  },
});
const messages = defineMessages({
  whenThisStageIsSkipped: {
    id: 'architect.sections.fields.skipLogicDestinationField.whenThisStageIsSkipped',
    defaultMessage: 'When this stage is skipped',
    description:
      'The label text in components / sections / fields / SkipLogicDestinationField.',
  },
  chooseWhereTheInterviewShouldContinue: {
    id: 'architect.sections.fields.skipLogicDestinationField.chooseWhereTheInterviewShouldContinue',
    defaultMessage:
      'Choose where the interview should continue. Only later stages can be selected.',
    description:
      'The hint text in components / sections / fields / SkipLogicDestinationField.',
  },
});
const finalMessages = defineMessages({
  untitledStage: {
    id: 'architect.final.components.sections.fields.SkipLogicDestinationField.untitledStage',
    defaultMessage: 'Untitled stage',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const NEXT_AVAILABLE_ROUTE = 'route:next';
const FINISH_ROUTE = 'route:finish';
const STAGE_ROUTE_PREFIX = 'route:stage:';

type StageOptionSource = {
  id: string;
  label: string;
};

type SkipLogicDestinationFieldProps = {
  stages: StageOptionSource[];
  stagePosition: number;
  isNewStage: boolean;
  /**
   * Seeded by the caller (which owns the stage-form context) so this stays a
   * plain field component, usable outside a stage form.
   */
  initialValue?: SkipLogicDestination;
};

export const formatSkipLogicDestination = (value: unknown): string => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return NEXT_AVAILABLE_ROUTE;
  }

  if (value.type === 'finish') {
    return FINISH_ROUTE;
  }

  if (
    value.type === 'stage' &&
    'stageId' in value &&
    typeof value.stageId === 'string'
  ) {
    return `${STAGE_ROUTE_PREFIX}${value.stageId}`;
  }

  return NEXT_AVAILABLE_ROUTE;
};

export const parseSkipLogicDestination = (
  value: unknown,
): SkipLogicDestination | undefined => {
  if (value === FINISH_ROUTE) {
    return { type: 'finish' };
  }

  if (typeof value === 'string' && value.startsWith(STAGE_ROUTE_PREFIX)) {
    const stageId = value.slice(STAGE_ROUTE_PREFIX.length);
    return stageId ? { type: 'stage', stageId } : undefined;
  }

  return undefined;
};

export const buildSkipLogicDestinationOptions = (
  stages: StageOptionSource[],
  stagePosition: number,
  isNewStage: boolean,
  intl: IntlShape = defaultIntl,
) => {
  const options: Array<{ value: string; label: string }> = [
    {
      value: NEXT_AVAILABLE_ROUTE,
      label: intl.formatMessage(utilityMessages.nextAvailableStage),
    },
  ];

  stages.forEach((stage, index) => {
    const isLaterStage = isNewStage
      ? index >= stagePosition
      : index > stagePosition;

    if (!isLaterStage) {
      return;
    }

    const prospectiveStageNumber = index + 1 + (isNewStage ? 1 : 0);
    options.push({
      value: `${STAGE_ROUTE_PREFIX}${stage.id}`,
      label: intl.formatMessage(utilityMessages.stage, {
        prospectiveStageNumber: prospectiveStageNumber,
        value2: stage.label || intl.formatMessage(finalMessages.untitledStage),
      }),
    });
  });

  options.push({
    value: FINISH_ROUTE,
    label: intl.formatMessage(utilityMessages.endTheInterview),
  });

  return options;
};

type DestinationSelectProps = CreateFormFieldProps<
  SkipLogicDestination,
  'div',
  { options: Array<{ value: string; label: string }> }
>;

/**
 * Protocol state stores a destination object, while NativeSelect speaks route
 * strings. Keep that representation boundary here so the shared select stays
 * a normal string field and the stage form never contains UI-only route IDs.
 */
const DestinationSelect = ({
  value,
  onChange,
  ...props
}: DestinationSelectProps) => (
  <NativeSelect
    {...props}
    value={formatSkipLogicDestination(value)}
    onChange={(nextValue) => onChange?.(parseSkipLogicDestination(nextValue))}
  />
);

const SkipLogicDestinationField = ({
  stages,
  stagePosition,
  isNewStage,
  initialValue,
}: SkipLogicDestinationFieldProps) => {
  const intl = useAppIntl();
  return (
    <ArchitectField
      name="skipLogic.destination"
      label={intl.formatMessage(messages.whenThisStageIsSkipped)}
      hint={intl.formatMessage(messages.chooseWhereTheInterviewShouldContinue)}
      component={DestinationSelect}
      initialValue={initialValue}
      options={buildSkipLogicDestinationOptions(
        stages,
        stagePosition,
        isNewStage,
        intl,
      )}
    />
  );
};

export default SkipLogicDestinationField;
