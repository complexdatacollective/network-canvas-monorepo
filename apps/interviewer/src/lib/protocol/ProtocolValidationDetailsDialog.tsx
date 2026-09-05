import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ScrollArea as ScrollableArea } from '@codaco/fresco-ui/ScrollArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ExternalLink } from '~/components/ExternalLink';

const messages = defineMessages({
  protocolValidationErrors: {
    id: 'interviewer.protocolValidationDetailsDialog.protocolValidationErrors',
    defaultMessage: 'Protocol validation errors',
    description:
      'The aria-label label in Interviewer Protocol Validation Details Dialog.',
  },
  ifYouWouldLikeSupportPostYour: {
    id: 'interviewer.protocolValidationDetailsDialog.ifYouWouldLikeSupportPostYour',
    defaultMessage:
      'If you would like support, post your protocol along with these errors on the <link>community forum</link>, or email <link1>info@networkcanvas.com</link1> with this information.',
    description:
      'Visible copy in Interviewer Protocol Validation Details Dialog.',
  },
  validationErrorsCopiedToClipboard: {
    id: 'interviewer.protocolValidationDetailsDialog.validationErrorsCopiedToClipboard',
    defaultMessage: 'Validation errors copied to clipboard.',
    description:
      'User-facing message in Interviewer Protocol Validation Details Dialog.',
  },
  validationErrorsCouldNotBeCopied: {
    id: 'interviewer.protocolValidationDetailsDialog.validationErrorsCouldNotBeCopied',
    defaultMessage: 'Validation errors could not be copied.',
    description:
      'User-facing message in Interviewer Protocol Validation Details Dialog.',
  },
  copied: {
    id: 'interviewer.protocolValidationDetailsDialog.copied',
    defaultMessage: 'Copied',
    description:
      'User-facing message in Interviewer Protocol Validation Details Dialog.',
  },
  copy: {
    id: 'interviewer.protocolValidationDetailsDialog.copy',
    defaultMessage: 'Copy',
    description:
      'User-facing message in Interviewer Protocol Validation Details Dialog.',
  },
  title: {
    id: 'interviewer.protocolValidationDetailsDialog.title',
    defaultMessage: 'Protocol validation failed',
    description:
      'Administration text in Interviewer ProtocolValidationDetailsDialog.',
  },
  description: {
    id: 'interviewer.protocolValidationDetailsDialog.description',
    defaultMessage: 'Details of the validation errors can be found below:',
    description:
      'Administration text in Interviewer ProtocolValidationDetailsDialog.',
  },
});

export type ProtocolValidationIssue = {
  path: string;
  message: string;
};

type ProtocolValidationDetailsDialogOptions = {
  issues?: ProtocolValidationIssue[];
  message: string;
};

type ProtocolValidationDetailsDialogViewProps =
  ProtocolValidationDetailsDialogOptions & {
    open: boolean;
    onClose: () => void;
  };

function createValidationDetailsDialogId() {
  return `protocol-validation-details-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString()}`;
}

function issuePathLabel(path: string) {
  const trimmedPath = path.trim();
  return trimmedPath.length > 0 ? trimmedPath : 'protocol';
}

function formatIssue(issue: ProtocolValidationIssue) {
  return `${issuePathLabel(issue.path)}: ${issue.message}`;
}

function displayIssues(
  issues: ProtocolValidationIssue[] | undefined,
  fallbackMessage: string,
): ProtocolValidationIssue[] {
  if (issues && issues.length > 0) return issues;
  return [{ path: '', message: fallbackMessage }];
}

export function getProtocolValidationDetailsCopyText({
  issues,
  message,
}: ProtocolValidationDetailsDialogOptions) {
  const lines = displayIssues(issues, message).map(
    (issue, index) => `${index + 1}. ${formatIssue(issue)}`,
  );

  return ['Protocol validation failed.', '', ...lines].join('\n');
}

