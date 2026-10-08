'use client';

import { type ReactNode, useCallback, useRef } from 'react';

import type { ToastVariant } from '@codaco/fresco-ui/Toast';

import { useInterviewToastContext } from './InterviewToast';
import { interviewToastManager } from './interviewToastManager';

type InterviewToastOptions = {
  description: string | ReactNode;
  variant: ToastVariant;
  anchor: 'forward' | 'backward';
  icon?: ReactNode;
  timeout?: number;
  onRemove?: () => void;
};

/** Shows toasts anchored to the interview's navigation buttons. */
export function useInterviewToast() {
  const toastContext = useInterviewToastContext();
  const toastManager = toastContext?.toastManager ?? interviewToastManager;

  const resolvePositionerProps = useCallback(
    (anchor: 'forward' | 'backward') => {
      if (!toastContext) return undefined;

      const { forwardButtonRef, backButtonRef, orientation } = toastContext;
      const anchorRef = anchor === 'forward' ? forwardButtonRef : backButtonRef;
      const side: 'right' | 'top' =
        orientation === 'vertical' ? 'right' : 'top';

      return {
        anchor: anchorRef.current,
        side,
      };
    },
    [toastContext],
  );

  const resolvePositionerPropsRef = useRef(resolvePositionerProps);
  resolvePositionerPropsRef.current = resolvePositionerProps;

  const showToast = useCallback(
    (options: InterviewToastOptions): string =>
      toastManager.add({
        type: options.variant,
        description: options.description,
        timeout: options.timeout ?? 4000,
        positionerProps: resolvePositionerPropsRef.current(options.anchor),
        data: options.icon ? { icon: options.icon } : undefined,
        onRemove: options.onRemove,
      }),
    [toastManager],
  );

  const closeToast = useCallback(
    (id: string) => {
      toastManager.close(id);
    },
    [toastManager],
  );

  return { showToast, closeToast };
}
