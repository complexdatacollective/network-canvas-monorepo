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
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title={t('heading')}>{t('introduction')}</SectionHeading>

      <div className="tablet-landscape:gap-6 mx-auto mt-14 flex max-w-3xl items-center gap-3">
        <CarouselButton
          label={t('previous')}
          onClick={() => paginate(-1)}
          icon={<ChevronLeft aria-hidden className="size-6" />}
        />

        <div
          data-homepage-weave-target
          className="relative min-h-[22rem] flex-1"
        >
          <div className="pointer-events-none absolute -inset-8 overflow-hidden p-8">
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
                className="focusable bg-surface tablet-landscape:p-10 pointer-events-auto flex h-full flex-col rounded p-8 shadow-xl"
              >
                <Heading
                  level="h3"
                  margin="none"
                  className="font-heading text-text text-xl font-bold"
                >
                  {active.title}
                </Heading>
                <Paragraph
                  margin="none"
                  className="text-text/55 mt-3 text-sm font-bold"
                >
                  {active.pis}
                </Paragraph>
                <Paragraph
                  margin="none"
                  className="text-text/80 mt-4 text-base leading-relaxed"
                >
                  {active.description}
                </Paragraph>
                <img
                  src={active.logo}
                  alt={active.logoAlt}
                  className="mt-auto h-12 w-auto self-start pt-6"
                />
              </motion.a>
            </AnimatePresence>
          </div>
        </div>

        <CarouselButton
          label={t('next')}
          onClick={() => paginate(1)}
          icon={<ChevronRight aria-hidden className="size-6" />}
        />
      </div>

      <div className="mt-8 flex justify-center gap-2.5">
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
                'h-2.5 rounded-full transition-all',
                isActive ? 'bg-neon-coral w-7' : 'bg-cyber-grape/20 w-2.5',
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
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <IconButton
      icon={icon}
      aria-label={label}
      onClick={onClick}
      color="dynamic"
      size="sm"
      className="bg-surface text-text hover:bg-cyber-grape size-11 border-transparent shadow-lg transition-colors hover:text-white"
    />
  );
}
