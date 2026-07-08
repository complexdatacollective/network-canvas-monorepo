import type { ReactNode } from 'react';

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
  <div className={cx('mb-10 last:mb-0', wrapperClassName)}>
    <div
      className={cx(
        'border-platinum relative overflow-hidden rounded border-2 px-5 pt-10 pb-2.5',
        contentClassName,
      )}
    >
      <h2 className="bg-platinum absolute top-0 left-0 m-0 w-full px-5 py-2.5 text-xs font-semibold tracking-widest uppercase">
        {title}
      </h2>
      {children}
    </div>
  </div>
);

export default SectionFrame;
