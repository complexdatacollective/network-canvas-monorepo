import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { createInitialNetwork } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';
import { createSession, getSettings } from '~/lib/db/api';
import type { ProtocolWithCounts, StoredSession } from '~/lib/db/types';
import { useOnline } from '~/lib/net/OnlineStatusProvider';
import { protocolRequiresInternet } from '~/lib/protocol/protocolRequiresInternet';

type NewSessionFormProps = {
  protocol: ProtocolWithCounts;
  onCreated: (session: StoredSession) => void;
  onCancel: () => void;
};

type NewSessionFormViewProps = {
  requiresInternet: boolean;
  online: boolean;
  onSubmit: (caseId: string) => Promise<FormSubmissionResult>;
  onCancel: () => void;
};

export function NewSessionFormView({
  requiresInternet,
  online,
  onSubmit,
  onCancel,
}: NewSessionFormViewProps) {
  const { openDialog } = useDialog();

  return (
    <Form
      onSubmit={async (values) => {
        const raw = values.caseId;
        const caseId = typeof raw === 'string' ? raw.trim() : '';
        if (!caseId) {
          return {
            success: false,
            fieldErrors: { caseId: ['Case ID is required'] },
          };
        }
        // This protocol renders an online map but the device is offline. Warn
        // the researcher; the map won't load, but they may still want to start
        // (the rest of the interview works, and connectivity may return).
        if (!online && requiresInternet) {
          const proceed = await openDialog({
            type: 'choice',
            intent: 'warning',
            title: 'You appear to be offline',
            description:
              'This protocol includes a map stage that needs an internet connection. The map will not load until you reconnect. You can still start the interview and complete the other stages.',
            actions: {
              primary: { label: 'Start anyway', value: true },
              cancel: { label: 'Cancel', value: null },
            },
          });
          if (proceed !== true) return { success: false };
        }
        return onSubmit(caseId);
      }}
    >
      <Field
        name="caseId"
        label="Case ID"
        hint="This will be shown on the resume interview screen to help you quickly identify this session."
        component={InputField}
        required="Case ID is required"
        minLength={1}
        validateOnChange
        autoFocus
        data-testid="new-session-case-id"
      />
      <div className="flex items-center justify-end gap-[2cqi]">
        <Button type="button" variant="text" color="dynamic" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton data-testid="new-session-submit">
          Start interview
        </SubmitButton>
      </div>
    </Form>
  );
}

export function NewSessionForm({
  protocol,
  onCreated,
  onCancel,
}: NewSessionFormProps) {
  const { requireFreshUnlock, setAuthorizedInterviewId } = useStepUpAuth();
  const isOnline = useOnline();

  // A protocol the launch-time migration could not bring up to the runtime's
  // schema version cannot run an interview — the interview route would refuse
  // the session it produced. Explain instead of creating a permanently
  // unusable session.
  if (protocol.schemaVersion !== COMPATIBLE_PROTOCOL_SCHEMA_VERSION) {
    return (
      <div className="flex flex-col gap-4">
        <Paragraph>
          This protocol could not be updated to work with this version of the
          app, so new interviews cannot be started from it. Responses already
          collected remain available on the data screen. Repair the protocol in
          Architect and import it again.
        </Paragraph>
        <div className="flex justify-end">
          <Button onClick={onCancel}>Close</Button>
        </div>
      </div>
    );
  }

  return (
    <NewSessionFormView
      requiresInternet={protocolRequiresInternet(protocol)}
      online={isOnline}
      onCancel={onCancel}
      onSubmit={async (caseId) => {
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
    />
  );
}
