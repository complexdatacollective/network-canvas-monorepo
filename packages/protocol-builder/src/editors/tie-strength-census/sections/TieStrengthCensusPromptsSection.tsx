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
  buildInterfaceOwnedOptionMap,
  buildVariableRoleMap,
  excludeInterfaceOwned,
  excludeValidatedUses,
  hasValidatedUse,
  interfaceOwnedPickIssue,
  lockedVariableOptions,
  variableRoleKey,
} from '../../../codebook/variableRoles.ts';
import { LockedOptions } from '../../../fields/BinAttributeField.tsx';
import CreateEdgeField, {
  CREATE_EDGE_FIELD,
  edgeSubjectOf,
  missingEdgeTypeIssue,
} from '../../../fields/CreateEdgeField.tsx';
import {
  PromptTextField,
  PromptTextPreview,
} from '../../../fields/PromptTextField.tsx';
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
import AttributeCodebookControls from '../../../sections/AttributeCodebookControls.tsx';
import CreateVariableButton from '../../../sections/create-variable/CreateVariableButton.tsx';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { censusMessages } from '../../dyad-census/sections/censusMessages.ts';

const SCALE_FIELD = 'edgeVariable';
const DECLINE_FIELD = 'negativeLabel';

/** The strength is a point on a scale, so only an ordinal attribute holds it. */
const SCALE_TYPE = 'ordinal' as const satisfies VariableType;

/**
 * A tie-strength prompt keeps no input control of its own: the participant taps
 * one of the scale's points and the value is written as it is. So the key named
 * here is one the row never holds, and the codebook's own control is what the
 * attribute's settings are keyed on.
 */
const NO_ROW_COMPONENT = 'component';

/**
 * How many points the scale itself can carry. The decline answer is drawn
 * beside them and is not counted: it is not one of the attribute's values, so
 * counting it would make the warning speak about a control it cannot see.
 * Architect counts the same way, though its wording claims otherwise.
 */
const SCALE_LIMIT = 5;

