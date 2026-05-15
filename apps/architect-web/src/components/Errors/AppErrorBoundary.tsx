import { Component, type ReactNode } from 'react';

import { posthog } from '~/analytics';
import { Button } from '~/lib/legacy-ui/components';

type AppErrorBoundaryProps = {
  children?: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  componentDidCatch(error: unknown) {
    const normalizedError = ensureError(error);
    posthog.captureException(normalizedError);
    this.setState({ error: normalizedError });
  }

  resetError = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (error) {
      return (
        <div className="text-primary-foreground absolute inset-0 flex size-full items-center justify-center bg-(--modal-overlay)">
          <div className="bg-cyber-grape w-240 rounded p-(--space-2xl)">
            <h1>Something went wrong.</h1>
            <div>
              <p>
                The following &quot;
                {error.message}
                &quot; error occurred:
              </p>
            </div>
            <pre className="bg-surface-1-foreground my-(--space-md) block max-h-36 overflow-scroll rounded p-(--space-md)">
              <code>{error.stack}</code>
            </pre>
            <Button size="small" color="platinum" onClick={this.resetError}>
              OK
            </Button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default AppErrorBoundary;
