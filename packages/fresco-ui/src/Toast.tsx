'use client';

import {
  Toast,
  type ToastObject,
  type UseToastManagerReturnValue,
} from '@base-ui/react/toast';
import { AlertCircle, Info, type LucideIcon, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Badge } from './Badge';
import Button from './Button';
import CloseButton from './CloseButton';
import { surfaceVariants } from './layout/Surface';
import { usePortalContainer } from './PortalContainer';
import { ScrollArea } from './ScrollArea';
import Heading from './typography/Heading';
import { cva, cx, type VariantProps } from './utils/cva';
import { fitToastStack } from './utils/fitToastStack';

const messages = defineMessages({
  notifications: {
    id: 'frescoUi.toast.notifications',
    defaultMessage: 'Notifications',
    description:
      'Accessible name of the region containing status notifications and alerts.',
  },
  moreNotifications: {
    id: 'frescoUi.toast.moreNotifications',
    defaultMessage:
      '{count, plural, one {# more notification} other {# more notifications}}',
    description:
      'Shown above an expanded stack of notifications when some do not fit on screen. They appear as the visible ones are dismissed.',
  },
});

// Caps how tall a toast's description can grow before it scrolls internally,
// so a consumer that renders a lot of content (a long message, a list of
// errors) can't push the toast's own title and Close control off the top of
// the screen — the viewport anchors every toast to the bottom and grows it
// upward, so unbounded content is clipped by the browser window with no way
// back, not by anything the toast itself renders.
const DESCRIPTION_MAX_HEIGHT = 'max-h-[40dvh]';

