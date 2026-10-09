'use client';
import { isEqual } from 'es-toolkit';
import {
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useShallow } from 'zustand/react/shallow';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createMessageError,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { AppMessage } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import type { ComposerForm } from '@codaco/protocol-validation';
import type { entityAttributesProperty, NcNode } from '@codaco/shared-consts';

import { formValuesToAttributePatch } from '../../forms/formValuesToAttributePatch';
import useProtocolForm from '../../forms/useProtocolForm';
import { rejectedWriteMessage } from '../../forms/writeSubmissionResult';
import useBeforeNext from '../../hooks/useBeforeNext';
import useSavesInOrder from '../../hooks/useSavesInOrder';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import type { Subject } from '../../selectors/forms';
import type { AttributePatch } from '../../store/entityAttributePatch';
import PassphraseNotice, {
  type PassphraseNoticeStatus,
} from '../Anonymisation/PassphraseNotice';
import discardChangesDialog, {
  failedCheckReason,
} from '../discardChangesDialog';
import { interfaceMessages } from '../messages';
import type { LeaveGuard } from './useComposerStore';

type Attributes = NcNode[typeof entityAttributesProperty];

export type InspectorProps = {
  entityId: string;
  form: ComposerForm | undefined;
  subject: Subject;
  attributes: Attributes;
  /**
   * The attributes whose stored value can never be shown, which are left out
   * of `attributes` and kept as stored unless a new value is entered.
   */
  unavailable?: readonly string[];
  /**
   * Set while the entity's values cannot be shown or saved because they are
   * encrypted; the form is replaced by an explanation.
   */
  passphraseStatus?: PassphraseNoticeStatus;
  /**
   * Saves the entity's answers. The patch is built when the save is made,
   * after every change asked for before it, and building it returns `null`
   * when there is nothing to save.
   */
  onSave: (
    id: string,
    buildPatch: () => AttributePatch | null,
  ) => Promise<void>;
  onDelete: (id: string) => void;
  /**
   * Holds the selection on this entity while its form is open, so whatever
   * would close the Inspector first saves an edit not saved yet, or asks
   * before discarding one that cannot be saved. Returns the function that
   * releases the hold.
   */
  guardDraft: (entityId: string, confirmLeave: LeaveGuard) => () => void;
};

// How long to wait after the last edit before validating and persisting.
const AUTOSAVE_DELAY = 400;

const noopSubmit: FormSubmitHandler = () => ({ success: true as const });

// A save resolves to why it was refused, or to nothing once it is stored.
const isSaved = (reason: MessageDescriptor | undefined) => reason === undefined;

// One of the form's own saves: the answers it stores, and whether the store
// has taken them.
type OwnWrite = { stored: Record<string, FieldValue>; done: boolean };

// An edit not saved yet whose stored answer an undo or redo has changed
// since: the stored answer it was made from, and the value the form showed
// for it then.
type HeldEdit = { from: FieldValue; shown: FieldValue };

const NO_UNAVAILABLE: readonly string[] = [];

const ownValue = (values: Record<string, FieldValue>, name: string) =>
  Object.hasOwn(values, name) ? values[name] : undefined;

// A blank answer is the same as none.
const sameAnswer = (a: FieldValue, b: FieldValue) =>
  (isUnanswered(a) && isUnanswered(b)) || isEqual(a, b);

/**
 * Watches the form's values and, once they settle, calls `onSettled` to
 * validate and persist them — so attribute edits save automatically (when
 * valid) without a Save button. `pendingSave` holds the timer while an edit is
 * waiting to settle.
 */
