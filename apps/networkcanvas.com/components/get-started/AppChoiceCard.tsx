import { Check, ExternalLink } from 'lucide-react';

import { PillLink } from '~/components/ui/PillLink';
import { cn } from '~/lib/cn';
import { type classicApps, type webApps } from '~/lib/getStarted';

type AppRecord = (typeof webApps)[number] | (typeof classicApps)[number];

const treatmentClasses = {
  featured: 'bg-cyber-grape text-white elevation-high',
  fresco: 'bg-slate-blue/10 text-cyber-grape backdrop-blur-md elevation-low',
  classic: 'bg-white/55 text-cyber-grape backdrop-blur-md elevation-low',
};

function AppActions({ app }: { app: (typeof webApps)[number] }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {app.actions.map((action) => (
        <PillLink
          key={action.href}
          href={action.href}
          external
          tone={app.treatment === 'fresco' ? 'slate-blue' : 'neon-coral'}
        >
          {action.label}
          <ExternalLink aria-hidden className="size-4" />
        </PillLink>
      ))}
    </div>
  );
}

function PlatformActions({ app }: { app: (typeof classicApps)[number] }) {
  return (
    <div className="mt-8">
      <p className="font-heading text-xs font-bold tracking-[0.12em] uppercase">
        Download version {app.version}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {app.platforms.map((platform) => (
          <a
            key={platform.id}
            href={platform.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${platform.label} for ${app.name}`}
            className="focusable border-cyber-grape/20 font-heading inline-flex items-center gap-2 rounded-full border bg-white/70 px-4 py-2 text-sm font-bold transition-transform hover:-translate-y-0.5 hover:bg-white focus-visible:-translate-y-0.5 motion-reduce:transform-none"
          >
            {platform.label}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function AppChoiceCard({ app }: { app: AppRecord }) {
  const featured = app.treatment === 'featured';

  return (
    <article
      className={cn(
        'tablet-portrait:p-9 flex h-full flex-col rounded-[2rem] p-7 transition-transform focus-within:-translate-y-1 hover:-translate-y-1 motion-reduce:transform-none',
        treatmentClasses[app.treatment],
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h3 className="font-heading text-3xl font-black tracking-tight">
          {app.name}
        </h3>
        <span
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-bold tracking-wide',
            featured
              ? 'bg-white/15 text-white'
              : 'bg-cyber-grape/10 text-cyber-grape',
          )}
        >
          {app.status}
        </span>
      </div>

      <p
        className={cn(
          'mt-5 text-base',
          featured ? 'text-white/85' : 'text-text/80',
        )}
      >
        {app.description}
      </p>

      <p className="font-heading mt-7 text-xs font-bold tracking-[0.12em] uppercase">
        Best for
      </p>
      <ul className="mt-3 space-y-2.5">
        {app.bestFor.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-relaxed">
            <Check aria-hidden className="mt-1 size-4 shrink-0" />
            <span>{item}</span>
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
