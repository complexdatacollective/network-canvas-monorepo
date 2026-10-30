import type { ReactNode } from 'react';

import { cx } from '@codaco/fresco-ui/utils/cva';

import { outline } from './motion';

// An outlined disc centered on the origin, for stamps like "1.0" or
// "Schema 8". Children are its text, positioned relative to the centre.
export function Badge({
  r,
  fill = 'fill-mustard',
  children,
}: {
  r: number;
  fill?: string;
  children: ReactNode;
}) {
  return (
    <>
      <circle r={r} className={cx(fill, outline)} strokeWidth={6} />
      {children}
    </>
  );
}