function AutoPersist({
  onSettled,
  pendingSave,
}: {
  onSettled: () => void;
  pendingSave: RefObject<ReturnType<typeof setTimeout> | null>;
}) {
  const values = useFormStore(
    useShallow((state) => {
      const snapshot: Record<string, FieldValue> = {};
      state.fields.forEach((field, name) => {
        Object.defineProperty(snapshot, name, {
          configurable: true,
          enumerable: true,
          value: field.value,
          writable: true,
        });
      });
      return snapshot;
    }),
  );
  // Deliberately the store's STICKY `isDirty`, not `selectIsFormDirty`.
  //
  // This is not a "you have unsaved changes" warning — it is the trigger for
  // an autosave, and it has to fire for the edit that puts a value BACK. With
  // a live comparison, editing an attribute (persisted), then restoring it,
  // would settle as "not changed" and skip the write — leaving the edited
  // value persisted while the participant is looking at the restored one.
  // Sticky is the safe semantics for a persistence trigger: once anything has
  // been touched, every settled state is written.
  const isDirty = useFormStore((state) => state.isDirty);
  const isInitial = useRef(true);

  useEffect(() => {
    // Skip the initial mount: nothing has been edited yet.
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    if (!isDirty) return;

    const handle = setTimeout(() => {
      pendingSave.current = null;
      onSettled();
    }, AUTOSAVE_DELAY);
    pendingSave.current = handle;
    return () => clearTimeout(handle);
  }, [values, isDirty, onSettled, pendingSave]);

  return null;
}

