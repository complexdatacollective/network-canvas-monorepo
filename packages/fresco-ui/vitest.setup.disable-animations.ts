import { MotionGlobalConfig } from 'motion/react';

declare global {
  // Base UI checks this flag before waiting for CSS animations to finish.
  // eslint-disable-next-line no-var
  var BASE_UI_ANIMATIONS_DISABLED: boolean;
}

// Keep the real Motion implementation in unit tests, but make every animation
// finish immediately. This covers components rendered without the app-level
// AnimationProvider, including AnimatePresence exit bookkeeping.
MotionGlobalConfig.skipAnimations = true;
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
