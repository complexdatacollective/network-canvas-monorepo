import { motion } from 'motion/react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppDirection, useAppIntl } from '@codaco/app-i18n/react';
import { BackgroundLights } from '@codaco/art';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { ThemedRegion } from '@codaco/fresco-ui/ThemedRegion';
import { useAnalytics } from '~/lib/analytics/AnalyticsProvider';

const messages = defineMessages({
  theAppHitAnUnexpectedErrorYour: {
    id: 'interviewer.appErrorBoundary.theAppHitAnUnexpectedErrorYour',
    defaultMessage:
      'The app hit an unexpected error. Your collected data is saved on this device and is not affected. Try reloading to continue.',
    description:
      'Body of the full-screen error dialog shown when the app crashes; reassures that collected data is safe on the device and asks to reload. Anyone holding the device may see it, including a participant.',
  },
  reload: {
    id: 'interviewer.appErrorBoundary.reload',
    defaultMessage: 'Reload',
    description: 'Button in the app crash dialog; reloads the page.',
  },
});

type Props = {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { hasError: boolean };

// posthog-js `capture_exceptions` catches uncaught errors and unhandled
// rejections, but React swallows render errors at the nearest boundary, so we
// add one here to both report those to PostHog and show a recoverable fallback.
// `onError` is optional so a dependency-free outer instance (mounted above the
// providers in App.tsx) can still show the fallback when provider construction
// itself crashes — before AnalyticsProvider exists to report to.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <ErrorFallback />;
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

function ErrorFallback() {
  const intl = useAppIntl();
  const direction = useAppDirection();
  // The crashed tree (including the ambient blob layer in App.tsx) is
  // unmounted by React, so re-create the backdrop here and present the
  // fallback as a dialog over it. Reload is the only way forward.
  return (
    // The dialog's portal must share the fallback's language and the way it
    // is written. In particular, locale startup can fail after bootstrap set a
    // non-English document lang; provider-optional English recovery must not
    // inherit that stale language, or a right-to-left direction left with it.
    <ThemedRegion theme="interview" lang={intl.locale} dir={direction}>
      <motion.div
        className="fixed inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ duration: 2 }}
      >
        <BackgroundLights
          large={0}
          medium={4}
          small={0}
          blendMode="color-dodge"
          speedFactor={30}
        />
      </motion.div>
      <Dialog
        open
        dismissible={false}
        title={intl.formatMessage(commonMessages.genericError)}
        description={intl.formatMessage(
          messages.theAppHitAnUnexpectedErrorYour,
        )}
        footer={
          <Button onClick={() => window.location.reload()}>
            {intl.formatMessage(messages.reload)}
          </Button>
        }
      />
    </ThemedRegion>
  );
}