function AttributeFormInner({
  entityId,
  form,
  subject,
  attributes,
  unavailable,
  onSave,
  guardDraft,
}: Omit<InspectorProps, 'form' | 'onDelete' | 'passphraseStatus'> & {
  form: ComposerForm;
}) {
  const initialValues = useMemo(
    () =>
      Object.entries(attributes).reduce<Record<string, FieldValue>>(
        (values, [name, value]) => {
          if (value !== null) {
            values[name] = value;
          }
          return values;
        },
        {},
      ),
    [attributes],
  );

  const { fieldComponents, coerceValues, passphraseNeeded } = useProtocolForm({
    fields: form.fields ?? [],
    initialValues,
    subject,
    currentEntityId: entityId,
    unavailableVariables: unavailable,
  });
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The answers the form last saved, or was opened with. An answer changed
  // outside the form since, as by an undo, is not an edit of the form's.
  const savedRef = useRef(initialValues);
  // While saves are under way, settles once every one of them has.
  const savesUnderWay = useRef<Promise<void> | null>(null);
  // The stored answers the form was last given.
  const givenRef = useRef(initialValues);
  // The answers each of the form's own saves stores, oldest first, from just
  // before it is made until the form is given them back. While any is
  // pending, the form may hold answers that differ from the stored ones even
  // when it shows the answers it was given, and the next save builds on the
  // newest of these rather than on those.
  const ownWritesRef = useRef<OwnWrite[]>([]);
  // Edits an undo or redo overtook, by question. Each stays on screen but is
  // saved only over the answer it was made from, so the participant has to
  // change that question again before it replaces what the undo or redo
  // stored.
  const heldRef = useRef(new Map<string, HeldEdit>());

  // An answer changed outside the form, as an undo or redo does, replaces
  // the one shown unless the participant has changed that question since.
  // Otherwise the form would go on showing the undone answer, and save it
  // back when the Inspector closes. An answer the participant has changed
  // stays on screen, held until they change that question again or the
  // stored answer is again the one they changed. The answers the form's own
  // save stored are not such a change, even when the participant has put
  // back the earlier answer since.
  useEffect(() => {
    const given = givenRef.current;
    givenRef.current = initialValues;
    const state = storeApi?.getState();
    if (given === initialValues || !state?.pathOperations) return;

    const fields = form.fields ?? [];
    // Several saves can land in one render, so the answers given may be those
    // of any pending save, and every save before it has landed too.
    const ownWrites = ownWritesRef.current;
    const landed = ownWrites.findIndex(({ stored }) =>
      fields.every(({ variable }) =>
        isEqual(initialValues[variable], stored[variable]),
      ),
    );
    if (landed !== -1) {
      ownWritesRef.current = ownWrites.slice(landed + 1);
      return;
    }
    // The change was made after any save the store has taken, even one whose
    // answers never reached the form.
    const previous = ownWrites.findLast(({ done }) => done)?.stored ?? given;
    ownWritesRef.current = ownWrites.filter(({ done }) => !done);

    const shown = coerceValues(state.getFormValues());
    const held = heldRef.current;
    const saved = { ...savedRef.current };
    for (const { variable } of fields) {
      const was = previous[variable];
      const now = initialValues[variable];
      if (isEqual(was, now)) continue;

      // Whatever the form does with it, the stored answer is now this one.
      saved[variable] = now;
      const hold = held.get(variable);
      const from = hold ? hold.from : was;
      if (isEqual(shown[variable], now)) {
        held.delete(variable);
      } else if (!hold && isEqual(shown[variable], was)) {
        state.pathOperations.resetField([variable]);
      } else if (isEqual(now, from)) {
        // The stored answer is again the one this edit was made from, so the
        // autosave that follows the change saves the edit.
        held.delete(variable);
      } else {
        held.set(variable, {
          from,
          shown: hold
            ? hold.shown
            : state.pathOperations.getFieldState([variable])?.value,
        });
      }
    }
    savedRef.current = saved;
  }, [initialValues, storeApi, form.fields, coerceValues]);

  // Changing a question whose edit is held makes the new answer an edit of
  // the stored one.
  useEffect(
    () =>
      storeApi?.subscribe((state) => {
        for (const [variable, { shown }] of heldRef.current) {
          const value = state.pathOperations?.getFieldState([variable])?.value;
          if (!isEqual(value, shown)) heldRef.current.delete(variable);
        }
      }),
    [storeApi],
  );

  // Resolves to why the values could not be saved, or to undefined once they
  // are saved.
  const save = useCallback(
    async (values: Record<string, FieldValue>) => {
      // The form keeps what was entered, so the edit can be saved again once
      // whatever refused it is resolved.
      const showSaveFailure = (message: MessageDescriptor) => {
        storeApi?.getState().setErrors({
          formErrors: [createMessageError(message)],
          fieldErrors: {},
        });
        return message;
      };

      let failure: MessageDescriptor | undefined;
      let ownWrite: OwnWrite | undefined;
      // Built when the save is made, once the form has followed every undo or
      // redo made before it.
      const buildPatch = () => {
        const fieldState = storeApi?.getState().pathOperations?.getFieldState;
        const stored = ownWritesRef.current.at(-1)?.stored ?? givenRef.current;
        // An answer is saved only while the form still shows it, so a save
        // asked for before an undo cannot put back an answer the form has
        // since replaced, and never over an answer an undo or redo overtook.
        const savable = (form.fields ?? [])
          .map(({ variable }) => variable)
          .filter(
            (variable) =>
              !heldRef.current.has(variable) &&
              isEqual(
                ownValue(values, variable),
                fieldState?.([variable])?.value,
              ),
          );
        const patchResult = formValuesToAttributePatch(
          coerceValues(values),
          savable,
          { keepWhenUnanswered: unavailable ?? NO_UNAVAILABLE },
        );
        if (!patchResult.success) {
          failure = runtimeMessages.submissionFailed;
          return null;
        }

        // Every save adds an undo step, and a new step discards what could
        // be redone, so a save that changes nothing, as after the form
        // follows an undo, is not made.
        const { set, unset } = patchResult.patch;
        const changesAnswers =
          unset.some((name) => stored[name] !== undefined) ||
          Object.entries(set).some(
            ([name, value]) => !isEqual(value, stored[name]),
          );
        if (!changesAnswers) return null;

        ownWrite = {
          stored: Object.fromEntries(
            [...Object.entries(stored), ...Object.entries(set)].filter(
              ([name]) => !unset.includes(name),
            ),
          ),
          done: false,
        };
        ownWritesRef.current = [...ownWritesRef.current, ownWrite];
        return patchResult.patch;
      };

      try {
        await onSave(entityId, buildPatch);
      } catch (error) {
        ownWritesRef.current = ownWritesRef.current.filter(
          (pending) => pending !== ownWrite,
        );
        return showSaveFailure(rejectedWriteMessage(error));
      }
      if (failure) return showSaveFailure(failure);
      if (ownWrite) ownWrite.done = true;

      // What is stored now: the answers saved, and, for an edit an undo or
      // redo overtook, the stored answer it was not saved over.
      const saved = coerceValues(values);
      for (const variable of heldRef.current.keys()) {
        saved[variable] = ownValue(savedRef.current, variable);
      }
      savedRef.current = saved;
      return undefined;
    },
    [onSave, entityId, coerceValues, form.fields, unavailable, storeApi],
  );
  // A save that takes longer, as encrypting an answer can, never lands after
  // a newer one.
  const saveInOrder = useSavesInOrder(save, isSaved);
  const persist = useCallback(
    (values: Record<string, FieldValue>) => {
      const call = saveInOrder(values);
      // Saves settle in the order they are asked for, so the newest settles
      // last.
      const settled = call.then(
        () => undefined,
        () => undefined,
      );
      savesUnderWay.current = settled;
      void settled.then(() => {
        if (savesUnderWay.current === settled) savesUnderWay.current = null;
      });
      return call;
    },
    [saveInOrder],
  );

  const showsSaved = useCallback(
    (values: Record<string, FieldValue>) => {
      const shown = coerceValues(values);
      return (form.fields ?? []).every(({ variable }) =>
        sameAnswer(
          ownValue(shown, variable),
          ownValue(savedRef.current, variable),
        ),
      );
    },
    [coerceValues, form.fields],
  );

  const saveIfValid = useCallback(async () => {
    const state = storeApi?.getState();
    if (state && (await state.validateForm())) {
      await persist(state.getFormValues());
    }
  }, [storeApi, persist]);

  // Closing the Inspector, by leaving the stage or by moving the selection
  // off this entity, saves an edit not saved yet, even one the autosave has
  // not reached, and asks before discarding one that cannot be saved: an
  // invalid edit, one the store refused, or one an undo or redo overtook.
  const confirmLeave = useCallback((): true | Promise<boolean> => {
    const state = storeApi?.getState();
    if (!state) return true;
    if (savesUnderWay.current === null && showsSaved(state.getFormValues())) {
      return true;
    }

    if (pendingSave.current !== null) {
      clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    return (async () => {
      // A save refused while the answers are being checked would cut the
      // check short, so the saves under way settle first.
      await savesUnderWay.current;
      if (showsSaved(state.getFormValues())) return true;

      let reason = (await state.validateForm())
        ? await persist(state.getFormValues())
        : failedCheckReason(passphraseNeeded);
      // Leaving is not changing the question again, so an edit an undo or
      // redo overtook is not saved by it.
      if (reason === undefined && heldRef.current.size > 0) {
        reason = interfaceMessages.discardOvertakenEditDescription;
      }
      if (reason === undefined) return true;

      const discarded = await confirm({
        ...discardChangesDialog(reason),
        onConfirm: () => undefined,
      });
      return discarded === true;
    })();
  }, [storeApi, showsSaved, persist, passphraseNeeded, confirm]);

  useBeforeNext(confirmLeave);
  useEffect(
    () => guardDraft(entityId, confirmLeave),
    [guardDraft, entityId, confirmLeave],
  );

  return (
    <div data-testid="inspector-panel" className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" viewportClassName="p-4">
        <FormWithoutProvider onSubmit={noopSubmit}>
          <div>{fieldComponents}</div>
        </FormWithoutProvider>
      </ScrollArea>
      <AutoPersist onSettled={saveIfValid} pendingSave={pendingSave} />
    </div>
  );
}

export default function Inspector({
  entityId,
  form,
  subject,
  attributes,
  unavailable,
  passphraseStatus,
  onSave,
  onDelete,
  guardDraft,
}: InspectorProps) {
  const hasFields = form !== undefined && (form.fields?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasFields && passphraseStatus ? (
        <PassphraseNotice
          status={passphraseStatus}
          className="text-text/60 min-h-0 flex-1"
        />
      ) : hasFields ? (
        <FormStoreProvider>
          <AttributeFormInner
            entityId={entityId}
            form={form}
            subject={subject}
            attributes={attributes}
            unavailable={unavailable}
            onSave={onSave}
            guardDraft={guardDraft}
          />
        </FormStoreProvider>
      ) : null}
      <div className="flex shrink-0 items-center border-t border-current/10 p-4">
        <Button
          type="button"
          variant="text"
          color="destructive"
          onClick={() => onDelete(entityId)}
        >
          <AppMessage message={commonMessages.delete} />
        </Button>
      </div>
    </div>
  );
}
