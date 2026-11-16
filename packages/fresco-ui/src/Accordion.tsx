'use client';

import { Accordion as BaseAccordion } from '@base-ui/react/accordion';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { type ComponentProps, type HTMLAttributes, useState } from 'react';

import { headingVariants } from './typography/Heading';
import { cx } from './utils/cva';
import { motionSafeProps } from './utils/motionSafeProps';

type AccordionProps<Value> = Omit<
  BaseAccordion.Root.Props<Value>,
  'className'
> & {
  className?: string;
};

function Accordion<Value = unknown>({
  className,
  ...props
}: AccordionProps<Value>) {
  return (
    <BaseAccordion.Root<Value>
      className={cx('flex flex-col gap-4', className)}
      {...props}
    />
  );
}

type AccordionItemProps = Omit<
  ComponentProps<typeof BaseAccordion.Item>,
  'className'
> & {
  className?: string;
};

function AccordionItem({ className, ...props }: AccordionItemProps) {
  return <BaseAccordion.Item className={className} {...props} />;
}

type AccordionHeaderProps = Omit<
  ComponentProps<typeof BaseAccordion.Header>,
  'className'
> & {
  className?: string;
};

function AccordionHeader({ ...props }: AccordionHeaderProps) {
  return <BaseAccordion.Header {...props} />;
}

type AccordionTriggerProps = Omit<
  ComponentProps<typeof BaseAccordion.Trigger>,
  'className'
> & {
  className?: string;
};

function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionTriggerProps) {
  return (
    <BaseAccordion.Trigger
      className={cx(
        headingVariants({ level: 'h4', variant: 'all-caps', margin: 'none' }),
        'focusable flex w-full flex-1 cursor-pointer items-center justify-between gap-4',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="transition-transform [[data-panel-open]>&]:rotate-180" />
    </BaseAccordion.Trigger>
  );
}

type AccordionPanelProps = Omit<
  ComponentProps<typeof BaseAccordion.Panel>,
  'className' | 'render'
> & {
  className?: string;
};

type AccordionPanelBodyProps = {
  open: boolean;
  renderProps: HTMLAttributes<HTMLElement>;
  className?: string;
  children?: ComponentProps<'div'>['children'];
};

/**
 * The panel clips its content while it animates, because `height` runs between
 * 0 and `auto`, and while it is closed. A panel that is open and has finished
 * animating must not clip: a focus ring is an outline that reaches past the
 * control it belongs to, and `overflow: hidden` would cut it off at the
 * panel's edge.
 *
 * `settled` records that the opening animation has finished. It starts as
 * `open`, so a panel that is open on first render never clips. Closing clears
 * it during the render that sees `open` turn false, so the panel clips from the
 * first frame of the exit, an interrupted toggle starts clipping again at once,
 * and the completion of a closing animation (which sets it again) is undone
 * before it can paint. Opening waits for `onAnimationComplete`, which Motion
 * also fires when animations are skipped, so every mode ends up settled.
 *
 * `flow-root` gives the panel its own block formatting context, which
 * `overflow: hidden` did implicitly. Without it the first and last child's
 * margins would collapse through the panel once overflow became visible, and
 * the content would move when the panel settles.
 */
function AccordionPanelBody({
  open,
  renderProps,
  className,
  children,
}: AccordionPanelBodyProps) {
  const [settled, setSettled] = useState(open);

  if (!open && settled) setSettled(false);

  return (
    <motion.div
      {...motionSafeProps(renderProps)}
      aria-hidden={!open}
      animate={{
        height: open ? 'auto' : 0,
        opacity: open ? 1 : 0,
      }}
      initial={false}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      onAnimationComplete={() => setSettled(true)}
      style={{
        ...renderProps.style,
        overflow: open && settled ? 'visible' : 'hidden',
      }}
      className={cx('mt-2 flow-root', className)}
    >
      {children}
    </motion.div>
  );
}

function AccordionPanel({
  className,
  children,
  keepMounted = true,
  ...props
}: AccordionPanelProps) {
  return (
    <BaseAccordion.Panel
      keepMounted={keepMounted}
      {...props}
      render={(renderProps, state) => (
        <AccordionPanelBody
          open={state.open}
          renderProps={renderProps}
          className={className}
        >
          {children}
        </AccordionPanelBody>
      )}
    />
  );
}

export {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
};
