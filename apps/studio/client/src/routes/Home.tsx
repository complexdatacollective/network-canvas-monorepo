import { useQuery } from '@tanstack/react-query';

import { Alert } from '@codaco/fresco-ui/Alert';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { orpc } from '../lib/api.ts';
import { authClient } from '../lib/auth.ts';
import TeamWorkspace from './TeamWorkspace.tsx';

export default function Home() {
  const status = useQuery(orpc.status.queryOptions());
  const teams = authClient.useListOrganizations();

  return (
    // The `<main id="main-content">` is the area layout's (§5.3, §7.1): the
    // skip link is rendered by `AppFrame` and the landmark it targets by
    // `AppArea`, so a route that declared its own would give the link two
    // candidates and nest one `<main>` inside another.
    <div className="tablet-portrait:p-8 mx-auto flex w-full max-w-6xl flex-col gap-6 p-4">
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
        <TeamWorkspace teams={teams.data} />
      )}
    </div>
  );
}
