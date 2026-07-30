import { DirectionProvider } from '@base-ui/react/direction-provider';
import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import { PortalContainerProvider } from '@codaco/fresco-ui/PortalContainer';
import { TooltipProvider } from '@codaco/fresco-ui/Tooltip';

declare global {
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

/**
 * The UI-provider subset shared by Architect and its stories. Connected
 * components add an isolated Redux Provider in their own story so state cannot
 * leak between examples.
 */
export default function Providers({
  children,
  disableAnimations,
}: {
  children: ReactNode;
  disableAnimations?: boolean;
}) {
  if (disableAnimations) {
    globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  }

  return (
    <MotionConfig reducedMotion="user" skipAnimations={disableAnimations}>
      <DirectionProvider direction="ltr">
        <PortalContainerProvider>
          <TooltipProvider>
            <DialogProvider>{children}</DialogProvider>
          </TooltipProvider>
        </PortalContainerProvider>
      </DirectionProvider>
    </MotionConfig>
  );
}
