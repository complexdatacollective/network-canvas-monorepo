import { ORPCError } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import { Badge } from '@codaco/fresco-ui/Badge';
import { Button } from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  AUDIT_ALERT_MAX_RECIPIENTS,
  type AuditAlertItem,
  type AuditAlertSettings,
} from '@codaco/studio-rpc';

import { orpc, rpcClient } from '../lib/api.ts';

const messages = defineMessages({
  heading: {
    id: 'studio.teamSettings.heading',
    defaultMessage: 'Team settings',
    description: 'Heading of the team settings screen.',
  },
  intro: {
    id: 'studio.teamSettings.intro',
    defaultMessage:
      'Choose who receives activity alerts for this team, and review your own alerts.',
    description: 'Introduction to the team alert settings and personal feed.',
  },
  recipients: {
    id: 'studio.teamSettings.recipients',
    defaultMessage: 'Activity alert recipients',
    description: 'Heading for team alert recipient configuration.',
  },
  recipientHelp: {
    id: 'studio.teamSettings.recipientHelp',
    defaultMessage:
      'Choose up to {maximum} verified owners or administrators. Alerts cover participant contact access, integration credential activity, and repeated access denials. Changes apply to future activity.',
    description:
      'Explains the fixed alert policy, eligible recipients and when settings apply.',
  },
  inApp: {
    id: 'studio.teamSettings.inApp',
    defaultMessage: 'In Studio',
    description: 'Name of the in-app activity alert channel.',
  },
  email: {
    id: 'studio.teamSettings.email',
    defaultMessage: 'Email',
    description: 'Name of the email activity alert channel.',
  },
  inAppFor: {
    id: 'studio.teamSettings.inAppFor',
    defaultMessage: 'In Studio alerts for {name}',
    description: 'Accessible label for a recipient in-app alert preference.',
  },
  emailFor: {
    id: 'studio.teamSettings.emailFor',
    defaultMessage: 'Email alerts for {name}',
    description: 'Accessible label for a recipient email alert preference.',
  },
  noEmail: {
    id: 'studio.teamSettings.noEmail',
    defaultMessage:
      'Email delivery is unavailable on this instance. Saving will remove email preferences; in-Studio alerts remain available.',
    description:
      'Explains unavailable email and the effect of saving preferences.',
  },
  missingRecipients: {
    id: 'studio.teamSettings.missingRecipients',
    defaultMessage:
      'Some configured recipients no longer qualify. Saving will remove their preferences.',
    description:
      'Warns that saving removes recipients whose membership or verification changed.',
  },
  truncated: {
    id: 'studio.teamSettings.truncated',
    defaultMessage:
      'This list shows the first 100 eligible members, including current recipients.',
    description: 'Explains the bounded eligible member list.',
  },
  noneEligible: {
    id: 'studio.teamSettings.noneEligible',
    defaultMessage: 'No verified owners or administrators are available.',
    description: 'Empty eligible recipient list.',
  },
  save: {
    id: 'studio.teamSettings.save',
    defaultMessage: 'Save alert preferences',
    description: 'Saves team alert recipient and channel preferences.',
  },
  saved: {
    id: 'studio.teamSettings.saved',
    defaultMessage: 'Alert preferences saved.',
    description: 'Success announcement after saving alert preferences.',
  },
  savedRefreshFailed: {
    id: 'studio.teamSettings.savedRefreshFailed',
    defaultMessage:
      'Alert preferences were saved. Refresh to load their current state.',
    description:
      'The preference write succeeded but its follow-up read failed.',
  },
  saveUnknown: {
    id: 'studio.teamSettings.saveUnknown',
    defaultMessage:
      'The save could not be confirmed. Refresh to check the current preferences before trying again.',
    description: 'A save had an ambiguous network outcome.',
  },
  conflict: {
    id: 'studio.teamSettings.conflict',
    defaultMessage:
      'These preferences changed elsewhere. Refresh and review the current choices before saving again.',
    description:
      'A settings revision conflict preserves the unsaved form for review.',
  },
  invalid: {
    id: 'studio.teamSettings.invalid',
    defaultMessage:
      'Choose up to {maximum} eligible recipients and use only available delivery channels.',
    description: 'Recipient or channel validation failure.',
  },
  failed: {
    id: 'studio.teamSettings.failed',
    defaultMessage: 'Activity alerts could not be loaded. Try refreshing.',
    description:
      'Generic alert query failure with no server diagnostic details.',
  },
  forbidden: {
    id: 'studio.teamSettings.forbidden',
    defaultMessage:
      'A verified owner or administrator account is required to view activity alerts.',
    description: 'The server refused audit alert access.',
  },
  refresh: {
    id: 'studio.teamSettings.refresh',
    defaultMessage: 'Refresh',
    description: 'Reloads current alert settings and the personal alert feed.',
  },
  loading: {
    id: 'studio.teamSettings.loading',
    defaultMessage: 'Loading activity alerts…',
    description: 'Accessible loading status for activity alerts.',
  },
  yourAlerts: {
    id: 'studio.teamSettings.yourAlerts',
    defaultMessage: 'Your activity alerts',
    description: 'Heading for the signed-in recipient personal alert feed.',
  },
  feedHelp: {
    id: 'studio.teamSettings.feedHelp',
    defaultMessage:
      'Only alerts addressed to your current membership and preferences appear here. Notifications contain no participant details.',
    description: 'Explains the scope and privacy of the personal alert feed.',
  },
  empty: {
    id: 'studio.teamSettings.empty',
    defaultMessage: 'You have no activity alerts yet.',
    description: 'Empty personal alert feed.',
  },
  contact: {
    id: 'studio.teamSettings.contact',
    defaultMessage: 'Participant contact information accessed',
    description:
      'Fixed title for an authorized participant contact access alert.',
  },
  credential: {
    id: 'studio.teamSettings.credential',
    defaultMessage: 'Integration credential activity',
    description:
      'Fixed title for an integration credential access or update alert.',
  },
  denials: {
    id: 'studio.teamSettings.denials',
    defaultMessage: 'Repeated access denials',
    description: 'Fixed title for repeated protected-operation denials.',
  },
  unread: {
    id: 'studio.teamSettings.unread',
    defaultMessage: 'Unread',
    description: 'Badge on an unread in-app alert.',
  },
  markRead: {
    id: 'studio.teamSettings.markRead',
    defaultMessage: 'Mark as read',
    description: 'Marks one personal in-app alert read.',
  },
  pending: {
    id: 'studio.teamSettings.pending',
    defaultMessage: 'Email pending',
    description: 'Email is queued or retrying.',
  },
  delivered: {
    id: 'studio.teamSettings.delivered',
    defaultMessage: 'Email sent',
    description: 'The email provider accepted the alert.',
  },
  rejected: {
    id: 'studio.teamSettings.rejected',
    defaultMessage: 'Email failed',
    description: 'The alert email reached a terminal rejected state.',
  },
  uncertain: {
    id: 'studio.teamSettings.uncertain',
    defaultMessage: 'Email delivery uncertain',
    description: 'The alert email may have been accepted before interruption.',
  },
  suppressed: {
    id: 'studio.teamSettings.suppressed',
    defaultMessage: 'Email suppressed',
    description: 'An outdated or no longer eligible email was suppressed.',
  },
  uncertaintyHelp: {
    id: 'studio.teamSettings.uncertaintyHelp',
    defaultMessage:
      'An email attempt was interrupted. Check your inbox before acknowledging it. Acknowledgement records your review and does not resend the email.',
    description:
      'Explains manual reconciliation without suggesting duplicate sends.',
  },
  acknowledge: {
    id: 'studio.teamSettings.acknowledge',
    defaultMessage: 'Acknowledge uncertainty',
    description:
      'Opens a confirmation for acknowledging an uncertain email delivery.',
  },
  acknowledgeTitle: {
    id: 'studio.teamSettings.acknowledgeTitle',
    defaultMessage: 'Acknowledge this delivery?',
    description: 'Title of the uncertain email acknowledgement dialog.',
  },
  acknowledged: {
    id: 'studio.teamSettings.acknowledged',
    defaultMessage: 'Uncertainty acknowledged',
    description: 'Badge after the recipient acknowledges uncertain delivery.',
  },
  actionFailed: {
    id: 'studio.teamSettings.actionFailed',
    defaultMessage:
      'The update could not be confirmed. Refresh to check its current state.',
    description: 'An alert read or acknowledgement could not be confirmed.',
  },
  updated: {
    id: 'studio.teamSettings.updated',
    defaultMessage: 'Alert updated.',
    description: 'Accessible success announcement for personal alert state.',
  },
  updatedRefreshFailed: {
    id: 'studio.teamSettings.updatedRefreshFailed',
    defaultMessage: 'The alert was updated. Refresh to load its current state.',
    description: 'An alert write succeeded but its follow-up read failed.',
  },
  more: {
    id: 'studio.teamSettings.more',
    defaultMessage: 'Load more alerts',
    description: 'Loads the next bounded page of personal alerts.',
  },
});

