'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type React from 'react';
import { useId, type ReactNode } from 'react';

import CloseButton from '../CloseButton';
import { surfaceSpacingVariants } from '../layout/Surface';
import Modal from '../Modal';
import { ScrollArea } from '../ScrollArea';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import DialogPopup, { type DialogSize } from './DialogPopup';

// TODO: These seem like they belong in a shared location.
export const STATE_VARIANTS = [
  'default',
  'destructive',
  'success',
  'info',
  'warning',
] as const;

export type DialogProps = {
  title?: ReactNode;
  description?: ReactNode;
  accent?: (typeof STATE_VARIANTS)[number];
  closeDialog?: () => void;
  footer?: React.ReactNode;
  open?: boolean;
  children?: ReactNode;
  /** Supplementary controls rendered below the title in the fixed header. */
  header?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  layoutId?: string;
  /**
   * Semantic sizing based on dialog use cases. Use `className` only when a
   * dialog has exceptional requirements not covered by these presets.
   * @default 'readable'
   */
  size?: DialogSize;
  /**
   * When false, the dialog cannot be dismissed: the close button is hidden,
   * and clicks outside / Escape no longer trigger `closeDialog`. Use this for
   * forced flows like a lock screen that the user must complete.
   * @default true
   */
  dismissible?: boolean;
  /**
   * Where focus goes when the dialog opens. Defaults to Base UI's behaviour
   * (the popup itself, then its first tabbable child).
   */
  initialFocus?: React.ComponentProps<typeof BaseDialog.Popup>['initialFocus'];
  /**
   * Where focus RETURNS when the dialog closes. Prefer a function: it is
   * resolved when focus is actually returned (after the exit animation), so it
   * can name a control that is remounted by then. Resolve to `null` to keep
   * Base UI's default; never resolve to `document.body`.
   */
  finalFocus?: React.ComponentProps<typeof BaseDialog.Popup>['finalFocus'];
};

/**
 * Dialog component using Base UI Dialog primitives with motion animations.
 *
 * For use with `useDialog` and `DialogProvider`. Use `Dialog` in
 * situations where you need to control the dialog's open state manually.
 *
 * Implementation Notes:
 *
 * - Uses Base UI Dialog for accessibility and state management
 * - ModalPopup with ModalPopupAnimation for consistent animations
 * - Surface styling applied via className for proper elevation and spacing
 * - Backdrop click-to-close is handled by Base UI's dismissible behavior
 */
export default function Dialog({
  title,
  description,
  children,
  header,
  closeDialog,
  accent,
  footer,
  open = false,
  className,
  size = 'readable',
  dismissible = true,
  finalFocus,
  ...rest
}: DialogProps) {
  const titleId = useId();

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && closeDialog) {
          closeDialog();
        }
      }}
    >
      <DialogPopup
        key="dialog-popup"
        size={size}
        // Straight through: `ModalPopup` resolves it and falls back to the
        // opener remembered by the enclosing `Modal`. That capture used to live
        // here, which left every surface rendering `ModalPopup` inside a
        // `Modal` directly — Architect's variable pill editor, variable
        // spotlight and nav drawer, Fresco's mobile nav drawer — without one.
        finalFocus={finalFocus}
        className={cx(
          // Accent overrides the primary hue so that nested primary buttons inherit color.
          // Override the primitives (--primary/--primary-contrast) because @theme inline
          // substitutes the --color-* aliases at compile time — consumers like Button read
          // the primitives directly, so an alias override wouldn't propagate.
          accent === 'success' && '[--primary:var(--success)]',
          accent === 'info' && '[--primary:var(--info)]',
          accent === 'destructive' &&
            '[--primary-contrast:var(--destructive-contrast)] [--primary:var(--destructive)]',
          accent === 'warning' &&
            '[--primary-contrast:var(--warning-contrast)] [--primary:var(--warning)]',
          className,
        )}
        {...rest}
      >
        <DialogHeader>
          {/*
            The close button shares a row with the title and centres on it.
            The title is cap-trimmed, so its box is its caps; aligned to the
            start it would sit high against the button, and aligned across
            the whole header it would drift whenever `header` adds content.
          */}
          <div className="flex items-center justify-between gap-2">
            <BaseDialog.Title
              id={titleId}
              render={<Heading level="h2" margin="none" className="min-w-0" />}
            >
              {title}
            </BaseDialog.Title>
            {dismissible && <BaseDialog.Close render={<CloseButton />} />}
          </div>
          {header && <div className="mt-4">{header}</div>}
        </DialogHeader>
        <DialogContent labelledBy={title ? titleId : undefined}>
          {description && (
            <BaseDialog.Description
              render={<Paragraph className="max-w-[75ch]" />}
            >
              {description}
            </BaseDialog.Description>
          )}
          {children}
        </DialogContent>
        <DialogFooter>{footer}</DialogFooter>
      </DialogPopup>
    </Modal>
  );
}

Dialog.displayName = 'Dialog';

const DialogHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <div
      className={cx(
        'mb-4 shrink-0',
        surfaceSpacingVariants({ section: 'header' }),
      )}
    >
      {children}
    </div>
  );
};

/**
 * `labelledBy` names the scroll viewport after the dialog's own title. The
 * viewport is a tab stop whenever the body overflows (so it can be scrolled by
 * keyboard — WCAG 2.1.1), and an unnamed, roleless tab stop announces nothing:
 * it was the "invisible stop after Close" reported in every dialog. A named
 * `<section>` maps to `role="region"` implicitly, so no explicit role is needed.
 */
const DialogContent = ({
  children,
  labelledBy,
}: {
  children: React.ReactNode;
  labelledBy?: string;
}) => {
  return (
    <ScrollArea
      aria-labelledby={labelledBy}
      nameWhenScrollableOnly
      viewportClassName={surfaceSpacingVariants({
        section: 'content',
        className: 'py-2!',
      })}
    >
      {children}
    </ScrollArea>
  );
};

// Layout convention: place the cancel/dismiss action as the first child to pin it left.
// Primary and any secondary actions follow and cluster on the right. A single-child footer
// (e.g. acknowledge dialog) is right-aligned by `justify-end`.
const DialogFooter = ({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) => {
  return (
    <footer
      className={cx(
        // `min-w-0` so the row is bounded by the popup and not by its widest
        // action: without it an over-long label sized the footer, and the flex
        // row pushed the cancel action out past the dialog's clipped edge and
        // off the viewport entirely (#1392).
        'mt-4 flex min-w-0 shrink-0 flex-col gap-2 @min-[30rem]:flex-row @min-[30rem]:justify-end @min-[30rem]:[&>*:first-child:not(:only-child)]:mr-auto',
        children && 'mt-6',
        surfaceSpacingVariants({ section: 'footer' }),
        className,
      )}
    >
      {children}
    </footer>
  );
};

export { DialogFooter };
