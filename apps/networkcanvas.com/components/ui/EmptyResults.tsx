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
      // An <output> may hold only phrasing content, and this holds a
      // heading and a paragraph.
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
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
