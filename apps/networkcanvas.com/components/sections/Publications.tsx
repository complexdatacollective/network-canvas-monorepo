import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks, publications } from '~/lib/content';

export function Publications() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Recent Publications Using Network Canvas">
        <Paragraph margin="none">
          The following are the four most recent publications utilizing Network
          Canvas. For a full list of publications, see our{' '}
          <a
            href={externalLinks.publications}
            target="_blank"
            rel="noreferrer"
            className="text-link font-bold hover:underline"
          >
            documentation article
          </a>
          .
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          If you would like to feature your publication, please let us know by
          posting in our community site{' '}
          <a
            href={externalLinks.shareYourWork}
            target="_blank"
            rel="noreferrer"
            className="text-link font-bold hover:underline"
          >
            thread
          </a>
          .
        </Paragraph>
      </SectionHeading>

      <div className="tablet-landscape:grid-cols-2 mt-14 grid gap-6">
        {publications.map((pub, i) => (
          <Reveal key={pub.title} delay={(i % 2) * 0.06}>
            <a
              href={pub.href}
              target="_blank"
              rel="noreferrer"
              className="focusable bg-cyber-grape tablet-landscape:p-10 flex h-full flex-col rounded-[1.75rem] p-8 text-white shadow-lg transition-transform hover:-translate-y-1"
            >
              <Heading
                level="h3"
                margin="none"
                className="font-heading tablet-landscape:text-xl text-lg leading-snug font-bold"
              >
                {pub.title}
              </Heading>
              <Paragraph
                margin="none"
                className="font-heading mt-4 text-xs font-bold tracking-[0.15em] text-white/55 uppercase"
              >
                {pub.source}
              </Paragraph>
              <Paragraph margin="none" className="mt-3 text-sm text-white/70">
                {pub.authors}
              </Paragraph>
            </a>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
