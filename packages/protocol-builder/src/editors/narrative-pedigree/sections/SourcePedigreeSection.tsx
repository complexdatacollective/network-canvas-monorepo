import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import SourcePedigreePickerField, {
  type SourceChangeQuestion,
  type SourcePedigreeOption,
} from '../../../fields/SourcePedigreePickerField.tsx';
import { REQUIRED } from '../../../form/requiredField.ts';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import {
  useAskStageHasAnyValue,
  useDiscardStageValues,
  useStageValue,
} from '../../../form/stageFormHooks.ts';
import BuilderSection from '../../../sections/BuilderSection.tsx';
import { useOnResearcherChange } from '../../../sections/researcherChange.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import {
  resolveSourceStages,
  type SourceStageOption,
  type SourceStageProblem,
} from './sourceStage.ts';

const SOURCE_FIELD = 'sourceStageId';
const DISEASES_FIELD = 'diseases';

/** The paths a change of source pedigree throws away. */
const SOURCE_DEPENDENT_FIELDS: readonly string[] = Object.freeze([
  DISEASES_FIELD,
]);

/**
 * What the editor says about a stored source that is no longer usable.
 *
 * Whole sentences per case rather than one assembled from clauses: what has
 * gone wrong differs, and so does what the researcher has to do about it.
 *
 * Keyed on the resolver's own problem token, so a case added there is a case
 * this record does not compile without.
 *
 * Said twice, from the two places that can say it. The notice states it on
 * arrival, which is the only way the researcher hears about a source a
 * collaborator broke while they were reading something else: a field shows its
 * errors once it is dirty, and a stage nobody has touched never is. The
 * FIELD's copy is what refuses the save, and it is encoded rather than
 * formatted because it is stated by a rule the field registers, which runs
 * outside React and can see no formatter — the form's own error region decodes
 * it, so it too follows a change of language.
 */
const PROBLEM_MESSAGES: Readonly<
  Record<SourceStageProblem, MessageDescriptor>
> = Object.freeze({
  missing: narrativePedigreeMessages.sourceMissing,
  notAPedigree: narrativePedigreeMessages.sourceNotAPedigree,
  afterThisStage: narrativePedigreeMessages.sourceAfterThisStage,
});

/**
 * What a source change costs, in this stage's own words.
 *
 * Declared beside the field the reset discards, so a path added to one is
 * visibly missing from the other.
 */
const SOURCE_CHANGE_QUESTION: SourceChangeQuestion = Object.freeze({
  title: narrativePedigreeMessages.sourceChangeTitle,
  description: narrativePedigreeMessages.sourceChangeDescription,
  confirmLabel: narrativePedigreeMessages.sourceChangeConfirm,
});

/**
 * The family this stage draws, and the stage that collected it.
 *
 * Every disease mapping names an attribute of the source pedigree's node type,
 * so a different source invalidates all of them at once. They are removed
 * rather than left to fail validation later: the researcher reconfigures
 * against the new family instead of saving a stage that points at attributes
 * the new node type does not have. Which is why the choice is held back until
 * they have agreed to it — see `SourcePedigreePickerField`.
 *
 * The removal goes through `useDiscardStageValues`, and it is one batch: the
 * chosen source first, the diseases unset after it. The source travels with
 * them because it is an ordinary field, which waits for the submit that
 * flushes it — sent alone, the unset would reach a live-applying host as a
 * stage describing the OLD pedigree with none of the diseases that described
 * it, which is a stage nobody authored.
 */
