import type { ReactNode } from 'react';

import { cn } from '~/lib/cn';

export function SectionLabel({
  children,
  Icon,
  subSection,
}: {
  children: ReactNode;
  Icon?: ReactNode;
  subSection?: boolean;
}) {
  return (
    <div
      className={cn(
        'font-monospace text-slate-blue inline-flex items-center gap-3 text-xs leading-relaxed font-semibold tracking-widest uppercase',
        subSection
          ? '[counter-increment:subsection]'
          : '[counter-increment:section] [counter-set:subsection_0]',
        subSection && 'text-slate-blue/75',
      )}
    >
      {Icon ?? <span aria-hidden className="h-0.5 w-6 bg-current" />}
      <span>
        <span aria-hidden>
          <span className="before:content-[counter(section,decimal-leading-zero)]" />
          {subSection && (
            <span className="before:content-[counter(subsection,lower-alpha)]" />
          )}
          {' — '}
        </span>
        {children}
      </span>
    </div>
  );
}