const policyMessages = {
  contact_access: messages.contact,
  credential_access: messages.credential,
  repeated_denials: messages.denials,
};
const emailMessages = {
  pending: messages.pending,
  delivered: messages.delivered,
  failed: messages.rejected,
  uncertain: messages.uncertain,
  suppressed: messages.suppressed,
};

function RecipientForm({
  teamId,
  settings,
  refresh,
  onSaved,
}: {
  teamId: string;
  settings: AuditAlertSettings;
  refresh: () => Promise<unknown>;
  onSaved: (state: 'saved' | 'refreshFailed' | null) => void;
}) {
  const intl = useAppIntl();
  const [saving, setSaving] = useState(false);
  const missing = settings.recipients.some(
    (recipient) =>
      !settings.eligibleMembers.some(
        (member) => member.memberId === recipient.memberId,
      ),
  );
  return (
    <Form
      onSubmit={async (values) => {
        const recipients = settings.eligibleMembers
          .map((member, index) => ({
            memberId: member.memberId,
            inApp: values[`inApp${index}`] === true,
            email: values[`email${index}`] === true,
          }))
          .filter((row) => row.inApp || row.email);
        if (recipients.length > AUDIT_ALERT_MAX_RECIPIENTS)
          return {
            success: false,
            formErrors: [
              intl.formatMessage(messages.invalid, {
                maximum: AUDIT_ALERT_MAX_RECIPIENTS,
              }),
            ],
          };
        setSaving(true);
        try {
          await rpcClient.audit.alerts.updateSettings({
            teamId,
            revision: settings.revision,
            recipients,
          });
          onSaved('saved');
          try {
            await refresh();
          } catch {
            onSaved('refreshFailed');
          }
          return { success: true };
        } catch (error) {
          const message =
            error instanceof ORPCError && error.code === 'CONFLICT'
              ? messages.conflict
              : error instanceof ORPCError && error.code === 'BAD_REQUEST'
                ? messages.invalid
                : messages.saveUnknown;
          return {
            success: false,
            formErrors: [
              intl.formatMessage(message, {
                maximum: AUDIT_ALERT_MAX_RECIPIENTS,
              }),
            ],
          };
        } finally {
          setSaving(false);
        }
      }}
      onChange={() => onSaved(null)}
      className="flex flex-col gap-5"
    >
      {!settings.emailAvailable && (
        <Alert variant="warning">{intl.formatMessage(messages.noEmail)}</Alert>
      )}
      {missing && (
        <Alert variant="warning">
          {intl.formatMessage(messages.missingRecipients)}
        </Alert>
      )}
      {settings.eligibleMembersTruncated && (
        <Paragraph>{intl.formatMessage(messages.truncated)}</Paragraph>
      )}
      {settings.eligibleMembers.length === 0 && (
        <Paragraph>{intl.formatMessage(messages.noneEligible)}</Paragraph>
      )}
      <div className="divide-border divide-y">
        {settings.eligibleMembers.map((member, index) => {
          const selected = settings.recipients.find(
            (recipient) => recipient.memberId === member.memberId,
          );
          return (
            <div
              key={member.memberId}
              className="flex flex-wrap items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <Paragraph className="font-semibold">{member.name}</Paragraph>
                <Paragraph className="text-sm break-all">
                  {member.email}
                </Paragraph>
              </div>
              <div className="flex flex-wrap gap-5">
                <div className="flex items-center gap-2">
                  <Field
                    name={`inApp${index}`}
                    component={Checkbox}
                    label={intl.formatMessage(messages.inAppFor, {
                      name: member.name,
                    })}
                    labelHidden
                    initialValue={selected?.inApp ?? false}
                    disabled={saving}
                  />
                  <span aria-hidden="true">
                    {intl.formatMessage(messages.inApp)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Field
                    name={`email${index}`}
                    component={Checkbox}
                    label={intl.formatMessage(messages.emailFor, {
                      name: member.name,
                    })}
                    labelHidden
                    initialValue={
                      settings.emailAvailable && (selected?.email ?? false)
                    }
                    disabled={saving || !settings.emailAvailable}
                  />
                  <span aria-hidden="true">
                    {intl.formatMessage(messages.email)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <SubmitButton disabled={saving}>
          {intl.formatMessage(messages.save)}
        </SubmitButton>
      </div>
    </Form>
  );
}

function PersonalAlerts({ teamId }: { teamId: string }) {
  const intl = useAppIntl();
  const dialog = useDialog();
  const feedHeading = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    'updated' | 'refreshFailed' | 'failed' | null
  >(null);
  const alerts = useInfiniteQuery(
    orpc.audit.alerts.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        teamId,
        ...(cursor ? { cursor } : {}),
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
      retry: false,
    }),
  );
  const items = alerts.data?.pages.flatMap((page) => page.items) ?? [];
  const update = async (item: AuditAlertItem, acknowledge: boolean) => {
    if (pending) return;
    const perform = async () => {
      setPending(item.id);
      setFeedback(null);
      try {
        if (acknowledge && item.emailDeliveryId)
          await rpcClient.audit.alerts.acknowledge({
            teamId,
            deliveryId: item.emailDeliveryId,
          });
        else
          await rpcClient.audit.alerts.markRead({ teamId, alertId: item.id });
        setFeedback('updated');
        try {
          const refreshed = await alerts.refetch();
          if (refreshed.isError) setFeedback('refreshFailed');
        } catch {
          setFeedback('refreshFailed');
        }
      } catch {
        setFeedback('failed');
        throw new Error(intl.formatMessage(messages.actionFailed));
      } finally {
        setPending(null);
      }
    };
    if (acknowledge) {
      await dialog.confirm({
        title: intl.formatMessage(messages.acknowledgeTitle),
        description: intl.formatMessage(messages.uncertaintyHelp),
        confirmLabel: intl.formatMessage(messages.acknowledge),
        onConfirm: perform,
        finalFocus: () => feedHeading.current,
      });
    } else {
      try {
        await perform();
      } catch {
        /* The inline alert already owns this failure. */
      }
    }
  };
  return (
    <Surface className="flex flex-col gap-4 p-6">
      <Heading level="h2" ref={feedHeading} tabIndex={-1}>
        {intl.formatMessage(messages.yourAlerts)}
      </Heading>
      <Paragraph>{intl.formatMessage(messages.feedHelp)}</Paragraph>
      <div role="status" aria-live="polite">
        {feedback === 'updated' ? intl.formatMessage(messages.updated) : ''}
        {feedback === 'refreshFailed'
          ? intl.formatMessage(messages.updatedRefreshFailed)
          : ''}
      </div>
      {feedback === 'failed' && (
        <Alert variant="destructive">
          {intl.formatMessage(messages.actionFailed)}
        </Alert>
      )}
      {alerts.isPending ? (
        <div role="status">
          <Spinner />
          {intl.formatMessage(messages.loading)}
        </div>
      ) : alerts.isError ? (
        <Alert variant="destructive">
          {intl.formatMessage(
            alerts.error instanceof ORPCError &&
              alerts.error.code === 'FORBIDDEN'
              ? messages.forbidden
              : messages.failed,
          )}
        </Alert>
      ) : (
        <>
          {items.length === 0 && (
            <Paragraph>{intl.formatMessage(messages.empty)}</Paragraph>
          )}
          <ol className="flex flex-col gap-4">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-border flex flex-col gap-3 rounded border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Heading level="h3">
                    {intl.formatMessage(policyMessages[item.policy])}
                  </Heading>
                  {item.inApp && !item.readAt && (
                    <Badge>{intl.formatMessage(messages.unread)}</Badge>
                  )}
                </div>
                <time dateTime={item.createdAt.toISOString()}>
                  {intl.formatDate(item.createdAt, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
                {item.emailState && (
                  <Paragraph>
                    {intl.formatMessage(emailMessages[item.emailState])}
                  </Paragraph>
                )}
                {item.emailState === 'uncertain' && (
                  <Paragraph>
                    {intl.formatMessage(
                      item.emailAcknowledgedAt
                        ? messages.acknowledged
                        : messages.uncertaintyHelp,
                    )}
                  </Paragraph>
                )}
                <div className="flex flex-wrap gap-3">
                  {item.inApp && !item.readAt && (
                    <Button
                      onClick={() => void update(item, false)}
                      disabled={pending !== null}
                    >
                      {intl.formatMessage(messages.markRead)}
                    </Button>
                  )}
                  {item.emailState === 'uncertain' &&
                    !item.emailAcknowledgedAt && (
                      <Button
                        onClick={() => void update(item, true)}
                        disabled={pending !== null}
                      >
                        {intl.formatMessage(messages.acknowledge)}
                      </Button>
                    )}
                </div>
              </li>
            ))}
          </ol>
          {alerts.hasNextPage && (
            <Button
              onClick={() => void alerts.fetchNextPage()}
              disabled={alerts.isFetchingNextPage}
            >
              {intl.formatMessage(messages.more)}
            </Button>
          )}
        </>
      )}
      <div>
        <Button
          onClick={() => void alerts.refetch()}
          disabled={alerts.isFetching}
        >
          {intl.formatMessage(messages.refresh)}
        </Button>
      </div>
    </Surface>
  );
}

export default function TeamSettings({ teamId }: { teamId: string }) {
  const intl = useAppIntl();
  const [saved, setSaved] = useState<'saved' | 'refreshFailed' | null>(null);
  const settings = useQuery(
    orpc.audit.alerts.settings.queryOptions({
      input: { teamId },
      retry: false,
    }),
  );
  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
      </div>
      <div role="status" aria-live="polite">
        {saved === 'saved' ? intl.formatMessage(messages.saved) : ''}
        {saved === 'refreshFailed'
          ? intl.formatMessage(messages.savedRefreshFailed)
          : ''}
      </div>
      {settings.isPending ? (
        <div role="status">
          <Spinner />
          {intl.formatMessage(messages.loading)}
        </div>
      ) : settings.isError ? (
        <Alert variant="destructive">
          {intl.formatMessage(
            settings.error instanceof ORPCError &&
              settings.error.code === 'FORBIDDEN'
              ? messages.forbidden
              : messages.failed,
          )}
        </Alert>
      ) : (
        <>
          <Surface className="flex flex-col gap-4 p-6">
            <Heading level="h2">
              {intl.formatMessage(messages.recipients)}
            </Heading>
            <Paragraph>
              {intl.formatMessage(messages.recipientHelp, {
                maximum: AUDIT_ALERT_MAX_RECIPIENTS,
              })}
            </Paragraph>
            <RecipientForm
              key={settings.data.revision ?? 'new'}
              teamId={teamId}
              settings={settings.data}
              refresh={async () => {
                const result = await settings.refetch();
                if (result.isError) throw new Error('Settings refresh failed');
              }}
              onSaved={setSaved}
            />
          </Surface>
          <PersonalAlerts key={teamId} teamId={teamId} />
        </>
      )}
      <div>
        <Button
          onClick={() => {
            setSaved(null);
            void settings.refetch();
          }}
          disabled={settings.isFetching}
        >
          {intl.formatMessage(messages.refresh)}
        </Button>
      </div>
    </div>
  );
}
