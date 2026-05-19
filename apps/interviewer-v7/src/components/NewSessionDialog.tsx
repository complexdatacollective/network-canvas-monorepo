import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { createInitialNetwork } from '@codaco/interview';
import { createSession } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

type NewSessionDialogProps = {
  open: boolean;
  protocol: ProtocolWithCounts;
  onClose: () => void;
  onCreated: (session: StoredSession) => void;
  layoutId?: string;
};

const FORM_ID = 'new-session-form';

export function NewSessionDialog({
  open,
  protocol,
  onClose,
  onCreated,
  layoutId,
}: NewSessionDialogProps) {
  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={onClose}
        layoutId={layoutId}
        title="Start a new interview"
        description={`Using ${protocol.name}`}
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton form={FORM_ID}>Start interview</SubmitButton>
          </>
        }
      >
        <FormWithoutProvider
          id={FORM_ID}
          onSubmit={async (values) => {
            const caseId = String(values.caseId ?? '').trim();
            if (!caseId) {
              return {
                success: false,
                fieldErrors: { caseId: ['Case ID is required'] },
              };
            }
            const session = await createSession({
              protocolHash: protocol.hash,
              protocolName: protocol.name,
              caseId,
              initialNetwork: createInitialNetwork(),
            });
            onCreated(session);
            return { success: true };
          }}
        >
          <Field
            name="caseId"
            label="Case ID"
            hint="A label used to identify this interview in exports."
            component={InputField}
            required="Case ID is required"
            minLength={1}
            validateOnChange
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}
