'use client';

import {
  Toast,
  type ToastObject,
  type UseToastManagerReturnValue,
} from '@base-ui/react/toast';
import { AlertCircle, Info, type LucideIcon, PartyPopper } from 'lucide-react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button from './Button';
import CloseButton from './CloseButton';
import { surfaceVariants } from './layout/Surface';
import { usePortalContainer } from './PortalContainer';
import { ScrollArea } from './ScrollArea';
import Heading from './typography/Heading';
import { cva, cx, type VariantProps } from './utils/cva';

// Caps how tall a toast's description can grow before it scrolls internally,
// so a consumer that renders a lot of content (a long message, a list of
// errors) can't push the toast's own title and Close control off the top of
// the screen — the viewport anchors every toast to the bottom and grows it
// upward, so unbounded content is clipped by the browser window with no way
// back, not by anything the toast itself renders.
const messages = defineMessages({
  notifications: {
    id: 'frescoUi.toast.notifications',
    defaultMessage: 'Notifications',
    description:
      'Accessible name of the region containing status notifications and alerts.',
  },
});

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
  cancelLabel?: string;
  // When set, the toast's title + description become a clickable region (the
  // close button and action button remain separate). Use for "click the toast
  // to see more" affordances.
  onClick?: () => void;
  onClose?: () => void;
};

type ToastCustomData = {
  variant?: ToastVariant;
  onCancel?: () => void;
  cancelLabel?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
};

type ToastItemProps = {
  toast: ToastObject<ToastCustomData>;
};

function ToastItem({ toast }: ToastItemProps) {
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
      className={cx(
        'focusable',
        '[--peek:--spacing(4)]', // space between toasts when stacked
        '[--gap:--spacing(4)]', // space between toasts when expanded, and swipe area
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
        '[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s] data-ending-style:opacity-0 data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))] data-limited:opacity-0 data-starting-style:transform-[translateY(150%)] data-ending-style:data-swipe-direction-down:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-expanded:data-ending-style:data-swipe-direction-down:transform-[translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-swipe-direction-left:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-swipe-direction-left:transform-[translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))] data-ending-style:data-swipe-direction-right:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-expanded:data-ending-style:data-swipe-direction-right:transform-[translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))] data-ending-style:data-swipe-direction-up:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] data-expanded:data-ending-style:data-swipe-direction-up:transform-[translateY(calc(var(--toast-swipe-movement-y)-150%))] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:transform-[translateY(150%)]',
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

export function Toaster() {
  const intl = useAppIntl();
  const { toasts } = useToast();
  const portalContainer = usePortalContainer();

  return (
    <Toast.Portal container={portalContainer ?? undefined}>
      <Toast.Viewport
        aria-label={intl.formatMessage(messages.notifications)}
        data-testid="toast-viewport"
        className={cx(
          'phone-landscape:max-w-sm fixed top-auto bottom-2 mx-auto flex w-full',
          'tablet-portrait:inset-e-8 tablet-portrait:bottom-8 z-10',
        )}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
