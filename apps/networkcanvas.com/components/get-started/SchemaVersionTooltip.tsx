'use client';

import { ExternalLink, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@codaco/fresco-ui/Button';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@codaco/fresco-ui/Tooltip';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cn } from '~/lib/cn';
import { documentationDestinations } from '~/lib/getStarted';

export function SchemaVersionTooltip() {
  const t = useTranslations('GetStarted');

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={documentationDestinations.schemaVersions}
            target="_blank"
            rel="noreferrer"
            aria-label={t('shared.schemaVersionLink')}
            className={cn(
              buttonVariants({
                variant: 'text',
                color: 'dynamic',
                size: 'sm',
              }),
              'size-8! shrink-0 rounded-full p-0!',
            )}
          >
            <Info aria-hidden className="size-4" />
          </a>
        }
      />
      <TooltipContent className="text-cyber-grape max-w-sm">
        <Paragraph margin="none" className="text-sm leading-relaxed">
          {t('shared.schemaVersionInfo')}
        </Paragraph>
        <NativeLink
          href={documentationDestinations.schemaVersions}
          target="_blank"
          rel="noreferrer"
          className="font-heading text-slate-blue mt-2 inline-flex text-xs font-bold [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1"
        >
          {t('shared.schemaVersionLink')}
          <ExternalLink aria-hidden className="size-3" />
        </NativeLink>
      </TooltipContent>
    </Tooltip>
  );
}