export function ProtocolValidationDetailsDialogBody({
  issues,
  message,
}: ProtocolValidationDetailsDialogOptions) {
  const intl = useAppIntl();
  const visibleIssues = displayIssues(issues, message);

  return (
    <div className="flex flex-col gap-4">
      <ScrollableArea
        aria-label={intl.formatMessage(messages.protocolValidationErrors)}
        className="inset-surface bg-surface-1 text-surface-1-contrast publish-colors h-64! flex-none overflow-hidden rounded-sm"
        fade={false}
        viewportClassName="my-1.5 mr-1.5 px-4 py-2.5"
      >
        <ol lang="en" dir="ltr" className="list-decimal space-y-3 ps-5 text-sm">
          {visibleIssues.map((issue, index) => (
            <li key={`${issue.path}-${issue.message}-${index}`}>
              <div className="font-monospace text-surface-1-contrast/70 text-xs break-all">
                {issuePathLabel(issue.path)}
              </div>
              <div>{issue.message}</div>
            </li>
          ))}
        </ol>
      </ScrollableArea>

      <Paragraph>
        {intl.formatMessage(messages.ifYouWouldLikeSupportPostYour, {
          link: (chunks) => (
            <ExternalLink href="https://community.networkcanvas.com">
              {chunks}
            </ExternalLink>
          ),
          link1: (chunks) => (
            <ExternalLink href="mailto:info@networkcanvas.com">
              {chunks}
            </ExternalLink>
          ),
        })}
      </Paragraph>
    </div>
  );
}

function ProtocolValidationDetailsDialogFooter({
  copyText,
  onClose,
}: {
  copyText: string;
  onClose: () => void;
}) {
  const intl = useAppIntl();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  };

  return (
    <>
      <Paragraph
        aria-live="polite"
        className="phone-landscape:mr-auto min-h-lh text-sm"
        emphasis={copyStatus === 'failed' ? 'default' : 'muted'}
        margin="none"
      >
        {copyStatus === 'copied'
          ? intl.formatMessage(messages.validationErrorsCopiedToClipboard)
          : null}
        {copyStatus === 'failed'
          ? intl.formatMessage(messages.validationErrorsCouldNotBeCopied)
          : null}
      </Paragraph>
      <Button
        icon={
          copyStatus === 'copied' ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )
        }
        onClick={copyToClipboard}
      >
        {copyStatus === 'copied'
          ? intl.formatMessage(messages.copied)
          : intl.formatMessage(messages.copy)}
      </Button>
      <Button color="primary" onClick={onClose}>
        {intl.formatMessage(commonMessages.close)}
      </Button>
    </>
  );
}

export function ProtocolValidationDetailsDialogView({
  issues,
  message,
  open,
  onClose,
}: ProtocolValidationDetailsDialogViewProps) {
  const intl = useAppIntl();
  const copyText = useMemo(
    () => getProtocolValidationDetailsCopyText({ issues, message }),
    [issues, message],
  );

  return (
    <Dialog
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      accent="destructive"
      open={open}
      closeDialog={onClose}
      className="max-w-3xl"
      footer={
        <ProtocolValidationDetailsDialogFooter
          copyText={copyText}
          onClose={onClose}
        />
      }
    >
      <ProtocolValidationDetailsDialogBody issues={issues} message={message} />
    </Dialog>
  );
}

export function openProtocolValidationDetailsDialog(
  dialog: ReturnType<typeof useDialog>,
  options: ProtocolValidationDetailsDialogOptions,
) {
  const dialogId = createValidationDetailsDialogId();
  const copyText = getProtocolValidationDetailsCopyText(options);

  void dialog.openDialog({
    id: dialogId,
    type: 'custom',
    title: <AppMessage message={messages.title} />,
    description: <AppMessage message={messages.description} />,
    intent: 'destructive',
    className: 'max-w-3xl',
    children: <ProtocolValidationDetailsDialogBody {...options} />,
    footer: (
      <ProtocolValidationDetailsDialogFooter
        copyText={copyText}
        onClose={() => void dialog.closeDialog(dialogId, null)}
      />
    ),
  });
}
