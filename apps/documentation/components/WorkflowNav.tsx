'use client';

import { Tabs } from '@base-ui/react/tabs';
import { ChartNetwork, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment, type ReactNode } from 'react';

import type { Project } from '~/app/types';
import Paragraph from '~/components/ui/typography/Paragraph';
import { cn } from '~/lib/utils';
import { Link, usePathname, useRouter } from '~/navigation';

import FancyHeading from './FancyHeading';

type SectionColor = 'slate-blue' | 'sea-green' | 'neon-coral' | 'cerulean-blue';

type WorkflowSection = {
  key: Project;
  color: SectionColor;
  // Image icon sources; when absent the section renders the ChartNetwork glyph.
  images?: string[];
};

// Single source of truth for the workflow steps, shared by both the collapsed
// section nav and the full homepage cards. Labels and descriptions live in the
// `ProjectSwitcher` translation namespace, keyed by `key`.
const WORKFLOW_SECTIONS: WorkflowSection[] = [
  { key: 'get-started', color: 'slate-blue', images: ['/images/mark.svg'] },
  {
    key: 'design-protocols',
    color: 'sea-green',
    images: ['/images/architect-icon.png'],
  },
  {
    key: 'collect-data',
    color: 'neon-coral',
    images: ['/images/interviewer.png', '/images/fresco.png'],
  },
  { key: 'analyze-data', color: 'cerulean-blue' },
];

const sectionColorClasses: Record<SectionColor, string> = {
  'slate-blue': 'bg-slate-blue',
  'sea-green': 'bg-sea-green',
  'neon-coral': 'bg-neon-coral',
  'cerulean-blue': 'bg-cerulean-blue',
};

function SectionIcon({
  section,
  onColor,
}: {
  section: WorkflowSection;
  onColor: boolean;
}) {
  if (section.images) {
    const dual = section.images.length > 1;
    return (
      <span className="flex items-center gap-0.5">
        {section.images.map((src) => (
          <Image
            key={src}
            src={src}
            alt=""
            width={28}
            height={28}
            className={cn(dual ? 'h-6 w-6' : 'h-7 w-7')}
          />
        ))}
      </span>
    );
  }

  return (
    <ChartNetwork
      className={cn('h-7 w-7', onColor ? 'text-white' : 'text-cerulean-blue')}
    />
  );
}

function CollapsedNav({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('ProjectSwitcher');
  const tNav = useTranslations('WorkflowNav');

  const activeProject = pathname.split('/')[1] ?? '';

  return (
    <Tabs.Root
      value={activeProject}
      onValueChange={(value) => {
        if (typeof value === 'string' && value !== activeProject) {
          router.push(`/${value}`);
        }
      }}
      className={cn('flex items-center justify-center', className)}
    >
      <Tabs.List
        aria-label={tNav('workflowLabel')}
        className="flex items-center gap-2 overflow-x-auto"
      >
        {WORKFLOW_SECTIONS.map((section, index) => {
          const isActive = section.key === activeProject;
          const dualIcon = (section.images?.length ?? 0) > 1;
          return (
            <Fragment key={section.key}>
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="text-muted-foreground/40 h-5 w-5 shrink-0"
                />
              )}
              <Tabs.Tab
                value={section.key}
                className={cn(
                  'focusable relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl py-2 pr-5 pl-3 text-base font-semibold transition-colors duration-200',
                  isActive
                    ? 'text-white'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isActive && (
                  <motion.span
                    aria-hidden
                    layoutId="workflowNavIndicator"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                    style={{ borderRadius: 12 }}
                    className={cn(
                      'absolute inset-0 shadow-sm',
                      sectionColorClasses[section.color],
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 flex h-9 shrink-0 items-center justify-center',
                    dualIcon ? 'w-auto px-1' : 'w-9',
                    isActive && 'rounded-lg bg-white/20',
                  )}
                >
                  <SectionIcon section={section} onColor={isActive} />
                </span>
                <span className="relative z-10">
                  {t(`${section.key}.label`)}
                </span>
              </Tabs.Tab>
            </Fragment>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}

function WorkflowCard({ section }: { section: WorkflowSection }) {
  const t = useTranslations('ProjectSwitcher');
  return (
    <Link
      href={`/${section.key}`}
      className={cn(
        'group focusable flex flex-1 flex-col gap-6 rounded-3xl p-6 text-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl xl:min-h-56',
        sectionColorClasses[section.color],
      )}
    >
      <span className="flex h-12 w-fit min-w-12 shrink-0 items-center justify-center gap-1 rounded-2xl bg-white/15 px-2">
        <SectionIcon section={section} onColor />
      </span>
      <div className="mt-auto flex flex-col gap-2">
        <FancyHeading variant="h2" margin="none" className="text-xl text-white">
          {t(`${section.key}.label`)}
        </FancyHeading>
        <Paragraph className="text-base text-white/85">
          {t(`${section.key}.description`)}
        </Paragraph>
      </div>
    </Link>
  );
}

function FullCards({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:flex xl:flex-row xl:items-stretch xl:gap-3',
        className,
      )}
    >
      {WORKFLOW_SECTIONS.map((section, index) => (
        <Fragment key={section.key}>
          {index > 0 && (
            <ChevronRight
              aria-hidden
              strokeWidth={3}
              className="text-foreground hidden h-8 w-8 shrink-0 self-center xl:block"
            />
          )}
          <WorkflowCard section={section} />
        </Fragment>
      ))}
    </div>
  );
}

export default function WorkflowNav({
  variant,
  className,
}: {
  variant: 'collapsed' | 'full';
  className?: string;
}): ReactNode {
  return variant === 'full' ? (
    <FullCards className={className} />
  ) : (
    <CollapsedNav className={className} />
  );
}
