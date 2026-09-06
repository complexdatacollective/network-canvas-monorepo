import { type ComponentType, useCallback, useMemo, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import { useCreateCodebookVariable } from '../codebook/useCodebookVariableEdits.ts';
import {
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
  buildExclusiveVariableSlotMap,
  hasValidatedUse,
} from '../codebook/variableRoles.ts';
import { draftFormFieldVariableIds } from '../codebook/variableValidation.ts';
import RichTextField from '../fields/RichTextField.tsx';
import { withoutAbsentValues } from '../form/absentValues.ts';
import AssignAttributes, {
  committedAttributeVariableIds,
  makeAssignAttributesValidation,
  type AttributeValue,
  type VariableOption,
} from '../form/arrayFields/AssignAttributes.tsx';
import ProtocolArrayField from '../form/ProtocolArrayField.tsx';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import { variablesForSubject } from '../protocol-context.ts';
import { CreatableVariablePickerControl } from './CreatableVariablePicker.tsx';
import PromptsSection from './PromptsSection.tsx';
import type { RowEditorProps, RowPreviewProps } from './rowRenderers.tsx';
import { useStageSubject } from './useStageSubject.ts';

/**
 * Stable identities for the empty cases: `initialValue` is a dependency of the
 * effect that registers a field, so a fresh `[]` per render re-registers it.
 */
const NO_ATTRIBUTES: AttributeValue[] = [];
const NO_OPTIONS: VariableOption[] = [];
const NO_VARIABLES: ReadonlySet<string> = new Set();

// The picker is handed to the rows as an open-record renderer, because a row
// knows nothing about what any control takes. Adapted once, here.
const VariablePicker = CreatableVariablePickerControl as ComponentType<
  Record<string, unknown>
>;

/**
 * What a stamp writes, so what an attribute invented for one has to be.
 *
 * The interview sets the configured value on the node as it is created, with
 * nobody to answer anything — so a stamp is a flag, and the researcher is
 * asked only for its name. `Toggle` is how the codebook editors offer a
 * boolean, and an attribute created here has to read the same way there.
 */
const STAMP_TYPE = 'boolean';
const STAMP_COMPONENT = 'Toggle';

const messages = defineMessages({
  promptGroupTitle: {
    id: 'protocolBuilder.nameGeneratorPrompts.promptGroupTitle',
    defaultMessage: 'Participant prompt',
    description:
      'Heading of the first half of the dialog for one name-generator prompt, holding the question the participant reads. A prompt is one question a participant is asked.',
  },
  promptGroupDescription: {
    id: 'protocolBuilder.nameGeneratorPrompts.promptGroupDescription',
    defaultMessage: 'Write the question this prompt asks the participant.',
    description:
      'Description of the first half of the dialog for one name-generator prompt.',
  },
  textLabel: {
    id: 'protocolBuilder.nameGeneratorPrompts.textLabel',
    defaultMessage: 'Prompt text',
    description:
      'Label of the box holding the question one name-generator prompt asks the participant.',
  },
  textHint: {
    id: 'protocolBuilder.nameGeneratorPrompts.textHint',
    defaultMessage:
      'Shown to the participant while they name people. Supports markdown formatting.',
    description:
      'Guidance under the prompt-text box. Markdown is the name of a text formatting syntax and is not translated.',
  },
  textPlaceholder: {
    id: 'protocolBuilder.nameGeneratorPrompts.textPlaceholder',
    defaultMessage: 'Who are the people you know?',
    description:
      'Example shown in the empty prompt-text box. Written as a participant would read it, because that is who reads the prompt.',
  },
  textRequired: {
    id: 'protocolBuilder.nameGeneratorPrompts.textRequired',
    defaultMessage: 'Write the question this prompt asks.',
    description:
      'Refusal shown when a researcher saves a name-generator prompt with no question in it.',
  },
  attributesGroupTitle: {
    id: 'protocolBuilder.nameGeneratorPrompts.attributesGroupTitle',
    defaultMessage: 'Additional attributes',
    description:
      'Heading of the second half of the dialog for one name-generator prompt, holding the fixed values given to everyone named under it.',
  },
  attributesGroupDescription: {
    id: 'protocolBuilder.nameGeneratorPrompts.attributesGroupDescription',
    defaultMessage:
      'Give every person named on this prompt a fixed value, so later stages can ask about them.',
    description:
      'Description of the additional-attributes half of the name-generator prompt dialog. A stage is one step of an interview.',
  },
  assignmentsLabel: {
    id: 'protocolBuilder.nameGeneratorPrompts.assignmentsLabel',
    defaultMessage: 'Attribute assignments',
    description:
      'Label of the list pairing an attribute with the fixed value everyone named on this prompt is given.',
  },
  assignmentsHint: {
    id: 'protocolBuilder.nameGeneratorPrompts.assignmentsHint',
    defaultMessage: 'Use these values in skip logic or in a stage’s filter.',
    description:
      'Guidance under the attribute-assignments list, naming the two places a later stage can read the assigned values. Skip logic decides whether a stage runs at all; a filter decides what reaches it.',
  },
  stampSummary: {
    id: 'protocolBuilder.nameGeneratorPrompts.stampSummary',
    defaultMessage:
      '{count, plural, one {Assigns # additional attribute.} other {Assigns # additional attributes.}}',
    description:
      'One line summarising a name-generator prompt in the list beneath its question, saying how many fixed values it gives everyone named on it. Shown only when there is at least one.',
  },
});

const WRITE_THE_QUESTION = createMessageError(messages.textRequired);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asAttributes = (value: unknown): AttributeValue[] =>
  Array.isArray(value)
    ? value.flatMap((row) =>
        typeof row === 'object' && row !== null
          ? [
              {
                ...(typeof Reflect.get(row, 'variable') === 'string'
                  ? { variable: Reflect.get(row, 'variable') as string }
                  : {}),
                ...(typeof Reflect.get(row, 'value') === 'boolean'
                  ? { value: Reflect.get(row, 'value') as boolean }
                  : {}),
              },
            ]
          : [],
      )
    : NO_ATTRIBUTES;

/**
 * What one name-generator prompt asks, and what it stamps on what it creates.
 *
 * Rendered inside the shared prompt list's row dialog, so its controls are
 * ordinary connected fields of THAT form: the row is committed as a whole when
 * the dialog saves, and no cell of it is ever registered on the stage.
 */
function NameGeneratorPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();

  return (
    <>
      <Section
        title={intl.formatMessage(messages.promptGroupTitle)}
        description={intl.formatMessage(messages.promptGroupDescription)}
      >
        <Field<typeof RichTextField>
          name="text"
          component={RichTextField}
          label={intl.formatMessage(messages.textLabel)}
          hint={intl.formatMessage(messages.textHint)}
          placeholder={intl.formatMessage(messages.textPlaceholder)}
          singleLine
          initialValue={asString(item.text)}
          required={WRITE_THE_QUESTION}
        />
      </Section>
      <AdditionalAttributes item={item} />
    </>
  );
}

