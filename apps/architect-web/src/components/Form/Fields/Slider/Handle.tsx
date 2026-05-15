import { useState } from 'react';

import { cx } from '~/utils/cva';

import MarkdownLabel from '../MarkdownLabel';

type HandleProps = {
  domain: [number, number];
  handle: {
    id: string;
    value: number;
    percent: number;
  };
  isActive?: boolean;
  isDisabled?: boolean;
  isNotSet?: boolean;
  showTooltips?: boolean;
  getHandleProps: (
    id: string,
    props?: Record<string, unknown>,
  ) => Record<string, unknown>;
  getLabelForValue: (value: number) => string | null;
};

const Handle = ({
  domain: [min, max],
  handle: { id, value, percent },
  isActive = false,
  isDisabled = false,
  isNotSet = false,
  showTooltips = false,
  getHandleProps,
  getLabelForValue,
}: HandleProps) => {
  const [mouseOver, setMouseOver] = useState(false);

  const handleMouseEnter = () => setMouseOver(true);
  const handleMouseLeave = () => setMouseOver(false);

  const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;
  const handleProps = getHandleProps(id, {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  });

  const label = getLabelForValue(value);

  return (
    <>
      {showTooltips && (
        <div
          className={cx(
            'text-surface-accent-foreground absolute bottom-1/2 transition-opacity duration-(--animation-duration-fast) ease-(--animation-easing)',
            'translate-x-[-0.05rem] translate-y-[calc(var(--space-xl)*-0.75)]',
            "before:bg-surface-accent before:absolute before:bottom-0 before:block before:h-(--space-md) before:w-(--space-md) before:origin-bottom-left before:-rotate-45 before:content-['']",
            showTooltip ? 'opacity-100' : 'opacity-0',
          )}
          style={{ left: `${percent}%` }}
        >
          <MarkdownLabel
            inline
            label={label}
            className="bg-surface-accent flex min-h-(--space-xl) w-max max-w-(--space-6xl) -translate-x-1/2 translate-y-[calc(var(--space-xl)*-0.2)] items-center justify-center rounded-(--radius) px-(--space-md) py-(--space-sm) text-xs"
          />
        </div>
      )}
      <div
        className="absolute top-(--space-xl) z-(--z-global-ui) size-(--space-xl) -translate-x-1/2 -translate-y-1/2 cursor-pointer"
        style={{ left: `${percent}%` }}
        {...handleProps}
      />
      <div
        role="slider"
        aria-label="Slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className={cx(
          'absolute top-(--space-xl) z-(--z-default) size-(--space-xl) -translate-x-1/2 -translate-y-1/2 rounded-full border-0',
          'transition-[transform,opacity,filter] duration-(--animation-duration-fast)',
          isDisabled ? 'bg-charcoal' : 'bg-active',
          isActive && 'scale-[1.2]',
          isNotSet && !isActive && 'opacity-80 saturate-0',
        )}
        style={{ left: `${percent}%` }}
        tabIndex={0}
      />
    </>
  );
};

export default Handle;
