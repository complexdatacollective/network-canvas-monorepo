import { get } from 'es-toolkit/compat';
import { useCallback } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import type { Command } from '@codaco/studio-sync/apply';

import {
  type StageFormStoreApi,
  useStageEditorForm,
} from '../form/stageEditorContext.ts';
import {
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
 * type it has just made. That is `useOnResearcherChange`, which is the one
 * place the distinction is made.
 *
 * The reset reaches the DOCUMENT as well as the form, as one batch, so that
 * everything reading the stage between here and the next save — the outline,
 * a section deciding whether it has anything to show — sees a stage that
 * describes one subject rather than two. The same rule a capability's
 * switch-off follows (`useDiscardStageValues`); it is spelled out here rather
 * than shared with it because this reset also writes the new subject and the
 * interface template's defaults.
 */
export function useResetStageOnSubjectChange(): void {
  const { storeApi, committedFields, identity, applyOwnCommands } =
    useStageEditorForm();
  const clearStageValue = useClearStageValue();

  useOnResearcherChange('subject', (subject) => {
    const template = getInterfaceTemplate(identity.type);
    const resets = subjectDependentResets(
      heldStageKeys(storeApi, committedFields),
      template,
    );

    // The document first, and in one batch, so nothing reading the stage
    // between here and the next save sees half a reset. Only the researcher
    // can reach this — a stage somebody else holds opens with its subject
    // picker disabled — so there is no refusal to answer for.
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
  });
}
