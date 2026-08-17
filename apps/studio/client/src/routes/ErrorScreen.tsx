import type { ErrorComponentProps } from '@tanstack/react-router';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export class ServerUnreachableError extends Error {
  constructor() {
    super('The server could not be reached.');
    this.name = 'ServerUnreachableError';
  }
}

// The error message itself is deliberately not shown — an unhandled render
// error's text is for a developer, and this screen is for whoever is holding
// the tab.
export default function ErrorScreen({ error }: ErrorComponentProps) {
  const unreachable = error instanceof ServerUnreachableError;
  return (
    <main className="flex h-full items-center justify-center p-4">
      <Surface className="max-w-xl" spacing="lg">
        <Heading level="h1">Something went wrong</Heading>
        <Paragraph role="alert">
          {unreachable
            ? 'The server could not be reached. Check that it is running, then reload this page.'
            : 'This page could not be loaded. Reload to try again.'}
        </Paragraph>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </Surface>
    </main>
  );
}
