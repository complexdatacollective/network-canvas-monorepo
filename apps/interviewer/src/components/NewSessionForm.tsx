import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
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
import {
  isSchema8Protocol,
  type ProtocolWithCounts,
  type StoredSession,
} from '~/lib/db/types';
import {
  getBundledLegacyInterviewer,
  LEGACY_INTERVIEWER_MAJOR,
} from '~/lib/legacyInterviewer';
import { useOnline } from '~/lib/net/OnlineStatusProvider';
import { protocolRequiresInternet } from '~/lib/protocol/protocolRequiresInternet';
import { useLegacyInterviewerOffline } from '~/lib/pwa/legacyInterviewerOffline';

import { legacyProtocolMessages } from './legacyProtocolMessages';
import { offlineMessages } from './offlineMessages';

const messages = defineMessages({
  caseID: {
    id: 'interviewer.newSessionForm.caseID',
    defaultMessage: 'Case ID',
    description: 'The label label in Interviewer New Session Form.',
  },
  thisWillBeShownOnTheResume: {
    id: 'interviewer.newSessionForm.thisWillBeShownOnTheResume',
    defaultMessage:
      'This will be shown on the resume interview screen to help you quickly identify this session.',
    description: 'The hint label in Interviewer New Session Form.',
  },
  startInterview: {
    id: 'interviewer.newSessionForm.startInterview',
    defaultMessage: 'Start interview',
    description: 'Visible copy in Interviewer New Session Form.',
  },
  thisProtocolCouldNotBeUpdatedTo: {
    id: 'interviewer.newSessionForm.thisProtocolCouldNotBeUpdatedTo',
    defaultMessage:
      'This protocol could not be updated to work with this version of the app, so new interviews cannot be started from it. Responses already collected remain available on the data screen. Repair the protocol in Architect and import it again.',
    description: 'Visible copy in Interviewer New Session Form.',
  },
  caseIDIsRequired: {
    id: 'interviewer.newSessionForm.caseIDIsRequired',
    defaultMessage: 'Case ID is required',
    description: 'User-facing message in Interviewer New Session Form.',
  },
  youAppearToBeOffline: {
    id: 'interviewer.newSessionForm.youAppearToBeOffline',
    defaultMessage: 'You appear to be offline',
    description: 'User-facing message in Interviewer New Session Form.',
  },
  thisProtocolIncludesAMapStageThat: {
    id: 'interviewer.newSessionForm.thisProtocolIncludesAMapStageThat',
    defaultMessage:
      'This protocol includes a map stage that needs an internet connection. The map will not load until you reconnect. You can still start the interview and complete the other stages.',
    description: 'User-facing message in Interviewer New Session Form.',
  },
  startAnyway: {
    id: 'interviewer.newSessionForm.startAnyway',
    defaultMessage: 'Start anyway',
    description: 'User-facing message in Interviewer New Session Form.',
  },
});

// The offline-map warning's localised nodes, built once at module scope so the
// form's submit handler stays a plain callback rather than an element factory.
const offlineWarningTitle = (
  <AppMessage message={messages.youAppearToBeOffline} />
);
const offlineWarningDescription = (
  <AppMessage message={messages.thisProtocolIncludesAMapStageThat} />
);
const offlineWarningPrimaryLabel = (
  <AppMessage message={messages.startAnyway} />
);
const offlineWarningCancelLabel = (
  <AppMessage message={commonMessages.cancel} />
);

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
  const intl = useAppIntl();
  const { openDialog } = useDialog();

  return (
    <Form
      onSubmit={async (values) => {
        const raw = values.caseId;
        const caseId = typeof raw === 'string' ? raw.trim() : '';
        if (!caseId) {
          return {
            success: false,
            fieldErrors: {
              caseId: [createMessageError(messages.caseIDIsRequired)],
            },
          };
        }
        // This protocol renders an online map but the device is offline. Warn
        // the researcher; the map won't load, but they may still want to start
        // (the rest of the interview works, and connectivity may return).
        if (!online && requiresInternet) {
          const proceed = await openDialog({
            type: 'choice',
            intent: 'warning',
            title: offlineWarningTitle,
            description: offlineWarningDescription,
            actions: {
              primary: {
                label: offlineWarningPrimaryLabel,
                value: true,
              },
              cancel: {
                label: offlineWarningCancelLabel,
                value: null,
              },
            },
          });
          if (proceed !== true) return { success: false };
        }
        return onSubmit(caseId);
      }}
    >
      <Field
        name="caseId"
        label={intl.formatMessage(messages.caseID)}
        hint={intl.formatMessage(messages.thisWillBeShownOnTheResume)}
        component={InputField}
        required={intl.formatMessage(messages.caseIDIsRequired)}
        minLength={1}
        validateOnChange
        autoFocus
        data-testid="new-session-case-id"
      />
      <div className="flex items-center justify-end gap-[2cqi]">
        <Button type="button" variant="text" color="dynamic" onClick={onCancel}>
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
        <SubmitButton data-testid="new-session-submit">
          {intl.formatMessage(messages.startInterview)}
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
  const intl = useAppIntl();
  const { requireFreshUnlock, setAuthorizedInterviewId } = useStepUpAuth();
  const isOnline = useOnline();
  const interviewer8Offline = useLegacyInterviewerOffline();

  // A schema 8 protocol's interviews run in the bundled Interviewer 8, which
  // the interview route hosts. A build without it cannot run them: explain
  // rather than create an interview nothing here could open.
  const schema8 = isSchema8Protocol(protocol);
  const runnable = schema8
    ? getBundledLegacyInterviewer() !== null
    : protocol.schemaVersion === COMPATIBLE_PROTOCOL_SCHEMA_VERSION;

  // A protocol at another schema version cannot run an interview here — the
  // interview route would refuse the session it produced. Explain instead of
  // creating a permanently unusable session.
  if (!runnable) {
    return (
      <div className="flex flex-col gap-4">
        <Paragraph>
          {schema8
            ? intl.formatMessage(legacyProtocolMessages.notAvailableHelp, {
                legacyVersion: LEGACY_INTERVIEWER_MAJOR,
              })
            : intl.formatMessage(messages.thisProtocolCouldNotBeUpdatedTo)}
        </Paragraph>
        <div className="flex justify-end">
          <Button onClick={onCancel}>
            {intl.formatMessage(commonMessages.close)}
          </Button>
        </div>
      </div>
    );
  }

  // Offline, a schema 8 interview opens only once Interviewer 8 is saved on
  // this device; until then the interview route could show nothing but an
  // error, so explain here rather than create an interview that cannot open.
  if (schema8 && !isOnline && interviewer8Offline !== 'ready') {
    return (
      <div className="flex flex-col gap-4">
        <Paragraph>
          {intl.formatMessage(offlineMessages.notReadyHelp)}
        </Paragraph>
        <div className="flex justify-end">
          <Button onClick={onCancel}>
            {intl.formatMessage(commonMessages.close)}
          </Button>
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
        // The enter step every interview takes. A schema 8 interview runs in
        // Interviewer 8, hosted by the interview route, which is handed this
        // app's unlock, so this is the only time the researcher is asked. Run
        // before creating the session so a declined or failed unlock doesn't
        // leave an orphan session behind.
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
