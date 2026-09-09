import { get, isEqual } from 'es-toolkit/compat';
import { useCallback, useRef } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import type { Command } from '@codaco/studio-sync/apply';

import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import {
  stageDraftValue,
  useAskStageHasAnyValue,
  useClearStageValue,
} from '../form/stageFormHooks.ts';
import { getInterfaceTemplate } from '../interfaces/templates.ts';
import type { StageFormDraft } from '../stageDocument.ts';
import { useOnResearcherChange } from './researcherChange.ts';
import {
  SUBJECT_INDEPENDENT_FIELDS,
  subjectDependentResets,
} from './subjectReset.ts';

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
 * The stage key a parked field name belongs to.
 *
 * A value the researcher answered into a control that has since unmounted is
 * held under that control's own name, which may be a path: a control named
 * `behaviours.freeDraw` parks under that whole name, while the key a reset
 * addresses is `behaviours`. Parsed rather than split on `.`, because a
 * protocol-authored key may contain one — `["prompt text"]` is a single
 * segment.
 *
 * `undefined` for a name that will not parse, which is a name no reset could
 * address anyway.
 */
const parkedStageKey = (name: string): string | undefined => {
  try {
    const [first] = resolveFieldPath([], name, 'path');
    return typeof first === 'string' ? first : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Every stage key the form or the draft is holding, from all three places one
 * can be hiding.
 *
 * `getFormValues()` is built from REGISTERED fields, so a control the
 * researcher answered and then unmounted contributes nothing to it, and an
 * answer that has not been saved is not in `committedFields` either. That key
 * is in neither place and is still on its way into the saved stage —
 * `documentFromSubmission` replays parked values on purpose — so the names
 * the store is parking are read as well.
 */
const heldStageKeys = (
  storeApi: StageFormStoreApi,
  committedFields: StageFormDraft,
): string[] => [
  ...Object.keys(storeApi.getState().getFormValues()),
  ...Object.keys(committedFields),
  ...[...storeApi.getState().dormantValues.keys()]
    .map(parkedStageKey)
    .filter((key) => key !== undefined),
];

/**
 * Whether changing the subject would actually cost the researcher anything.
 *
 * Asked before the change rather than after it — see `EntityTypePickerField`,
 * which holds the pick back until it is answered — so it reads what the stage
 * is carrying NOW rather than what a reset would write. A key the template
 * supplies and the stage does not is no loss, which is why this is not the
 * reset's own list; and a key that is only a registered field holding nothing
 * — an empty prompt list a section has mounted — is no loss either, which is
 * why it asks the same "holds something" a capability's switch-off asks rather
 * than counting keys.
 *
 * A function rather than a value: it reads the form's values, and a section
 * re-rendering on every keystroke to keep an answer current is one
 * re-rendering for a question nobody has asked yet.
 */
export function useSubjectChangeDiscards(): () => boolean {
  const { storeApi, committedFields } = useStageEditorForm();
  const hasAnyValue = useAskStageHasAnyValue();
  return useCallback(
    () =>
      hasAnyValue(
        heldStageKeys(storeApi, committedFields).filter(
          (key) => !SUBJECT_INDEPENDENT_FIELDS.includes(key),
        ),
      ),
    [committedFields, hasAnyValue, storeApi],
  );
}

/**
 * Throws away everything that described the previous subject when the stage's
 * subject changes.
 *
 * The hard part is telling the researcher picking a different type apart from
 * the subject moving for some other reason — the create dialog selecting the
 * type it has just made, this hook putting a refused pick back. That is
 * `useOnResearcherChange`, which is the one place the distinction is made.
 *
 * The reset reaches the DOCUMENT as well as the form, as one batch. Ordinary
 * typing waits for the submit that flushes it, but a bound list does not: it
 * resolves every insertion, removal and reorder against the document as it
 * stands (`applyOwnCommands([])`). A reset that lived only in the form store
 * would therefore be undone by the next row a researcher adds — the list would
 * rebuild itself from the old subject's rows and save them.
 *
 * The same rule a capability's switch-off follows (`useDiscardStageValues`),
 * for the same reason. It is spelled out here rather than shared with it
 * because this reset also writes the new subject and the interface template's
 * defaults.
 */
export function useResetStageOnSubjectChange(): void {
  const { storeApi, committedFields, identity, applyOwnCommands } =
    useStageEditorForm();
  const clearStageValue = useClearStageValue();

  /**
   * The subject this hook has just written back into the picker after a
   * refusal, held until the observation it causes has been read.
   *
   * Putting the picker back moves the value this hook is watching, and
   * `useOnResearcherChange` has no way to tell that from the researcher
   * picking the old type on purpose — it would call the reset again, this time
   * to throw away the configuration that describes the subject just restored.
   * A box rather than the value itself, because `undefined` is a subject a
   * stage really has, and cleared by whichever observation arrives next
   * whether or not it matches: a foreign arrival landing in that gap is the
   * researcher's own change again as far as anything here can tell, and
   * `useOnResearcherChange` already resolves that ambiguity the same way.
   */
  const putBack = useRef<{ value: unknown } | null>(null);

  useOnResearcherChange('subject', (subject) => {
    const restored = putBack.current;
    putBack.current = null;
    if (restored !== null && isEqual(restored.value, subject)) return;

    const template = getInterfaceTemplate(identity.type);
    const resets = subjectDependentResets(
      heldStageKeys(storeApi, committedFields),
      template,
    );

    // The document first, and in one batch. Everything below writes into the
    // form store, which a bound list never reads on its own: it asks for the
    // document it is editing.
    const { draft, refused } = applyOwnCommands([
      subject === undefined
        ? { op: 'unset', key: 'subject' }
        : { op: 'set', key: 'subject', value: subject },
      ...resets.map((reset): Command =>
        reset.value === undefined
          ? { op: 'unset', key: reset.key }
          : { op: 'set', key: reset.key, value: reset.value },
      ),
    ]);
    // A refusal means nothing was thrown away, so nothing may be emptied
    // either — the rule `useDiscardStageValues` follows, for the same reason.
    // A form emptied here would leave the stage looking unconfigured with
    // nothing left to fill it back in, and the next save would write that
    // emptiness. `applyOwnCommands` has already said so on screen.
    //
    // The PICK goes back too. The refusal is of the whole batch, subject
    // included, so the document still holds the old type and everything left
    // standing here still describes it; a picker showing the new one is the
    // only part of the stage saying otherwise. Left there it would be a choice
    // the researcher could not make again — the control already shows it, so
    // re-picking it moves nothing and no reset could follow — while picking the
    // type the stage actually has would read as a fresh change and throw away
    // the configuration that belongs to it.
    if (refused) {
      const agreed = stageDraftValue(draft, 'subject');
      putBack.current = { value: agreed };
      // A subject the picker cannot show — a stage being filled in for the
      // first time, which holds none, or a document whose `subject` is not the
      // object one is — puts it back to holding nothing.
      // Cleared rather than set to `undefined`, for the reason the reset loop
      // below gives: a tombstone would outlive the refusal and delete the key
      // again on the next save.
      if (agreed !== undefined && isFieldValue(agreed)) {
        storeApi.getState().setFieldValue('subject', agreed);
      } else {
        clearStageValue('subject');
      }
      return;
    }

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
  });
}
