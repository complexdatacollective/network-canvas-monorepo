import { get } from 'es-toolkit/compat';
import { useCallback, useMemo, useRef, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import DialogForm from '~/components/DialogForm/DialogForm';
import DirtyProbe from '~/components/DialogForm/DirtyProbe';
import { format, parse } from '~/components/TypeEditor/convert';
import getNewTypeTemplate from '~/components/TypeEditor/getNewTypeTemplate';
import TypeEditor, {
  type EntityTypeValues,
} from '~/components/TypeEditor/TypeEditor';
import validateEntityType from '~/components/TypeEditor/validateEntityType';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  createTypeAsync,
  updateTypeAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';
import { reportError } from '~/utils/reportError';

const FORM_ID = 'entity-type-dialog';

type EntityTypeDialogProps = {
  show: boolean;
  entity?: string;
  type?: string;
  onClose: (newTypeId?: string) => void;
};

const EntityTypeDialog = ({
  show,
  entity,
  type,
  onClose,
}: EntityTypeDialogProps) => {
  const dispatch = useAppDispatch();
  const { openDialog } = useDialog();
  const protocol = useAppSelector((state: RootState) => getProtocol(state));
  const dirtyRef = useRef(false);

  const isNew = !type;

  const initialValues = useMemo<EntityTypeValues>(() => {
    if (!entity || !protocol) {
      return {};
    }
    const defaultValue = getNewTypeTemplate({
      protocol,
      entity: entity as 'node' | 'edge',
    });
    const value = type
      ? get(protocol, ['codebook', entity, type]) || defaultValue
      : defaultValue;
    return format(value) as EntityTypeValues;
  }, [protocol, entity, type]);

  const title = useMemo(() => {
    if (!entity) {
      return '';
    }
    const entityLabel = entity === 'node' ? 'Node' : 'Edge';
    return isNew ? `Create ${entityLabel} Type` : `Edit ${entityLabel} Type`;
  }, [entity, isNew]);

  const handleSubmit = useCallback(
    async (values: Record<string, FieldValue>) => {
      if (!entity) return;

      // `updateType` replaces the whole definition, and `getFormValues()`
      // reports registered fields only — so the properties this editor does
      // not render (`variables` above all) are carried over from the committed
      // definition.
      const configuration = parse({ ...initialValues, ...values });

      try {
        if (isNew) {
          const result = await dispatch(
            createTypeAsync({
              entity: entity as 'node' | 'edge' | 'ego',
              configuration,
            }),
          ).unwrap();
          onClose(result.type);
        } else if (type) {
          await dispatch(
            updateTypeAsync({
              entity: entity as 'node' | 'edge' | 'ego',
              type,
              configuration,
            }),
          ).unwrap();
          onClose();
        }
      } catch (error) {
        // Keep the dialog open so the user can retry, and tell them the save
        // failed rather than leaving the submit looking like a no-op.
        const normalizedError = reportError(error);
        void openDialog({
          type: 'acknowledge',
          intent: 'destructive',
          title: isNew ? 'Could not create type' : 'Could not update type',
          description: normalizedError.message,
          actions: { primary: { label: 'OK', value: true } },
        });
      }
    },
    [dispatch, initialValues, onClose, entity, type, isNew, openDialog],
  );

  const handleCancel = useCallback(async () => {
    // An untouched form loses nothing, so close immediately. Once the author has
    // started filling it in, confirm before discarding — including brand-new
    // types, so an accidental backdrop/outside click can't drop a
    // partially-authored variable or type.
    if (!dirtyRef.current) {
      onClose();
      return;
    }

    const confirmed = await openDialog({
      type: 'choice',
      intent: 'warning',
      title: 'Unsaved Changes',
      description:
        'You have unsaved changes. Are you sure you want to close without saving?',
      actions: {
        primary: { label: 'Close Without Saving', value: true },
        cancel: { label: 'Cancel', value: false },
      },
    });

    if (confirmed) {
      onClose();
    }
  }, [onClose, openDialog]);

  /**
   * Every open is a different editing session, so each one needs its own field
   * store — the `key` `DialogForm` documents for exactly this.
   *
   * Identifying the session by what is being edited is not enough. `type` is
   * undefined for a creation, so `new-${entity}` was the SAME key for two
   * consecutive creations of the same entity — and this dialog is mounted for
   * the lifetime of its owner (`NewTypeDialog` keeps it rendered and only
   * toggles `show`), so nothing else separates them. What normally hides that
   * is `Modal`'s exit animation: it unmounts the form, whose `useForm` cleanup
   * resets the store. A close followed by another open before that exit
   * finishes cancels the removal, so the reset never runs — and the next
   * type's fields re-register over the previous one's parked values, which
   * `registerField` prefers over `initialValue`. Creating two edge types back
   * to back (the sample protocol's edge-creation sociogram does exactly that)
   * therefore reopened the dialog still holding the first type's name, colour
   * and shape, and saving it wrote those over the second type's own defaults.
   * Reopening the same type after abandoning an edit had the same effect.
   *
   * Counting opens rather than naming the session also covers that reopen
   * case, since `type` alone repeats there too. It is bumped as the dialog
   * OPENS (the React-documented adjust-state-on-prop-change pattern) rather
   * than on close, so the entering dialog is the fresh one and a close still
   * animates out.
   */
  const [wasShown, setWasShown] = useState(show);
  const [openCount, setOpenCount] = useState(0);
  if (show !== wasShown) {
    setWasShown(show);
    if (show) {
      setOpenCount((count) => count + 1);
    }
  }

  if (!entity) {
    return null;
  }

  return (
    <DialogForm
      // `entity`/`type` stay in the key so switching what is being edited
      // without closing still remounts, as before.
      key={`${entity}-${type ?? 'new'}-${openCount}`}
      open={show}
      onClose={() => void handleCancel()}
      title={title}
      formId={FORM_ID}
      submitLabel="Save and Close"
      onSubmit={handleSubmit}
      validate={validateEntityType}
    >
      <DirtyProbe dirtyRef={dirtyRef} />
      <TypeEditor
        entity={entity}
        type={type}
        isNew={isNew}
        initialValues={initialValues}
      />
    </DialogForm>
  );
};

export default EntityTypeDialog;
