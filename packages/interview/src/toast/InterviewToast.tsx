'use client';

import { Toast, type ToastObject } from '@base-ui/react/toast';
import {
  createContext,
  type FocusEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { useAppIntl } from '@codaco/app-i18n/react';
import CloseButton from '@codaco/fresco-ui/CloseButton';
import { usePortalContainer } from '@codaco/fresco-ui/PortalContainer';
import {
  type ToastVariant,
  toastVariants,
  variantIcons,
} from '@codaco/fresco-ui/Toast';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { cva, cx } from '@codaco/fresco-ui/utils/cva';

import { runtimeMessages as messages } from '../i18n/runtimeMessages';
import { interviewToastManager } from './interviewToastManager';

type InterviewToastContextValue = {
  toastManager: ReturnType<typeof Toast.createToastManager>;
  forwardButtonRef: RefObject<HTMLButtonElement | null>;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  orientation: 'vertical' | 'horizontal';
};

const InterviewToastContext = createContext<InterviewToastContextValue | null>(
  null,
);

export function useInterviewToastContext() {
  return useContext(InterviewToastContext);
}

const arrowVariants = cva({
  base: 'size-2.5 rotate-45 rounded-br-sm data-[side=bottom]:top-[-5px] data-[side=left]:right-[-5px] data-[side=right]:left-[-5px] data-[side=top]:bottom-[-5px]',
  variants: {
    variant: {
      default: 'bg-surface',
      info: 'bg-info',
      success: 'bg-success',
      destructive: 'bg-destructive',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

type InterviewToastData = {
  icon?: ReactNode;
};

function InterviewToastIcon({
  toast,
  variant,
}: {
  toast: ToastObject<InterviewToastData>;
  variant: ToastVariant;
}) {
  const customIcon = toast.data?.icon;
  if (customIcon) {
    return (
      <span className="mt-[0.1em] size-5 shrink-0" aria-hidden="true">
        {customIcon}
      </span>
    );
  }

  const IconComponent = variantIcons[variant];
  if (!IconComponent) return null;

  return (
    <IconComponent className="mt-[0.1em] size-5 shrink-0" aria-hidden="true" />
  );
}

function InterviewToastItem({
  toast,
}: {
  toast: ToastObject<InterviewToastData>;
}) {
  const intl = useAppIntl();
  const { close } = Toast.useToastManager<InterviewToastData>();
  const variant = (toast.type ?? 'default') as ToastVariant;

  const hasFocusedRef = useRef(false);

  const focusRef = useCallback((node: HTMLElement | null) => {
    if (node) {
      node.focus();
    }
  }, []);

  const handleFocus = useCallback(() => {
    hasFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      if (hasFocusedRef.current && !e.currentTarget.contains(e.relatedTarget)) {
        close(toast.id);
      }
    },
    [close, toast.id],
  );

  const variantClasses = cx(
    toastVariants({ variant }),
    'rounded p-4 shadow-lg',
  );

  return (
    <Toast.Root
      toast={toast}
      ref={focusRef}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <Toast.Positioner
        toast={toast}
        {...toast.positionerProps}
        sideOffset={12}
        collisionPadding={24}
      >
        <Toast.Content
          className={cx(
            variantClasses,
            'animate-shake pointer-events-auto flex max-w-72 items-start gap-3',
          )}
        >
          <InterviewToastIcon toast={toast} variant={variant} />
          <Toast.Description
            render={<Paragraph margin="none" className="flex-1" />}
          />
          <Toast.Close
            render={<CloseButton size="sm" />}
            aria-label={intl.formatMessage(commonMessages.close)}
            nativeButton
          />
        </Toast.Content>
        <Toast.Arrow
          className={cx(arrowVariants({ variant }), 'animate-shake')}
        />
      </Toast.Positioner>
    </Toast.Root>
  );
}

export function InterviewToastViewport() {
  const intl = useAppIntl();
  const { toasts } = Toast.useToastManager();
  const portalContainer = usePortalContainer();

  return (
    <Toast.Portal container={portalContainer ?? undefined}>
      <Toast.Viewport
        aria-label={intl.formatMessage(messages.notifications)}
        className="pointer-events-none fixed inset-0 z-50"
      >
        {toasts.map((toast) => (
          <InterviewToastItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

type InterviewToastProviderProps = {
  children: ReactNode;
  toastManager?: ReturnType<typeof Toast.createToastManager>;
  forwardButtonRef: RefObject<HTMLButtonElement | null>;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  orientation: 'vertical' | 'horizontal';
};

/**
 * Shares the Shell's manager and positioning refs with its stage hooks.
 * The matching Base UI provider wraps the sibling viewport. The module manager
 * remains the fallback for standalone controls assembled outside a Shell.
 */
export function InterviewToastProvider({
  children,
  toastManager = interviewToastManager,
  forwardButtonRef,
  backButtonRef,
  orientation,
}: InterviewToastProviderProps) {
  return (
    <InterviewToastContext.Provider
      value={{ toastManager, forwardButtonRef, backButtonRef, orientation }}
    >
      {children}
    </InterviewToastContext.Provider>
  );
}
