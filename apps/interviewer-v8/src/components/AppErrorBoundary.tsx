import { motion } from 'motion/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { BackgroundBlobs } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';

type Props = {
  children: ReactNode;
  onError: (error: Error, info: ErrorInfo) => void;
};

type State = { hasError: boolean };

// posthog-js `capture_exceptions` catches uncaught errors and unhandled
// rejections, but React swallows render errors at the nearest boundary, so we
// add one here to both report those to PostHog and show a recoverable fallback.
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    // The crashed tree (including the ambient blob layer in App.tsx) is
    // unmounted by React, so re-create the backdrop here and present the
    // fallback as a dialog over it. Reload is the only way forward.
    return (
      <>
        <motion.div
          className="fixed inset-0 -z-10 blur-[10rem]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          transition={{ duration: 2 }}
        >
          <BackgroundBlobs
            large={0}
            medium={4}
            small={0}
            compositeOperation="color-dodge"
          />
        </motion.div>
        <Dialog
          open
          dismissible={false}
          title="Something went wrong"
          description="The app hit an unexpected error. Your collected data is saved on this device and is not affected. Try reloading to continue."
          footer={
            <Button onClick={() => window.location.reload()}>Reload</Button>
          }
        />
      </>
    );
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  const analytics = useAnalytics();
  return (
    <ErrorBoundary
      onError={(error, info) =>
        analytics.captureException(error, {
          feature: 'react-error-boundary',
          component_stack: info.componentStack,
        })
      }
    >
      {children}
    </ErrorBoundary>
  );
}
