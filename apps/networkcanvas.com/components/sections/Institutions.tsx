import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import { institutions } from '~/lib/content';

function renderPriorLink(chunks: ReactNode) {
  return (
    <NativeLink
      href="https://reporter.nih.gov/project-details/9306043"
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

function renderOngoingLink(chunks: ReactNode) {
  return (
    <NativeLink
      href="https://reporter.nih.gov/project-details/10715902"
      target="_blank"
      rel="noreferrer"
      className="font-bold"
    >
      {chunks}
    </NativeLink>
  );
}

export function Institutions() {
  const t = useTranslations('Institutions');

  return (
    <Container maxWidth="full">
      <SectionHeading title={t('heading')}>
        <Paragraph margin="none">
          {t.rich('paragraph1', {
            prior: renderPriorLink,
            ongoing: renderOngoingLink,
          })}
        </Paragraph>
        <Paragraph margin="none" className="mt-3">
          {t('paragraph2')}
        </Paragraph>
      </SectionHeading>

      <div className="laptop:gap-x-12 mx-auto mt-14 flex max-w-[1500px] flex-wrap items-center justify-center gap-x-10 gap-y-10">
        {institutions.map((inst) => (
          // Partner logos are fixed-colour brand assets. In dark mode they sit on
          // a light plate so dark marks (e.g. the Oxford wordmark) stay legible;
          // in light mode the plate is absent and the logos render as before.
          <div
            key={inst.name}
            className="flex max-w-full items-center justify-center [[data-theme=dark]_&]:rounded [[data-theme=dark]_&]:bg-white/90 [[data-theme=dark]_&]:px-3 [[data-theme=dark]_&]:py-2"
          >
            <div
              className={cn(
                'tablet-portrait:h-20 laptop:h-28 relative h-16 max-w-full overflow-hidden',
                inst.name === 'University of Oxford' &&
                  'tablet-portrait:w-40 laptop:w-56 w-32',
                inst.name === 'Northwestern University' &&
                  'tablet-portrait:w-[21rem] laptop:w-[29rem] w-72',
                inst.name === 'Complex Data Collective' &&
                  'tablet-portrait:w-[21.5rem] laptop:w-[30rem] w-72',
              )}
            >
              <img
                src={inst.logo}
                alt={inst.name}
                className={cn(
                  'absolute left-1/2 h-full w-auto max-w-none -translate-x-1/2 -translate-y-1/2 object-contain',
                  inst.name === 'Northwestern University' && 'top-1/2',
                  inst.name === 'University of Oxford' &&
                    'top-[42.5%] scale-[1.3]',
                  inst.name === 'Complex Data Collective' &&
                    'top-[42.5%] scale-[3.2]',
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
