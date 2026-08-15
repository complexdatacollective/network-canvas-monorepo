'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type React from 'react';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';

import CloseButton from '../CloseButton';
import { surfaceSpacingVariants } from '../layout/Surface';
import Modal from '../Modal';
import { ScrollArea } from '../ScrollArea';
import Heading from '../typography/Heading';
import Paragraph from '../typography/Paragraph';
import { cx } from '../utils/cva';
import {
  isUsableFinalFocusTarget,
  normaliseFinalFocus,
  type FinalFocusCloseType,
  type FinalFocusResult,
} from '../utils/finalFocus';
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

  /**
   * Remember the control that was focused when this dialog opened, and return
   * focus to it on close unless the caller names somewhere better.
   *
   * Every dialog in the app is controlled — none uses `Dialog.Trigger` — so
   * Base UI has no `domReference` to go back to, and its remaining fallbacks
   * resolve to `<body>` or to an unrelated control focused earlier in the
   * session. Making the opener the default here fixes every direct `Dialog`
   * caller at once, rather than asking each one to remember.
   *
   * Captured during the render that flips `open` to true. A layout effect would
   * be too late: Base UI's focus manager lives BELOW this component, and child
   * effects run first, so by then focus is already inside the popup. Reading
   * `document` is guarded by that transition, so it never runs during SSR.
   */
  // Starts `false` even when `open` is already true, so a dialog that MOUNTS
  // open still captures. Two of Architect's own dialogs do exactly that: they
  // bump a `key` in the same render that shows them, so the whole subtree
  // remounts with `open` already true and a transition-only capture would never
  // fire for them.
  const [wasOpen, setWasOpen] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && typeof document !== 'undefined') {
      const active = document.activeElement;
      openerRef.current =
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement
          ? active
          : null;
    }
  }

  const resolveFinalFocus = useCallback(
    (closeType: FinalFocusCloseType): FinalFocusResult => {
      const declared = normaliseFinalFocus(finalFocus, closeType);
      // `true`/`false` are instructions, not targets, so they pass straight
      // through.
      if (typeof declared === 'boolean') return declared;
      // Anything the caller actually answered with wins; `null` means "no
      // opinion", which is where the remembered opener comes in. A named
      // element only wins if it can still be focused — the caller's target is
      // usually the control that opened the dialog, and a confirmed destructive
      // action removes exactly that. An explicit target bypasses Base UI's own
      // connectivity check, so handing over a detached node leaves focus on
      // `<body>`: worse than falling through to the opener (or to Base UI's
      // default).
      if (declared !== null && isUsableFinalFocusTarget(declared)) {
        return declared;
      }

      const opener = openerRef.current;
      // A disconnected opener (the row this dialog was editing has been
      // deleted) must not be handed over: an explicit target bypasses Base UI's
      // own connectivity check, and focusing a detached node leaves focus on
      // `<body>`.
      return opener?.isConnected ? opener : null;
    },
    [finalFocus],
  );

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
        finalFocus={resolveFinalFocus}
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
          <div className="min-w-0 flex-1">
            <BaseDialog.Title
              id={titleId}
              render={<Heading level="h2" margin="none" />}
            >
              {title}
            </BaseDialog.Title>
            {header && <div className="mt-4">{header}</div>}
          </div>
          {dismissible && <BaseDialog.Close render={<CloseButton />} />}
        </DialogHeader>
        <DialogContent labelledBy={title ? titleId : undefined}>
          {description && (
            <BaseDialog.Description
              render={<Paragraph margin="none" className="max-w-[75ch]" />}
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
        'mb-4 flex shrink-0 items-start justify-between gap-2',
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
