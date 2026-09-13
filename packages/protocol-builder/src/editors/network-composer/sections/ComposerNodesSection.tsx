import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';

import VariablePickerField, {
  type VariablePickerOption,
} from '../../../fields/VariablePickerField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import {
  CATEGORICAL_TYPE,
  CATEGORICAL_TYPES,
  LAYOUT_TYPE,
  LAYOUT_TYPES,
  TEXT_TYPE,
  TEXT_TYPES,
  useVariableChoices,
} from '../../../sections/canvas/codebookChoices.ts';
import { asText } from '../../../sections/canvas/rowValues.ts';
import { useCreateAttributeForSlot } from '../../../sections/create-variable/useCreateAttributeForSlot.ts';
import { composerFormFieldMessages } from '../../../sections/form-fields/composerFormFieldMessages.ts';
import { ComposerFormFieldsField } from '../../../sections/form-fields/ComposerFormFields.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
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
 * Excluded, and not also refused at the save. Every one of these controls is
 * on screen and reads the codebook live, so the only way a pick can become a
 * conflict is for somebody else to make it one while the researcher is looking
 * at something else — and a draft is allowed to be transiently invalid across
 * sections, with validity enforced when the protocol is published. A save gate
 * here could only ever fire on that race, and would refuse the researcher a
 * save for a change that was not theirs.
 */
export default function ComposerNodesSection() {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const waiting = subject === undefined;
  const setStageValue = useSetStageValue();

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

  const quickAddCreate = useCreateAttributeForSlot({
    subject,
    variableType: TEXT_TYPE,
    title: intl.formatMessage(messages.quickAddCreateLabel),
    onCreated: bindQuickAdd,
  });
  const layoutCreate = useCreateAttributeForSlot({
    subject,
    variableType: LAYOUT_TYPE,
    title: intl.formatMessage(messages.layoutCreateLabel),
    onCreated: bindLayout,
  });
  const hullCreate = useCreateAttributeForSlot({
    subject,
    variableType: CATEGORICAL_TYPE,
    title: intl.formatMessage(messages.hullCreateLabel),
    onCreated: bindHull,
  });

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
        {...quickAddCreate.createProps}
      />
      {quickAddCreate.editor}

      <Field<typeof VariablePickerField>
        name={LAYOUT_VARIABLE_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.layoutLabel)}
        hint={intl.formatMessage(messages.layoutHint)}
        options={layoutOptions}
        emptyMessage={intl.formatMessage(messages.layoutEmpty)}
        required={REQUIRED}
        {...layoutCreate.createProps}
      />
      {layoutCreate.editor}

      <Field<typeof VariablePickerField>
        name={CONVEX_HULL_FIELD}
        component={VariablePickerField}
        label={intl.formatMessage(messages.hullLabel)}
        hint={intl.formatMessage(messages.hullHint)}
        options={hullOptions}
        emptyMessage={intl.formatMessage(messages.hullEmpty)}
        {...hullCreate.createProps}
      />
      {hullCreate.editor}

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
          // The section around this list is titled with the same words, so
          // showing the label too would announce them twice. It still has to
          // exist: it is what the outline and a host's problem panel call
          // this field.
          label={intl.formatMessage(messages.nodeFormTitle)}
          labelHidden
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
