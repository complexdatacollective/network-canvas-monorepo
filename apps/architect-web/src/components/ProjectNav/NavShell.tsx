import type React from 'react';

import Brand from '~/components/Brand';
import { useReturnToStartDialog } from '~/hooks/useReturnToStartDialog';
import { cn } from '~/utils/cn';

export const NAV_SURFACE =
  'pointer-events-auto bg-fresco-purple text-fresco-purple-foreground shadow-lg';

type NavShellProps = {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

const NavShell = ({ leading, trailing }: NavShellProps) => {
  const handleReturnToStart = useReturnToStartDialog();
  return (
    <header className="pointer-events-none sticky top-0 z-(--z-global-ui) w-full px-4 py-(--space-md) sm:px-6 print:static print:hidden">
      <div
        className={cn(
          NAV_SURFACE,
          'mx-auto flex max-w-7xl flex-wrap items-center gap-(--space-md) rounded-full py-3 pr-6 pl-2 sm:pr-10 sm:pl-3',
        )}
      >
        <div className="flex min-w-0 flex-1 items-center justify-start gap-(--space-md)">
          <Brand variant="icon" onClick={handleReturnToStart} />
          {leading}
        </div>
        {trailing && (
          <div className="flex shrink-0 items-center gap-(--space-md)">
            {trailing}
          </div>
        )}
      </div>
    </header>
  );
};

export default NavShell;
