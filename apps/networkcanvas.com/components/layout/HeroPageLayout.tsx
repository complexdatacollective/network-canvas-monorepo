import type { ReactNode, Ref } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

type HeroPageLayoutProps = {
  ref?: Ref<HTMLDivElement>;
  // Spans the header and the hero together: the scroll target for the hero's
  // departure, and the box a backdrop fills.
  frameRef?: Ref<HTMLDivElement>;
  header: ReactNode;
  // A single element: it becomes the first row of `<main>`.
  hero: ReactNode;
  backdrop?: ReactNode;
  children?: ReactNode;
  // Makes the header and the hero fill the first screen between them.
  fillScreen?: 'always' | 'tablet-portrait';
  entrancePending?: boolean;
  mainClassName?: string;
};

// A page that opens with the site header over a hero. The header stays
// outside `<main>`, where it keeps its banner landmark, while the hero is
// `<main>`'s first row. The two still share the first screen: a frame spans
// the header's row and the hero's, and `<main>` takes the hero's row from
// this grid, so the hero grows to fill whatever the header leaves.
export function HeroPageLayout({
  ref,
  frameRef,
  header,
  hero,
  backdrop,
  children,
  fillScreen,
  entrancePending,
  mainClassName,
}: HeroPageLayoutProps) {
  return (
    <div
      ref={ref}
      data-entrance-pending={entrancePending ? '' : undefined}
      className="relative isolate grid grid-cols-1 grid-rows-[auto_1fr_auto]"
    >
      <div
        ref={frameRef}
        aria-hidden
        className={cx(
          'pointer-events-none relative -z-10 col-start-1 row-span-2 row-start-1 overflow-hidden',
          fillScreen === 'always' && 'min-h-svh',
          fillScreen === 'tablet-portrait' && 'tablet-portrait:min-h-svh',
        )}
      >
        {backdrop}
      </div>
      <div className="col-start-1 row-start-1">{header}</div>
      <main
        className={cx(
          'col-start-1 row-span-2 row-start-2 grid grid-cols-1 grid-rows-subgrid',
          mainClassName,
        )}
      >
        {hero}
        <div>{children}</div>
      </main>
    </div>
  );
}
