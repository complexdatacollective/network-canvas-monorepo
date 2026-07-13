'use client';

import { Tabs } from '@base-ui/react/tabs';
import { ChartNetwork, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment, type ReactNode } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  SECTIONS,
  type SectionConfig,
  sectionColorClasses,
} from '~/lib/sections';
import { Link, usePathname, useRouter } from '~/navigation';

import FancyHeading from './FancyHeading';

function SectionIcon({
  section,
  onColor,
}: {
  section: SectionConfig;
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
            className={cx(dual ? 'h-6 w-6' : 'h-7 w-7')}
          />
        ))}
      </span>
    );
  }

  return (
    <ChartNetwork
      className={cx('h-7 w-7', onColor ? 'text-white' : 'text-cerulean-blue')}
    />
  );
}

function CollapsedNav({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('SectionSwitcher');
  const tNav = useTranslations('WorkflowNav');

  const activeSection = pathname.split('/')[1] ?? '';

  return (
    <Tabs.Root
      value={activeSection}
      onValueChange={(value) => {
        if (typeof value === 'string' && value !== activeSection) {
          router.push(`/${value}`);
        }
      }}
      className={cx('flex items-center justify-center', className)}
    >
      <Tabs.List
        aria-label={tNav('workflowLabel')}
        className="flex items-center gap-2 overflow-x-auto"
      >
        {SECTIONS.map((section, index) => {
          const isActive = section.key === activeSection;
          const dualIcon = (section.images?.length ?? 0) > 1;
          return (
            <Fragment key={section.key}>
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-current/30"
                />
              )}
              <Tabs.Tab
                value={section.key}
                className={cx(
                  'focusable relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl py-2 pr-5 pl-3 text-base font-semibold transition-colors duration-200',
                  isActive ? 'text-white' : 'hover:text-text text-current/70',
                )}
              >
                {isActive && (
                  <motion.span
                    aria-hidden
                    layoutId="workflowNavIndicator"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0 }}
                    style={{ borderRadius: 12 }}
                    className={cx(
                      'absolute inset-0 shadow-sm',
                      sectionColorClasses[section.color],
                    )}
                  />
                )}
                <span
                  className={cx(
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

function WorkflowCard({ section }: { section: SectionConfig }) {
  const t = useTranslations('SectionSwitcher');
  return (
    <Link
      href={`/${section.key}`}
      className={cx(
        'group focusable laptop:min-h-56 flex flex-1 flex-col gap-6 rounded-lg p-6 text-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl',
        sectionColorClasses[section.color],
      )}
    >
      <span className="flex h-12 w-fit min-w-12 shrink-0 items-center justify-center gap-1 rounded-lg bg-white/15 px-2">
        <SectionIcon section={section} onColor />
      </span>
      <div className="mt-auto flex flex-col gap-2">
        <FancyHeading level="h2" margin="none" className="text-xl text-white">
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
      className={cx(
        'phone-landscape:grid-cols-2 laptop:flex laptop:flex-row laptop:items-stretch laptop:gap-3 grid w-full grid-cols-1 gap-4',
        className,
      )}
    >
      {SECTIONS.map((section, index) => (
        <Fragment key={section.key}>
          {index > 0 && (
            <ChevronRight
              aria-hidden
              strokeWidth={3}
              className="text-text laptop:block hidden h-8 w-8 shrink-0 self-center"
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
