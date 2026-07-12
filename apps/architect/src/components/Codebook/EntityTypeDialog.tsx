import { get } from 'es-toolkit/compat';
import { useCallback, useMemo } from 'react';
import { isDirty, isInvalid } from 'redux-form';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import InlineEditScreen from '~/components/InlineEditScreen/InlineEditScreen';
import { format, parse } from '~/components/TypeEditor/convert';
import getNewTypeTemplate from '~/components/TypeEditor/getNewTypeTemplate';
import TypeEditor from '~/components/TypeEditor/TypeEditor';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  createTypeAsync,
  updateTypeAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';
import { reportError } from '~/utils/reportError';

const formName = 'ENTITY_TYPE_DIALOG';

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
  const hasUnsavedChanges = useAppSelector((state: RootState) =>
    isDirty(formName)(state),
  );
  const invalid = useAppSelector((state: RootState) =>
    isInvalid(formName)(state),
  );

  const isNew = !type;

  const initialValues = useMemo(() => {
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
    return format(value);
  }, [protocol, entity, type]);

  const title = useMemo(() => {
    if (!entity) {
      return '';
    }
    const entityLabel = entity === 'node' ? 'Node' : 'Edge';
    return isNew ? `Create ${entityLabel} Type` : `Edit ${entityLabel} Type`;
  }, [entity, isNew]);

  const updateType = useCallback(
    async (
      entityType: string,
      typeKey: string,
      form: Record<string, unknown>,
    ) => {
      await dispatch(
        updateTypeAsync({
          entity: entityType as 'node' | 'edge' | 'ego',
          type: typeKey,
          configuration: parse(form),
        }),
      ).unwrap();
    },
    [dispatch],
  );

  const createType = useCallback(
    async (entityType: string, form: Record<string, unknown>) => {
      const result = await dispatch(
        createTypeAsync({
          entity: entityType as 'node' | 'edge' | 'ego',
          configuration: parse(form),
        }),
      ).unwrap();
      return result;
    },
    [dispatch],
  );

  const handleSubmit = useCallback(
    async (values: Record<string, unknown>) => {
      if (invalid) {
        return;
      }

      if (!entity) {
        return;
      }

      try {
        if (isNew) {
          const result = await createType(entity, values);
          onClose(result.type);
        } else if (type) {
          await updateType(entity, type, values);
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
    [createType, updateType, onClose, entity, type, isNew, invalid, openDialog],
  );

  const handleCancel = useCallback(async () => {
    // An untouched form loses nothing, so close immediately. Once the author has
    // started filling it in, confirm before discarding — including brand-new
    // types, so an accidental backdrop/outside click can't drop a
    // partially-authored variable or type.
    if (!hasUnsavedChanges) {
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
  }, [hasUnsavedChanges, onClose, openDialog]);

  if (!entity) {
    return null;
  }

  return (
    <InlineEditScreen
      show={show}
      form={formName}
      title={title}
      onSubmit={handleSubmit as (values: unknown) => void}
      onCancel={handleCancel}
      initialValues={initialValues}
    >
      <TypeEditor form={formName} entity={entity} type={type} isNew={isNew} />
    </InlineEditScreen>
  );
};

export default EntityTypeDialog;
