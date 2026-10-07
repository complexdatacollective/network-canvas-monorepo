'use client';
import { isEqual } from 'es-toolkit';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
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

import { formValuesToAttributePatch } from '../../forms/formValuesToAttributePatch';
import useProtocolForm from '../../forms/useProtocolForm';
import { rejectedWriteMessage } from '../../forms/writeSubmissionResult';
import useBeforeNext from '../../hooks/useBeforeNext';
import useOneAtATime from '../../hooks/useOneAtATime';
import { runtimeMessages } from '../../i18n/runtimeMessages';
import type { Subject } from '../../selectors/forms';
import type { AttributePatch } from '../../store/entityAttributePatch';
import KeepWhileProtected from '../Anonymisation/KeepWhileProtected';
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
   * Set while the entity's values cannot be shown or saved because they are
   * encrypted; the form is replaced by an explanation. A form already shown
   * is only hidden, so what was entered comes back with it.
   */
  passphraseStatus?: PassphraseNoticeStatus;
  onSave: (id: string, attributePatch: AttributePatch) => Promise<void>;
  onDelete: (id: string) => void;
  /**
   * Holds the participant on this entity while its form has a draft, so
   * whatever would close the Inspector first saves the draft or asks before
   * discarding it. Returns the function that releases the hold.
   */
  guardDraft: (entityId: string, confirmLeave: LeaveGuard) => () => void;
};

// How long to wait after the last edit before validating and persisting.
const AUTOSAVE_DELAY = 400;

// One of the form's own saves: the answers it stores, and whether the store
// has taken them.
type OwnWrite = { stored: Record<string, FieldValue>; done: boolean };

const noopSubmit: FormSubmitHandler = () => ({ success: true as const });

/**
 * Watches the form's values and, once they settle, validates and persists them
 * — so attribute edits save automatically (when valid) without a Save button.
 * Nothing is saved while it is not `enabled`; an edit made before then is
 * saved when it is enabled again.
 */
function AutoPersist({
  enabled,
  onValidValues,
}: {
  enabled: boolean;
  onValidValues: (values: Record<string, FieldValue>) => void;
}) {
  const storeApi = useContext(FormStoreContext);
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
    if (!enabled || !isDirty || !storeApi) return;

    const handle = setTimeout(() => {
      void storeApi
        .getState()
        .validateForm()
        .then((valid) => {
          if (valid) onValidValues(storeApi.getState().getFormValues());
        });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(handle);
  }, [enabled, values, isDirty, storeApi, onValidValues]);

  return null;
}

