import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import {
  buildExclusiveVariableSlotMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
  hasValidatedUse,
  interfaceOwnedPickIssue,
} from '../../../codebook/variableRoles.ts';
import RichTextField from '../../../fields/RichTextField.tsx';
import VariablePickerField from '../../../fields/VariablePickerField.tsx';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
} from '../../../form/arrayFields/crossClassPick.ts';
import type {
  RowEditorProps,
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import { useCreateAttributeForSlot } from '../../../sections/create-variable/useCreateAttributeForSlot.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from '../../dyad-census/sections/censusMessages.ts';
import CreateEdgeField, {
  CREATE_EDGE_FIELD,
  edgeSubjectOf,
  missingEdgeTypeIssue,
} from '../../dyad-census/sections/CreateEdgeField.tsx';
import {
  PromptTextField,
  PromptTextPreview,
} from '../../dyad-census/sections/PromptTextField.tsx';

const SCALE_FIELD = 'edgeVariable';
const DECLINE_FIELD = 'negativeLabel';

/** The strength is a point on a scale, so only an ordinal attribute holds it. */
const SCALE_TYPE = 'ordinal' as const satisfies VariableType;

/**
 * How many points the scale itself can carry. The decline answer is drawn
 * beside them and is not counted: it is not one of the attribute's values, so
 * counting it would make the warning speak about a control it cannot see.
 * Architect counts the same way, though its wording claims otherwise.
 */
const SCALE_LIMIT = 5;

/** What only a Tie-Strength Census says; the shared words are in `censusMessages`. */
const messages = defineMessages({
  guidance: {
    id: 'protocolBuilder.censusPrompts.tieStrengthGuidance',
    defaultMessage:
      'The participant sees two people side by side and answers on a scale, so write the question about the pair in front of them — “how close are these two people?” rather than a name — and phrase it so that every point on the scale is a sensible answer.',
    description:
      'Guidance shown above the box where a researcher writes a Tie-Strength Census prompt, saying what the participant is looking at while they answer it. The quoted sentence is an example of a question a scale can answer.',
  },
  placeholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthPlaceholder',
    defaultMessage: 'How close are these two people?',
    description:
      'Example question in the empty box where a researcher writes a Tie-Strength Census prompt.',
  },
  edgeTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeTitle',
    defaultMessage: 'Connection rated',
    description:
      'Heading of the group that says which kind of connection the participant’s answer on the scale describes.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeDescription',
    defaultMessage:
      'Choose the kind of connection an answer on the scale records between the pair.',
    description:
      'Description of the group that says what answering on the scale records between the two people a Tie-Strength Census prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeHint',
    defaultMessage:
      'A connection of this type is created between the two people whenever the participant answers on the scale.',
    description:
      'Guidance under the control that picks what answering on the scale records between the two people a Tie-Strength Census prompt asked about.',
  },
  edgeRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeRequired',
    defaultMessage: 'Choose the type of connection this prompt creates.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without saying what an answer on the scale records.',
  },
  scaleTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleTitle',
    defaultMessage: 'The scale',
    description:
      'Heading of the group that picks the attribute whose ordered values the participant answers on — the points running from least to most.',
  },
  scaleDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleDescription',
    defaultMessage:
      'Choose the attribute whose ordered values the participant answers on.',
    description:
      'Description of the group that picks the attribute whose ordered values are the points of the scale. The attribute belongs to the connection this prompt creates, not to either person.',
  },
  scaleLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLabel',
    defaultMessage: 'Attribute',
    description:
      'Label of the control that picks which attribute of the connection holds the participant’s answer. An attribute is one thing an interview records.',
  },
  scaleHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleHint',
    defaultMessage:
      'The participant taps one of this attribute’s values, and it is recorded on the connection.',
    description:
      'Guidance under the attribute picker in a Tie-Strength Census prompt, saying where the participant’s answer is stored.',
  },
  scaleRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleRequired',
    defaultMessage: 'Choose the attribute the participant answers on.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without saying which attribute holds the strength.',
  },
  scaleEmpty: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleEmpty',
    defaultMessage:
      'This connection type has no ordinal attributes yet. Create one to say what the scale is.',
    description:
      'Shown in place of the attribute picker’s options when the kind of connection this prompt creates has no attribute whose answers run in an order.',
  },
  scaleCreateLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleCreateLabel',
    defaultMessage: 'Create a new attribute',
    description:
      'Names the act of inventing the attribute whose ordered values become the points of the scale, and titles the codebook editor the attribute picker’s create row opens for it.',
  },
  scaleGoneRefusal: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleGoneRefusal',
    defaultMessage:
      'This attribute can no longer be the scale for this connection. Choose another one.',
    description:
      'Refusal shown on the attribute picker when a researcher saves a Tie-Strength Census prompt whose scale has been deleted from the codebook, moved to another kind of answer, or belongs to a different connection type.',
  },
  scaleLimitTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLimitTitle',
    defaultMessage: 'More answers than fit on one screen',
    description:
      'Heading of the warning shown when the attribute a Tie-Strength Census prompt uses offers more values than the interview screen can draw as points on its scale.',
  },
  scaleLimitDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLimitDescription',
    defaultMessage:
      'This interface is designed for up to five points on the scale, with the decline answer beside them. Beyond that they become hard to read and hard to tap, which costs data quality.',
    description:
      'Body of the warning shown when a Tie-Strength Census prompt would draw more points on its scale than its interview screen is designed for. The decline answer is the extra control the participant uses to say the two people are not connected.',
  },
  declineTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineTitle',
    defaultMessage: 'Answering that there is no connection',
    description:
      'Heading of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineDescription',
    defaultMessage:
      'Give the participant a way to say these two people are not connected at all.',
    description:
      'Description of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineLabel',
    defaultMessage: 'Decline answer',
    description:
      'Label of the box a researcher writes the words the participant chooses to say the two people are not connected into.',
  },
  declineHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineHint',
    defaultMessage:
      'Shown at the end of the scale. Choosing it records no connection between the pair.',
    description:
      'Guidance under the box a researcher writes the decline answer into, saying where the participant sees it and what choosing it does.',
  },
  declinePlaceholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclinePlaceholder',
    defaultMessage: 'They don’t know each other',
    description:
      'Example wording in the empty box where a researcher writes the decline answer.',
  },
  declineRequired: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineRequired',
    defaultMessage: 'Write how the participant says there is no connection.',
    description:
      'Refusal shown when a researcher saves a Tie-Strength Census prompt without wording for the decline answer.',
  },
});

