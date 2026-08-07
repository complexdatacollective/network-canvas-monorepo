import { useQuery } from '@tanstack/react-query';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Spinner from '@codaco/fresco-ui/Spinner';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { fetchStatus } from '../lib/api.ts';

export default function Home() {
  const status = useQuery({ queryKey: ['status'], queryFn: fetchStatus });

  return (
    <main className="flex h-full items-center justify-center p-4">
      <Surface className="max-w-xl" spacing="lg">
        <Heading level="h1">Network Canvas Studio</Heading>
        <Paragraph>
          Design network interview protocols and collect network data remotely.
        </Paragraph>
        {status.isPending && <Spinner size="sm" />}
        {status.isError && (
          <Paragraph role="alert">
            The server could not be reached. Check that it is running, then
            reload this page.
          </Paragraph>
        )}
        {status.isSuccess && (
          <Paragraph className="text-sm" data-testid="server-status">
            {status.data.name} server, version {status.data.version}.
          </Paragraph>
        )}
      </Surface>
    </main>
  );
}
