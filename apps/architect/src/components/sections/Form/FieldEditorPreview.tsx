import { useId, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Form from '@codaco/fresco-ui/form/Form';
import {
  useFormHasValue,
  useFormValue,
} from '@codaco/fresco-ui/form/hooks/useFormValue';
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
const messages = defineMessages({
  interactivePreview: {
    id: 'architect.sections.form.fieldEditorPreview.interactivePreview',
    defaultMessage: 'Interactive preview',
    description:
      'Visible text in components / sections / Form / FieldEditorPreview.',
  },
  tryTheFieldAsAParticipant: {
    id: 'architect.sections.form.fieldEditorPreview.tryTheFieldAsAParticipant',
    defaultMessage:
      'Try the field as a participant. Use Check response to test its current validation rules.',
    description:
      'Visible text in components / sections / Form / FieldEditorPreview.',
  },
  whenSelectingAnExistingAttributeChanges: {
    id: 'architect.sections.form.fieldEditorPreview.whenSelectingAnExistingAttributeChanges',
    defaultMessage:
      'When selecting an existing attribute, changes you make to the input control or validation options will also change other uses of this attribute.',
    description:
      'Visible text in components / sections / Form / FieldEditorPreview.',
  },
  checkResponse: {
    id: 'architect.sections.form.fieldEditorPreview.checkResponse',
    defaultMessage: 'Check response',
    description:
      'Visible text in components / sections / Form / FieldEditorPreview.',
  },
  selectAnAttributeAndInputControl: {
    id: 'architect.sections.form.fieldEditorPreview.selectAnAttributeAndInputControl',
    defaultMessage:
      'Select an attribute and input control to preview this field.',
    description:
      'Visible text in components / sections / Form / FieldEditorPreview.',
  },
});
const finalMessages = defineMessages({
  attribute: {
    id: 'architect.final.components.sections.Form.FieldEditorPreview.attribute',
    defaultMessage: 'Attribute label',
    description: 'Researcher-facing Architect control or feedback.',
  },
  question: {
    id: 'architect.final.components.sections.Form.FieldEditorPreview.question',
    defaultMessage: 'Your question will appear here.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

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
  const intl = useAppIntl();
  const headingId = useId();
  const liveValues = useFormValue(PREVIEW_DRAFT_FIELDS);
  // A field the form has not registered yet has no live value to show — the
  // dialog opens before its sections mount — so the committed `item` stands
  // until it does. This is what separates that from a field the researcher has
  // deliberately emptied, for the leaves and for `parameters` alike: the latter
  // is a container the form only ever holds as a tree of leaves
  // (`parameters.type`, `parameters.min`, …).
  const hasLiveValue = useFormHasValue(PREVIEW_DRAFT_FIELDS);

  const draft = useMemo(() => {
    const values: Record<string, unknown> = { ...item };
    for (const name of PREVIEW_DRAFT_FIELDS) {
      if (hasLiveValue[name]) values[name] = liveValues[name];
    }
    return values;
  }, [hasLiveValue, item, liveValues]);

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
        intl.formatMessage(finalMessages.attribute))
      : (prompt ?? intl.formatMessage(finalMessages.question));

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
        {intl.formatMessage(messages.interactivePreview)}
      </Heading>
      <Paragraph className="mt-2 max-w-[65ch]">
        {intl.formatMessage(messages.tryTheFieldAsAParticipant)}
      </Paragraph>
      {codebookVariable && (
        <Alert variant="info" className="mt-4">
          <AlertDescription>
            {intl.formatMessage(
              messages.whenSelectingAnExistingAttributeChanges,
            )}
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
                <Button type="submit">
                  {intl.formatMessage(messages.checkResponse)}
                </Button>
              </div>
            </Form>
          ) : (
            <div className="flex min-h-56 items-center justify-center text-center">
              <Paragraph className="max-w-[36ch]" margin="none">
                {intl.formatMessage(messages.selectAnAttributeAndInputControl)}
              </Paragraph>
            </div>
          )}
        </Surface>
      </ThemedRegion>
    </section>
  );
};

export default FieldEditorPreview;
