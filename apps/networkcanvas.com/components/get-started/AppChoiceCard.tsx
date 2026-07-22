import {
  Apple,
  Check,
  ExternalLink,
  type LucideIcon,
  Monitor,
  Smartphone,
  Terminal,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@codaco/fresco-ui/Badge';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SchemaVersionTooltip } from '~/components/get-started/SchemaVersionTooltip';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { cn } from '~/lib/cn';
import {
  type classicApps,
  type PlatformId,
  type webApps,
} from '~/lib/getStarted';

type AppRecord = (typeof webApps)[number] | (typeof classicApps)[number];

const treatmentClasses = {
  featured: 'bg-cyber-grape text-white elevation-high',
  fresco: 'bg-slate-blue/10 text-text backdrop-blur-md elevation-low',
  classic: 'bg-surface/55 text-text backdrop-blur-md elevation-low',
};

const platformIcons = {
  'apple-silicon': Apple,
  'apple-intel': Apple,
  'windows': Monitor,
  'linux': Terminal,
  'android': Smartphone,
} satisfies Record<PlatformId, LucideIcon>;

function AppActions({ app }: { app: (typeof webApps)[number] }) {
  const t = useTranslations('GetStarted');

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {app.actions.map((action) => (
        <ButtonLink
          key={action.href}
          href={action.href}
          external
          color="default"
          className={cn(
            'rounded-full text-white',
            app.treatment === 'fresco' ? 'bg-slate-blue' : 'bg-neon-coral',
          )}
        >
          {t(action.labelKey)}
          <ExternalLink aria-hidden className="size-4" />
        </ButtonLink>
      ))}
    </div>
  );
}

function PlatformActions({ app }: { app: (typeof classicApps)[number] }) {
  const t = useTranslations('GetStarted');

  return (
    <div id={`${app.id}-downloads`} className="mt-8 scroll-mt-8">
      <Paragraph
        margin="none"
        className="font-heading text-xs font-bold tracking-[0.12em] uppercase"
      >
        {t('shared.downloadVersion', { version: app.version })}
      </Paragraph>
      <div className="mt-3 flex flex-wrap gap-2">
        {app.platforms.map((platform) => {
          const PlatformIcon = platformIcons[platform.id];
          const label = t(platform.labelKey);

          return (
            <ButtonLink
              key={platform.id}
              href={platform.href}
              external
              variant="outline"
              color="dynamic"
              aria-label={t('shared.platformAccessibleName', {
                platform: label,
                app: app.name,
              })}
              className="bg-surface/70 hover:bg-surface rounded-full"
            >
              <PlatformIcon aria-hidden className="size-4" />
              {label}
              <ExternalLink aria-hidden className="size-3.5" />
            </ButtonLink>
          );
        })}
      </div>
    </div>
  );
}

export function AppChoiceCard({ app }: { app: AppRecord }) {
  const t = useTranslations('GetStarted');
  const featured = app.treatment === 'featured';

  return (
    <article
      className={cn(
        'tablet-portrait:p-9 flex h-full flex-col rounded p-7 transition-transform focus-within:-translate-y-1 hover:-translate-y-1 motion-reduce:transform-none',
        treatmentClasses[app.treatment],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <Heading level="h3" variant="subheading" margin="none">
          {app.name}
        </Heading>
        <Badge
          variant="outline"
          className={cn(
            'rounded-full border-0 px-3 py-1.5 text-xs font-bold tracking-wide',
            featured
              ? 'bg-surface/15 text-white'
              : 'bg-cyber-grape/10 text-text',
          )}
        >
          {t(`apps.${app.messageKey}.status`)}
        </Badge>
      </div>

      <div className="mt-5 flex items-start gap-2">
        <Paragraph
          margin="none"
          className={cn(
            'text-base',
            featured ? 'text-white/85' : 'text-text/80',
          )}
        >
          {t(`apps.${app.messageKey}.description`)}
        </Paragraph>
        {'platforms' in app && <SchemaVersionTooltip />}
      </div>

      <Paragraph
        margin="none"
        className="font-heading mt-7 text-xs font-bold tracking-[0.12em] uppercase"
      >
        {t('shared.bestFor')}
      </Paragraph>
      <ul className="mt-3 space-y-2.5">
        {app.bestFor.map((itemKey) => (
          <li key={itemKey} className="flex gap-3 text-sm leading-relaxed">
            <Check aria-hidden className="mt-1 size-4 shrink-0" />
            <span>{t(itemKey)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto">
        {'platforms' in app ? (
          <PlatformActions app={app} />
        ) : (
          <AppActions app={app} />
        )}
      </div>
    </article>
  );
}
