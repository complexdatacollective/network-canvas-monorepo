'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { CSSProperties, ReactNode } from 'react';

import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { GrantLogo } from '~/components/sections/GrantLogo';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { entranceEase, useOnceInView } from '~/components/ui/useOnceInView';
import { cn } from '~/lib/cn';
import { institutions } from '~/lib/content';

// The section reads like headed paper. The title heads the sheet alone;
// between two rules the three logos stand at reading size, in their own
// colours, spread across the full width; the two paragraphs follow as the
// letter. The logos never share space with text, so nothing has to shrink to
// fit beside the title. In the dark theme they take the text colour, as the
// navy and purple artwork would sink into the page. The sheet plays its
// entrance once, as it comes into view.

type InstitutionId = (typeof institutions)[number]['id'];

// Each logo's size relative to the band's `--logo-unit`. `GrantLogo`'s optical
// rule evens out visual weight; CODACO's caption is so small next to its
// wordmark that it needs a little more than its share to stay legible.
const logoSizeClassName: Record<InstitutionId, string> = {
  northwestern: '[--logo-size:var(--logo-unit)]',
  oxford: '[--logo-size:var(--logo-unit)]',
  codaco: '[--logo-size:calc(var(--logo-unit)*1.12)]',
};

// Logos whose artwork has light type inside dark shapes.
const knockout: Record<InstitutionId, boolean> = {
  northwestern: false,
  oxford: true,
  codaco: false,
};

// In the dark theme a logo keeps the artwork's shape and drops its colours:
// the image is pushed out of its own box and the box is filled with the
// current text colour through a mask cut from the same file.
const darkTintClassName =
  '[[data-theme=dark]_&]:[&_img]:bg-current [[data-theme=dark]_&]:[&_img]:object-[-200vw_0] [[data-theme=dark]_&]:[&_img]:mask-(--logo-mask) [[data-theme=dark]_&]:[&_img]:[mask-mode:var(--logo-mask-mode)] [[data-theme=dark]_&]:[&_img]:[mask-composite:var(--logo-mask-composite)] [[data-theme=dark]_&]:[&_img]:mask-contain [[data-theme=dark]_&]:[&_img]:mask-center [[data-theme=dark]_&]:[&_img]:mask-no-repeat';

type MaskStyle = CSSProperties & {
  '--logo-mask': string;
  '--logo-mask-mode': string;
  '--logo-mask-composite': string;
};

// The Oxford mark carries white type inside solid blocks, so its mask also
// subtracts the file's light pixels and the type stays cut out of the blocks
// rather than filling in.
function maskStyle(src: string, cutLightPixels: boolean): MaskStyle {
  const url = `url("${src}")`;
  return cutLightPixels
    ? {
        '--logo-mask': `${url}, ${url}`,
        '--logo-mask-mode': 'alpha, luminance',
        '--logo-mask-composite': 'subtract, add',
      }
    : {
        '--logo-mask': url,
        '--logo-mask-mode': 'alpha',
        '--logo-mask-composite': 'add',
      };
}

const reporterLinks = {
  prior: 'https://reporter.nih.gov/project-details/9306043',
  ongoing: 'https://reporter.nih.gov/project-details/10715902',
} as const;

function reporterLink(href: string) {
  return function renderLink(chunks: ReactNode) {
    return (
      <NativeLink
        href={href}
        target="_blank"
        rel="noreferrer"
        className="font-bold"
      >
        {chunks}
      </NativeLink>
    );
  };
}

export function Institutions() {
  const t = useTranslations('Institutions');
  const { ref, play, timing } = useOnceInView<HTMLDivElement>(0.3);

  // The hairline across the sheet, drawn once from the start edge.
  const rule = (className?: string) => (
    <motion.div
      aria-hidden
      className={cn('bg-text/20 h-px origin-left rtl:origin-right', className)}
      initial={{ scaleX: 0 }}
      animate={play ? { scaleX: 1 } : undefined}
      transition={timing({ duration: 1.1, ease: entranceEase, delay: 0.2 })}
    />
  );

  return (
    <Container maxWidth="default">
      <div ref={ref} className="mx-auto max-w-6xl">
        <SectionHeading
          title={t('heading')}
          className="mx-0 max-w-none text-start"
        />

        {rule('tablet-landscape:mt-10 mt-8')}
        <ul className="tablet-portrait:justify-between tablet-portrait:gap-x-10 tablet-landscape:py-14 laptop:[--logo-unit:8.5rem] tablet-portrait:[--logo-unit:5.2rem] tablet-landscape:[--logo-unit:6.6rem] [[data-theme=dark]_&]:text-text/90 flex flex-wrap items-center gap-x-8 gap-y-8 py-10 [--logo-unit:4.2rem]">
          {institutions.map((institution, index) => (
            <motion.li
              key={institution.id}
              className={cn(
                'flex max-w-full',
                logoSizeClassName[institution.id],
              )}
              initial={{ opacity: 0, y: 10 }}
              animate={play ? { opacity: 1, y: 0 } : undefined}
              transition={timing({
                duration: 0.8,
                ease: entranceEase,
                delay: 0.3 + index * 0.08,
              })}
            >
              <GrantLogo
                src={institution.logo}
                alt={institution.name}
                className={darkTintClassName}
                style={maskStyle(institution.logo, knockout[institution.id])}
              />
            </motion.li>
          ))}
        </ul>
        {rule()}

        <motion.div
          className="tablet-landscape:mt-12 tablet-landscape:grid-cols-12 tablet-landscape:gap-x-12 laptop:gap-x-16 mt-8 grid gap-y-6"
          initial={{ opacity: 0, y: 16 }}
          animate={play ? { opacity: 1, y: 0 } : undefined}
          transition={timing({ duration: 0.8, ease: entranceEase, delay: 0.5 })}
        >
          <Paragraph
            margin="none"
            className="text-text tablet-landscape:col-span-7 tablet-landscape:text-xl text-lg"
          >
            {t.rich('paragraph1', {
              prior: reporterLink(reporterLinks.prior),
              ongoing: reporterLink(reporterLinks.ongoing),
            })}
          </Paragraph>
          <Paragraph
            margin="none"
            className="text-text/70 tablet-landscape:col-span-5 tablet-landscape:text-lg text-base"
          >
            {t('paragraph2')}
          </Paragraph>
        </motion.div>
      </div>
    </Container>
  );
}
