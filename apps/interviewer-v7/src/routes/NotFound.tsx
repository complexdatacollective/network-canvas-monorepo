import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function NotFoundRoute() {
  const [, navigate] = useLocation();
  return (
    <div className="mx-auto flex h-full max-w-xl items-center justify-center p-8">
      <Surface
        level={1}
        spacing="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">Page not found</Heading>
        <Paragraph>The page you were looking for does not exist.</Paragraph>
        <Button onClick={() => navigate('/')}>Return home</Button>
      </Surface>
    </div>
  );
}