export default function SourcePedigreeSection() {
  const intl = useAppIntl();
  const { creation, identity, storeApi } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const discardStageValues = useDiscardStageValues();
  // Asked of the SAME field the reset below discards, so the question can
  // neither appear over a change that costs nothing — a stage that has mapped
  // no disease yet — nor stay silent over one that costs something.
  const hasAnyValue = useAskStageHasAnyValue();
  const confirmSourceChange = useCallback(
    () =>
      hasAnyValue(SOURCE_DEPENDENT_FIELDS) ? SOURCE_CHANGE_QUESTION : undefined,
    [hasAnyValue],
  );

  // Where the stage runs decides which pedigrees precede it, and a stage being
  // created is not in the order to be found in: the editor carries the
  // position the host is about to insert it at, so a new stage placed at the
  // top of an interview is not offered the pedigrees it will run before.
  const { options, problem, chosenLabel } = useMemo(
    () =>
      resolveSourceStages(
        protocolContext,
        identity.id,
        sourceStageId,
        creation?.position,
      ),
    [creation?.position, identity.id, protocolContext, sourceStageId],
  );

  /**
   * Each pedigree named by where it runs as well as by what it is called.
   *
   * A stage label is required to be non-empty and is not required to be
   * unique, and the host proposes one name per interface — so two Family
   * Pedigree stages can read identically here while collecting different
   * families. Numbered, they cannot; the same reason, and the same phrasing,
   * as the skip-logic destination control.
   */
  const numbered = useCallback(
    (option: SourceStageOption): SourcePedigreeOption => ({
      value: option.value,
      label: intl.formatMessage(narrativePedigreeMessages.sourceStageOption, {
        position: option.position,
        stageLabel: option.label,
      }),
    }),
    [intl],
  );

  // A stored choice the list no longer contains is still offered, as the
  // current one and labelled with what is wrong: blanking the control would
  // hide the very reference the researcher has to resolve, and would then
  // write the blank back over it. Named as the researcher named it while the
  // stage is still there; by its identifier only once there is no stage left
  // to read a name from.
  const selectOptions = useMemo<SourcePedigreeOption[]>(
    () =>
      problem === null || typeof sourceStageId !== 'string'
        ? options.map(numbered)
        : [
            ...options.map(numbered),
            {
              value: sourceStageId,
              label: intl.formatMessage(
                narrativePedigreeMessages.sourceUnusableOption,
                { stageName: chosenLabel ?? sourceStageId },
              ),
              disabled: true,
            },
          ],
    [chosenLabel, intl, numbered, options, problem, sourceStageId],
  );

  /**
   * The resolver's verdict, expressed as the control's own validation.
   *
   * A source that has been deleted, re-typed or moved below this stage is not
   * a warning to read past: the stage cannot run, so the save has to stop, and
   * it has to stop for THIS reason — a stage whose source has moved still
   * resolves a node type, so every disease beside it still validates and the
   * whole stage saved with an order the interview cannot execute. Stating it
   * as the field's validation is what marks the control invalid, blocks the
   * submit, and lets the section outline say this section has a problem rather
   * than that it is finished.
   *
   * The verdict is read through a ref because `useField` memoises its
   * validation on a JSON of its props, which drops functions: a rule rebuilt
   * each render would serialise identically and pin the first closure — and
   * its first protocol — forever. One entry for the field's lifetime, reading
   * the current verdict, keeps it live without ever re-registering the field.
   */
  const problemRef = useRef(problem);
  problemRef.current = problem;
  const sourceValidation = useMemo(
    () => ({
      custom: messageRuleValidation([
        () =>
          problemRef.current === null
            ? undefined
            : createMessageError(PROBLEM_MESSAGES[problemRef.current]),
      ]),
    }),
    [],
  );

  // Field validation runs when the researcher touches a control, and on
  // submit. Neither covers how this problem appears: a collaborator deletes,
  // re-types or moves the source stage while the editor sits untouched.
  // Re-running the field's validation whenever the verdict changes is what
  // reports it the moment it appears rather than at the next save — and only
  // when there is a verdict, or an error already standing that it would now
  // clear, so an untouched empty control is not given the "required" error
  // nobody has earned yet.
  useEffect(() => {
    const state = storeApi.getState();
    if (problem === null && state.getFieldErrors(SOURCE_FIELD) === null) return;
    void state.validateField(SOURCE_FIELD);
  }, [problem, storeApi]);

  // Told apart from the draft moving beneath the form — an undo, a redo, a
  // collaborator's change — by `useOnResearcherChange`, which is the one place
  // that distinction is made. Its rule is that the FIRST reading is not a
  // change and every reading after it is, the transition out of `undefined`
  // included: a stage whose source has never been set is exactly the stage
  // whose first real choice invalidates the diseases sitting beside it.
  useOnResearcherChange(SOURCE_FIELD, (value) => {
    discardStageValues(SOURCE_DEPENDENT_FIELDS, {
      path: SOURCE_FIELD,
      value,
    });
  });

  return (
    <BuilderSection
      title={intl.formatMessage(narrativePedigreeMessages.sourceTitle)}
    >
      {problem !== null && (
        <Alert variant="destructive">
          <AlertTitle>
            {intl.formatMessage(narrativePedigreeMessages.sourceProblemTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(PROBLEM_MESSAGES[problem])}
          </AlertDescription>
        </Alert>
      )}
      {selectOptions.length === 0 && (
        <Alert variant="warning">
          <AlertTitle>
            {intl.formatMessage(narrativePedigreeMessages.sourceEmptyTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(narrativePedigreeMessages.sourceEmptyMessage)}
          </AlertDescription>
        </Alert>
      )}
      {/* The control is disabled when there is nothing to choose rather than
          replaced by the notice above it. The field is also what tells the
          outline this section owns something unanswered: rendered instead of
          the control, the notice left the section with no fields at all, which
          reads as finished beside a stage the save refuses. */}
      <Field<typeof SourcePedigreePickerField>
        name={SOURCE_FIELD}
        component={SourcePedigreePickerField}
        confirmChange={confirmSourceChange}
        label={intl.formatMessage(narrativePedigreeMessages.sourceLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.sourceHint)}
        placeholder={intl.formatMessage(
          narrativePedigreeMessages.sourcePlaceholder,
        )}
        options={selectOptions}
        disabled={selectOptions.length === 0}
        required={REQUIRED}
        {...sourceValidation}
      />
    </BuilderSection>
  );
}