export const toastVariants = cva({
  base: 'publish-colors border bg-clip-padding',
  variants: {
    variant: {
      default: 'bg-surface text-surface-contrast border-outline',
      info: 'bg-info text-info-contrast border-info',
      success: 'bg-success text-success-contrast border-success',
      destructive:
        'bg-destructive text-destructive-contrast border-destructive',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export type ToastVariant = NonNullable<
  VariantProps<typeof toastVariants>['variant']
>;

export const variantIcons: Record<ToastVariant, LucideIcon | null> = {
  default: null,
  info: Info,
  success: PartyPopper,
  destructive: AlertCircle,
};

type ToastData = {
  id?: string;
  title: React.ReactNode;
  description?: string | React.ReactNode;
  variant?: ToastVariant;
  icon?: React.ReactNode;
  timeout?: number;
  onCancel?: () => void;
  // Label for the action button rendered when `onCancel` is set. Defaults to
  // "Cancel".
  cancelLabel?: React.ReactNode;
  // When set, the toast's title + description become a clickable region (the
  // close button and action button remain separate). Use for "click the toast
  // to see more" affordances.
  onClick?: () => void;
  onClose?: () => void;
};

type ToastCustomData = {
  variant?: ToastVariant;
  onCancel?: () => void;
  cancelLabel?: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
};

type ToastItemProps = {
  toast: ToastObject<ToastCustomData>;
  // The expanded stack has no room for this toast (see `Toaster`).
  overflowing: boolean;
};

function ToastItem({ toast, overflowing }: ToastItemProps) {
  const intl = useAppIntl();
  const variant: ToastVariant =
    toast.type === 'info' ||
    toast.type === 'success' ||
    toast.type === 'destructive'
      ? toast.type
      : 'default';
  const IconComponent = variantIcons[variant];

  return (
    <Toast.Root
      key={toast.id}
      toast={toast}
      // Hidden much like a toast past the provider's `limit`: inert, so
      // neither Tab nor a screen reader can land on it, and faded out while
      // the stack is expanded. Collapsed, it still peeks out from behind the
      // frontmost toast with the rest of the stack.
      data-overflowing={overflowing || undefined}
      {...(overflowing && { inert: true })}
      className={cx(
        'focusable',
        '[--peek:--spacing(4)]', // space between toasts when stacked
        '[--scale:calc(max(0,1-(var(--toast-index)*0.1)))]', // scale factor for stacked toasts (10% smaller per position)
        '[--shrink:calc(1-var(--scale))]', // inverse of scale, used for height offset
        '[--stack-opacity:calc(1-(var(--toast-index)*0.2))]', // opacity for stacked toasts (20% more transparent per position)
        '[--height:var(--toast-frontmost-height,var(--toast-height))]', // toast height (matches frontmost when stacked)
        '[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]', // vertical offset when expanded
        'after:absolute after:inset-s-0 after:top-full after:h-[calc(var(--gap)+1px)] after:w-full after:content-[""]',
        'me-0 select-none',
        surfaceVariants({ spacing: 'sm' }),
        'absolute inset-s-auto inset-e-0 bottom-0',
        'z-[calc(1000-var(--toast-index))]',
        'h-(--height) w-full origin-bottom',
        '[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s] data-ending-style:opacity-0 data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-expanded:data-overflowing:opacity-0 data-starting-style:transform-[translateY(150%)] data-ending-style:data-swipe-direction-down:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-expanded:data-ending-style:data-swipe-direction-down:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-swipe-direction-left:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-swipe-direction-left:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-swipe-direction-right:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-swipe-direction-right:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-swipe-direction-up:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-swipe-direction-up:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(150%)]',
        'transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]',
        'opacity-(--stack-opacity) data-expanded:h-(--toast-height) data-expanded:opacity-100',
        toastVariants({ variant }),
      )}
    >
      <Toast.Content className="flex gap-3 overflow-hidden transition-opacity duration-250 data-behind:pointer-events-none data-behind:opacity-0 data-expanded:pointer-events-auto data-expanded:opacity-100">
        {toast.data?.icon ? (
          <span className="mt-[0.1em] shrink-0">{toast.data.icon}</span>
        ) : (
          IconComponent && (
            <IconComponent
              className="mt-[0.1em] size-5 shrink-0"
              aria-hidden="true"
            />
          )
        )}
        <div className="flex-1">
          {toast.data?.onClick ? (
            <button
              type="button"
              onClick={toast.data.onClick}
              className="block w-full cursor-pointer text-start"
            >
              <Toast.Title render={<Heading level="h4" />} />
              {/* A native <button> may not contain interactive/tabbable
                  descendants, so this branch can't use ScrollArea (its
                  viewport is keyboard-focusable). Long content still gets
                  bounded and mouse/touch-scrollable; the whole toast is
                  already a single keyboard-operable control here. */}
              <Toast.Description
                className={cx(DESCRIPTION_MAX_HEIGHT, 'overflow-y-auto')}
                render={<div className="font-body text-pretty" />}
              />
            </button>
          ) : (
            <>
              <Toast.Title render={<Heading level="h4" />} />
              <Toast.Description
                className={cx(
                  DESCRIPTION_MAX_HEIGHT,
                  'overflow-hidden not-last:mb-4',
                )}
                render={
                  <ScrollArea viewportClassName="font-body text-pretty pe-2" />
                }
              />
            </>
          )}
          {toast.data?.onCancel && (
            <Button
              type="button"
              size="sm"
              onClick={toast.data.onCancel}
              className="mt-3 mb-1"
            >
              {toast.data.cancelLabel ??
                intl.formatMessage(commonMessages.cancel)}
            </Button>
          )}
        </div>
        <Toast.Close
          render={<CloseButton size="sm" />}
          className="absolute inset-e-2 top-2"
          aria-label={intl.formatMessage(commonMessages.close)}
          nativeButton
        />
      </Toast.Content>
    </Toast.Root>
  );
}

type TypedUseToastManager = Omit<
  UseToastManagerReturnValue,
  'add' | 'update'
> & {
  add: (data: ToastData) => string;
  update: (id: string, data: Partial<ToastData>) => void;
  toast: (data: ToastData) => void;
};

export function useToast(): TypedUseToastManager {
  const toastManager = Toast.useToastManager();

  const add = (toastData: ToastData) => {
    const { onCancel, cancelLabel, onClick, onClose, icon, variant, ...rest } =
      toastData;
    return toastManager.add({
      ...rest,
      type: variant,
      onClose,
      data: { onCancel, cancelLabel, onClick, icon },
    });
  };

  const update = (id: string, toastData: Partial<ToastData>) => {
    const { onCancel, cancelLabel, onClick, onClose, icon, variant, ...rest } =
      toastData;
    toastManager.update(id, {
      ...rest,
      ...(variant !== undefined && { type: variant }),
      ...(onClose !== undefined && { onClose }),
      ...((onCancel !== undefined ||
        cancelLabel !== undefined ||
        onClick !== undefined ||
        icon !== undefined) && {
        data: { onCancel, cancelLabel, onClick, icon },
      }),
    });
  };

  const toast = (toastData: ToastData) => {
    add(toastData);
  };

  return {
    ...toastManager,
    add,
    update,
    toast,
  } as TypedUseToastManager;
}

type StackSpace = Parameters<typeof fitToastStack>[1];

/**
 * Measures, in pixels, the room the expanded stack has. Read from the
 * rendered viewport and indicator rather than kept as constants: the spacing
 * scale can be fluid (the interview theme scales it with the screen), and the
 * indicator's height follows the type scale and the locale.
 *
 * `null` until the viewport has been laid out — and in environments with no
 * layout at all, such as jsdom, where there is nothing to fit against.
 */
function useStackSpace(
  viewport: HTMLElement | null,
  indicator: HTMLElement | null,
) {
  const [space, setSpace] = useState<StackSpace | null>(null);

  useEffect(() => {
    if (!viewport || !indicator) return undefined;
    const win = viewport.ownerDocument.defaultView;
    if (!win) return undefined;

    const measure = () => {
      // The viewport is an empty box pinned to the stack's bottom edge, so
      // its distance from the bottom of the window is the inset the stack
      // keeps. Keep the same inset clear at the top.
      const { bottom } = viewport.getBoundingClientRect();
      const available = bottom - (win.innerHeight - bottom);
      const next =
        available > 0
          ? {
              available,
              gap:
                Number.parseFloat(win.getComputedStyle(viewport).rowGap) || 0,
              indicator: indicator.offsetHeight,
            }
          : null;
      setSpace((current) =>
        current &&
        next &&
        current.available === next.available &&
        current.gap === next.gap &&
        current.indicator === next.indicator
          ? current
          : next,
      );
    };

    measure();
    win.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(indicator);
    return () => {
      win.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [viewport, indicator]);

  return space;
}

const NOTHING_HIDDEN: ReturnType<typeof fitToastStack> = {
  overflowingIds: new Set(),
  hiddenCount: 0,
  extent: 0,
};

type IndicatorStyle = React.CSSProperties & { '--stack-extent': string };

export function Toaster() {
  const intl = useAppIntl();
  const { toasts } = useToast();
  const portalContainer = usePortalContainer();
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<HTMLDivElement | null>(null);
  const space = useStackSpace(viewport, indicator);

  // Base UI expands the stack by translating each toast up past the ones in
  // front of it, so tall toasts would pile up past the top of the screen.
  // Toasts the expanded stack has no room for are hidden instead, the oldest
  // first, and come back as the ones in front are dismissed; the indicator
  // above the stack counts them, together with any past the provider's
  // `limit`.
  const { overflowingIds, hiddenCount, extent } = space
    ? fitToastStack(toasts, space)
    : NOTHING_HIDDEN;
  const indicatorStyle: IndicatorStyle = { '--stack-extent': `${extent}px` };

  return (
    <Toast.Portal container={portalContainer ?? undefined}>
      <Toast.Viewport
        ref={setViewport}
        aria-label={intl.formatMessage(messages.notifications)}
        data-testid="toast-viewport"
        className={cx(
          'group/toasts phone-landscape:max-w-sm fixed top-auto bottom-2 mx-auto flex w-full',
          'tablet-portrait:inset-e-8 tablet-portrait:bottom-8 z-10',
          // Space between toasts when expanded, and their swipe area. Also
          // the viewport's own flex gap — which lays nothing out, as every
          // child is absolutely positioned — so `useStackSpace` can read it
          // in pixels.
          'gap-(--gap) [--gap:--spacing(4)]',
        )}
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            overflowing={overflowingIds.has(toast.id)}
          />
        ))}
        {/* Sits one gap above the topmost toast shown, and only shows while
            the stack is expanded, which is when the hidden toasts would have
            been on screen. Screen readers can reach the count whenever any
            toasts are hidden. Kept rendered (but invisible) when none are,
            so its height can be measured before it is needed. */}
        <div
          ref={setIndicator}
          style={indicatorStyle}
          className={cx(
            'pointer-events-none absolute inset-x-0 bottom-0 flex justify-center',
            'transform-[translateY(calc(-1*(var(--stack-extent)+var(--gap))))]',
            'opacity-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
            hiddenCount > 0
              ? 'group-data-expanded/toasts:opacity-100'
              : 'invisible',
          )}
        >
          <Badge tone="neutral" className="elevation-low">
            {intl.formatMessage(messages.moreNotifications, {
              count: hiddenCount,
            })}
          </Badge>
        </div>
      </Toast.Viewport>
    </Toast.Portal>
  );
}
