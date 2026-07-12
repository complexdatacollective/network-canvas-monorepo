import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { scientificAdvisors } from '~/lib/content';

export function ScientificAdvisors() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Scientific Advisors">
        <Paragraph
          margin="none"
          className="text-text/80 tablet-landscape:text-lg text-base"
        >
          {scientificAdvisors.join(', ')}
        </Paragraph>
      </SectionHeading>
    </Container>
  );
}
