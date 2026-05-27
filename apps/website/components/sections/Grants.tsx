'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

import { Container } from '~/components/ui/Container';
import { SectionHeading } from '~/components/ui/SectionHeading';
import { cn } from '~/lib/cn';
import { grants } from '~/lib/content';

export function Grants() {
  const [[index, direction], setState] = useState<[number, number]>([0, 0]);
  const count = grants.length;
  const active = grants[((index % count) + count) % count]!;

  const paginate = (dir: number) => setState([index + dir, dir]);

  return (
    <Container className="tablet-landscape:py-28 py-20">
      <SectionHeading title="Grants Using Network Canvas">
        We are proud to say Network Canvas is being actively used in a number of
        federally funded grants in the United States, across a diverse set of
        research contexts, institutions, and funding bodies.
      </SectionHeading>

      <div className="tablet-landscape:gap-6 mx-auto mt-14 flex max-w-3xl items-center gap-3">
        <CarouselButton label="Previous grant" onClick={() => paginate(-1)}>
          <ChevronLeft className="size-6" />
        </CarouselButton>

        <div className="relative min-h-[22rem] flex-1 overflow-hidden">
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
              className="focusable bg-surface tablet-landscape:p-10 flex h-full flex-col rounded-[1.75rem] p-8 shadow-xl"
            >
              <h3 className="font-heading text-cyber-grape text-xl font-bold">
                {active.title}
              </h3>
              <p className="text-text/55 mt-3 text-sm font-bold">
                {active.pis}
              </p>
              <p className="text-text/80 mt-4 text-base leading-relaxed">
                {active.description}
              </p>
              <img
                src={active.logo}
                alt={active.logoAlt}
                className="mt-auto h-12 w-auto self-start pt-6"
              />
            </motion.a>
          </AnimatePresence>
        </div>

        <CarouselButton label="Next grant" onClick={() => paginate(1)}>
          <ChevronRight className="size-6" />
        </CarouselButton>
      </div>

      <div className="mt-8 flex justify-center gap-2.5">
        {grants.map((grant, i) => {
          const isActive = ((index % count) + count) % count === i;
          return (
            <button
              key={grant.title}
              type="button"
              aria-label={`Show grant ${i + 1}`}
              onClick={() => setState([i, i > index ? 1 : -1])}
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
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="focusable bg-surface text-cyber-grape hover:bg-cyber-grape flex size-11 shrink-0 items-center justify-center rounded-full shadow-lg transition-colors hover:text-white"
    >
      {children}
    </button>
  );
}
