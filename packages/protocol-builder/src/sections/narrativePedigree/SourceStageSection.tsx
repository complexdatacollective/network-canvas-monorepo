import { useEffect, useMemo, useRef } from 'react';

import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useStageValue,
} from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { useOnResearcherChange } from '../researcherChange.ts';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';
import { resolveSourceStages, type SourceStageProblem } from './sourceStage.ts';

const SOURCE_FIELD = 'sourceStageId';
const DISEASES_FIELD = 'diseases';

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
 * it (see `formatMessageError`), so it too follows a change of language.
 */
const PROBLEM_MESSAGES: Readonly<
  Record<SourceStageProblem, MessageDescriptor>
> = Object.freeze({
  missing: narrativePedigreeMessages.sourceMissing,
  notAPedigree: narrativePedigreeMessages.sourceNotAPedigree,
  afterThisStage: narrativePedigreeMessages.sourceAfterThisStage,
});

/**
 * The family this stage draws, and the stage that collected it.
 *
 * Every disease mapping names an attribute of the source pedigree's node type,
 * so a different source invalidates all of them at once. They are removed
 * rather than left to fail validation later: the researcher reconfigures
 * against the new family, instead of saving a stage that points at attributes
 * the new node type does not have.
 *
 * The removal goes through `useDiscardStageValues`, which is the one seam a
 * reset goes through, and it is one batch: the chosen source first, the
 * diseases unset after it. The source travels with them because it is an
 * ordinary field, which waits for the submit that flushes it — sent alone, the
 * unset would reach a live-applying host as a stage describing the OLD
 * pedigree with none of the diseases that described it, which is a stage
 * nobody authored. And the session rather than the form alone, because the
 * draft the session holds is the single notion of what a path holds: the
 * disease list resolves its next row against that draft, so rows cleared only
 * on screen come back with the next one added.
 */
export default function SourceStageSection() {
  const intl = useAppIntl();
  const { creation, identity, protocolContext, storeApi } =
    useStageEditorForm();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const discardStageValues = useDiscardStageValues();

  // Where the stage runs decides which pedigrees precede it, and a stage being
  // created is not in the order to be found in: the session carries the
  // position the host is about to insert it at, so a new stage placed at the
  // top of an interview is not offered the pedigrees it will run before.
  const { options, problem } = useMemo(
    () =>
      resolveSourceStages(
        protocolContext,
        identity.id,
        sourceStageId,
        creation?.position,
      ),
    [creation?.position, identity.id, protocolContext, sourceStageId],
  );

  // A stored choice the list no longer contains is still offered, as the
  // current one and labelled with what is wrong: blanking the control would
  // hide the very reference the researcher has to resolve, and would then
  // write the blank back over it.
  const selectOptions = useMemo<{ value: string; label: string }[]>(
    () =>
      problem === null || typeof sourceStageId !== 'string'
        ? options.map((option) => ({ ...option }))
        : [
            ...options.map((option) => ({ ...option })),
            {
              value: sourceStageId,
              label: intl.formatMessage(
                narrativePedigreeMessages.sourceUnusableOption,
                { stageId: sourceStageId },
              ),
            },
          ],
    [intl, options, problem, sourceStageId],
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
    () =>
      messageRuleValidation([
        () =>
          problemRef.current === null
            ? undefined
            : createMessageError(PROBLEM_MESSAGES[problemRef.current]),
      ]),
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
  // that distinction is made. The rule it applies is that the FIRST reading is
  // not a change and every reading after it is, the transition out of
  // `undefined` included: a stage whose source has never been set is exactly
  // the stage whose first real choice invalidates the diseases sitting beside
  // it, and the hand-written observer here read that first choice as another
  // initial observation and kept them.
  useOnResearcherChange(SOURCE_FIELD, (value) => {
    discardStageValues([DISEASES_FIELD], { path: SOURCE_FIELD, value });
  });

  return (
    <BuilderSection
      title={intl.formatMessage(narrativePedigreeMessages.sourceTitle)}
      description={intl.formatMessage(
        narrativePedigreeMessages.sourceDescription,
      )}
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
          replaced by the alert above it. `ProtocolField` is also what tells
          the outline this section owns a required field: rendered instead of
          the control, the alert left the section with no fields at all, which
          reads as "Finished" beside a stage the save refuses — and left the
          session's own complaint about the missing source with no field to
          attribute it to. Mounted and empty, the section reports the
          prerequisite nobody has met yet. */}
      <ProtocolField<typeof StyledSelectField>
        name={SOURCE_FIELD}
        component={StyledSelectField}
        label={intl.formatMessage(narrativePedigreeMessages.sourceLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.sourceHint)}
        placeholder={intl.formatMessage(
          narrativePedigreeMessages.sourcePlaceholder,
        )}
        options={selectOptions}
        disabled={selectOptions.length === 0}
        required
        custom={sourceValidation}
      />
    </BuilderSection>
  );
}
