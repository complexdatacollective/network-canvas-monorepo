import { Toast } from '@base-ui/react/toast';

/**
 * Global toast manager for interview validation/notification toasts.
 *
 * Shell wraps its own Toast.Provider around InterviewToastViewport, with
 * this manager passed in via the `toastManager` prop. Hooks and event
 * handlers anywhere call `interviewToastManager.add(...)` directly — the
 * manager is a singleton and doesn't require provider context for emission.
 *
 * @see https://base-ui.com/react/components/toast#anchored-toasts
 */
export const interviewToastManager = Toast.createToastManager();
