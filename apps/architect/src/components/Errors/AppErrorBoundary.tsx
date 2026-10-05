import { Check, Copy } from 'lucide-react';
import {
  Component,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useState,
} from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ensureError } from '@codaco/shared-consts';
import { posthog } from '~/analytics';
import { architectLocales } from '~/i18n/locales';
const messages = defineMessages({
  details: {
    id: 'architect.errors.appErrorBoundary.details',
    defaultMessage: 'Technical details (English)',
    description:
      'Introduces technical error details in the application error dialog. The error message itself is a diagnostic.',
  },
  copied: {
    id: 'architect.errors.appErrorBoundary.copied',
    defaultMessage: 'Copied!',
    description: 'Visible text in components / Errors / AppErrorBoundary.',
  },
  copyError: {
    id: 'architect.errors.appErrorBoundary.copyError',
    defaultMessage: 'Copy error',
    description: 'Visible text in components / Errors / AppErrorBoundary.',
  },
});

type AppErrorBoundaryProps = {
  children?: ReactNode;
  /** Only the provider-free root fallback may take document locale ownership. */
  manageDocumentLocale?: boolean;
};
function CopyButton({ value }: { value: string }) {
  const intl = useAppIntl();
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
      {copied
        ? intl.formatMessage(messages.copied)
        : intl.formatMessage(messages.copyError)}
    </Button>
  );
}
type AppErrorBoundaryState = {
  error: Error | null;
};
function ErrorContents({
  error,
  resetError,
  manageDocumentLocale,
}: {
  error: Error;
  resetError: () => void;
  manageDocumentLocale: boolean;
}) {
  const intl = useAppIntl();
  const direction =
    architectLocales.find(({ locale }) => locale === intl.locale)?.direction ??
    'ltr';
  useLayoutEffect(() => {
    if (!manageDocumentLocale) return;
    // If provider initialization fails after bootstrap selected Spanish, its
    // optional English recovery must have the right document language,
    // including portaled controls. Inner recovery leaves ownership with the
    // mounted provider, which may change language while this dialog is open.
    const root = document.documentElement;
    const previous = { lang: root.lang, dir: root.dir };
    root.lang = intl.locale;
    root.dir = direction;
    return () => {
      root.lang = previous.lang;
      root.dir = previous.dir;
    };
  }, [intl.locale, direction, manageDocumentLocale]);
  return (
    <Dialog
      open
      closeDialog={resetError}
      title={intl.formatMessage(commonMessages.genericError)}
      size="editor"
      footer={
        <>
          <CopyButton value={error.stack ?? error.message} />
          <Button color="default" onClick={resetError}>
            {intl.formatMessage(commonMessages.confirm)}
          </Button>
        </>
      }
    >
      <Paragraph>{intl.formatMessage(messages.details)}</Paragraph>
      <div className="bg-surface-accent text-surface-accent-contrast my-5 overflow-hidden rounded">
        <pre lang="en" dir="ltr" className="block max-h-36 overflow-auto p-5">
          <code>{error.stack ?? error.message}</code>
        </pre>
      </div>
    </Dialog>
  );
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
    const { children, manageDocumentLocale = false } = this.props;
    if (error) {
      return (
        <ErrorContents
          error={error}
          resetError={this.resetError}
          manageDocumentLocale={manageDocumentLocale}
        />
      );
    }
    return children;
  }
}
export default AppErrorBoundary;
