import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc, rpcClient } from '../lib/api.ts';

const route = getRouteApi('/app/team/$teamId/settings');
const messages = defineMessages({
  heading: {
    id: 'studio.teamAlertSettings.heading',
    defaultMessage: 'Researcher alert recipients',
    description: 'Audit alert settings heading.',
  },
  intro: {
    id: 'studio.teamAlertSettings.intro',
    defaultMessage:
      'Choose which verified team owners and administrators receive security alerts in Studio and by email.',
    description: 'Audit alert settings introduction.',
  },
  save: {
    id: 'studio.teamAlertSettings.save',
    defaultMessage: 'Save recipients',
    description: 'Save audit alert settings.',
  },
  saved: {
    id: 'studio.teamAlertSettings.saved',
    defaultMessage: 'Recipient settings saved.',
    description: 'Saved audit alert settings.',
  },
});
type Selection = {
  userId: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
};

export function TeamAlertSettings() {
  const { teamId } = route.useParams();
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const preferences = useQuery(
    orpc.audit.preferences.queryOptions({ input: { teamId } }),
  );
  const [selection, setSelection] = useState<Selection[]>([]);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (preferences.data)
      setSelection(
        preferences.data.recipients.map(
          ({ userId, emailEnabled, inAppEnabled }) => ({
            userId,
            emailEnabled,
            inAppEnabled,
          }),
        ),
      );
  }, [preferences.data]);
  const update = useMutation({
    mutationFn: (recipients: Selection[]) =>
      rpcClient.audit.updatePreferences({ teamId, recipients }),
    onSuccess: async (result) => {
      setSaved(true);
      setSelection(
        result.recipients.map(({ userId, emailEnabled, inAppEnabled }) => ({
          userId,
          emailEnabled,
          inAppEnabled,
        })),
      );
      await queryClient.invalidateQueries({
        queryKey: orpc.audit.preferences.queryKey({ input: { teamId } }),
      });
    },
  });
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph>{intl.formatMessage(messages.intro)}</Paragraph>
      </div>
      <Surface spacing="lg">
        {preferences.isPending && <Spinner size="sm" />}
        {preferences.isError && (
          <Alert variant="destructive">
            Unable to load recipient settings.
          </Alert>
        )}
        {preferences.data && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              update.mutate(
                selection.filter((item) => {
                  const recipient = preferences.data?.recipients.find(
                    ({ userId }) => userId === item.userId,
                  );
                  return (
                    recipient?.emailVerified && !recipient.recoveryDisabled
                  );
                }),
              );
            }}
          >
            <div className="flex flex-col gap-3">
              {preferences.data.recipients.map((recipient) => {
                const current = selection.find(
                  ({ userId }) => userId === recipient.userId,
                );
                const disabled =
                  !recipient.emailVerified || recipient.recoveryDisabled;
                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-4 rounded p-4"
                    key={recipient.userId}
                  >
                    <div>
                      <strong>{recipient.name}</strong>
                      <div>{recipient.email}</div>
                    </div>
                    <div className="flex gap-4">
                      <label>
                        <input
                          type="checkbox"
                          checked={current?.emailEnabled ?? false}
                          disabled={disabled || update.isPending}
                          onChange={(event) =>
                            setSelection((items) =>
                              items.map((item) =>
                                item.userId === recipient.userId
                                  ? {
                                      ...item,
                                      emailEnabled: event.target.checked,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />{' '}
                        Email
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={current?.inAppEnabled ?? false}
                          disabled={disabled || update.isPending}
                          onChange={(event) =>
                            setSelection((items) =>
                              items.map((item) =>
                                item.userId === recipient.userId
                                  ? {
                                      ...item,
                                      inAppEnabled: event.target.checked,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />{' '}
                        In Studio
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            {saved && <Alert>{intl.formatMessage(messages.saved)}</Alert>}
            <Button type="submit" disabled={update.isPending}>
              {intl.formatMessage(messages.save)}
            </Button>
          </form>
        )}
      </Surface>
    </div>
  );
}
