import { useCallback, useMemo, useRef } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import {
  buildVariableRoleMap,
  hasConflictingUse,
  type WriterClass,
} from '../../../codebook/variableRoles.ts';
import {
  crossClassConflictMessage,
  variableDisplayName,
} from '../../../codebook/variableValidation.ts';
import VariablePickerField, {
  type VariablePickerOption,
} from '../../../fields/VariablePickerField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import { variablesForSubject } from '../../../protocol-context.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  CATEGORICAL_TYPES,
  LAYOUT_TYPES,
  TEXT_TYPES,
  useVariableChoices,
} from '../../../sections/canvas/codebookChoices.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import CreateVariableButton from '../../../sections/create-variable/CreateVariableButton.tsx';
import { composerFormFieldMessages } from '../../../sections/form-fields/composerFormFieldMessages.ts';
import { ComposerFormFieldsField } from '../../../sections/form-fields/ComposerFormFields.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { composerMessages as messages } from './composerMessages.ts';
import { useSetStageValue } from './useSetStageValue.ts';

const QUICK_ADD_FIELD = 'quickAdd';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
const CONVEX_HULL_FIELD = 'convexHullVariable';
const NODE_FORM_FIELD = 'nodeForm.fields';

/**
 * What switching the node form off means, in the composer's own words.
 *
 * The shared list owns the fields; what a researcher loses by turning it off
 * is a fact about THIS interface — the panel that opens when a participant
 * selects a node stops asking anything — so the composer says it.
 */
const NODE_FORM_CAPABILITY = Object.freeze({
  fields: [NODE_FORM_FIELD],
  confirmClear: {
    title: messages.nodeFormClearTitle,
    description: messages.nodeFormClearDescription,
    confirmLabel: messages.nodeFormClearConfirm,
  },
});

/** The attributes a list of form-field rows records into. */
const variablesIn = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((row) => {
        if (typeof row !== 'object' || row === null) return [];
        const variable = asText(Reflect.get(row, 'variable'));
        return variable === undefined ? [] : [variable];
      })
    : [];

/**
 * The offered options minus the ones this stage's own draft has already
 * claimed the other way, and never minus the field's own pick.
 *
 * A picker that dropped its own value would blank the control and then write
 * the blank over the reference the researcher has to resolve.
 */
function useKeptOptions(
  offered: readonly VariablePickerOption[],
  held: string | undefined,
  claimedElsewhere: readonly string[],
): readonly VariablePickerOption[] {
  return useMemo(
    () =>
      offered.filter(
        (option) =>
          option.value === held || !claimedElsewhere.includes(option.value),
      ),
    [claimedElsewhere, held, offered],
  );
}

/**
 * What the participant may put on this canvas, and what the stage remembers
 * about it.
 *
 * Four decisions the stage holds directly — the attribute the quick-add box
 * fills in, the one that stores each node's position, the one nodes are
 * grouped by, and the questions asked about a selected node — and every one of
 * them names a codebook attribute, so each can create one where the protocol
 * has nothing suitable yet.
 *
 * The pickers deliberately exclude opposite things. Adding a node and
 * answering its form both collect through the codebook's own rules, so neither
 * may take an attribute something writes around them; the position and the
 * grouping are written straight onto the node as the participant drags and
 * lassoes, so neither may take one a form collects. The saved protocol answers
 * half of that through the role map, and the other half is this stage's own
 * unsaved draft: the role map is built with the edited stage taken out, so a
 * pick made a moment ago is a write nothing else accounts for.
 *
 * Excluded, and ALSO refused at the save — but only for a conflict with the
 * rest of the protocol. A picker keeps the value it arrived holding, whatever
 * the filters say, because one that dropped its own pick would write the blank
 * over the reference the researcher has to resolve; so a protocol authored
 * elsewhere, where a form in another stage already collects what this stage
 * writes around the codebook, opens here with the conflict intact and nothing
 * filtered. That is the state Architect's own composer refused to save, and
 * the one place it can be resolved — with no unchanged-pick escape, for the
 * same reason: re-saving the stage as it stands leaves the export mixing a
 * checked answer with one this stage stamped.
 *
 * Only against the rest of the protocol. What the two halves of THIS stage
 * claim is a draft the researcher is in the middle of making, and both are on
 * screen: the pickers above keep them apart, and a save gate there would
 * refuse a stage across sections a draft is allowed to be transiently
 * inconsistent in.
 */
