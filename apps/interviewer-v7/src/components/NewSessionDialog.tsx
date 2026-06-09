import { useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

import { NewSessionForm } from './NewSessionForm';

type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  onCancel: () => void;
  onCreated: (session: StoredSession) => void;
};

export function NewSessionDialog({
  open,
  protocol,
  onCancel,
  onCreated,
}: NewSessionDialogProps) {
  const formId = useId();

  // The store provider wraps the whole Dialog so the footer's SubmitButton —
  // rendered outside the <form> element — shares the form store and submits
  // via its `form={formId}` association.
  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={onCancel}
        title={protocol.name}
        footer={
          <>
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <SubmitButton form={formId}>Start interview</SubmitButton>
          </>
        }
      >
        <NewSessionForm
          formId={formId}
          protocol={protocol}
          onCreated={onCreated}
        />
      </Dialog>
    </FormStoreProvider>
  );
}
