import { Check, Copy } from 'lucide-react';
import { Component, type ReactNode, useCallback, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { posthog } from '~/analytics';
type AppErrorBoundaryProps = {
  children?: ReactNode;
};
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      posthog.captureException(ensureError(err));
    }
  }, [value]);
  return (
    <Button
      color="default"
      icon={copied ? <Check /> : <Copy />}
      onClick={handleCopy}
    >
      {copied ? 'Copied!' : 'Copy error'}
    </Button>
  );
}
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
        <Dialog
          open
          closeDialog={this.resetError}
          title="Something went wrong."
          size="editor"
          footer={
            <>
              <CopyButton value={error.stack ?? error.message} />
              <Button color="default" onClick={this.resetError}>
                OK
              </Button>
            </>
          }
        >
          <Paragraph>
            The following &quot;
            {error.message}
            &quot; error occurred:
          </Paragraph>
          <div className="bg-surface-accent text-surface-accent-contrast my-5 overflow-hidden rounded">
            <pre className="block max-h-36 overflow-auto p-5">
              <code>{error.stack ?? error.message}</code>
            </pre>
          </div>
        </Dialog>
      );
    }
    return children;
  }
}
export default AppErrorBoundary;
