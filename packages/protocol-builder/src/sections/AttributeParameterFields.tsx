import { useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import Section from '@codaco/fresco-ui/Section';

import { variableParametersMessages } from '../codebook/codebookMessages.ts';
import {
  hasParameterIssues,
  type ParameterShape,
  parameterShapeFor,
  readParameters,
  validateParameters,
} from '../codebook/variableParameters.ts';
import ComposerParametersField from '../fields/ComposerParametersField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { useDraftThatFollowsTheAttribute } from './AttributeValueFields.tsx';

export const ATTRIBUTE_PARAMETERS_FIELD = '_parameters';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type AttributeParameterFieldsProps = Readonly<{
  subject: CodebookSubject | undefined;
  variableId: string | undefined;
  rowComponent: unknown;
  invented?: string;
}>;

export default function AttributeParameterFields({
  subject,
  variableId,
  rowComponent,
  invented,
}: AttributeParameterFieldsProps) {
  const intl = useAppIntl();
  const { readOnly } = useStageEditorForm();
  const protocolContext = useProtocolContext();

  const picked = useMemo(
    () =>
      subject === undefined || variableId === undefined || variableId === ''
        ? undefined
        : variablesForSubject(protocolContext, subject)[variableId],
    [protocolContext, subject, variableId],
  );
  const heldParameters =
    picked === undefined ? undefined : Reflect.get(picked, 'parameters');

  useDraftThatFollowsTheAttribute(
    ATTRIBUTE_PARAMETERS_FIELD,
    invented === undefined
      ? `attribute:${variableId ?? ''}`
      : `invented:${invented}`,
    invented === undefined && isRecord(heldParameters)
      ? heldParameters
      : undefined,
    invented !== undefined ||
      variableId === undefined ||
      variableId === '' ||
      picked !== undefined,
  );

  const shape: ParameterShape | null =
    invented === undefined
      ? picked === undefined
        ? null
        : parameterShapeFor(picked.type, rowComponent)
      : parameterShapeFor(invented, rowComponent);

  const judgedShape = useRef(shape);
  judgedShape.current = shape;
  const validation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => {
          const liveShape = judgedShape.current;
          if (liveShape === null) return undefined;
          const issues = validateParameters(liveShape, readParameters(value));
          return hasParameterIssues(issues)
            ? Object.values(issues).flat()[0]
            : undefined;
        },
      ]),
    }),
    [],
  );

  if (shape === null) return null;

  return (
    <Section
      title={intl.formatMessage(variableParametersMessages.parametersLegend)}
      description={intl.formatMessage(
        variableParametersMessages.parametersHint,
      )}
    >
      <Field<typeof ComposerParametersField>
        key={invented === undefined ? variableId : `invented:${invented}`}
        name={ATTRIBUTE_PARAMETERS_FIELD}
        component={ComposerParametersField}
        label={intl.formatMessage(variableParametersMessages.parametersLegend)}
        labelHidden
        shape={shape}
        initialValue={
          invented === undefined && isRecord(heldParameters)
            ? heldParameters
            : undefined
        }
        readOnly={readOnly}
        {...validation}
      />
    </Section>
  );
}
