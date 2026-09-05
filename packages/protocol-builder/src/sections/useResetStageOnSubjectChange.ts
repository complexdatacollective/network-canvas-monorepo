import { get, isEqual } from 'es-toolkit/compat';
import { useEffect, useRef } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { Command } from '@codaco/studio-sync/apply';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useClearStageValue, useStageValue } from '../form/stageFormHooks.ts';
import { getInterfaceTemplate } from '../interfaces/templates.ts';
import { subjectDependentResets } from './subjectReset.ts';

/**
 * Narrows a value read back out of a template by a dynamic path.
 *
 * A template is authored data, so a value that is not one the form store can
 * hold is a defect in the template rather than something to swallow: writing
 * `undefined` instead would silently drop a default the interface depends on.
 */
const isFieldValueArrayItem = (
  value: unknown,
): value is string | number | boolean | Record<string, unknown> =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

const isFieldValue = (value: unknown): value is FieldValue =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isFieldValueArrayItem)) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

function asFieldValue(value: unknown): FieldValue {
  if (!isFieldValue(value)) {
    throw new TypeError('An interface template holds a value a form cannot.');
  }
  return value;
}

/**
 * Throws away everything that described the previous subject when the stage's
 * subject changes.
 *
 * An observer effect rather than an `onChange` handler, because a caller's
 * `onChange` on a Fresco field REPLACES the store's own write rather than
 * running beside it — a side effect has to watch the value instead.
 *
 * The hard part is telling the researcher picking a different type apart from
 * the draft being replaced beneath the form, which also moves the subject: an
 * undo, a redo, a collaborator's change, or the atomic edit that creates a
 * type and selects it. Those arrive carrying the configuration that belongs to
 * the subject they bring with them, and resetting there would wipe the half of
 * the change the researcher was reaching for.
 *
 * They are told apart by watching the AGREED draft as well as the form. When
 * the agreed subject moves, the form's controls are about to be re-seeded with
 * it, and the form's own subject arriving at that value is that re-seed rather
 * than a choice. Deliberately not "did both move in the same render": the
 * re-seed happens in the shell's effect, which runs after this one, so the two
 * are a render apart and in an order neither section controls.
 *
 * The reset reaches the SESSION as well as the form, as one batch. Ordinary
 * typing waits for the submit that flushes it, but a bound list does not: it
 * resolves every insertion, removal and reorder against the draft the session
 * holds right now (`applyOwnCommands([])`). A reset that lived only in the form
 * store would therefore be undone by the next row a researcher adds — the list
 * would rebuild itself from the old subject's rows and save them. One batch
 * rather than a command per key, so an undo brings the whole stage back at
 * once, subject included: an undo that restored the configuration without the
 * type it describes would leave the stage in a state no researcher chose.
 */
export function useResetStageOnSubjectChange(): void {
  const { storeApi, committedFields, identity, applyOwnCommands } =
    useStageEditorForm();
  const subject = useStageValue('subject');
  const clearStageValue = useClearStageValue();

  const seenSubject = useRef(subject);
  const seenCommittedSubject = useRef(committedFields.subject);
  /**
   * The subject the form is expected to be re-seeded with, once the agreed
   * draft has moved to one the controls have not caught up with.
   *
   * Cleared by whichever subject change arrives next, including a change to
   * something else entirely — a foreign arrival landing in the middle of a
   * researcher's own pick is genuinely ambiguous, and a stage reset to its
   * template is the recoverable side of it.
   */
  const awaitingReseedTo = useRef<{ value: unknown } | null>(null);

  useEffect(() => {
    const previousSubject = seenSubject.current;
    seenSubject.current = subject;
    const previousCommittedSubject = seenCommittedSubject.current;
    const committedSubject = committedFields.subject;
    seenCommittedSubject.current = committedSubject;

    if (!isEqual(previousCommittedSubject, committedSubject)) {
      awaitingReseedTo.current = { value: committedSubject };
    }

    // The first subject a stage is given has nothing to reset: there was no
    // previous type for its configuration to belong to.
    if (previousSubject === undefined || isEqual(previousSubject, subject)) {
      return;
    }

    const expected = awaitingReseedTo.current;
    awaitingReseedTo.current = null;
    if (expected !== null && isEqual(expected.value, subject)) return;

    const template = getInterfaceTemplate(identity.type);
    const resets = subjectDependentResets(
      [
        ...Object.keys(storeApi.getState().getFormValues()),
        ...Object.keys(committedFields),
      ],
      template,
    );

    // The session first, and in one batch. Everything below writes into the
    // form store, which a bound list never reads: it asks the session for the
    // draft it is editing. `applyOwnCommands` also marks the write as this
    // form's own, so the draft moving here does not re-seed the controls the
    // loop below is about to set.
    applyOwnCommands([
      subject === undefined
        ? { op: 'unset', key: 'subject' }
        : { op: 'set', key: 'subject', value: subject },
      ...resets.map((reset): Command =>
        reset.value === undefined
          ? { op: 'unset', key: reset.key }
          : { op: 'set', key: reset.key, value: reset.value },
      ),
    ]);

    for (const reset of resets) {
      // Clears the path itself, everything beneath it, and every registered or
      // parked field above it that still carries it. Anything left holding the
      // old subject's configuration would be written back on save.
      clearStageValue(reset.key);
      // A key with no template default is simply gone: absence is how the
      // schema spells "this stage does not do this", and the clear above has
      // already said that. Writing `undefined` over it again would say nothing
      // the clear has not.
      if (reset.value === undefined) continue;

      storeApi.getState().setFieldValue(reset.key, reset.value);

      // A section registers the LEAVES of a container it configures
      // (`behaviours.removeAfterConsideration`, not `behaviours`), and the
      // store keys fields by exact name. Writing the container alone parks a
      // dormant value that never reaches those controls, so each nested
      // default is written under the name its own field registered.
      const { fields, dormantValues } = storeApi.getState();
      for (const name of new Set([...fields.keys(), ...dormantValues.keys()])) {
        if (
          !name.startsWith(`${reset.key}.`) &&
          !name.startsWith(`${reset.key}[`)
        ) {
          continue;
        }
        storeApi
          .getState()
          .setFieldValue(name, asFieldValue(get(template, name)));
      }
    }
  }, [
    applyOwnCommands,
    clearStageValue,
    committedFields,
    identity.type,
    storeApi,
    subject,
  ]);
}
