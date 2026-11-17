import { Toast } from '@base-ui/react/toast';
import type { ReactNode } from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { DndStoreProvider } from '@codaco/fresco-ui/dnd/dnd';
import { Toaster } from '@codaco/fresco-ui/Toast';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

/**
 * Mounted as a global decorator in preview.tsx so every story sees the same
 * Fresco-style provider stack the app mounts in `AppProviders`, minus the
 * auth/step-up providers (those need the platform DB and aren't relevant to
 * presentational components). Provides the Toast surface, Tooltip, drag-and-drop
 * store, and dialog host that fresco-ui components may reach for.
 *
 * Base UI's `DirectionProvider` is deliberately absent: the toolbar's
 * direction control owns it, in the `withAppI18n` decorator around this. A
 * second provider here would be nearer the story and pin every Base UI
 * component to one direction while the CSS around it mirrored.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      <Toast.Provider limit={7}>
        <TooltipProvider>
          <DndStoreProvider>
            <DialogProvider>{children}</DialogProvider>
          </DndStoreProvider>
        </TooltipProvider>
        <Toaster />
      </Toast.Provider>
    </AnimationProvider>
  );
}
