import { motion, useAnimation } from 'motion/react';
import type React from 'react';

import Icon from '~/lib/legacy-ui/components/Icon';
import { cx } from '~/utils/cva';

type TipProps = {
  type?: 'info' | 'warning' | 'error';
  icon?: boolean;
  children?: React.ReactNode;
};

const typeClasses: Record<NonNullable<TipProps['type']>, string> = {
  // Swap the info icon's "speech bubble" tones for a lighter pair so the icon
  // reads against the tinted Tip background. See info.svg.react.tsx.
  info: 'bg-info/25 text-navy-taupe [--info-fill-primary:oklch(var(--white))] [--info-fill-shadow:oklch(var(--platinum))]',
  warning: 'bg-warning/10',
  error: 'bg-destructive/10',
};

const Tip = ({ type = 'info', icon = true, children = null }: TipProps) => {
  const animation = useAnimation();

  return (
    <div
      className={cx(
        'bg-surface-2 my-7 flex w-full items-center gap-5 rounded px-10 py-1 text-sm first:mt-0 last:mb-0',
        typeClasses[type],
      )}
    >
      {icon && (
        <motion.div
          className="shrink-0 origin-center"
          animate={animation}
          onViewportEnter={() =>
            animation.start({
              rotate: [-15, 10, -7, 0],
              scale: [1, 1.2, 1],
              transition: {
                delay: 0.5,
              },
            })
          }
        >
          <Icon name={type} className="size-10" />
        </motion.div>
      )}
      <div>{children}</div>
    </div>
  );
};

export default Tip;
