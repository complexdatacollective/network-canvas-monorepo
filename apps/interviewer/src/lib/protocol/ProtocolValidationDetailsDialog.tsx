import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import type useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { ScrollArea as ScrollableArea } from '@codaco/fresco-ui/ScrollArea';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { ExternalLink } from '~/components/ExternalLink';

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

const DIALOG_TITLE = 'Protocol validation failed';
const DIALOG_DESCRIPTION =
  'Details of the validation errors can be found below:';

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
  const visibleIssues = displayIssues(issues, message);

  return (
    <div className="flex flex-col gap-4">
      <ScrollableArea
        aria-label="Protocol validation errors"
        className="inset-surface bg-surface-1 text-surface-1-contrast publish-colors h-64! flex-none overflow-hidden rounded-sm"
        fade={false}
        viewportClassName="my-1.5 mr-1.5 px-4 py-2.5"
      >
        <ol className="list-decimal space-y-3 pl-5 text-sm">
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
        If you would like support, post your protocol along with these errors on
        the{' '}
        <ExternalLink href="https://community.networkcanvas.com">
          community forum
        </ExternalLink>
        , or email{' '}
        <ExternalLink href="mailto:info@networkcanvas.com">
          info@networkcanvas.com
        </ExternalLink>{' '}
        with this information.
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
          ? 'Validation errors copied to clipboard.'
          : null}
        {copyStatus === 'failed'
          ? 'Validation errors could not be copied.'
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
        {copyStatus === 'copied' ? 'Copied' : 'Copy'}
      </Button>
      <Button color="primary" onClick={onClose}>
        Close
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
  const copyText = useMemo(
    () => getProtocolValidationDetailsCopyText({ issues, message }),
    [issues, message],
  );

  return (
    <Dialog
      title={DIALOG_TITLE}
      description={DIALOG_DESCRIPTION}
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
    title: DIALOG_TITLE,
    description: DIALOG_DESCRIPTION,
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
