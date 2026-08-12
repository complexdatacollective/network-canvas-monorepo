import { MotionGlobalConfig } from 'motion/react';

// Keep the real Motion implementation in unit tests, but make every animation
// finish immediately. This covers components rendered without the app-level
// AnimationProvider, including AnimatePresence exit bookkeeping.
MotionGlobalConfig.skipAnimations = true;
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
