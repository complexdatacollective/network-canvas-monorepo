import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '~/lib/cn';

export type PillTone =
  | 'neon-coral'
  | 'sea-green'
  | 'cerulean-blue'
  | 'mustard'
  | 'slate-blue'
  | 'cyber-grape';

const toneClasses: Record<PillTone, string> = {
  'neon-coral': 'bg-neon-coral',
  'sea-green': 'bg-sea-green',
  'cerulean-blue': 'bg-cerulean-blue',
  'mustard': 'bg-mustard',
  'slate-blue': 'bg-slate-blue',
  'cyber-grape': 'bg-cyber-grape',
};

type PillLinkProps = {
  'href': string;
  'children': ReactNode;
  'tone'?: PillTone;
  'size'?: 'md' | 'lg';
  'external'?: boolean;
  'className'?: string;
  'aria-label'?: string;
};

/** A pill-shaped link in one of the Network Canvas brand colours. */
export function PillLink({
  href,
  children,
  tone = 'neon-coral',
  size = 'md',
  external,
  className,
  ...props
}: PillLinkProps) {
  const classes = cn(
    'focusable font-heading elevation-low inline-flex items-center justify-center gap-2 rounded-full font-bold tracking-wide text-white uppercase transition-transform hover:-translate-y-0.5',
    size === 'lg' ? 'px-10 py-4 text-base' : 'px-6 py-3 text-sm',
    toneClasses[tone],
    className,
  );

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={classes}
        {...props}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href as Route} className={classes} {...props}>
      {children}
    </Link>
  );
}
