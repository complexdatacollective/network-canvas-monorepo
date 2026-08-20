import { useId, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Form from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  createInitialNetwork,
  ProtocolField,
  type ProtocolFieldDefinition,
} from '@codaco/interview';
import {
  ComponentTypesKeys,
  type ComponentType,
  type StageSubject,
  VariableTypesKeys,
  type Variable,
} from '@codaco/protocol-validation';
import {
  getTypeForComponent,
  isOrdinalOrCategoricalType,
} from '~/config/variables';
import type { RootState } from '~/ducks/modules/root';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';
import { getProtocol } from '~/selectors/protocol';

import { completeRuleValues } from '../../Validations/ruleValue';
import { CREATE_NEW_VARIABLE_FIELD } from './withFieldsHandlers';

const PREVIEW_DRAFT_FIELDS = [
  'variable',
  CREATE_NEW_VARIABLE_FIELD,
  'prompt',
  'label',
  'hint',
  'showValidationHints',
  'component',
  'options',
  'parameters',
  'validation',
] as const;

type FieldEditorPreviewProps = {
  entity: 'node' | 'edge' | 'ego';
  type?: string | null;
  mode?: 'form' | 'composer';
  item?: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isComponentType = (value: unknown): value is ComponentType =>
  typeof value === 'string' &&
  ComponentTypesKeys.some((component) => component === value);

const isVariableType = (
  value: unknown,
): value is ProtocolFieldDefinition['type'] =>
  typeof value === 'string' && VariableTypesKeys.some((type) => type === value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNonEmptyString = (value: unknown): string | undefined => {
  const stringValue = asString(value)?.trim();
  return stringValue ? stringValue : undefined;
};

const passPreviewValidation = () => ({ success: true as const });

/**
 * Interactive participant-facing rendering of the field currently being
 * authored. This component reads the parent dialog's draft store, then mounts
 * the actual interview field in a separate form store so testing a response
 * cannot overwrite or submit the authoring form.
 */
const FieldEditorPreview = ({
  entity,
  type = null,
  mode = 'form',
  item = {},
}: FieldEditorPreviewProps) => {
  const headingId = useId();
  const liveValues = useFormValue(PREVIEW_DRAFT_FIELDS);
  const registeredFields = useFormStore((state) => state.fields);
  const dormantFields = useFormStore((state) => state.dormantValues);

  const draft = useMemo(() => {
    const values: Record<string, unknown> = { ...item };
    for (const name of PREVIEW_DRAFT_FIELDS) {
      if (registeredFields.has(name) || dormantFields.has(name)) {
        values[name] = liveValues[name];
      }
    }
    return values;
  }, [dormantFields, item, liveValues, registeredFields]);

  const subject = useMemo(
    () => ({ entity, type: type ?? undefined }),
    [entity, type],
  );
  const variables = useSelector((state: RootState) =>
    getVariablesForSubjectSelector(state, subject),
  );
  const protocol = useSelector(getProtocol);
  const network = useMemo(() => createInitialNetwork(), []);

  const variableId = asString(draft.variable);
  const createNewVariable = asString(draft[CREATE_NEW_VARIABLE_FIELD]);
  const codebookVariable: Variable | undefined = variableId
    ? variables[variableId]
    : undefined;
  const componentValue = asString(draft.component);
  const component = isComponentType(componentValue)
    ? componentValue
    : undefined;
  const inferredType = getTypeForComponent(component);
  const variableType = codebookVariable?.type ?? inferredType;

  const prompt = asNonEmptyString(draft.prompt);
  const authoredLabel = asNonEmptyString(draft.label);
  const label =
    mode === 'composer'
      ? (authoredLabel ??
        codebookVariable?.name ??
        asNonEmptyString(createNewVariable) ??
        variableId ??
        'Attribute label')
      : (prompt ?? 'Your question will appear here.');

  const stageSubject = useMemo<StageSubject | null>(() => {
    if (entity === 'ego') return { entity: 'ego' };
    if (!type) return null;
    return { entity, type };
  }, [entity, type]);

  const previewVariableId = variableId ?? createNewVariable ?? 'preview-field';
  const validationContext = useMemo(
    () =>
      protocol?.codebook && stageSubject
        ? {
            codebook: protocol.codebook,
            network,
            stageSubject,
            variableLabels: { [previewVariableId]: label },
          }
        : undefined,
    [label, network, previewVariableId, protocol?.codebook, stageSubject],
  );

  const field = useMemo<ProtocolFieldDefinition | null>(() => {
    if (!component || !isVariableType(variableType)) return null;

    // Categorical and ordinal controls require an options array. While a new
    // variable is being authored there is a valid intermediate state before
    // the first option is added; render an empty control instead of allowing
    // the participant preview to crash on `options.map`.
    const options = Array.isArray(draft.options)
      ? draft.options
      : isOrdinalOrCategoricalType(variableType)
        ? []
        : undefined;
    const validation = isRecord(draft.validation)
      ? completeRuleValues(draft.validation)
      : undefined;

    return {
      variable: previewVariableId,
      label,
      type: variableType,
      component,
      ...(asString(draft.hint) !== undefined && {
        hint: asString(draft.hint),
      }),
      ...(draft.showValidationHints === true && {
        showValidationHints: true,
      }),
      ...(options !== undefined && { options }),
      ...(isRecord(draft.parameters) && { parameters: draft.parameters }),
      ...(validation !== undefined && { validation }),
    };
  }, [component, draft, label, previewVariableId, variableType]);

  return (
    <section aria-labelledby={headingId}>
      <Heading id={headingId} level="h3" margin="none">
        Interactive preview
      </Heading>
      <Paragraph className="mt-2 max-w-[65ch]">
        Try the field as a participant. Use Check response to test its current
        validation rules.
      </Paragraph>
      {codebookVariable && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            When selecting an existing attribute, changes you make to the input
            control or validation options will also change other uses of this
            attribute.
          </AlertDescription>
        </Alert>
      )}
      <ThemedRegion theme="interview" className="mt-4 rounded-lg">
        <Surface noContainer spacing="lg" shadow="lg" className="min-h-80">
          {field ? (
            <Form
              key={`${field.type}:${field.component}`}
              onSubmit={passPreviewValidation}
            >
              <ProtocolField
                field={field}
                name="preview-value"
                validationContext={validationContext}
              />
              <div className="flex justify-end">
                <Button type="submit">Check response</Button>
              </div>
            </Form>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-center">
              <Paragraph className="max-w-[36ch]" margin="none">
                Select an attribute and input control to preview this field.
              </Paragraph>
            </div>
          )}
        </Surface>
      </ThemedRegion>
    </section>
  );
};

export default FieldEditorPreview;
