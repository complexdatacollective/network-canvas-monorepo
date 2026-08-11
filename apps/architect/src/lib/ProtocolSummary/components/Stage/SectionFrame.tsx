import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '~/utils/cva';
type SectionFrameProps = {
  title: string;
  children: ReactNode;
  wrapperClassName?: string;
  contentClassName?: string;
};

const SectionFrame = ({
  title,
  children,
  wrapperClassName,
  contentClassName,
}: SectionFrameProps) => (
  <div
    className={cx(
      'border-platinum relative overflow-hidden rounded-sm border-2 px-5 pt-10 pb-2.5',
      wrapperClassName,
      contentClassName,
    )}
  >
    <Heading
      level="h2"
      variant="all-caps"
      margin="none"
      className="bg-platinum absolute top-0 left-0 w-full px-5 py-2.5 text-xs font-semibold"
    >
      {title}
    </Heading>
    {children}
  </div>
);

export default SectionFrame;
