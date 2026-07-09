import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import { paragraphVariants } from '@codaco/fresco-ui/typography/Paragraph';
import { cx } from '~/utils/cva';
type SubsectionProps = {
  /** Used as the scroll-to-error anchor (see utils/issues getFieldId). */
  id?: string;
  title: ReactNode;
  summary?: ReactNode;
  /** Optional control shown to the right of the heading (e.g. a toggle). */
  action?: ReactNode;
  disabled?: boolean;
  disabledMessage?: string;
  children?: ReactNode;
  className?: string;
};

/**
 * A headed subsection within a single Section card. Used to group related
 * fields under a heading instead of giving each group its own card.
 */
const Subsection = ({
  id,
  title,
  summary = null,
  action = null,
  disabled = false,
  disabledMessage = 'Complete the required options above to enable this section.',
  children,
  className = '',
}: SubsectionProps) => (
  <section
    id={id}
    className={cx('flex flex-col gap-5', 'not-first:pt-7', className)}
  >
    <div className="flex items-start justify-between gap-5">
      <div>
        <Heading
          level="h3"
          margin="none"
          className="text-lg font-semibold tracking-tight"
        >
          {title}
        </Heading>
        {summary && (
          <div
            className={paragraphVariants({
              intent: 'smallText',
              margin: 'none',
              className: 'text-current/70',
            })}
          >
            {summary}
          </div>
        )}
      </div>
      {action}
    </div>
    {disabled ? (
      <div className="bg-outline/75 text-text/70 flex items-center justify-center rounded p-8 text-center font-semibold italic">
        {disabledMessage}
      </div>
    ) : (
      children
    )}
  </section>
);

export default Subsection;
