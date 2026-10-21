import { useCallback, useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { RichSelectOption } from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { FAMILY_PEDIGREE_BUILD_PROMPT_ID } from '@codaco/protocol-validation';

import BinAttributeField, {
  type BinAttributeSlot,
  binAttributePickIssue,
} from '../../../fields/BinAttributeField.tsx';
import DefaultChoiceField from '../../../fields/DefaultChoiceField.tsx';
import {
  PromptTextField,
  PromptTextPreview,
} from '../../../fields/PromptTextField.tsx';
import type {
  RowEditorProps,
  RowSaveContext,
  RowSaveOutcome,
  RowValues,
} from '../../../form/rowDialog.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import PromptsSection from '../../../sections/PromptsSection.tsx';
import { useStageSubject } from '../../../sections/useStageSubject.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';
import {
  NOMINATION_PROMPTS_PATH,
  usePedigreeDraftBindings,
} from './pedigreeSlots.ts';

/** Where a nomination prompt keeps what it sets, and who it is limited to. */
const VARIABLE_FIELD = 'attribute';
const SEX_FIELD = 'onlyForSexAssignedAtBirth';

/** What a nomination prompt with no limit means: anyone can be selected. */
const ANYONE = 'anyone';

/**
 * The attribute a nomination prompt sets to true on each person the
 * participant selects. The interface writes it itself, without asking the
 * participant anything a form could check, so it is an UNVALIDATED writer: it
 * may not be an attribute a form collects.
 */
const NOMINATION_SLOT: BinAttributeSlot = Object.freeze({
  name: VARIABLE_FIELD,
  variableType: 'boolean',
  writerClass: 'unvalidated',
  goneRefusal: messages.nominationVariableGoneRefusal,
});

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/**
 * The attributes the stage's other answers hold, as seen from one prompt:
 * every attribute the stage's other answers and prompts are bound to, which
 * is the stage's list less this prompt's own attribute, once.
 */
const boundElsewhereFrom = (
  bound: readonly string[],
  ownAttribute: string | undefined,
): string[] => {
  const own = ownAttribute === undefined ? -1 : bound.indexOf(ownAttribute);
  return own === -1 ? [...bound] : bound.toSpliced(own, 1);
};

/**
 * A fresh id for a nomination prompt.
 *
 * Never the id the interview gives the family-building step, which comes
 * before every nomination prompt: a prompt reusing it is refused by the
 * schema. A random id cannot be that word in practice, and this says so
 * instead of relying on it.
 */
export function newNominationPromptId(): string {
  let id: string = crypto.randomUUID();
  while (id === FAMILY_PEDIGREE_BUILD_PROMPT_ID) id = crypto.randomUUID();
  return id;
}

/** A new prompt starts with its id and nothing else. */
const newNominationPrompt = (): Partial<RowValues> => ({
  id: newNominationPromptId(),
});

/**
 * One nomination prompt: the question, the attribute that records who the
 * participant selects, and whether only people of one sex assigned at birth
 * can be selected.
 */
function NominationPromptEditor({ item }: RowEditorProps) {
  const intl = useAppIntl();
  const subject = useStageSubject('node');
  const { draftSlotMap, validatedPersonVariables, otherAnswerVariables } =
    usePedigreeDraftBindings();
  const committedAttribute = asString(item[VARIABLE_FIELD]);
  const draftBoundElsewhere = useMemo(
    () =>
      boundElsewhereFrom(
        otherAnswerVariables.nominationPrompts,
        committedAttribute,
      ),
    [committedAttribute, otherAnswerVariables.nominationPrompts],
  );

  // Held for as long as the reader's language does not change: a control's
  // options are part of what it registers with, and a fresh array every render
  // re-registers it.
  const sexOptions = useMemo<RichSelectOption[]>(
    () => [
      {
        value: ANYONE,
        label: intl.formatMessage(messages.nominationSexAnyone),
      },
      {
        value: 'female',
        label: intl.formatMessage(messages.nominationSexFemale),
      },
      { value: 'male', label: intl.formatMessage(messages.nominationSexMale) },
    ],
    [intl],
  );

  return (
    <>
      <PromptTextField
        item={item}
        placeholder={intl.formatMessage(messages.nominationTextPlaceholder)}
        hint={intl.formatMessage(messages.nominationTextHint)}
      />
      <BinAttributeField
        slot={NOMINATION_SLOT}
        subject={subject}
        committed={asString(item[VARIABLE_FIELD])}
        label={intl.formatMessage(messages.nominationVariableLabel)}
        hint={intl.formatMessage(messages.nominationVariableHint)}
        emptyMessage={intl.formatMessage(messages.nominationVariableEmpty)}
        requiredMessage={intl.formatMessage(
          messages.nominationVariableRequired,
        )}
        createLabel={intl.formatMessage(messages.nominationVariableCreateLabel)}
        draftConflicting={validatedPersonVariables}
        draftSlotMap={draftSlotMap}
        draftBoundElsewhere={draftBoundElsewhere}
        editsValues={false}
      />
      <Field<typeof DefaultChoiceField>
        name={SEX_FIELD}
        component={DefaultChoiceField}
        label={intl.formatMessage(messages.nominationSexLabel)}
        hint={intl.formatMessage(messages.nominationSexHint)}
        options={sexOptions}
        defaultOption={ANYONE}
        initialValue={asString(item[SEX_FIELD])}
      />
    </>
  );
}

/**
 * The questions a Family Pedigree asks about the whole family once it is
 * drawn, each answered by selecting the people it applies to.
 *
 * The shared prompts list at `nominationPrompts`, which a stage may go
 * without: emptying the list removes the key, because the schema accepts no
 * stage holding an empty one. The attribute each prompt sets is picked as
 * every unvalidated writer's is — never one a form collects, nor one the
 * interface owns for a slot of its own — and this stage's own unsaved
 * bindings count, so a pick made a moment ago in another section constrains
 * this one before anything is saved.
 */
export default function NominationPromptsSection() {
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const subject = useStageSubject('node');
  const { draftSlotMap, validatedPersonVariables, otherAnswerVariables } =
    usePedigreeDraftBindings();

  const beforeSave = useCallback(
    (row: RowValues, context: RowSaveContext): RowSaveOutcome => {
      const issue = binAttributePickIssue({
        protocolContext,
        excludedStageId: identity.id,
        subject,
        slot: NOMINATION_SLOT,
        variableId: asString(row[VARIABLE_FIELD]) ?? '',
        openedOnVariableId: asString(context.openedOn[VARIABLE_FIELD]) ?? '',
        draftConflicting: validatedPersonVariables,
        draftSlotMap,
        draftBoundElsewhere: boundElsewhereFrom(
          otherAnswerVariables.nominationPrompts,
          asString(context.openedOn[VARIABLE_FIELD]),
        ),
      });
      return issue === undefined
        ? { row }
        : { refused: { fieldErrors: { [VARIABLE_FIELD]: [issue] } } };
    },
    [
      draftSlotMap,
      identity.id,
      otherAnswerVariables.nominationPrompts,
      protocolContext,
      subject,
      validatedPersonVariables,
    ],
  );

  return (
    <PromptsSection
      PromptEditor={NominationPromptEditor}
      PromptPreview={PromptTextPreview}
      beforeSave={beforeSave}
      itemTemplate={newNominationPrompt}
      name={NOMINATION_PROMPTS_PATH}
      optional
      title={messages.nominationTitle}
      description={messages.nominationDescription}
      waitingDescription={messages.nominationWaiting}
      fieldLabel={messages.nominationFieldLabel}
      fieldHint={messages.nominationListHint}
      addLabel={messages.nominationAddLabel}
      addTitle={messages.nominationAddTitle}
      editTitle={messages.nominationEditTitle}
      itemNoun={messages.nominationItemNoun}
      emptyState={messages.nominationEmptyState}
      rowDescription={messages.nominationRowDescription}
    />
  );
}