/**
 * The fixed values every person named on this prompt is given.
 *
 * A stamp is an UNVALIDATED writer — the interview writes the configured
 * boolean straight onto the node — so the pool excludes any attribute a form
 * collects, whether that form is saved elsewhere in the protocol or is this
 * stage's own unsaved one. Reselecting what the prompt already saved is never
 * a new contradiction, which is what the committed-pick set escapes.
 */
function AdditionalAttributes({
  item,
}: Readonly<{ item: RowEditorProps['item'] }>) {
  const intl = useAppIntl();
  const { protocolContext, identity } = useStageEditorForm();
  const subject = useStageSubject('node');
  const committed = useMemo(
    () => asAttributes(item.additionalAttributes),
    [item.additionalAttributes],
  );
  const committedVariableIds = useMemo(
    () => committedAttributeVariableIds(committed),
    [committed],
  );

  // The stage's LIVE form fields, read from the stage form rather than this
  // dialog's: an attribute a not-yet-saved form field already collects must
  // not be offered here either.
  const draftFormFields = useStageValue('form.fields');
  const draftValidatedVariables = useMemo(
    () =>
      draftFormFields === undefined
        ? NO_VARIABLES
        : draftFormFieldVariableIds(draftFormFields),
    [draftFormFields],
  );

  // The role map excludes the stage being edited: this form's own unsaved
  // fields are the authority on what this stage collects, and the saved copy
  // of them is stale the moment editing begins.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const slotMap = useMemo(
    () => buildExclusiveVariableSlotMap(protocolContext),
    [protocolContext],
  );
  const allVariables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const variableOptions = useMemo(() => {
    if (subject === undefined) return NO_OPTIONS;
    const committedPicks = [...committedVariableIds];
    const pool = Object.entries(allVariables).map(([value, variable]) => ({
      value,
      label: variable.name,
      type: variable.type,
    }));
    // Also drops an attribute an interface derives from the structure a
    // participant builds — a Family Pedigree's participant marker is a boolean
    // like any other, and stamping it here would put several people in one
    // family.
    return excludeInterfaceOwned(
      slotMap,
      subject,
      excludeValidatedUses(roleMap, subject, pool, committedPicks),
      committedPicks,
    ).filter(
      ({ value }) =>
        !draftValidatedVariables.has(value) || committedVariableIds.has(value),
    );
  }, [
    allVariables,
    committedVariableIds,
    draftValidatedVariables,
    roleMap,
    slotMap,
    subject,
  ]);

  // Answered as a variable id, or as nothing at all: the row commits its own
  // `variable` cell only when the codebook write actually landed, so a refusal
  // leaves the row naming nothing rather than an attribute that does not
  // exist. The refusal is kept and shown, because the row cannot carry one —
  // it is handed a variable id or nothing — and a create that silently did
  // nothing would leave the researcher pressing the button again.
  const createVariable = useCreateCodebookVariable(subject);
  const [createProblem, setCreateProblem] = useState<string | undefined>(
    undefined,
  );
  const createStampVariable = useCallback(
    async (variableName: string) => {
      const outcome = await createVariable({
        name: variableName,
        type: STAMP_TYPE,
        component: STAMP_COMPONENT,
      });
      if (outcome.status === 'refused') {
        setCreateProblem(outcome.message);
        return undefined;
      }
      setCreateProblem(undefined);
      return outcome.variableId;
    },
    [createVariable],
  );

  const validation = useMemo(
    () =>
      makeAssignAttributesValidation({
        allVariables,
        committedVariableIds,
        draftValidatedVariables,
        hasValidatedUseElsewhere: (variableId) =>
          subject !== undefined &&
          hasValidatedUse(roleMap, subject, variableId),
      }),
    [
      allVariables,
      committedVariableIds,
      draftValidatedVariables,
      roleMap,
      subject,
    ],
  );

  // With no node type there is no pool to pick from and nothing to validate.
  // Mounting the field anyway would register `additionalAttributes` on prompts
  // that never had it and — through the dialog's whole-row save — write an
  // empty key onto them.
  if (subject === undefined) return null;

  return (
    <Section
      title={intl.formatMessage(messages.attributesGroupTitle)}
      description={intl.formatMessage(messages.attributesGroupDescription)}
    >
      {/*
        A `ProtocolArrayField` rather than a plain one, even inside a dialog:
        it is what tells this list it is NOT bound to a document key. The
        prompt list around it is, and its binding reaches here through React
        context — so a plain field would commit "add a row" straight into the
        stage's `prompts` array while the researcher is still editing one
        prompt of it.
      */}
      <ProtocolArrayField<typeof AssignAttributes>
        name="additionalAttributes"
        component={AssignAttributes}
        label={intl.formatMessage(messages.assignmentsLabel)}
        hint={intl.formatMessage(messages.assignmentsHint)}
        initialValue={committed}
        subject={subject}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        onCreateVariable={createStampVariable}
        draftValidatedVariables={draftValidatedVariables}
        committedVariableIds={committedVariableIds}
        // The rows' own rules are display-only (see `RowField`), so the
        // blocking counterparts have to exist here or the dialog saves exactly
        // what it has just refused in red.
        custom={validation.custom}
      />
      {createProblem !== undefined && (
        <Alert variant="destructive" className="my-7">
          <AlertDescription>{createProblem}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

/** How one prompt reads in the list when its dialog is closed. */
function NameGeneratorPromptPreview({ item }: RowPreviewProps) {
  const intl = useAppIntl();
  const text = asString(item.text);
  const stamps = asAttributes(item.additionalAttributes).length;

  return (
    <div className="flex flex-col gap-2">
      <RenderMarkdown render={<div />}>{text ?? ''}</RenderMarkdown>
      {stamps > 0 && (
        <p className="text-sm text-current/70">
          {intl.formatMessage(messages.stampSummary, { count: stamps })}
        </p>
      )}
    </div>
  );
}

/**
 * A prompt that stamps nothing carries no `additionalAttributes` key at all.
 *
 * The list field is mounted for every prompt, so a prompt the researcher never
 * assigned anything on still submits an empty array — and the shared row
 * normaliser keeps empty arrays on purpose. Written through, every prompt in
 * the protocol would grow a key saying "assigns nothing", which is what its
 * absence already says.
 */
const normalizeNameGeneratorPrompt = (row: unknown): unknown => {
  const cleaned = withoutAbsentValues(row);
  if (typeof cleaned !== 'object' || cleaned === null) return cleaned;
  const attributes = Reflect.get(cleaned, 'additionalAttributes');
  if (!Array.isArray(attributes) || attributes.length > 0) return cleaned;
  const { additionalAttributes: _empty, ...rest } = cleaned as Record<
    string,
    unknown
  >;
  return rest;
};

/**
 * The questions a name generator asks.
 *
 * The list, its ordering, its row identity and its "a stage must ask
 * something" rule all belong to the shared `PromptsSection`; what a name
 * generator's prompts SAY — the question, and the values it stamps on the
 * people named under it — is what this adds. Shared by NameGenerator,
 * NameGeneratorQuickAdd and NameGeneratorRoster, whose prompts are the same
 * shape in the schema.
 */
export default function NameGeneratorPromptsSection() {
  return (
    <PromptsSection
      PromptEditor={NameGeneratorPromptEditor}
      PromptPreview={NameGeneratorPromptPreview}
      normalizeRow={normalizeNameGeneratorPrompt}
    />
  );
}
