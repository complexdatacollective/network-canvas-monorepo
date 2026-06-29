'use client';

import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@codaco/fresco-ui/Button';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider, {
  FormStoreContext,
} from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmitHandler } from '@codaco/fresco-ui/form/store/types';
import { ScrollArea } from '@codaco/fresco-ui/ScrollArea';
import type { TitlelessForm } from '@codaco/protocol-validation';
import type { entityAttributesProperty, NcNode } from '@codaco/shared-consts';
import useProtocolForm from '~/forms/useProtocolForm';
import type { Subject } from '~/selectors/forms';

type Attributes = NcNode[typeof entityAttributesProperty];

export type InspectorProps = {
  entityId: string;
  form: TitlelessForm | undefined;
  subject: Subject;
  attributes: Attributes;
  onSave: (id: string, data: Attributes) => void;
  onDelete: (id: string) => void;
};

// How long to wait after the last edit before validating and persisting.
const AUTOSAVE_DELAY = 400;

const noopSubmit: FormSubmitHandler = () => ({ success: true as const });

/**
 * Watches the form's values and, once they settle, validates and persists them
 * — so attribute edits save automatically (when valid) without a Save button.
 */
function AutoPersist({
  onValidValues,
}: {
  onValidValues: (values: Record<string, FieldValue>) => void;
}) {
  const storeApi = useContext(FormStoreContext);
  const values = useFormStore(
    useShallow((state) => {
      const snapshot: Record<string, FieldValue> = {};
      state.fields.forEach((field, name) => {
        snapshot[name] = field.value;
      });
      return snapshot;
    }),
  );
  const isDirty = useFormStore((state) => state.isDirty);
  const isInitial = useRef(true);

  useEffect(() => {
    // Skip the initial mount: nothing has been edited yet.
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    if (!isDirty || !storeApi) return;

    const handle = setTimeout(() => {
      void storeApi
        .getState()
        .validateForm()
        .then((valid) => {
          if (valid) onValidValues(storeApi.getState().getFormValues());
        });
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(handle);
  }, [values, isDirty, storeApi, onValidValues]);

  return null;
}

function AttributeFormInner({
  entityId,
  form,
  subject,
  attributes,
  onSave,
}: Omit<InspectorProps, 'form' | 'onDelete'> & { form: TitlelessForm }) {
  const initialValues = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(attributes).map(([key, value]) => [
          key,
          value ?? undefined,
        ]),
      ) as Record<string, FieldValue>,
    [attributes],
  );

  const { fieldComponents, coerceValues } = useProtocolForm({
    fields: form.fields,
    initialValues,
    subject,
    currentEntityId: entityId,
  });

  const handleValidValues = useCallback(
    (values: Record<string, FieldValue>) => {
      // Coerce to declared codebook types (e.g. number fields emit strings)
      // before persisting — the same boundary cast SlidesForm uses.
      onSave(entityId, coerceValues(values) as Attributes);
    },
    [onSave, entityId, coerceValues],
  );

  return (
    <div data-testid="inspector-panel" className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" viewportClassName="p-4">
        <FormWithoutProvider onSubmit={noopSubmit}>
          <div>{fieldComponents}</div>
        </FormWithoutProvider>
      </ScrollArea>
      <AutoPersist onValidValues={handleValidValues} />
    </div>
  );
}

export default function Inspector({
  entityId,
  form,
  subject,
  attributes,
  onSave,
  onDelete,
}: InspectorProps) {
  const hasFields = form !== undefined && form.fields.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasFields ? (
        <FormStoreProvider>
          <AttributeFormInner
            entityId={entityId}
            form={form}
            subject={subject}
            attributes={attributes}
            onSave={onSave}
          />
        </FormStoreProvider>
      ) : (
        <div className="text-text/60 flex min-h-0 flex-1 items-center justify-center p-6 text-center">
          No attributes to edit
        </div>
      )}
      <div className="flex shrink-0 items-center border-t border-current/10 p-4">
        <Button
          type="button"
          variant="text"
          color="destructive"
          onClick={() => onDelete(entityId)}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
