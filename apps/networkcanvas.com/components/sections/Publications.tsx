import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { externalLinks, publications } from '~/lib/content';

export function Publications() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Recent Publications Using Network Canvas">
        <p>
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
        </p>
        <p className="mt-3">
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
        </p>
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
              <h3 className="font-heading tablet-landscape:text-xl text-lg leading-snug font-bold">
                {pub.title}
              </h3>
              <p className="font-heading mt-4 text-xs font-bold tracking-[0.15em] text-white/55 uppercase">
                {pub.source}
              </p>
              <p className="mt-3 text-sm text-white/70">{pub.authors}</p>
            </a>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
