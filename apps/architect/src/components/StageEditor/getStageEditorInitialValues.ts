import type { Stage, StageType } from '@codaco/protocol-validation';

type GetStageEditorInitialValuesOptions = {
  interfaceType: StageType;
  stage?: Stage | null;
  template: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getStageEditorInitialValues = ({
  interfaceType,
  stage,
  template,
}: GetStageEditorInitialValuesOptions): Record<string, unknown> => {
  const values = stage ?? { ...template, type: interfaceType };

  if (interfaceType !== 'Sociogram') {
    return values;
  }

  const sociogramValues: Record<string, unknown> = { ...values };
  const background = isRecord(sociogramValues.background)
    ? sociogramValues.background
    : {};

  // The concentric-circles editor renders an optional toggle whose established
  // form default is `false`. Include that default in redux-form's initial
  // values so mounting the field does not look like a user edit. Image-backed
  // Sociograms do not render the toggle, so their persisted shape stays intact.
  if (background.image || typeof background.skewedTowardCenter === 'boolean') {
    return sociogramValues;
  }

  return {
    ...sociogramValues,
    background: {
      ...background,
      skewedTowardCenter: false,
    },
  };
};