const SCALE_GONE = createMessageError(messages.scaleGoneRefusal);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

function TieStrengthGuidance() {
  const intl = useAppIntl();
  return (
    <Alert variant="info" className="mb-6">
      <AlertDescription>
        {intl.formatMessage(messages.guidance)}
      </AlertDescription>
    </Alert>
  );
}

/**
 * Throws the scale away when the connection it describes changes.
 *
 * `edgeVariable` names an attribute OF `createEdge`, so a prompt keeping its
 * scale across a change of connection type names an attribute the new type
 * does not have. Nothing downstream can explain that: the picker can only say
 * a stale pick is not available here, never that it belongs to the type the
 * researcher just moved away from.
 *
 * An effect rather than an `onChange`, because a caller's `onChange` on a
 * Fresco field REPLACES the store's own write rather than running beside it.
 * The connection type ARRIVING is not a change: a prompt opened on a saved row
 * begins with nothing here, and clearing on that first value would throw the
 * saved scale away the moment the researcher opened the prompt to read it.
 */
function useClearScaleOnConnectionChange(createEdge: unknown): void {
  const clearValue = useFormStore((state) => state.clearValue);
  const seenEdge = useRef(createEdge);

  useEffect(() => {
    const previous = seenEdge.current;
    seenEdge.current = createEdge;
    if (previous === undefined || previous === '' || previous === createEdge) {
      return;
    }
    clearValue(SCALE_FIELD);
  }, [clearValue, createEdge]);
}

