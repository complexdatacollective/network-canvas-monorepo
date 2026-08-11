import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

// The router's defaultErrorComponent: what renders when a route loader or
// guard throws (e.g. the session check while the server is unreachable),
// instead of TanStack's unstyled built-in boundary.
export default function ErrorScreen() {
  return (
    <main className="flex h-full items-center justify-center p-4">
      <Surface className="max-w-xl" spacing="lg">
        <Heading level="h1">Something went wrong</Heading>
        <Paragraph role="alert">
          The server could not be reached. Check that it is running, then reload
          this page.
        </Paragraph>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </Surface>
    </main>
  );
}
