'use client';
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
  selectIsFormDirty,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import type { ComposerForm } from '@codaco/protocol-validation';
import type { entityAttributesProperty, NcNode } from '@codaco/shared-consts';

import useProtocolForm from '../../forms/useProtocolForm';
import { rejectedWriteMessage } from '../../forms/writeSubmissionResult';
import useBeforeNext from '../../hooks/useBeforeNext';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import type { Subject } from '../../selectors/forms';
import type { AttributePatch } from '../../store/entityAttributePatch';
import PassphraseNotice, {
  type PassphraseNoticeStatus,
} from '../Anonymisation/PassphraseNotice';
import discardChangesDialog from '../discardChangesDialog';
import { interfaceMessages } from '../messages';

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
};

// How long to wait after the last edit before validating and persisting.
const AUTOSAVE_DELAY = 400;

const noopSubmit: FormSubmitHandler = () => ({ success: true as const });

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

  const { fieldComponents, toAttributePatch } = useProtocolForm({
    fields: form.fields ?? [],
    initialValues,
    subject,
    currentEntityId: entityId,
    unavailableVariables: unavailable,
  });
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolves to why the values could not be saved, or to undefined once they
  // are saved.
  const persist = useCallback(
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
      return undefined;
    },
    [onSave, entityId, toAttributePatch, storeApi],
  );

  const saveIfValid = useCallback(async () => {
    const state = storeApi?.getState();
    if (state && (await state.validateForm())) {
      await persist(state.getFormValues());
    }
  }, [storeApi, persist]);

  // Leaving the stage saves an edit the autosave has not reached yet, and
  // asks before discarding one that cannot be saved: an invalid edit, or one
  // the store refused.
  useBeforeNext(async () => {
    const state = storeApi?.getState();
    if (!state) return true;
    if (pendingSave.current === null && !selectIsFormDirty(state)) return true;

    if (pendingSave.current !== null) {
      clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    const reason = (await state.validateForm())
      ? await persist(state.getFormValues())
      : interfaceMessages.discardChangesDescription;
    if (reason === undefined) return true;

    const discarded = await confirm({
      ...discardChangesDialog(reason),
      onConfirm: () => undefined,
    });
    return discarded === true;
  });

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