/**
 * The attribute of this connection type whose ordered values are the scale.
 *
 * An UNVALIDATED writer: the participant taps one of the values and it is
 * written straight onto the connection. So the pool drops any attribute a form
 * elsewhere validates, and any one an interface derives for itself —
 * re-offering what this prompt already saved is never a new contradiction,
 * which is what the committed pick escapes.
 */
function ScaleField({
  committed,
}: Readonly<{ committed: string | undefined }>) {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const setFieldValue = useFormStore((state) => state.setFieldValue);
  const { createEdge, edgeVariable } = useFormValue([
    CREATE_EDGE_FIELD,
    SCALE_FIELD,
  ] as const);
  const subject = useMemo(() => edgeSubjectOf(createEdge), [createEdge]);
  const { createProps, editor } = useCreateAttributeForSlot({
    subject,
    variableType: SCALE_TYPE,
    title: intl.formatMessage(messages.scaleCreateLabel),
    onCreated: (variableId) => setFieldValue(SCALE_FIELD, variableId),
  });
  const picked = asString(edgeVariable) ?? committed;

  const allVariables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const options = useMemo(() => {
    if (subject === undefined) return [];
    // The role map excludes the stage being edited: this form's own unsaved
    // prompts are the authority on what this stage writes, and the saved copy
    // of them is stale the moment editing begins.
    const roleMap = buildVariableRoleMap(protocolContext, identity.id);
    const pool = Object.entries(allVariables).flatMap(([value, variable]) =>
      variable.type === SCALE_TYPE
        ? [{ value, label: variable.name, type: variable.type }]
        : [],
    );
    const keep = picked === undefined ? [] : [picked];
    return excludeInterfaceOwned(
      buildExclusiveVariableSlotMap(protocolContext),
      subject,
      excludeValidatedUses(roleMap, subject, pool, keep),
      keep,
    );
  }, [allVariables, identity.id, picked, protocolContext, subject]);

  // Read from the codebook rather than from the row: the values belong to the
  // attribute, so a collaborator adding a sixth changes what this stage shows.
  const pickedVariable =
    picked === undefined ? undefined : allVariables[picked];
  const valueCount =
    pickedVariable?.type === SCALE_TYPE ? pickedVariable.options.length : 0;

  // The scale belongs to the connection, so there is nothing to choose from
  // until the connection type is known — and it is that type's own attributes
  // that are offered, never the person's.
  if (subject === undefined) return null;

  return (
    <Section
      title={intl.formatMessage(messages.scaleTitle)}
      description={intl.formatMessage(messages.scaleDescription)}
    >
      <Field<typeof VariablePickerField>
        name={SCALE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.scaleLabel)}
        hint={intl.formatMessage(messages.scaleHint)}
        options={options}
        emptyMessage={intl.formatMessage(messages.scaleEmpty)}
        initialValue={committed}
        required={intl.formatMessage(messages.scaleRequired)}
        {...createProps}
      />
      {/*
        The create row escalates to the codebook's own attribute editor rather
        than creating from the typed name: an ordinal attribute IS its list of
        ordered values, and the schema refuses one with fewer than two.
      */}
      {editor}
      {valueCount > SCALE_LIMIT && (
        <Alert variant="warning" className="mt-6">
          <AlertTitle>
            {intl.formatMessage(messages.scaleLimitTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.scaleLimitDescription)}
          </AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

/**
 * One Tie-Strength Census question: what to ask, what an answer connects, how
 * strong that connection is said to be, and how the participant says there is
 * none.
 */
function TieStrengthCensusPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const { createEdge } = useFormValue([CREATE_EDGE_FIELD] as const);

  useClearScaleOnConnectionChange(createEdge);

  return (
    <>
      <PromptTextField
        item={item}
        guidance={<TieStrengthGuidance />}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
      <CreateEdgeField
        title={intl.formatMessage(messages.edgeTitle)}
        description={intl.formatMessage(messages.edgeDescription)}
        hint={intl.formatMessage(messages.edgeHint)}
        requiredMessage={intl.formatMessage(messages.edgeRequired)}
      />
      <ScaleField committed={asString(item[SCALE_FIELD])} />
      <Section
        title={intl.formatMessage(messages.declineTitle)}
        description={intl.formatMessage(messages.declineDescription)}
      >
        <Field<typeof RichTextField>
          name={DECLINE_FIELD}
          component={RichTextField}
          label={intl.formatMessage(messages.declineLabel)}
          hint={intl.formatMessage(messages.declineHint)}
          placeholder={intl.formatMessage(messages.declinePlaceholder)}
          singleLine
          initialValue={asString(item[DECLINE_FIELD])}
          required={intl.formatMessage(messages.declineRequired)}
        />
      </Section>
    </>
  );
}

/**
 * The questions a Tie-Strength Census asks about every pair of people.
 *
 * Two codebook picks per prompt, both the CONNECTION's rather than the stage
 * subject's: the type of connection the answer records, and the attribute of
 * that type whose ordered values the participant answers on.
 */
export default function TieStrengthCensusPromptsSection() {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();

  /**
   * The refusals a Tie-Strength prompt can earn that no control can raise for
   * itself, all of them about a pick on offer only because blanking it would
   * hide the reference the researcher has to repair.
   *
   * The connection type is asked about first: the scale hangs off it, so with
   * the type gone there is no codebook to judge the attribute against.
   */
  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const edgeIssue = missingEdgeTypeIssue(
        protocolContext.codebook.edge ?? {},
        row[CREATE_EDGE_FIELD],
      );
      if (edgeIssue !== undefined) {
        return {
          refused: { fieldErrors: { [CREATE_EDGE_FIELD]: [edgeIssue] } },
        };
      }

      const subject = edgeSubjectOf(row[CREATE_EDGE_FIELD]);
      const variableId = asString(row[SCALE_FIELD]) ?? '';
      if (subject === undefined || variableId === '') return { row };

      const allVariables = variablesForSubject(protocolContext, subject);
      // Deleted, or moved to a kind of answer the scale cannot draw. No escape
      // for a pick this edit did not change: the reference is unusable however
      // it got there.
      if (allVariables[variableId]?.type !== SCALE_TYPE) {
        return { refused: { fieldErrors: { [SCALE_FIELD]: [SCALE_GONE] } } };
      }

      const roleMap = buildVariableRoleMap(protocolContext, identity.id);
      const conflict = crossClassPickIssue({
        variableId,
        originalVariableId: asString(context.openedOn[SCALE_FIELD]) ?? '',
        hasConflictingUse: (candidate) =>
          hasValidatedUse(roleMap, subject, candidate),
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (conflict !== undefined) {
        return { refused: { fieldErrors: { [SCALE_FIELD]: [conflict] } } };
      }

      // And an attribute another interface derives for itself, which has NO
      // unchanged-pick escape: re-saving such a prompt would go on overwriting
      // the value that interface computes.
      const owned = interfaceOwnedPickIssue(
        buildExclusiveVariableSlotMap(protocolContext),
        subject,
        variableId,
      );
      return owned === undefined
        ? { row }
        : { refused: { fieldErrors: { [SCALE_FIELD]: [owned] } } };
    },
    [identity.id, protocolContext],
  );

  return (
    <PromptsSection
      PromptEditor={TieStrengthCensusPromptEditor}
      PromptPreview={PromptTextPreview}
      beforeSave={beforeSave}
      description={censusMessages.pairDescription}
      fieldHint={censusMessages.pairFieldHint}
    />
  );
}
