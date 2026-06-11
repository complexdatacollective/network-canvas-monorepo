'use client';

import { Toast, type ToastObject } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// Self-contained toast built directly on `@base-ui/react/toast` (the primitive
// layer Architect already uses for dialogs/popovers) rather than the shared
// fresco-ui Toaster, so it matches Architect's surface styling and positioning
// instead of clashing with it.

export type WelcomeToastData = {
  icon?: ReactNode;
};

function ToastItem({ toast }: { toast: ToastObject<WelcomeToastData> }) {
  return (
    <Toast.Root
      toast={toast}
      className="bg-surface-1 text-surface-1-foreground border-surface-3 w-full rounded-lg border p-4 shadow-xl transition-[transform,opacity] duration-300 ease-out data-[ending-style]:translate-y-4 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-4 data-[starting-style]:opacity-0"
    >
      <Toast.Content className="flex items-start gap-3">
        {toast.data?.icon && (
          <span className="text-2xl leading-none" aria-hidden>
            {toast.data.icon}
          </span>
        )}
        <div className="flex-1">
          <Toast.Title className="m-0 font-semibold" />
          <Toast.Description className="mt-0.5 text-sm" />
        </div>
        <Toast.Close
          aria-label="Dismiss"
          nativeButton
          className="text-surface-1-foreground/50 hover:text-surface-1-foreground -mt-1 -mr-1 shrink-0 cursor-pointer rounded p-1 transition-colors"
        >
          <X className="size-4" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  );
}

export function WelcomeToaster() {
  const { toasts } = Toast.useToastManager<WelcomeToastData>();

  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed right-6 bottom-6 z-(--z-modal) flex w-88 max-w-[calc(100vw-3rem)] flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
