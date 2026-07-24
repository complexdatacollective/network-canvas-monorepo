import { useTranslations } from 'next-intl';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import type { TeamMember } from '~/lib/siteContent';

import { ScientificAdvisors } from './ScientificAdvisors';

export function CoreTeam({ members }: { members: readonly TeamMember[] }) {
  const t = useTranslations('Team');

  return (
    <Container as="section" className="">
      <SectionHeading title={t('heading')}>{t('introduction')}</SectionHeading>

      <div className="tablet-portrait:grid-cols-3 tablet-landscape:grid-cols-4 mt-14 grid grid-cols-2 gap-x-6 gap-y-12">
        {members.map((member, i) => (
          <Reveal
            key={member.id}
            delay={(i % 4) * 0.05}
            className="group spring-short z-10 flex flex-col items-center rounded p-3 text-center"
          >
            <img
              src={member.photo}
              alt={member.name}
              className="effect-shadow group-hover:effect-shadow-xl spring-short tablet-landscape:size-36 size-28 rounded-full object-cover group-hover:scale-105 motion-reduce:transform-none"
            />
            <Paragraph
              margin="none"
              className="font-heading text-text mt-5 text-lg font-bold"
            >
              {member.name}
            </Paragraph>
            <Paragraph margin="none" className="text-base-sm text-text/65 mt-1">
              {member.institution}
            </Paragraph>
          </Reveal>
        ))}
      </div>

      <ScientificAdvisors />
    </Container>
  );
}
