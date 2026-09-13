import { ORPCError } from '@orpc/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Form from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { routeFocusTargetProps } from '@codaco/fresco-ui/navigation/RouteFocus';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc, rpcClient } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import { canManageTeam } from '../lib/teamRoles.ts';
import RegistryCredentialForm from './RegistryCredentialForm.tsx';

const messages = defineMessages({
  loading: {
    id: 'studio.templates.loading',
    defaultMessage: 'Loading templates…',
    description: 'Template workspace loading status.',
  },
  loadFailed: {
    id: 'studio.templates.loadFailed',
    defaultMessage: 'Templates could not be loaded. Try again.',
    description: 'Template workspace read error.',
  },
  noTeams: {
    id: 'studio.templates.noTeams',
    defaultMessage: 'Join a team to work with templates.',
    description: 'No team memberships.',
  },
  readOnly: {
    id: 'studio.templates.readOnly',
    defaultMessage:
      'Only team owners and administrators can publish or import templates.',
    description: 'Explains template read-only access.',
  },
  linkFirst: {
    id: 'studio.templates.linkFirst',
    defaultMessage:
      'Link your publisher identity in Account → Template Registry before publishing.',
    description: 'Explains the Registry account-link prerequisite.',
  },
  publication: {
    id: 'studio.templates.publication',
    defaultMessage: 'Published by {publisher} on {date} to {registry}.',
    description: 'Immutable Registry publication receipt.',
  },
  publishedLabel: {
    id: 'studio.templates.publishedLabel',
    defaultMessage: 'Published',
    description: 'Status of an already-published immutable version.',
  },
  importOrigin: {
    id: 'studio.templates.importOrigin',
    defaultMessage: 'Imported from {registry} on {date}.',
    description: 'Imported template provenance.',
  },

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
  unsupported: {
    id: 'studio.templates.unsupported',
    defaultMessage:
      'This Registry template uses a newer protocol schema than this Studio supports.',
    description: 'Registry import schema-version refusal.',
  },
  origin: {
    id: 'studio.templates.origin',
    defaultMessage: 'Configured Registry: {origin}',
    description: 'Operator-configured Registry origin.',
  },
  unavailable: {
    id: 'studio.templates.unavailable',
    defaultMessage: 'This Studio instance has no Template Registry configured.',
    description: 'Registry unavailable message.',
  },
  importPending: {
    id: 'studio.templates.importPending',
    defaultMessage: 'Import is pending Registry reconciliation.',
    description: 'Durable Registry import pending announcement.',
  },
  imported: {
    id: 'studio.templates.imported',
    defaultMessage: 'The Registry template was imported.',
    description: 'Registry import success announcement.',
  },
  publicationPending: {
    id: 'studio.templates.publicationPending',
    defaultMessage: 'Publication is pending Registry reconciliation.',
    description: 'Durable Registry publication pending announcement.',
  },
  published: {
    id: 'studio.templates.published',
    defaultMessage: 'The template version was published.',
    description: 'Registry publication success announcement.',
  },
  alreadyPublished: {
    id: 'studio.templates.alreadyPublished',
    defaultMessage: 'This template version was already published.',
    description: 'Registry publication replay announcement.',
  },
  version: {
    id: 'studio.templates.version',
    defaultMessage: '{name}, version {version}',
    description: 'Template version label.',
  },
});

function ImportSubmitButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const submitting = useFormStore((state) => state.isSubmitting);
  return <SubmitButton disabled={disabled || submitting}>{label}</SubmitButton>;
}

