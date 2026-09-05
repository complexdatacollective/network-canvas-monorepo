import { isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useClearStageValue,
  useStageValue,
} from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
import { resolveSourceStages, type SourceStageProblem } from './sourceStage.ts';

const SOURCE_FIELD = 'sourceStageId';
const DISEASES_FIELD = 'diseases';

/**
 * What the editor says about a stored source that is no longer usable.
 *
 * Whole sentences per case rather than one assembled from clauses: what has
 * gone wrong differs, and so does what the researcher has to do about it.
 */
const PROBLEM_MESSAGES: Readonly<Record<SourceStageProblem, string>> =
  Object.freeze({
    missing:
      'The Family Pedigree stage this one reads is no longer part of the interview. Choose another one, or restore it, before this stage can be saved.',
    notAPedigree:
      'The stage this one reads is no longer a Family Pedigree, so there is no family for it to visualise. Choose a Family Pedigree stage instead.',
    afterThisStage:
      'The Family Pedigree stage this one reads now runs after it, so the family would still be empty. Move it earlier in the interview, or choose a pedigree that runs before this stage.',
  });

export type SourceStageCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
  placeholder: string;
  /** Said in place of the list when there is no pedigree to choose. */
  emptyMessage: string;
}>;

const DEFAULT_COPY: SourceStageCopy = {
  sectionTitle: 'Pedigree source',
  description:
    'Choose the Family Pedigree stage whose family this stage visualises.',
  fieldLabel: 'Source stage',
  fieldHint:
    'Only Family Pedigree stages that run before this one are listed: the family has to be drawn before it can be shown.',
  placeholder: 'Select a Family Pedigree stage...',
  emptyMessage:
    'This interview has no Family Pedigree stage before this one. Add one, or move this stage later, before configuring it.',
};

export type SourceStageSectionProps = Readonly<{
  copy?: Partial<SourceStageCopy>;
}>;

/** Whether anything is actually mapped here, in the form or in the draft. */
const holdsDiseases = (value: unknown): boolean =>
  Array.isArray(value) ? value.length > 0 : value !== undefined;

/**
 * The family this stage draws, and the stage that collected it.
 *
 * Every disease mapping names an attribute of the source pedigree's node type,
 * so a different source invalidates all of them at once. They are removed
 * rather than left to fail validation later: the researcher reconfigures
 * against the new family, instead of saving a stage that points at attributes
 * the new node type does not have.
 *
 * The removal reaches the SESSION as one field-level command and the FORM as a
 * clear, in that order, and neither half is optional. `applyOwnCommands` is
 * what marks the write as this form's own; a whole-draft `changeFields` here
 * is indistinguishable from a draft arriving from somewhere else, so the shell
 * re-seeds every control from it — including the source select, which is put
 * straight back to the stage the researcher had just moved away from. The form
 * clear is the other half: a bound list resolves its next edit against the
 * draft the session holds, so rows left on screen would be written back.
 *
 * A stage with nothing mapped is left completely alone. A narrative pedigree
 * created from its template carries `diseases: []`, and issuing a write to
 * remove nothing spends a marker on a transition that never happens — the
 * marker then stands until some later arrival at the same content and
 * suppresses the re-seed that one genuinely needed.
 */
export default function SourceStageSection({ copy }: SourceStageSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { applyOwnCommands, committedFields, identity, protocolContext } =
    useStageEditorForm();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const clearStageValue = useClearStageValue();
  // Held in a ref rather than read in the effect's dependencies: what is
  // mapped changes as the researcher edits the list, and re-running the reset
  // effect for that would ask its "did the source move" question against
  // bookkeeping that has already moved on.
  const mappedDiseases = useStageValue(DISEASES_FIELD);
  const diseases = useRef(mappedDiseases);
  diseases.current = mappedDiseases;

  const { options, problem } = useMemo(
    () => resolveSourceStages(protocolContext, identity.id, sourceStageId),
    [identity.id, protocolContext, sourceStageId],
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
              label: `${sourceStageId} — this stage can no longer be used`,
            },
          ],
    [options, problem, sourceStageId],
  );

  const committedSource: unknown = committedFields[SOURCE_FIELD];
  const seenSource = useRef(sourceStageId);
  const seenCommittedSource = useRef(committedSource);
  const awaitingReseedTo = useRef<{ value: unknown } | null>(null);

  useEffect(() => {
    const previousSource = seenSource.current;
    seenSource.current = sourceStageId;
    const previousCommitted = seenCommittedSource.current;
    seenCommittedSource.current = committedSource;

    if (!isEqual(previousCommitted, committedSource)) {
      awaitingReseedTo.current = { value: committedSource };
    }

    // The first source a stage is given has nothing to invalidate.
    if (previousSource === undefined || previousSource === sourceStageId) {
      return;
    }

    // An undo, a redo or a collaborator's change arrives carrying the diseases
    // that belong to the source it brings with it, so clearing here would wipe
    // the half of the change the researcher was reaching for.
    const expected = awaitingReseedTo.current;
    awaitingReseedTo.current = null;
    if (expected !== null && isEqual(expected.value, sourceStageId)) return;

    // The draft the session holds NOW, read with the empty batch that reads
    // without writing. A stage with nothing mapped — including the
    // `diseases: []` a new one is created with — is left untouched.
    const current = applyOwnCommands([]);
    if (
      !holdsDiseases(diseases.current) &&
      !holdsDiseases(current[DISEASES_FIELD])
    ) {
      return;
    }

    if (Object.hasOwn(current, DISEASES_FIELD)) {
      applyOwnCommands([{ op: 'unset', key: DISEASES_FIELD }]);
    }
    // The form as well as the session: the list is bound to the document key,
    // so rows still on screen would be resolved against it by the next edit
    // and written back.
    clearStageValue(DISEASES_FIELD);
  }, [applyOwnCommands, clearStageValue, committedSource, sourceStageId]);

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      {problem !== null && (
        <Alert variant="destructive">
          <AlertTitle>This stage has no family to show</AlertTitle>
          <AlertDescription>{PROBLEM_MESSAGES[problem]}</AlertDescription>
        </Alert>
      )}
      {selectOptions.length === 0 ? (
        <Alert variant="warning">
          <AlertTitle>No pedigree to read</AlertTitle>
          <AlertDescription>{words.emptyMessage}</AlertDescription>
        </Alert>
      ) : (
        <ProtocolField<typeof StyledSelectField>
          name={SOURCE_FIELD}
          component={StyledSelectField}
          label={words.fieldLabel}
          hint={words.fieldHint}
          placeholder={words.placeholder}
          options={selectOptions}
          required
        />
      )}
    </BuilderSection>
  );
}