export default function ComposerNodesSection() {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const waiting = subject === undefined;
  const setStageValue = useSetStageValue();

  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  // Built with the edited stage taken out: what THIS stage claims is the draft
  // in front of the researcher, and the saved copy of it is stale the moment
  // editing begins.
  const roleMap = useMemo(
    () => buildVariableRoleMap(protocolContext, identity.id),
    [identity.id, protocolContext],
  );
  const allVariables = useMemo(
    () =>
      subject === undefined
        ? {}
        : variablesForSubject(protocolContext, subject),
    [protocolContext, subject],
  );

  const quickAdd = asText(useStageValue(QUICK_ADD_FIELD));
  const layout = asText(useStageValue(LAYOUT_VARIABLE_FIELD));
  const hull = asText(useStageValue(CONVEX_HULL_FIELD));
  const nodeFormRows = useStageValue(NODE_FORM_FIELD);

  /** Written straight onto the node, around the codebook's rules. */
  const draftUnvalidated = useMemo(
    () => [layout, hull].filter((id): id is string => id !== undefined),
    [hull, layout],
  );
  /** Collected through them. */
  const draftValidated = useMemo(
    () => [
      ...(quickAdd === undefined ? [] : [quickAdd]),
      ...variablesIn(nodeFormRows),
    ],
    [nodeFormRows, quickAdd],
  );

  const quickAddOffered = useVariableChoices({
    subject,
    types: TEXT_TYPES,
    writerClass: 'validated',
    ...(quickAdd === undefined ? {} : { currentValue: quickAdd }),
  });
  const layoutOptions = useVariableChoices({
    subject,
    types: LAYOUT_TYPES,
    writerClass: 'unvalidated',
    ...(layout === undefined ? {} : { currentValue: layout }),
  });
  const hullOffered = useVariableChoices({
    subject,
    types: CATEGORICAL_TYPES,
    writerClass: 'unvalidated',
    ...(hull === undefined ? {} : { currentValue: hull }),
  });

  // A position attribute has no input control at all, so no form can collect
  // one and nothing this stage validates can ever reach that list. The other
  // two can meet each other, and do: a categorical attribute is both something
  // a form asks for and something the grouping tool writes.
  const quickAddOptions = useKeptOptions(
    quickAddOffered,
    quickAdd,
    draftUnvalidated,
  );
  const hullOptions = useKeptOptions(hullOffered, hull, draftValidated);

  /**
   * What the rest of the protocol already claims, and what to say about it.
   *
   * Read through a ref because `useField` memoises a field's validation on a
   * JSON of its props, which drops functions: a rule rebuilt each render would
   * serialise identically and pin the first closure — and its first protocol —
   * for the life of the field.
   */
  const judge = useRef<
    (value: unknown, writerClass: WriterClass) => string | undefined
  >(() => undefined);
  judge.current = (value, writerClass) => {
    const variableId = asText(value);
    if (subject === undefined || variableId === undefined) return undefined;
    return hasConflictingUse(roleMap, subject, variableId, writerClass)
      ? crossClassConflictMessage[writerClass](
          variableDisplayName(allVariables, variableId),
        )
      : undefined;
  };
  const quickAddValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => judge.current(value, 'validated'),
      ]),
    }),
    [],
  );
  const hullValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        (value: unknown) => judge.current(value, 'unvalidated'),
      ]),
    }),
    [],
  );

  const bindQuickAdd = useCallback(
    (variableId: string) => setStageValue(QUICK_ADD_FIELD, variableId),
    [setStageValue],
  );
  const bindLayout = useCallback(
    (variableId: string) => setStageValue(LAYOUT_VARIABLE_FIELD, variableId),
    [setStageValue],
  );
  const bindHull = useCallback(
    (variableId: string) => setStageValue(CONVEX_HULL_FIELD, variableId),
    [setStageValue],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.nodesTitle)}
      description={intl.formatMessage(
        waiting ? messages.nodesWaitingDescription : messages.nodesDescription,
      )}
      disabled={waiting}
    >
      <Field<typeof VariablePickerField>
        name={QUICK_ADD_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.quickAddLabel)}
        hint={intl.formatMessage(messages.quickAddHint)}
        options={quickAddOptions}
        emptyMessage={intl.formatMessage(messages.quickAddEmpty)}
        required={REQUIRED}
        {...quickAddValidation}
      />
      <CreateVariableButton
        subject={subject ?? null}
        variableType="text"
        label={intl.formatMessage(messages.quickAddCreateLabel)}
        onCreated={bindQuickAdd}
      />

      <Field<typeof VariablePickerField>
        name={LAYOUT_VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.layoutLabel)}
        hint={intl.formatMessage(messages.layoutHint)}
        options={layoutOptions}
        emptyMessage={intl.formatMessage(messages.layoutEmpty)}
        required={REQUIRED}
      />
      <CreateVariableButton
        subject={subject ?? null}
        variableType="layout"
        label={intl.formatMessage(messages.layoutCreateLabel)}
        onCreated={bindLayout}
      />

      <Field<typeof VariablePickerField>
        name={CONVEX_HULL_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.hullLabel)}
        hint={intl.formatMessage(messages.hullHint)}
        options={hullOptions}
        emptyMessage={intl.formatMessage(messages.hullEmpty)}
        {...hullValidation}
      />
      <CreateVariableButton
        subject={subject ?? null}
        variableType="categorical"
        label={intl.formatMessage(messages.hullCreateLabel)}
        onCreated={bindHull}
      />

      <BuilderSection
        title={intl.formatMessage(messages.nodeFormTitle)}
        description={intl.formatMessage(messages.nodeFormDescription)}
        disabled={waiting}
        capability={NODE_FORM_CAPABILITY}
      >
        <ComposerFormFieldsField
          name={NODE_FORM_FIELD}
          subject={subject}
          draftUnvalidatedVariables={draftUnvalidated}
          label={intl.formatMessage(messages.nodeFormLabel)}
          hint={intl.formatMessage(messages.nodeFormHint)}
          addButtonLabel={intl.formatMessage(messages.nodeFormAddLabel)}
          emptyStateMessage={intl.formatMessage(messages.nodeFormEmptyState)}
          addTitle={composerFormFieldMessages.addSubmitTitle}
          editTitle={composerFormFieldMessages.editTitle}
          formId="composer-node-form-field"
        />
      </BuilderSection>
    </BuilderSection>
  );
}
