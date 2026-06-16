'use client';

import { Tabs } from '@base-ui/react/tabs';
import { ChartNetwork, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment } from 'react';

import { type Locale, type Project, projects } from '~/app/types';
import { cn } from '~/lib/utils';
import { usePathname, useRouter } from '~/navigation';

const sectionColors: Record<Project, string> = {
  'get-started': 'bg-slate-blue',
  'design-protocols': 'bg-sea-green',
  'collect-data': 'bg-neon-coral',
  'analyze-data': 'bg-cerulean-blue',
};

function SectionIcon({
  project,
  isActive,
}: {
  project: Project;
  isActive: boolean;
}) {
  if (project === 'get-started') {
    return (
      <Image
        src="/images/mark.svg"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7"
      />
    );
  }

  if (project === 'design-protocols') {
    return (
      <Image
        src="/images/architect-icon.png"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7"
      />
    );
  }

  if (project === 'collect-data') {
    return (
      <div className="flex items-center gap-0.5">
        <Image
          src="/images/interviewer.png"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6"
        />
        <Image
          src="/images/fresco.png"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6"
        />
      </div>
    );
  }

  return (
    <ChartNetwork
      className={cn('h-7 w-7', isActive ? 'text-white' : 'text-cerulean-blue')}
    />
  );
}

export default function SectionNav({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const t = useTranslations('ProjectSwitcher');
  const tNav = useTranslations('SectionNav');

  const activeProject = pathname.split('/')[1] as Project;

  return (
    <Tabs.Root
      value={activeProject}
      onValueChange={(value) => {
        if (typeof value === 'string' && value !== activeProject) {
          router.push(`/${value}`, { locale });
        }
      }}
      className={cn('flex items-center', className)}
    >
      <Tabs.List
        aria-label={tNav('workflowLabel')}
        className="flex items-center gap-2 overflow-x-auto"
      >
        {projects.map((project, index) => {
          const isActive = project === activeProject;
          return (
            <Fragment key={project}>
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="text-muted-foreground/40 h-5 w-5 shrink-0"
                />
              )}
              <Tabs.Tab
                value={project}
                className={cn(
                  'focusable flex shrink-0 cursor-pointer items-center gap-2 rounded-xl py-1.5 pr-4 pl-2 text-sm font-semibold transition-all',
                  isActive
                    ? cn(sectionColors[project], 'text-white shadow-sm')
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 shrink-0 items-center justify-center',
                    project === 'collect-data' ? 'w-auto' : 'w-9',
                    isActive && 'rounded-lg bg-white/20',
                    project === 'collect-data' && 'px-2',
                  )}
                >
                  <SectionIcon project={project} isActive={isActive} />
                </span>
                {t(`${project}.label`)}
              </Tabs.Tab>
            </Fragment>
          );
        })}
      </Tabs.List>
    </Tabs.Root>
  );
}
