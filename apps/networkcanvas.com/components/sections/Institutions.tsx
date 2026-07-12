import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { institutions } from '~/lib/content';

export function Institutions() {
  return (
    <Container className="tablet-landscape:py-24 py-20">
      <SectionHeading title="Institutions">
        <Paragraph margin="none">
          The software is being developed by a team of researchers and
          developers based at Northwestern University and the University of
          Oxford, as well as several external contracted developers. We are
          grateful for the{' '}
          <a
            href="https://reporter.nih.gov/search/MPUhMnE1GkqRHltT4rj3TQ/project-details/10405582"
            target="_blank"
            rel="noreferrer"
            className="text-link font-bold hover:underline"
          >
            prior
          </a>{' '}
          and{' '}
          <a
            href="https://reporter.nih.gov/search/vo3bW-y-mE6OeQAQvDNH5g/project-details/10233551"
            target="_blank"
            rel="noreferrer"
            className="text-link font-bold hover:underline"
          >
            ongoing
          </a>{' '}
          funding from the National Institutes of Health that make this work
          possible.
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          The intellectual property and copyright associated with the software
          is controlled by a registered not-for-profit, the Complex Data
          Collective, comprising the core project staff.
        </Paragraph>
      </SectionHeading>

      <div className="mt-14 flex flex-wrap items-center justify-center gap-x-16 gap-y-10">
        {institutions.map((inst) => (
          <img
            key={inst.name}
            src={inst.logo}
            alt={inst.name}
            className="tablet-landscape:h-20 h-16 w-auto object-contain"
          />
        ))}
      </div>
    </Container>
  );
}
