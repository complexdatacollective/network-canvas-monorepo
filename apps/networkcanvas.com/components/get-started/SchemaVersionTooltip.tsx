'use client';

import { ExternalLink, Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@codaco/fresco-ui/Button';
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
        <a
          href={documentationDestinations.schemaVersions}
          target="_blank"
          rel="noreferrer"
          className="font-heading text-slate-blue focusable mt-2 inline-flex items-center gap-1 text-xs font-bold underline-offset-4 hover:underline"
        >
          {t('shared.schemaVersionLink')}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </TooltipContent>
    </Tooltip>
  );
}
