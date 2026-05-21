import { type ComponentPropsWithRef, useState } from 'react';

import { cx } from '~/utils/cva';

import MarkdownLabel from '../MarkdownLabel';

type HandleProps = {
  /** Props base-ui injects into the thumb element (positioning, drag handlers, ref, hidden input). */
  thumbProps: ComponentPropsWithRef<'div'>;
  label: string | null;
  isActive?: boolean;
  isDisabled?: boolean;
  isNotSet?: boolean;
  showTooltips?: boolean;
};

const Handle = ({
  thumbProps,
  label,
  isActive = false,
  isDisabled = false,
  isNotSet = false,
  showTooltips = false,
}: HandleProps) => {
  const [mouseOver, setMouseOver] = useState(false);

  const showTooltip = showTooltips && (mouseOver || isActive) && !isDisabled;

  // base-ui renders a visually-hidden <input type="range"> as the thumb's
  // children (keyboard/a11y/form integration). Preserve it and render the
  // tooltip alongside, rather than overriding children via spread.
  const { children, ...rest } = thumbProps;

  return (
    <div
      {...rest}
      onMouseEnter={() => setMouseOver(true)}
      onMouseLeave={() => setMouseOver(false)}
      className={cx(
        'z-(--z-default) size-(--space-xl) rounded-full border-0',
        'transition-[transform,opacity,filter] duration-(--animation-duration-fast)',
        isDisabled ? 'bg-charcoal' : 'bg-active',
        isActive && 'scale-[1.2]',
        isNotSet && !isActive && 'opacity-80 saturate-0',
      )}
    >
      {children}
      {showTooltips && (
        <div
          className={cx(
            'text-surface-accent-foreground absolute bottom-1/2 left-1/2 transition-opacity duration-(--animation-duration-fast) ease-(--animation-easing)',
            'translate-x-[-0.05rem] translate-y-[calc(var(--space-xl)*-0.75)]',
            "before:bg-surface-accent before:absolute before:bottom-0 before:block before:h-(--space-md) before:w-(--space-md) before:origin-bottom-left before:-rotate-45 before:content-['']",
            showTooltip ? 'opacity-100' : 'opacity-0',
          )}
        >
          <MarkdownLabel
            inline
            label={label}
            className="bg-surface-accent flex min-h-(--space-xl) w-max max-w-(--space-6xl) -translate-x-1/2 translate-y-[calc(var(--space-xl)*-0.2)] items-center justify-center rounded-(--radius) px-(--space-md) py-(--space-sm) text-xs"
          />
        </div>
      )}
    </div>
  );
};

export default Handle;
