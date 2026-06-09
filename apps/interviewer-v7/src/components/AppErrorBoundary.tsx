import { Component, type ErrorInfo, type ReactNode } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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
    return (
      <div className="bg-background flex h-dvh items-center justify-center p-8">
        <Surface
          level={1}
          spacing="lg"
          shadow="lg"
          className="flex max-w-lg flex-col items-center gap-4 text-center"
        >
          <Heading level="h1">Something went wrong</Heading>
          <Paragraph>
            The app hit an unexpected error. Your collected data is saved on
            this device and is not affected. Try reloading to continue.
          </Paragraph>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Surface>
      </div>
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
