import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';

export default function Home() {
  const status = useQuery(orpc.status.queryOptions());
  const teams = authClient.useListOrganizations();
  const [teamId, setTeamId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const firstTeam = teams.data?.[0];
    if (teamId === null && firstTeam) setTeamId(firstTeam.id);
  }, [teamId, teams.data]);

  const protocols = useQuery(
    orpc.protocols.list.queryOptions({
      input: { teamId: teamId ?? '' },
      enabled: teamId !== null,
    }),
  );
  const createProtocol = useMutation(
    orpc.protocols.create.mutationOptions({
      onSuccess: async (created, variables) => {
        await queryClient.invalidateQueries({
          queryKey: orpc.protocols.list.key({
            input: { teamId: variables.teamId },
          }),
        });
        await navigate({
          to: '/teams/$teamId/protocols/$protocolId/drafts/$draftId',
          params: {
            teamId: variables.teamId,
            protocolId: created.protocolId,
            draftId: created.draftId,
          },
        });
      },
    }),
  );

  const busy = teams.isPending || (teamId !== null && protocols.isPending);

  return (
    <main
      id="main-content"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-8"
    >
      <div>
        <Heading level="h1">Network Canvas Studio</Heading>
        <Paragraph>
          Design network interview protocols and collect network data remotely.
        </Paragraph>
      </div>

      <Paragraph className="sr-only" role="status" data-testid="server-status">
        {status.isPending && 'Checking the server connection…'}
        {status.isSuccess &&
          `${status.data.name} server, version ${status.data.version}.`}
      </Paragraph>
      {status.isError && (
        <Alert variant="destructive">
          The server could not be reached. Check that it is running, then reload
          this page.
        </Alert>
      )}

      {teams.error && (
        <Alert variant="destructive">
          Your teams could not be loaded. Reload the page to try again.
        </Alert>
      )}
      {!teams.isPending && teams.data?.length === 0 && (
        <Alert>
          You do not belong to a Studio team yet. Ask a team owner to invite
          you.
        </Alert>
      )}

      {teams.data && teams.data.length > 0 && (
        <Surface spacing="lg">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <label className="font-heading block font-bold" htmlFor="team">
                  Team
                </label>
                <select
                  id="team"
                  className="focusable bg-input text-input-contrast mt-2 min-h-12 rounded border-2 px-3"
                  value={teamId ?? ''}
                  onChange={(event) => setTeamId(event.target.value)}
                >
                  {teams.data.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              {busy && <Spinner size="sm" />}
            </div>

            <section aria-labelledby="protocols-heading">
              <Heading id="protocols-heading" level="h2">
                Protocols
              </Heading>
              {protocols.isError && (
                <Alert variant="destructive">
                  Protocols could not be loaded. Try again.
                </Alert>
              )}
              {protocols.data?.length === 0 && (
                <Paragraph>
                  No protocols have been created for this team.
                </Paragraph>
              )}
              {protocols.data && protocols.data.length > 0 && (
                <ul className="mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
                  {protocols.data.map((protocol) => (
                    <li key={protocol.id}>
                      {protocol.draftId === null ? (
                        <div className="bg-surface-1 text-surface-1-contrast elevation-low block rounded p-4 opacity-70">
                          <span className="font-heading block font-bold">
                            {protocol.name}
                          </span>
                          <span className="text-sm">No editable draft</span>
                        </div>
                      ) : (
                        <Link
                          className="focusable bg-surface-1 text-surface-1-contrast elevation-low hover:elevation-medium block rounded p-4 no-underline"
                          to="/teams/$teamId/protocols/$protocolId/drafts/$draftId"
                          params={{
                            teamId: teamId ?? '',
                            protocolId: protocol.id,
                            draftId: protocol.draftId,
                          }}
                        >
                          <span className="font-heading block font-bold">
                            {protocol.name}
                          </span>
                          <span className="text-sm">
                            Created {protocol.createdAt.toLocaleDateString()}
                          </span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="new-protocol-heading">
              <Heading id="new-protocol-heading" level="h2">
                New protocol
              </Heading>
              <Form
                className="mt-4 max-w-xl"
                onSubmit={async (values) => {
                  const name =
                    typeof values.name === 'string' ? values.name : '';
                  if (teamId === null) {
                    return {
                      success: false,
                      formErrors: ['Select a team before creating a protocol.'],
                    };
                  }
                  try {
                    await createProtocol.mutateAsync({ teamId, name });
                    return { success: true };
                  } catch {
                    return {
                      success: false,
                      formErrors: [
                        'The protocol could not be created. Wait a moment and try again.',
                      ],
                    };
                  }
                }}
              >
                <Field
                  name="name"
                  label="Protocol name"
                  component={InputField}
                  required
                />
                <SubmitButton>Create protocol</SubmitButton>
              </Form>
            </section>
          </div>
        </Surface>
      )}
    </main>
  );
}
