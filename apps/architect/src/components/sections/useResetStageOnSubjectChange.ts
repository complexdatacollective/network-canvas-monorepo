import { difference, isEqual, union } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

import type { StageSubject, StageType } from '@codaco/protocol-validation';
import { getInterfaceTemplate } from '~/components/StageEditor/interfaceTemplates';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import {
  useSetStageValue,
  useStageFormValue,
} from '~/components/StageEditor/stageFormHooks';

const SUBJECT_INDEPENDENT_FIELDS = [
  'id',
  'type',
  'label',
  'interviewScript',
  'introductionPanel',
  'subject',
];

/**
 * Resets every subject-dependent field back to the interface template when the
 * stage's subject changes.
 *
 * An observer effect rather than the `onChange` handler this replaces: a
 * caller-supplied `onChange` on a fresco-ui `Field` replaces the store write
 * instead of running alongside it, so side effects have to watch the value.
 */
const useResetStageOnSubjectChange = (interfaceType: StageType): void => {
  const { storeApi, committedStage } = useStageFormContext();
  const subject = useStageFormValue<StageSubject>('subject');
  const setStageValue = useSetStageValue();

  const previousSubject = useRef(subject);

  useEffect(() => {
    const previous = previousSubject.current;
    previousSubject.current = subject;

    // Only a change away from an existing subject invalidates the stage; the
    // first subject a stage is given has nothing to reset.
    if (!previous || isEqual(previous, subject)) {
      return;
    }

    const template = getInterfaceTemplate(interfaceType);
    // Committed keys are unioned in as well: a section that is collapsed (and
    // so contributes nothing to the form's values) still holds a value that
    // belongs to the old subject.
    const fieldsToReset = difference(
      union(
        Object.keys(storeApi.getState().getFormValues()),
        Object.keys(committedStage ?? {}),
        Object.keys(template),
      ),
      SUBJECT_INDEPENDENT_FIELDS,
    );

    fieldsToReset.forEach((field) => {
      setStageValue(field, template[field] ?? null);
    });
  }, [committedStage, interfaceType, setStageValue, storeApi, subject]);
};

export default useResetStageOnSubjectChange;
