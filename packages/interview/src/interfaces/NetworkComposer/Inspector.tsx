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
import discardChangesDialog from '../discardChangesDialog';
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
  onSave: (id: string, attributePatch: AttributePatch) => Promise<void>;
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

  const { fieldComponents, coerceValues, toAttributePatch } = useProtocolForm({
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

      const patchResult = toAttributePatch(values);
      if (!patchResult.success) {
        return showSaveFailure(runtimeMessages.submissionFailed);
      }

      try {
        await onSave(entityId, patchResult.patch);
      } catch (error) {
        return showSaveFailure(rejectedWriteMessage(error));
      }
      savedRef.current = coerceValues(values);
      return undefined;
    },
    [onSave, entityId, toAttributePatch, coerceValues, storeApi],
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
  // invalid edit, or one the store refused.
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

      const reason = (await state.validateForm())
        ? await persist(state.getFormValues())
        : interfaceMessages.discardChangesDescription;
      if (reason === undefined) return true;

      const discarded = await confirm({
        ...discardChangesDialog(reason),
        onConfirm: () => undefined,
      });
      return discarded === true;
    })();
  }, [storeApi, showsSaved, persist, confirm]);

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
      ) : (
        <div className="text-text/60 flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          <AppMessage message={interfaceMessages.noAttributes} />
        </div>
      )}
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
