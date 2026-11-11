import type { ReactNode } from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

/**
 * The UI-provider subset shared by Architect and its stories. Connected
 * components add an isolated Redux Provider in their own story so state cannot
 * leak between examples.
 *
 * Base UI's `DirectionProvider` is deliberately absent: the toolbar's
 * direction control owns it, in the `withAppI18n` decorator around this. A
 * second provider here would be nearer the story and pin every Base UI
 * component to one direction while the CSS around it mirrored.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      <PortalContainerProvider>
        <TooltipProvider>
          <DialogProvider>{children}</DialogProvider>
        </TooltipProvider>
      </PortalContainerProvider>
    </AnimationProvider>
  );
}
