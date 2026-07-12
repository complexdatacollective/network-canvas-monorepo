import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import {
  interns,
  previousContractors,
  scientificAdvisors,
} from '~/lib/content';

export function Contractors() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Contractors">
        <Paragraph margin="none">
          We develop our software in collaboration with a talented group of
          contractors.
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          If you have skills in Design, User Experience Research,
          NextJS/React/Tailwind, or other relevant technical skills, please feel
          free to contact us!
        </Paragraph>
      </SectionHeading>

      <div className="mx-auto mt-16 max-w-4xl">
        <Heading
          level="h3"
          margin="none"
          className="font-heading text-cyber-grape text-center text-2xl font-bold"
        >
          Previous Contractors
        </Heading>
        <div className="tablet-landscape:grid-cols-2 mt-8 grid gap-x-10 gap-y-5">
          {previousContractors.map((person) => (
            <Paragraph
              margin="none"
              key={person.name}
              className="text-text/80 text-base leading-relaxed"
            >
              <span className="text-cyber-grape font-bold">{person.name}</span>{' '}
              - {person.note}
            </Paragraph>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-4xl text-center">
        <Heading
          level="h3"
          margin="none"
          className="font-heading text-cyber-grape text-2xl font-bold"
        >
          Scientific Advisors
        </Heading>
        <Paragraph
          margin="none"
          className="text-text/80 tablet-landscape:text-lg mt-5 text-base"
        >
          {scientificAdvisors.join(', ')}
        </Paragraph>
      </div>

      <div className="mx-auto mt-16 max-w-4xl">
        <Heading
          level="h3"
          margin="none"
          className="font-heading text-cyber-grape text-center text-2xl font-bold"
        >
          Interns
        </Heading>
        <Paragraph
          margin="none"
          className="text-text/80 mx-auto mt-5 max-w-2xl text-center text-base"
        >
          We have been fortunate to work with several talented interns since our
          project began. Please contact us if you are interested in interning
          with our project.
        </Paragraph>
        <div className="tablet-landscape:grid-cols-2 mt-10 grid gap-6">
          {interns.map((intern) => (
            <Reveal
              key={intern.name}
              className="bg-surface flex flex-col rounded-[1.75rem] p-8 shadow-lg"
            >
              <Paragraph
                margin="none"
                className="text-text/80 text-base leading-relaxed"
              >
                {intern.note}
              </Paragraph>
              <div className="mt-6 flex items-center gap-4">
                <img
                  src={intern.photo}
                  alt={intern.name}
                  className="size-16 rounded-full object-cover"
                />
                <div>
                  <Paragraph
                    margin="none"
                    className="font-heading text-cyber-grape text-lg font-bold"
                  >
                    {'href' in intern && intern.href ? (
                      <a
                        href={intern.href}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-neon-coral"
                      >
                        {intern.name}
                      </a>
                    ) : (
                      intern.name
                    )}
                  </Paragraph>
                  <Paragraph
                    margin="none"
                    className="text-base-sm text-text/60"
                  >
                    {intern.period}
                  </Paragraph>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </Container>
  );
}
