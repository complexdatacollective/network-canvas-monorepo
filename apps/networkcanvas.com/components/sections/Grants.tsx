'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import type { Grant } from '~/lib/siteContent';

export function Grants({ grants }: { grants: readonly Grant[] }) {
  const t = useTranslations('Grants');
  const [[index, direction], setState] = useState<[number, number]>([0, 0]);
  const count = grants.length;
  const activeIndex = count === 0 ? 0 : ((index % count) + count) % count;
  const active = grants[activeIndex];

  if (!active) return null;

  const paginate = (dir: number) => setState([index + dir, dir]);

  return (
    <Container className="">
      <SectionHeading title={t('heading')}>{t('introduction')}</SectionHeading>

      <div className="tablet-portrait:flex tablet-portrait:gap-6 tablet-landscape:gap-10 mx-auto mt-16 grid max-w-5xl grid-cols-[auto_1fr_auto] items-center gap-4">
        <CarouselButton
          label={t('previous')}
          onClick={() => paginate(-1)}
          icon={<ChevronLeft aria-hidden className="size-8" />}
          className="col-start-1 row-start-2"
        />

        <div className="tablet-portrait:col-auto tablet-portrait:row-auto col-span-3 col-start-1 row-start-1 min-w-0 flex-1">
          <div className="tablet-portrait:p-8 pointer-events-none overflow-hidden p-4">
            <AnimatePresence custom={direction} initial={false} mode="wait">
              <motion.a
                key={index}
                href={active.href}
                target="_blank"
                rel="noreferrer"
                custom={direction}
                initial={{ opacity: 0, x: direction >= 0 ? 60 : -60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction >= 0 ? -60 : 60 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="focusable bg-surface/55 tablet-portrait:p-12 tablet-landscape:p-14 pointer-events-auto flex min-h-[30rem] flex-col rounded p-10 shadow-xl backdrop-blur-md"
              >
                <Heading
                  level="h3"
                  variant="subheading"
                  margin="none"
                  className="text-text"
                >
                  {active.title}
                </Heading>
                <Paragraph
                  margin="none"
                  className="text-text/55 mt-5 text-base font-bold"
                >
                  {active.pis}
                </Paragraph>
                <Paragraph
                  margin="none"
                  className="text-text/80 tablet-portrait:text-lg mt-6 text-base leading-relaxed"
                >
                  {active.description}
                </Paragraph>
                <div className="mt-auto pt-10">
                  <img
                    src={active.logo}
                    alt={active.logoAlt}
                    className="tablet-portrait:h-28 h-24 w-auto max-w-full object-contain object-left"
                  />
                </div>
              </motion.a>
            </AnimatePresence>
          </div>
        </div>

        <CarouselButton
          label={t('next')}
          onClick={() => paginate(1)}
          icon={<ChevronRight aria-hidden className="size-8" />}
          className="col-start-3 row-start-2"
        />
      </div>

      <div className="mt-10 flex justify-center gap-4">
        {grants.map((grant, i) => {
          const current = ((index % count) + count) % count;
          const isActive = current === i;
          return (
            <button
              key={grant.id}
              type="button"
              aria-label={t('show', { number: i + 1 })}
              onClick={() => setState([i, i > current ? 1 : -1])}
              className={cn(
                'h-3 rounded-full transition-all',
                isActive ? 'bg-neon-coral w-10' : 'bg-cyber-grape/20 w-3',
              )}
            />
          );
        })}
      </div>
    </Container>
  );
}

function CarouselButton({
  icon,
  label,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <IconButton
      icon={icon}
      aria-label={label}
      onClick={onClick}
      color="dynamic"
      size="lg"
      className={cn(
        'bg-surface text-text hover:bg-cyber-grape tablet-portrait:size-16 size-12 border-transparent shadow-lg transition-colors hover:text-white',
        className,
      )}
    />
  );
}
