import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import SelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { RegistryAccountClient, RegistryReports } from './api.ts';
import { accountErrorMessage } from './feedback.ts';
import { messages } from './messages.ts';
import { useRequests } from './useRequests.ts';

const ACTIONS = {
  entry: ['curate', 'uncurate', 'takedown', 'restore'],
  publisher: ['suspend', 'reinstate'],
  artifact: ['delete'],
} as const;
const ActionSchema = z.enum([
  'curate',
  'uncurate',
  'takedown',
  'restore',
  'suspend',
  'reinstate',
  'delete',
]);
type TargetKind = keyof typeof ACTIONS;

export function Moderation({ client }: { client: RegistryAccountClient }) {
  const intl = useAppIntl();
  const { run, cancel } = useRequests();
  const [reports, setReports] = useState<RegistryReports | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(
    (after?: string) => {
      cancel();
      setLoading(true);
      void run((signal) => client.reports(after, signal))
        .then((result) => {
          if (result) {
            setReports(result);
            setError('');
            setLoading(false);
          }
        })
        .catch((cause) => {
          setError(accountErrorMessage(intl, cause));
          setLoading(false);
        });
    },
    [cancel, client, intl, run],
  );
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="grid gap-6">
      <Heading level="h2">{intl.formatMessage(messages.moderation)}</Heading>
      <Surface className="rounded p-6" aria-busy={loading}>
        <Heading level="h3">{intl.formatMessage(messages.reports)}</Heading>
        <Paragraph>{intl.formatMessage(messages.reportIntro)}</Paragraph>
        {error && <Alert variant="destructive">{error}</Alert>}
        {reports?.data.length === 0 && (
          <Paragraph role="status">
            {intl.formatMessage(messages.noReports)}
          </Paragraph>
        )}
        {reports && reports.data.length > 0 && (
          <ul className="my-6 grid list-none gap-5 p-0">
            {reports.data.map((report) => (
              <li
                key={report.id}
                className="min-w-0 border-t border-current/15 pt-4 break-words"
              >
                <Heading level="h4" className="break-all">
                  {report.entry_id}
                </Heading>
                <Paragraph>
                  <time dateTime={report.created_at}>
                    {intl.formatDate(report.created_at, {
                      dateStyle: 'medium',
                    })}
                  </time>
                </Paragraph>
                <Paragraph className="whitespace-pre-wrap">
                  {report.details ?? intl.formatMessage(messages.reportRemoved)}
                </Paragraph>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3">
          <Button disabled={loading} onClick={() => load()}>
            {intl.formatMessage(messages.newestReports)}
          </Button>
          {reports?.next_cursor && (
            <Button
              disabled={loading}
              onClick={() => {
                if (reports.next_cursor) load(reports.next_cursor);
              }}
            >
              {intl.formatMessage(messages.olderReports)}
            </Button>
          )}
        </div>
      </Surface>
      {(['entry', 'publisher', 'artifact'] as const).map((kind) => (
        <OperatorForm
          key={kind}
          kind={kind}
          client={client}
          refreshReports={() => load()}
        />
      ))}
    </section>
  );
}

function OperatorForm({
  kind,
  client,
  refreshReports,
}: {
  kind: TargetKind;
  client: RegistryAccountClient;
  refreshReports: () => void;
}) {
  const intl = useAppIntl();
  const { confirm } = useDialog();
  const { run } = useRequests();
  const [notice, setNotice] = useState('');
  const targetMessage =
    kind === 'entry'
      ? messages.entryId
      : kind === 'publisher'
        ? messages.publisherId
        : messages.root;
  return (
    <Surface className="rounded p-6">
      <Heading level="h3">
        {intl.formatMessage(
          kind === 'artifact' ? messages.delete : targetMessage,
        )}
      </Heading>
      {notice && <Alert variant="success">{notice}</Alert>}
      <Form
        onSubmit={async (values) => {
          setNotice('');
          const id = (
            kind === 'artifact' ? z.string().regex(/^[0-9a-f]{64}$/) : z.uuid()
          ).safeParse(values.target);
          const action = ActionSchema.safeParse(
            kind === 'artifact' ? 'delete' : values.action,
          );
          if (
            !id.success ||
            !action.success ||
            !(ACTIONS[kind] as readonly string[]).includes(action.data)
          )
            return {
              success: false,
              formErrors: [intl.formatMessage(messages.invalid)],
            };
          const selected = action.data;
          const actionLabel = intl.formatMessage(messages[selected]);
          await confirm({
            title: intl.formatMessage(messages.confirmAction),
            description:
              kind === 'artifact'
                ? intl.formatMessage(messages.confirmDelete, { root: id.data })
                : intl.formatMessage(
                    kind === 'entry'
                      ? messages.confirmEntry
                      : messages.confirmPublisher,
                    { action: actionLabel, id: id.data },
                  ),
            confirmLabel: actionLabel,
            intent: ['delete', 'takedown', 'suspend'].includes(selected)
              ? 'destructive'
              : 'default',
            onConfirm: async (dialogSignal) => {
              try {
                const result = await run((signal) => {
                  const combined = AbortSignal.any([signal, dialogSignal]);
                  if (selected === 'curate' || selected === 'uncurate')
                    return client.curate(
                      id.data,
                      selected === 'curate',
                      combined,
                    );
                  if (selected === 'takedown' || selected === 'restore')
                    return client.visibility(
                      id.data,
                      selected === 'takedown',
                      combined,
                    );
                  if (selected === 'suspend' || selected === 'reinstate')
                    return client.suspend(
                      id.data,
                      selected === 'suspend',
                      combined,
                    );
                  return client.hardDelete(id.data, combined);
                });
                if (result) {
                  setNotice(intl.formatMessage(messages.saved));
                  refreshReports();
                }
              } catch (error) {
                throw new Error(accountErrorMessage(intl, error), {
                  cause: error,
                });
              }
            },
          });
          return { success: true };
        }}
      >
        <Field
          name="target"
          component={InputField}
          label={intl.formatMessage(targetMessage)}
          required
          maxLength={kind === 'artifact' ? 64 : 36}
          autoComplete="off"
          pattern={{
            regex:
              kind === 'artifact'
                ? '^[0-9a-f]{64}$'
                : '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
            hint: intl.formatMessage(messages.invalid),
            errorMessage: intl.formatMessage(messages.invalid),
          }}
        />
        {kind !== 'artifact' && (
          <Field
            name="action"
            component={SelectField}
            label={intl.formatMessage(messages.action)}
            required
            options={ACTIONS[kind].map((value) => ({
              value,
              label: intl.formatMessage(messages[value]),
            }))}
          />
        )}
        <SubmitButton>
          {intl.formatMessage(
            kind === 'artifact' ? messages.delete : messages.apply,
          )}
        </SubmitButton>
      </Form>
    </Surface>
  );
}