function TeamTemplates({
  teamId,
  canManage,
  origin,
  linked,
}: {
  teamId: string;
  canManage: boolean;
  origin: string | null;
  linked: boolean;
}) {
  const intl = useAppIntl();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<
    Array<{
      id: string;
      kind: 'import' | 'publication';
      versionId: string;
      origin: string | null;
    }>
  >([]);
  const templatesQuery = orpc.templates.list.queryOptions({
    input: { teamId },
  });
  const intentStates = useQuery({
    ...orpc.templates.registryIntents.queryOptions({
      input: {
        teamId,
        intents: pending.slice(0, 100).map(({ id, kind }) => ({ id, kind })),
      },
    }),
    enabled: canManage && pending.length > 0,
    refetchInterval: pending.length > 0 ? 2_000 : false,
  });
  useEffect(() => {
    const refused = intentStates.data?.filter(
      (intent) =>
        intent.status === 'quarantined' || intent.status === 'unavailable',
    );
    if (
      !refused?.some((intent) =>
        pending.some(
          (operation) =>
            operation.id === intent.id && operation.kind === intent.kind,
        ),
      )
    )
      return;
    setPending((current) =>
      current.filter(
        (operation) =>
          !refused.some(
            (intent) =>
              intent.id === operation.id && intent.kind === operation.kind,
          ),
      ),
    );
    setNotice(intl.formatMessage(messages.failed));
  }, [intentStates.data, pending, intl]);
  const templates = useQuery({
    ...templatesQuery,
    refetchInterval: pending.length > 0 ? 2_000 : false,
  });
  useEffect(() => {
    if (!templates.data || pending.length === 0) return;
    const remaining = pending.filter((operation) => {
      const version = templates.data.find(
        (candidate) => candidate.versionId === operation.versionId,
      );
      return (
        !version ||
        (operation.kind === 'publication' &&
          !version.publications.some(
            (publication) => publication.registryUrl === operation.origin,
          ))
      );
    });
    if (remaining.length === pending.length) return;
    const completed = pending.find(
      (operation) => !remaining.includes(operation),
    );
    setPending(remaining);
    if (remaining.length === 0 && completed)
      setNotice(
        intl.formatMessage(
          completed.kind === 'import' ? messages.imported : messages.published,
        ),
      );
  }, [templates.data, pending, intl]);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: templatesQuery.queryKey,
    });
  return (
    <>
      {notice && (
        <div role="status" aria-live="polite">
          <Alert>{notice}</Alert>
        </div>
      )}
      {!canManage && <Alert>{intl.formatMessage(messages.readOnly)}</Alert>}
      {canManage && origin && (
        <Surface spacing="lg">
          <Form
            onSubmit={async ({ entryId }) => {
              if (typeof entryId !== 'string' || !canManage)
                return { success: false };
              setNotice(null);
              try {
                const result = await rpcClient.templates.import({
                  teamId,
                  entryId,
                });
                if (result.status === 'pending')
                  setPending((current) => [
                    ...current.filter(
                      (operation) =>
                        operation.kind !== 'import' ||
                        operation.versionId !== result.versionId,
                    ),
                    {
                      id: result.intentId,
                      kind: 'import',
                      versionId: result.versionId,
                      origin,
                    },
                  ]);
                setNotice(
                  intl.formatMessage(
                    result.status === 'pending'
                      ? messages.importPending
                      : messages.imported,
                  ),
                );
                void refresh().catch(() => undefined);
                return { success: true };
              } catch (error) {
                return {
                  success: false,
                  formErrors: [
                    intl.formatMessage(
                      error instanceof ORPCError &&
                        error.code === 'UNPROCESSABLE_CONTENT' &&
                        error.message === 'TEMPLATE_SCHEMA_UNSUPPORTED'
                        ? messages.unsupported
                        : messages.failed,
                    ),
                  ],
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
            <ImportSubmitButton
              disabled={!canManage}
              label={intl.formatMessage(messages.import)}
            />
          </Form>
        </Surface>
      )}
      {templates.isPending && (
        <div role="status">
          <Spinner size="sm" />
          {intl.formatMessage(messages.loading)}
        </div>
      )}
      {templates.isError && (
        <Alert variant="destructive">
          {intl.formatMessage(messages.loadFailed)}
        </Alert>
      )}
      {!templates.isError && templates.data?.length === 0 && (
        <Alert>{intl.formatMessage(messages.empty)}</Alert>
      )}
      {!templates.isError &&
        templates.data?.map((template) => {
          const publishedHere = template.publications.some(
            (publication) => publication.registryUrl === origin,
          );
          return (
            <Surface spacing="lg" key={template.versionId}>
              <Heading level="h2" margin="none">
                {intl.formatMessage(messages.version, {
                  name: template.name,
                  version: template.version,
                })}
              </Heading>
              {template.registryOrigin && (
                <Paragraph margin="none">
                  {intl.formatMessage(messages.importOrigin, {
                    registry: template.registryOrigin.registry_url,
                    date: intl.formatDate(
                      new Date(template.registryOrigin.fetched_at),
                    ),
                  })}
                </Paragraph>
              )}
              {template.publications.map((publication) => (
                <Paragraph
                  margin="none"
                  key={`${publication.registryUrl}/${publication.entryId}`}
                >
                  {intl.formatMessage(messages.publication, {
                    publisher: publication.publisher.name,
                    date: intl.formatDate(publication.publishedAt),
                    registry: publication.registryUrl,
                  })}
                </Paragraph>
              ))}
              {canManage &&
                origin &&
                (linked ? (
                  <RegistryCredentialForm
                    disabled={publishedHere}
                    label={intl.formatMessage(messages.credential)}
                    submitLabel={intl.formatMessage(
                      publishedHere
                        ? messages.publishedLabel
                        : messages.publish,
                    )}
                    onSubmit={async (credential) => {
                      setNotice(null);
                      try {
                        const result = await rpcClient.templates.publish({
                          teamId,
                          versionId: template.versionId,
                          credential,
                        });
                        if (result.status === 'pending') {
                          setPending((current) => [
                            ...current.filter(
                              (operation) =>
                                operation.kind !== 'publication' ||
                                operation.versionId !== template.versionId ||
                                operation.origin !== origin,
                            ),
                            {
                              id: result.intentId,
                              kind: 'publication',
                              versionId: template.versionId,
                              origin,
                            },
                          ]);
                          setNotice(
                            intl.formatMessage(messages.publicationPending),
                          );
                          void refresh().catch(() => undefined);
                          return { success: true };
                        }
                        queryClient.setQueryData<
                          Awaited<ReturnType<typeof rpcClient.templates.list>>
                        >(templatesQuery.queryKey, (current) =>
                          current?.map((candidate) =>
                            candidate.versionId === template.versionId &&
                            !candidate.publications.some(
                              (publication) =>
                                publication.registryUrl ===
                                  result.publication.registryUrl &&
                                publication.entryId ===
                                  result.publication.entryId,
                            )
                              ? {
                                  ...candidate,
                                  publications: [
                                    ...candidate.publications,
                                    result.publication,
                                  ],
                                }
                              : candidate,
                          ),
                        );
                        setNotice(
                          intl.formatMessage(
                            result.replayed
                              ? messages.alreadyPublished
                              : messages.published,
                          ),
                        );
                        void refresh().catch(() => undefined);
                        return { success: true };
                      } catch {
                        return {
                          success: false,
                          formErrors: [intl.formatMessage(messages.failed)],
                        };
                      }
                    }}
                  />
                ) : (
                  <Alert>{intl.formatMessage(messages.linkFirst)}</Alert>
                ))}
            </Surface>
          );
        })}
    </>
  );
}

export default function Templates() {
  const intl = useAppIntl();
  const me = useQuery(orpc.me.queryOptions());
  const organizations = authClient.useListOrganizations();
  const registry = useQuery(orpc.account.registry.queryOptions());
  const [teamId, setTeamId] = useState('');
  const teams = (organizations.data ?? []).filter((team) =>
    me.data?.teams.some((membership) => membership.teamId === team.id),
  );
  const selectedTeam = teams.some((team) => team.id === teamId)
    ? teamId
    : (teams[0]?.id ?? '');
  const pending = me.isPending || organizations.isPending || registry.isPending;
  const failed = me.isError || Boolean(organizations.error) || registry.isError;
  const role = me.data?.teams.find(
    (membership) => membership.teamId === selectedTeam,
  )?.role;
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
      {pending ? (
        <div role="status">
          <Spinner size="sm" />
          {intl.formatMessage(messages.loading)}
        </div>
      ) : failed ? (
        <Alert variant="destructive">
          {intl.formatMessage(messages.loadFailed)}
        </Alert>
      ) : (
        <>
          <Surface spacing="lg">
            {registry.data?.origin ? (
              <Paragraph margin="none">
                {intl.formatMessage(messages.origin, {
                  origin: registry.data.origin,
                })}
              </Paragraph>
            ) : (
              <Alert>{intl.formatMessage(messages.unavailable)}</Alert>
            )}
            {teams.length > 0 ? (
              <label className="flex flex-col gap-2 font-medium">
                {intl.formatMessage(messages.team)}
                <NativeSelectField
                  name="team"
                  value={selectedTeam}
                  onChange={(value: string | number | undefined) =>
                    setTeamId(String(value ?? ''))
                  }
                  options={teams.map((team) => ({
                    value: team.id,
                    label: team.name,
                  }))}
                />
              </label>
            ) : (
              <Alert>{intl.formatMessage(messages.noTeams)}</Alert>
            )}
          </Surface>
          {selectedTeam && (
            <TeamTemplates
              key={selectedTeam}
              teamId={selectedTeam}
              canManage={canManageTeam(role)}
              origin={registry.data?.origin ?? null}
              linked={Boolean(registry.data?.link)}
            />
          )}
        </>
      )}
    </div>
  );
}
