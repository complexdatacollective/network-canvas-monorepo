import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc, rpcClient } from '../lib/api.ts';

const messages = defineMessages({
  heading: {
    id: 'studio.templates.heading',
    defaultMessage: 'Templates',
    description: 'Template workspace heading.',
  },
  intro: {
    id: 'studio.templates.intro',
    defaultMessage:
      'Import a verified Registry entry into a team, or publish an immutable local template version.',
    description: 'Template workspace explanation.',
  },
  team: {
    id: 'studio.templates.team',
    defaultMessage: 'Team',
    description: 'Team selector label.',
  },
  entry: {
    id: 'studio.templates.entry',
    defaultMessage: 'Registry entry ID',
    description: 'Registry import entry field.',
  },
  import: {
    id: 'studio.templates.import',
    defaultMessage: 'Import template',
    description: 'Import submit label.',
  },
  credential: {
    id: 'studio.templates.credential',
    defaultMessage: 'Registry publishing credential',
    description: 'Publish credential label.',
  },
  publish: {
    id: 'studio.templates.publish',
    defaultMessage: 'Publish version',
    description: 'Publish submit label.',
  },
  empty: {
    id: 'studio.templates.empty',
    defaultMessage: 'This team has no local template versions.',
    description: 'Empty template list.',
  },
  failed: {
    id: 'studio.templates.failed',
    defaultMessage:
      'The Registry operation could not be completed. Check the values and try again.',
    description: 'Registry operation failure.',
  },
  version: {
    id: 'studio.templates.version',
    defaultMessage: '{name}, version {version}',
    description: 'Template version label.',
  },
});

export default function Templates() {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const me = useQuery(orpc.me.queryOptions());
  const [teamId, setTeamId] = useState<string>('');
  const selectedTeam = teamId || me.data?.teams[0]?.teamId || '';
  const templates = useQuery({
    ...orpc.templates.list.queryOptions({ input: { teamId: selectedTeam } }),
    enabled: Boolean(selectedTeam),
  });
  const refresh = async () =>
    await queryClient.invalidateQueries({
      queryKey: orpc.templates.list.key({ input: { teamId: selectedTeam } }),
    });
  return (
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-5xl flex-col gap-6 p-4">
      <div>
        <Heading level="h1" margin="none" {...routeFocusTargetProps}>
          {intl.formatMessage(messages.heading)}
        </Heading>
        <Paragraph margin="none">
          {intl.formatMessage(messages.intro)}
        </Paragraph>
      </div>
      <Surface spacing="lg">
        <label className="flex flex-col gap-2 font-medium">
          {intl.formatMessage(messages.team)}
          <NativeSelectField
            name="team"
            value={selectedTeam}
            onChange={(value: string | number | undefined) =>
              setTeamId(String(value ?? ''))
            }
            options={(me.data?.teams ?? []).map(({ teamId: id }) => ({
              value: id,
              label: id,
            }))}
          />
        </label>
        <Form
          onSubmit={async ({ entryId }) => {
            if (typeof entryId !== 'string') return { success: false };
            try {
              await rpcClient.templates.import({
                teamId: selectedTeam,
                entryId,
              });
              await refresh();
              return { success: true };
            } catch {
              return {
                success: false,
                formErrors: [intl.formatMessage(messages.failed)],
              };
            }
          }}
        >
          <Field
            name="entryId"
            label={intl.formatMessage(messages.entry)}
            component={InputField}
            required
          />
          <SubmitButton disabled={!selectedTeam}>
            {intl.formatMessage(messages.import)}
          </SubmitButton>
        </Form>
      </Surface>
      {templates.data?.length === 0 && (
        <Alert>{intl.formatMessage(messages.empty)}</Alert>
      )}
      {templates.data?.map((template) => (
        <Surface spacing="lg" key={template.versionId}>
          <Heading level="h2" margin="none">
            {intl.formatMessage(messages.version, {
              name: template.name,
              version: template.version,
            })}
          </Heading>
          <Form
            onSubmit={async ({ credential }) => {
              if (typeof credential !== 'string') return { success: false };
              try {
                await rpcClient.templates.publish({
                  teamId: selectedTeam,
                  versionId: template.versionId,
                  credential,
                });
                await refresh();
                return { success: true };
              } catch {
                return {
                  success: false,
                  formErrors: [intl.formatMessage(messages.failed)],
                };
              }
            }}
          >
            <Field
              name="credential"
              label={intl.formatMessage(messages.credential)}
              component={InputField}
              type="password"
              autoComplete="off"
              required
            />
            <SubmitButton>{intl.formatMessage(messages.publish)}</SubmitButton>
          </Form>
        </Surface>
      ))}
    </div>
  );
}
