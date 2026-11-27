import type { ReactNode } from 'react';

import { cx } from '~/utils/cva';

type SummaryPageProps = {
  id?: string;
  className?: string;
  children?: ReactNode;
};

/**
 * One page of the printable protocol summary. `page-break-marker` is not a
 * Tailwind class: `protocol-summary.css` frames each page on screen with it,
 * and the e2e specs count pages by it.
 */
const SummaryPage = ({ id, className, children }: SummaryPageProps) => (
  <div
    id={id}
    className={cx(
      // oxlint-disable-next-line tailwindcss/no-unknown-classes -- print stylesheet + e2e selector hook
      'page-break-marker flex break-before-page flex-col gap-6',
      className,
    )}
  >
    {children}
  </div>
);

export default SummaryPage;
