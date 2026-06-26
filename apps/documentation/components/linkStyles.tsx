import type { ReactNode } from 'react';

import { cn } from '~/lib/utils';

// Shared visual treatment for inline links. Both Link (app routes, via
// next/link) and DownloadLink (static assets, via a plain <a download>) render
// with these so the two stay pixel-identical — the styling lives here, not
// duplicated in each component.

// The focusable root that establishes the hover group.
export function linkRootClass(className?: string) {
  return cn(
    'focusable group text-link font-semibold transition-[background-size] duration-300 ease-in-out',
    className,
  );
}

// The label whose underline grows from the left on hover.
export function LinkLabel({ children }: { children: ReactNode }) {
  return (
    <span className="from-link to-link bg-linear-to-r bg-size-[0%_2px] bg-left-bottom bg-no-repeat pb-0.5 transition-[background-size] duration-200 ease-out group-hover:bg-size-[100%_2px]">
      {children}
    </span>
  );
}
