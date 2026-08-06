import type { CreateFormFieldProps } from '@codaco/fresco-ui/form/Field/types';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import type { SkipLogicDestination } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';

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
) => {
  const options: Array<{ value: string; label: string }> = [
    { value: NEXT_AVAILABLE_ROUTE, label: 'Next available stage' },
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
      label: `Stage ${prospectiveStageNumber} — ${stage.label || 'Untitled stage'}`,
    });
  });

  options.push({ value: FINISH_ROUTE, label: 'End the interview' });

  return options;
};

type DestinationSelectProps = CreateFormFieldProps<
  SkipLogicDestination,
  'div',
  { options: Array<{ value: string; label: string }> }
>;

/**
 * The stored value is a destination object; the control speaks route strings.
 * This field bridges the two — the fresco-ui form store has no
 * `format`/`parse` hook of its own.
 */
const DestinationSelect = ({
  value,
  onChange,
  ...props
}: DestinationSelectProps) => (
  <StyledSelectField
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
  return (
    <ArchitectField
      name="skipLogic.destination"
      label="When this stage is skipped"
      hint="Choose where the interview should continue. Only later stages can be selected."
      component={DestinationSelect}
      initialValue={initialValue}
      options={buildSkipLogicDestinationOptions(
        stages,
        stagePosition,
        isNewStage,
      )}
    />
  );
};

export default SkipLogicDestinationField;