/** What only a Tie-Strength Census says; the shared words are in `censusMessages`. */
const messages = defineMessages({
  placeholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthPlaceholder',
    defaultMessage: 'Enter text for the prompt here...',
    description:
      'Placeholder shown in the empty box where a researcher writes a Tie-Strength Census prompt. The trailing dots are an ellipsis written as three full stops.',
  },
  promptTextDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthPromptTextDescription',
    defaultMessage:
      'Explain the relationship participants should evaluate for each pair.',
    description:
      'Description of the group holding the question one Tie-Strength Census prompt shows the participant.',
  },
  promptTextHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthPromptTextHint',
    defaultMessage:
      'Refer clearly to the two people shown and phrase the prompt for a yes or no response.',
    description:
      'Guidance under the box where a researcher writes a Tie-Strength Census prompt, saying what the question has to name and what shape of answer it asks for.',
  },
  edgeLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeLabel',
    defaultMessage: 'Edge type',
    description:
      'Label of the control that picks which kind of connection a Tie-Strength Census prompt rates. Architect names this control differently here than in the two censuses whose answer is a yes or a no.',
  },
  edgeTitle: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeTitle',
    defaultMessage: 'Edge creation',
    description:
      'Heading of the group that says which kind of connection the participant’s answer on the scale describes.',
  },
  edgeDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeDescription',
    defaultMessage: 'Choose the edge type created between the two nodes.',
    description:
      'Description of the group that says what answering on the scale records between the two people a Tie-Strength Census prompt asked about.',
  },
  edgeHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthEdgeHint',
    defaultMessage:
      'Select or create the edge type before configuring its ordinal attribute.',
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
    defaultMessage: 'Response attribute',
    description:
      'Heading of the group that picks the attribute whose ordered values the participant answers on — the points running from least to most.',
  },
  scaleDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleDescription',
    defaultMessage:
      'Choose the ordinal attribute whose options participants use to rate the relationship.',
    description:
      'Description of the group that picks the attribute whose ordered values are the points of the scale. The attribute belongs to the connection this prompt creates, not to either person.',
  },
  scaleLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthScaleLabel',
    defaultMessage: 'Ordinal attribute',
    description:
      'Label of the control that picks which attribute of the connection holds the participant’s answer. An attribute is one thing an interview records.',
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
      'Button that opens the codebook editor for inventing the attribute whose ordered values become the points of the scale. Also the title of the dialog it opens.',
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
    defaultMessage: 'Decline response',
    description:
      'Heading of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineDescription: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineDescription',
    defaultMessage: 'Set the option participants use to decline edge creation.',
    description:
      'Description of the group holding the words the participant chooses to say the two people in front of them are not connected.',
  },
  declineLabel: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineLabel',
    defaultMessage: 'Decline option',
    description:
      'Label of the box a researcher writes the words the participant chooses to say the two people are not connected into.',
  },
  declineHint: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclineHint',
    defaultMessage: 'This option appears on the far right of the screen.',
    description:
      'Guidance under the box a researcher writes the decline answer into, saying where the participant sees it and what choosing it does.',
  },
  declinePlaceholder: {
    id: 'protocolBuilder.censusPrompts.tieStrengthDeclinePlaceholder',
    defaultMessage: 'Enter text for the negative label here...',
    description:
      'Placeholder shown in the empty box where a researcher writes the decline answer. The trailing dots are an ellipsis written as three full stops.',
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

  // An attribute whose VALUES another interface owns is still a legitimate
  // scale — a family pedigree's relationship kinds, say — but its points are
  // that interface's to decide, so they are shown rather than offered for
  // editing.
  const locked = useMemo(
    () =>
      subject === undefined || picked === undefined
        ? undefined
        : lockedVariableOptions(
            allVariables,
            picked,
            buildInterfaceOwnedOptionMap(protocolContext)[
              variableRoleKey(subject, picked)
            ],
          ),
    [allVariables, picked, protocolContext, subject],
  );

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
        options={options}
        emptyMessage={intl.formatMessage(messages.scaleEmpty)}
        initialValue={committed}
        required={intl.formatMessage(messages.scaleRequired)}
      />
      {/*
        The codebook's own attribute editor rather than a name box: an ordinal
        attribute IS its list of ordered values, and the schema refuses one
        with fewer than two.
      */}
      <CreateVariableButton
        subject={subject}
        variableType={SCALE_TYPE}
        label={intl.formatMessage(messages.scaleCreateLabel)}
        onCreated={(variableId) => setFieldValue(SCALE_FIELD, variableId)}
      />
      {/*
        The points ARE the stage: a scale whose values cannot be read from here
        sends the researcher to the codebook screen to find out what their own
        question asks. Reached rather than inlined, for the reason every
        codebook edit in this package is — the attribute lives in another
        section of the protocol and commits on its own.
      */}
      {locked === undefined ? (
        <AttributeCodebookControls
          subject={subject}
          variableField={SCALE_FIELD}
          committedVariable={committed}
          componentField={NO_ROW_COMPONENT}
          // The participant taps a point and the value is written as it is,
          // with nothing to check it — the schema says so by declaring this
          // reference `unvalidatedAttribute` — so rules authored here would
          // never run.
          offerRules={false}
        />
      ) : (
        <LockedOptions options={locked} />
      )}
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
        placeholder={intl.formatMessage(messages.placeholder)}
        title={intl.formatMessage(censusMessages.promptTextTitle)}
        description={intl.formatMessage(messages.promptTextDescription)}
        hint={intl.formatMessage(messages.promptTextHint)}
      />
      <CreateEdgeField
        title={intl.formatMessage(messages.edgeTitle)}
        description={intl.formatMessage(messages.edgeDescription)}
        label={intl.formatMessage(messages.edgeLabel)}
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
    />
  );
}
