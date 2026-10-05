import { Toast } from '@base-ui/react/toast';

/**
 * Fallback toast manager for standalone interview controls and tests.
 *
 * Each Shell supplies an isolated manager through InterviewToastProvider.
 * Controls assembled outside a Shell may use this manager with a Base UI
 * Toast.Provider and InterviewToastViewport; hook emission remains safe when
 * no interview toast context is available.
 *
 * @see https://base-ui.com/react/components/toast#anchored-toasts
 */
export const interviewToastManager = Toast.createToastManager();
