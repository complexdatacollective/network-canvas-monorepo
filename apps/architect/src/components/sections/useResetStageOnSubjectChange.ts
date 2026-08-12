import { difference, get, isEqual, union } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

import type { StageSubject, StageType } from '@codaco/protocol-validation';
import { clearFieldValue } from '~/components/Form/clearFieldValue';
import { getInterfaceTemplate } from '~/components/StageEditor/interfaceTemplates';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
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
  const { storeApi, committedStage, draft } = useStageFormContext();
  const subject = useStageFormValue<StageSubject>('subject');
  const setStageValue = useSetStageValue();

  const previousSubject = useRef(subject);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersion = useRef(restoreVersion);

  useEffect(() => {
    const previous = previousSubject.current;
    previousSubject.current = subject;
    const previousVersion = previousRestoreVersion.current;
    previousRestoreVersion.current = restoreVersion;

    // Only a change away from an existing subject invalidates the stage; the
    // first subject a stage is given has nothing to reset.
    if (!previous || isEqual(previous, subject)) {
      return;
    }

    // An undo/redo restores the subject together with the configuration that
    // belongs to it, so resetting here would wipe the half of the restore the
    // user was reaching for.
    if (previousVersion !== restoreVersion) {
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

    // As ONE gesture: the loop below makes a write per field, and an array
    // field (`prompts`, `form.fields`, `panels`) snapshots on the write, so
    // unbatched it would leave half-reset stops on the undo timeline — the NEW
    // subject still carrying the OLD subject's variable references, reachable
    // by undo and saveable from there.
    draft.runGesture(() => {
      fieldsToReset.forEach((field) => {
        // The store keys fields by exact name with no hierarchy, so writing a
        // container (`form`, `background`, `behaviours`) is only parked as a
        // dormant value and never replaces the descendants a section actually
        // registers (`form.fields`, `background.image`) — which would then be
        // saved still carrying the previous subject's variable references.
        clearFieldValue(storeApi, field);

        setStageValue(field, template[field] ?? null);

        const { fields, dormantValues } = storeApi.getState();
        const names = new Set([...fields.keys(), ...dormantValues.keys()]);
        for (const name of names) {
          if (!name.startsWith(`${field}.`) && !name.startsWith(`${field}[`)) {
            continue;
          }
          // A nested template default has to be addressed by the same name the
          // section registered, or it lands on the container instead.
          setStageValue(name, get(template, name));
        }
      });
    });
  }, [
    committedStage,
    draft,
    interfaceType,
    restoreVersion,
    setStageValue,
    storeApi,
    subject,
  ]);
};

export default useResetStageOnSubjectChange;
