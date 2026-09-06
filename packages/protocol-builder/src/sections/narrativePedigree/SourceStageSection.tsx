import { isEqual } from 'es-toolkit/compat';
import { useEffect, useMemo, useRef } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import StyledSelectField from '@codaco/fresco-ui/form/fields/Select/Styled';

import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  useDiscardStageValues,
  useStageValue,
} from '../../form/stageFormHooks.ts';
import BuilderSection from '../BuilderSection.tsx';
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
  const { committedFields, identity, protocolContext } = useStageEditorForm();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const discardStageValues = useDiscardStageValues();

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
              label: intl.formatMessage(
                narrativePedigreeMessages.sourceUnusableOption,
                { stageId: sourceStageId },
              ),
            },
          ],
    [intl, options, problem, sourceStageId],
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

    discardStageValues([DISEASES_FIELD], {
      path: SOURCE_FIELD,
      value: sourceStageId,
    });
  }, [committedSource, discardStageValues, sourceStageId]);

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
      {selectOptions.length === 0 ? (
        <Alert variant="warning">
          <AlertTitle>
            {intl.formatMessage(narrativePedigreeMessages.sourceEmptyTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(narrativePedigreeMessages.sourceEmptyMessage)}
          </AlertDescription>
        </Alert>
      ) : (
        <ProtocolField<typeof StyledSelectField>
          name={SOURCE_FIELD}
          component={StyledSelectField}
          label={intl.formatMessage(narrativePedigreeMessages.sourceLabel)}
          hint={intl.formatMessage(narrativePedigreeMessages.sourceHint)}
          placeholder={intl.formatMessage(
            narrativePedigreeMessages.sourcePlaceholder,
          )}
          options={selectOptions}
          required
        />
      )}
    </BuilderSection>
  );
}
