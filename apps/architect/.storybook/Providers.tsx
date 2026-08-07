import { DirectionProvider } from '@base-ui/react/direction-provider';
import type { ReactNode } from 'react';

import { AnimationProvider } from '@codaco/fresco-ui/AnimationProvider';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

/**
 * The UI-provider subset shared by Architect and its stories. Connected
 * components add an isolated Redux Provider in their own story so state cannot
 * leak between examples.
 */
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AnimationProvider disableAnimationsForAutomation>
      <DirectionProvider direction="ltr">
        <PortalContainerProvider>
          <TooltipProvider>
            <DialogProvider>{children}</DialogProvider>
          </TooltipProvider>
        </PortalContainerProvider>
      </DirectionProvider>
    </AnimationProvider>
  );
}
