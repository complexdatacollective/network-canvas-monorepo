import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function EmptyResults({
  heading,
  description,
}: {
  heading: string;
  description: string;
}) {
  return (
    <Surface
      noContainer
      spacing="lg"
      shadow="sm"
      role="status"
      className="mx-auto max-w-lg"
    >
      <Heading level="h3" margin="none">
        {heading}
      </Heading>
      <Paragraph margin="none" emphasis="muted" className="mt-3">
        {description}
      </Paragraph>
    </Surface>
  );
}
