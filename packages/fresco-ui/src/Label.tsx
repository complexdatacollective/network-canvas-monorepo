'use client';

import * as React from 'react';

import { headingVariants } from './typography/Heading';
import { cx } from './utils/cva';

const Label = React.forwardRef<
  React.ElementRef<'label'>,
  React.ComponentPropsWithoutRef<'label'> & {
    required?: boolean;
  }
>(
  (
    {
      className,
      required,
      htmlFor,
      children,
      onAnimationStart: _onAnimationStart,
      onAnimationEnd: _onAnimationEnd,
      onAnimationIteration: _onAnimationIteration,
      onDrag: _onDrag,
      onDragEnd: _onDragEnd,
      onDragEnter: _onDragEnter,
      onDragExit: _onDragExit,
      onDragLeave: _onDragLeave,
      onDragOver: _onDragOver,
      onDragStart: _onDragStart,
      onDrop: _onDrop,
      ...props
    },
    ref,
  ) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cx(
        // A block container, so headingVariants' cap trim applies to the
        // label itself: the gap to the control below starts at its baseline.
        // `block w-fit` rather than `inline-block`: an inline-block sits on
        // its parent's line box, whose strut keeps the parent as tall as an
        // untrimmed line and hands the slack straight back.
        //
        // The label keeps the label style's own margins, so what follows it
        // (a hint, a control) is spaced by the type scale rather than by its
        // container. Pass `m-0!` where a container spaces it itself.
        'block w-fit',
        headingVariants({ level: 'label' }),
        'peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-destructive" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </label>
  ),
);
Label.displayName = 'Label';

export { Label };