function AttributeFormInner({
  entityId,
  form,
  subject,
  attributes,
  canSave,
  onSave,
  guardDraft,
}: Omit<InspectorProps, 'form' | 'onDelete' | 'passphraseStatus'> & {
  form: ComposerForm;
  canSave: boolean;
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

  const { fieldComponents, coerceValues } = useProtocolForm({
    fields: form.fields ?? [],
    initialValues,
    subject,
    currentEntityId: entityId,
  });
  const storeApi = useContext(FormStoreContext);
  const { confirm } = useDialog();

  // The stored answers the form was last given.
  const givenRef = useRef(initialValues);
  // The answers each of the form's own saves stores, oldest first, from just
  // before it is made until the form is given them back. While any is
  // pending, the form may hold answers that differ from the stored ones even
  // when it shows the answers it was given, and the next save builds on the
  // newest of these rather than on those.
  const ownWritesRef = useRef<OwnWrite[]>([]);

  // An answer changed outside the form, as an undo does, replaces the one
  // shown unless the participant has changed that question since. Otherwise
  // the form would go on showing the undone answer, and save it back when the
  // Inspector closes. The answers the form's own save stored are not such a
  // change, even when the participant has put back the earlier answer since.
  useEffect(() => {
    const previous = givenRef.current;
    givenRef.current = initialValues;
    const state = storeApi?.getState();
    if (previous === initialValues || !state?.pathOperations) return;

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
    ownWritesRef.current = ownWrites.filter(({ done }) => !done);

    const shown = coerceValues(state.getFormValues());
    for (const { variable } of fields) {
      if (
        isEqual(shown[variable], previous[variable]) &&
        !isEqual(shown[variable], initialValues[variable])
      ) {
        state.pathOperations.resetField([variable]);
      }
    }
  }, [initialValues, storeApi, form.fields, coerceValues]);

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

      const stored = ownWritesRef.current.at(-1)?.stored ?? givenRef.current;
      const patchResult = formValuesToAttributePatch(
        coerceValues(values),
        (form.fields ?? []).map((field) => field.variable),
        stored,
      );
      if (!patchResult.success) {
        return showSaveFailure(runtimeMessages.submissionFailed);
      }

      // Every save adds an undo step, and a new step discards what could be
      // redone, so a save that changes nothing, as after the form follows an
      // undo, is not made.
      const { set, unset } = patchResult.patch;
      const changesAnswers =
        unset.length > 0 ||
        Object.entries(set).some(
          ([name, value]) => !isEqual(value, stored[name]),
        );
      if (changesAnswers) {
        const ownWrite: OwnWrite = {
          stored: Object.fromEntries(
            [...Object.entries(stored), ...Object.entries(set)].filter(
              ([name]) => !unset.includes(name),
            ),
          ),
          done: false,
        };
        ownWritesRef.current = [...ownWritesRef.current, ownWrite];
        try {
          await onSave(entityId, patchResult.patch);
        } catch (error) {
          ownWritesRef.current = ownWritesRef.current.filter(
            (pending) => pending !== ownWrite,
          );
          return showSaveFailure(rejectedWriteMessage(error));
        }
        ownWrite.done = true;
      }

      // An edit refused earlier is saved now, so the refusal is gone.
      const state = storeApi?.getState();
      if (state && state.errors.formErrors.length > 0) {
        state.setErrors(null);
      }
      return undefined;
    },
    [onSave, entityId, coerceValues, form.fields, storeApi],
  );
  // A save that takes longer, as protecting an answer can, never lands after
  // a newer one.
  const persist = useOneAtATime(save);

  const handleValidValues = useCallback(
    (values: Record<string, FieldValue>) => {
      void persist(values);
    },
    [persist],
  );

  // Closing the Inspector, by leaving the stage or by moving the selection
  // off this entity, saves an edit the autosave has not reached yet, and asks
  // before discarding one that cannot be saved: an invalid edit, one the
  // store refused, or one hidden because the passphrase cannot read it.
  const confirmLeave = useCallback((): true | Promise<boolean> => {
    const state = storeApi?.getState();
    if (!state) return true;
    const unsaved =
      selectIsFormDirty(state) || (canSave && ownWritesRef.current.length > 0);
    if (!unsaved) return true;

    return (async () => {
      let reason: MessageDescriptor | undefined =
        runtimeMessages.protectedAnswersNotSaved;
      if (canSave) {
        reason = (await state.validateForm())
          ? await persist(state.getFormValues())
          : interfaceMessages.discardChangesDescription;
        if (reason === undefined) return true;
      }

      const discarded = await confirm({
        ...discardChangesDialog(reason),
        onConfirm: () => undefined,
      });
      return discarded === true;
    })();
  }, [storeApi, canSave, persist, confirm]);

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
      <AutoPersist enabled={canSave} onValidValues={handleValidValues} />
    </div>
  );
}

export default function Inspector({
  entityId,
  form,
  subject,
  attributes,
  passphraseStatus,
  onSave,
  onDelete,
  guardDraft,
}: InspectorProps) {
  const hasFields = form !== undefined && (form.fields?.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasFields ? (
        <>
          {passphraseStatus && (
            <PassphraseNotice
              status={passphraseStatus}
              className="text-text/60 min-h-0 flex-1"
            />
          )}
          <KeepWhileProtected
            values={passphraseStatus ? undefined : attributes}
          >
            {(shownAttributes) => (
              <FormStoreProvider>
                <AttributeFormInner
                  entityId={entityId}
                  form={form}
                  subject={subject}
                  attributes={shownAttributes}
                  canSave={!passphraseStatus}
                  onSave={onSave}
                  guardDraft={guardDraft}
                />
              </FormStoreProvider>
            )}
          </KeepWhileProtected>
        </>
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
