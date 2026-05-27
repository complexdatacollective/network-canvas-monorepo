import { Container } from '~/components/ui/Container';
import { Reveal } from '~/components/ui/Reveal';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { coreTeam } from '~/lib/content';

export function CoreTeam() {
  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Core Team">
        Our project team comprises individuals across a variety of disciplines
        and specializations.
      </SectionHeading>

      <div className="tablet-portrait:grid-cols-3 tablet-landscape:grid-cols-4 mt-14 grid grid-cols-2 gap-x-6 gap-y-12">
        {coreTeam.map((member, i) => (
          <Reveal
            key={member.name}
            delay={(i % 4) * 0.05}
            className="flex flex-col items-center text-center"
          >
            <img
              src={member.photo}
              alt={member.name}
              className="tablet-landscape:size-36 size-28 rounded-full object-cover shadow-lg"
            />
            <p className="font-heading text-cyber-grape mt-5 text-lg font-bold">
              {member.name}
            </p>
            <p className="text-base-sm text-text/65 mt-1">
              {member.institution}
            </p>
          </Reveal>
        ))}
      </div>
    </Container>
  );
}
