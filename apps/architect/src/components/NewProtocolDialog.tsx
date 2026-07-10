import { useCallback, useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type {
  FieldValue,
  FormSubmissionResult,
} from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

type NewProtocolDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: { name: string }) => void;
  title?: string;
  initialName?: string;
};

const NewProtocolDialog = ({
  open,
  onOpenChange,
  onSubmit,
  title = 'Create New Protocol',
  initialName = '',
}: NewProtocolDialogProps) => {
  const formId = useId();

  const handleOpenChange = useCallback(
    (newOpen: boolean) => onOpenChange(newOpen),
    [onOpenChange],
  );

  const handleSubmit = useCallback(
    (values: Record<string, FieldValue>): FormSubmissionResult => {
      const name = typeof values.name === 'string' ? values.name.trim() : '';

      if (!name) {
        return {
          success: false,
          fieldErrors: {
            name: ['Protocol name is required'],
          },
        };
      }

      onSubmit({ name });
      return { success: true };
    },
    [onSubmit],
  );

  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={() => handleOpenChange(false)}
        title={title}
        size="readable"
        footer={
          <>
            <Button color="default" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton form={formId}>Create Protocol</SubmitButton>
          </>
        }
      >
        <FormWithoutProvider id={formId} onSubmit={handleSubmit}>
          <Field
            name="name"
            label="Protocol Name"
            hint="Use a short, recognizable name. Include a version number or date when it helps distinguish drafts, but avoid long project notes."
            component={InputField}
            initialValue={initialName}
            placeholder="Enter a name for your protocol..."
            required="Protocol name is required"
            autoFocus
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
};

export default NewProtocolDialog;
