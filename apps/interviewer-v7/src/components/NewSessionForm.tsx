import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { createInitialNetwork } from '@codaco/interview';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import { createSession, getSettings } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';

type NewSessionFormProps = {
  // Shared with the dialog footer's SubmitButton (`form={formId}`) so the
  // button can submit this form despite living outside the <form> element.
  formId: string;
  protocol: ProtocolWithCounts;
  onCreated: (session: StoredSession) => void;
};

export function NewSessionForm({
  formId,
  protocol,
  onCreated,
}: NewSessionFormProps) {
  const { requireFreshUnlock, setAuthorizedInterviewId } = useStepUpAuth();

  return (
    <FormWithoutProvider
      id={formId}
      onSubmit={async (values) => {
        const raw = values.caseId;
        const caseId = typeof raw === 'string' ? raw.trim() : '';
        if (!caseId) {
          return {
            success: false,
            fieldErrors: { caseId: ['Case ID is required'] },
          };
        }
        // Run the enter gate before creating the session so a declined or
        // failed unlock doesn't leave an orphan session behind.
        const settings = await getSettings();
        if (settings.requireUnlockOnEnter) {
          const result = await requireFreshUnlock();
          if (!result.ok) return { success: false };
        }
        const session = await createSession({
          protocolHash: protocol.hash,
          protocolName: protocol.name,
          caseId,
          initialNetwork: createInitialNetwork(),
        });
        // The user just satisfied the enter gate for this session; mark it
        // authorized so the InterviewRoute mount doesn't prompt again.
        setAuthorizedInterviewId(session.id);
        onCreated(session);
        return { success: true };
      }}
    >
      <Paragraph>
        Before the interview begins, enter a case ID. This will be shown on the
        resume interview screen to help you quickly identify this session.
      </Paragraph>

      <Field
        name="caseId"
        label="Case ID"
        hint="A label used to identify this interview in exports."
        component={InputField}
        required="Case ID is required"
        minLength={1}
        validateOnChange
        autoFocus
      />
    </FormWithoutProvider>
  );
}
