import { type ComponentType, useMemo } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Section from '@codaco/fresco-ui/Section';

import {
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
  buildExclusiveVariableSlotMap,
  hasValidatedUse,
} from '../codebook/variableRoles.ts';
import { draftFormFieldVariableIds } from '../codebook/variableValidation.ts';
import RichTextField from '../fields/RichTextField.tsx';
import { VariablePickerControl } from '../fields/VariablePicker.tsx';
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
import PromptsSection, { type PromptsCopy } from './PromptsSection.tsx';
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
const VariablePicker = VariablePickerControl as ComponentType<
  Record<string, unknown>
>;

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
export function NameGeneratorPromptEditor({ item }: RowEditorProps) {
  return (
    <>
      <Section
        title="Participant prompt"
        description="Write the question this prompt asks the participant."
      >
        <Field<typeof RichTextField>
          name="text"
          component={RichTextField}
          label="Prompt text"
          hint="Shown to the participant while they name people. Supports markdown formatting."
          placeholder="Who are the people you know?"
          singleLine
          initialValue={asString(item.text)}
          required="Write the question this prompt asks."
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
      title="Additional attributes"
      description="Give every person named on this prompt a fixed value, so later stages can ask about them."
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
        label="Attribute assignments"
        hint="Use these values in skip logic or in a stage's filter."
        initialValue={committed}
        subject={subject}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        draftValidatedVariables={draftValidatedVariables}
        committedVariableIds={committedVariableIds}
        // The rows' own rules are display-only (see `RowField`), so the
        // blocking counterparts have to exist here or the dialog saves exactly
        // what it has just refused in red.
        custom={validation.custom}
      />
    </Section>
  );
}

/** How one prompt reads in the list when its dialog is closed. */
export function NameGeneratorPromptPreview({ item }: RowPreviewProps) {
  const text = asString(item.text);
  const stamps = asAttributes(item.additionalAttributes).length;

  return (
    <div className="flex flex-col gap-2">
      <RenderMarkdown render={<div />}>{text ?? ''}</RenderMarkdown>
      {stamps > 0 && (
        <p className="text-sm text-current/70">
          {stamps === 1
            ? 'Assigns 1 additional attribute.'
            : `Assigns ${stamps} additional attributes.`}
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

export type NameGeneratorPromptsSectionProps = Readonly<{
  copy?: Partial<PromptsCopy>;
}>;

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
export default function NameGeneratorPromptsSection({
  copy,
}: NameGeneratorPromptsSectionProps = {}) {
  return (
    <PromptsSection
      PromptEditor={NameGeneratorPromptEditor}
      PromptPreview={NameGeneratorPromptPreview}
      normalizeRow={normalizeNameGeneratorPrompt}
      {...(copy === undefined ? {} : { copy })}
    />
  );
}
