import type { ReactNode } from 'react';

import { cx } from '~/utils/cva';

type PrintedPageProps = {
  id?: string;
  className?: string;
  /**
   * The first page of the document. A forced break before it would be a
   * no-op (CSS Fragmentation discards forced breaks at the start of a
   * fragment), so it is left out.
   */
  first?: boolean;
  children?: ReactNode;
};

/**
 * One page of the printable protocol summary. `page-break-marker` is not a
 * Tailwind class: `protocol-summary.css` frames each page on screen with it,
 * and the e2e specs count pages by it.
 */
const PrintedPage = ({ id, className, first, children }: PrintedPageProps) => (
  <div
    id={id}
    className={cx(
      // oxlint-disable-next-line tailwindcss/no-unknown-classes -- print stylesheet + e2e selector hook
      'page-break-marker flex flex-col gap-6',
      !first && 'break-before-page',
      className,
    )}
  >
    {children}
  </div>
);

export default PrintedPage;
