import { Check, Copy, Download, FileArchive, Save, Share2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Surface from '@codaco/fresco-ui/layout/Surface';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Spinner from '@codaco/fresco-ui/Spinner';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { exportStageMessages } from '@codaco/network-exporters/messages';
import { ExternalLink } from '~/components/ExternalLink';
import { APP_VERSION } from '~/lib/appVersion';
import { saveAction, type SaveAction } from '~/lib/files/download';

import type { ExportFlow } from './useSessionMutations';

const messages = defineMessages({
  errorDetailsCopiedToClipboard: {
    id: 'interviewer.exportDialog.errorDetailsCopiedToClipboard',
    defaultMessage: 'Error details copied to clipboard.',
    description: 'User-facing message in Interviewer Export Dialog.',
  },
  errorDetailsCouldNotBeCopied: {
    id: 'interviewer.exportDialog.errorDetailsCouldNotBeCopied',
    defaultMessage: 'Error details could not be copied.',
    description: 'User-facing message in Interviewer Export Dialog.',
  },
  copied: {
    id: 'interviewer.exportDialog.copied',
    defaultMessage: 'Copied',
    description:
      'Acknowledgment on the export-error copy button after the clipboard write succeeds.',
  },
  copyDetails: {
    id: 'interviewer.exportDialog.copyDetails',
    defaultMessage: 'Copy details',
    description:
      'Action that copies the original technical export error for support.',
  },
  exportProgress: {
    id: 'interviewer.exportDialog.exportProgress',
    defaultMessage: 'Export progress',
    description: 'The label label in Interviewer Export Dialog.',
  },
  exportFailed: {
    id: 'interviewer.exportDialog.exportFailed',
    defaultMessage: 'Export failed',
    description: 'User-facing message in Interviewer Export Dialog.',
  },
  yourInterviewDataIsUnchangedAndStored: {
    id: 'interviewer.exportDialog.yourInterviewDataIsUnchangedAndStored',
    defaultMessage:
      'Your interview data is unchanged and stored on this device. If this keeps happening, post the copied error details on the <link>community forum</link>, or email <link1>info@networkcanvas.com</link1> with this information.',
    description: 'Visible copy in Interviewer Export Dialog.',
  },
  archiveReady: {
    id: 'interviewer.exportDialog.archiveReady',
    defaultMessage: 'Archive ready',
    description:
      'Export dialog heading once the archive is built but has not yet been saved.',
  },
  saveDescription: {
    id: 'interviewer.exportDialog.saveDescription',
    defaultMessage:
      'Choose where to save the archive. Interviews are marked as exported once the file is saved.',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  shareDescription: {
    id: 'interviewer.exportDialog.shareDescription',
    defaultMessage:
      'Share the archive to save or send it. Interviews are marked as exported once sharing completes.',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  downloadDescription: {
    id: 'interviewer.exportDialog.downloadDescription',
    defaultMessage:
      'Download the archive. Interviews are marked as exported once the download starts.',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  saveAction: {
    id: 'interviewer.exportDialog.saveAction',
    defaultMessage: 'Save…',
    description:
      'Action that opens a device file picker to save the already-built data archive.',
  },
  shareAction: {
    id: 'interviewer.exportDialog.shareAction',
    defaultMessage: 'Share…',
    description:
      'Action that opens the device share sheet for the already-built data archive.',
  },
  downloadAction: {
    id: 'interviewer.exportDialog.downloadAction',
    defaultMessage: 'Download',
    description:
      'Action that downloads the already-built data archive using the browser.',
  },
  exporting: {
    id: 'interviewer.exportDialog.exporting',
    defaultMessage:
      '{count, plural, one {Exporting # interview} other {Exporting # interviews}}',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  filesProgress: {
    id: 'interviewer.exportDialog.filesProgress',
    defaultMessage: '{current, number} of {total, number} files',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  contains: {
    id: 'interviewer.exportDialog.contains',
    defaultMessage:
      '{count, plural, one {Contains # interview.} other {Contains # interviews.}}',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  incomplete: {
    id: 'interviewer.exportDialog.incomplete',
    defaultMessage:
      '{count, plural, one {# interview could not be exported completely and may be missing from this archive.} other {# interviews could not be exported completely and may be missing from this archive.}}',
    description: 'Administration text in Interviewer ExportDialog.',
  },
  failedDescription: {
    id: 'interviewer.exportDialog.failedDescription',
    defaultMessage:
      'The interview archive could not be created. Your saved interview data is unchanged. Copy the error details below if you need support.',
    description: 'Administration text in Interviewer ExportDialog.',
  },
});

// One whole string per save mechanism: the description must match the verb on
// the primary action, and sentence fragments would block localisation.
const READY_DESCRIPTIONS: Record<SaveAction, MessageDescriptor> = {
  'save-as': messages.saveDescription,
  'share': messages.shareDescription,
  'download': messages.downloadDescription,
};

const READY_ACTION_LABELS: Record<SaveAction, MessageDescriptor> = {
  'save-as': messages.saveAction,
  'share': messages.shareAction,
  'download': messages.downloadAction,
};

const READY_ACTION_ICONS: Record<SaveAction, typeof Download> = {
  'save-as': Save,
  'share': Share2,
  'download': Download,
};

// Mirrors ProtocolValidationDetailsDialog's copy footer: a live status line
// pinned left, then Copy-with-feedback and the primary Close.
function ExportErrorFooter({
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
          ? intl.formatMessage(messages.errorDetailsCopiedToClipboard)
          : null}
        {copyStatus === 'failed'
          ? intl.formatMessage(messages.errorDetailsCouldNotBeCopied)
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
        data-testid="export-copy-error"
      >
        {copyStatus === 'copied'
          ? intl.formatMessage(messages.copied)
          : intl.formatMessage(messages.copyDetails)}
      </Button>
      <Button color="primary" onClick={onClose} data-testid="export-dismiss">
        {intl.formatMessage(commonMessages.close)}
      </Button>
    </>
  );
}

// The modal export flow: build progress → a primary action whose click is the
// fresh user gesture saveBlob needs (Web Share cannot be called from the
// original Export tap once the async build has consumed its activation) →
// closed on save success. Rendered as one persistent Dialog whose content
// tracks the flow phase, so building → ready swaps in place instead of
// remounting the modal. See the 2026-08-04 export-dialog spec.
export function ExportDialog({
  flow,
  onCancelBuild,
  onSave,
  onDismiss,
}: {
  flow: ExportFlow;
  /** Aborts an in-progress archive build. */
  onCancelBuild: () => void;
  /** Runs saveBlob; must be wired straight to the primary action's click. */
  onSave: () => void;
  /** Discards a built-but-unsaved archive, or dismisses the error state. */
  onDismiss: () => void;
}) {
  const intl = useAppIntl();
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);

  // The dialog is already open during the build, so nothing refocuses when the
  // content changes underneath it: move focus onto the primary action when the
  // archive becomes ready (Enter/Space activation counts as a user gesture for
  // Web Share, so the keyboard path is first-class).
  useEffect(() => {
    if (flow.phase === 'ready') {
      primaryActionRef.current?.focus();
    }
  }, [flow.phase]);

  const action = useMemo(
    () =>
      flow.phase === 'ready' || flow.phase === 'saving'
        ? saveAction(flow.blob, flow.fileName)
        : null,
    [flow],
  );

  if (flow.phase === 'idle') {
    return null;
  }

  let title: string;
  let description: string | undefined;
  let accent: 'destructive' | 'success' | undefined;
  let dismissible: boolean;
  let announcement: string;
  let footer: ReactNode;
  let children: ReactNode = null;

  if (flow.phase === 'building') {
    const percent =
      flow.current !== null && flow.total !== null && flow.total > 0
        ? Math.round((flow.current / flow.total) * 100)
        : null;
    title = intl.formatMessage(messages.exporting, {
      count: flow.sessionCount,
    });
    // An accidental backdrop click or Escape must not destroy a long build;
    // cancellation is the explicit footer action only.
    dismissible = false;
    announcement = intl.formatMessage(exportStageMessages[flow.stage]);
    footer = (
      <Button onClick={onCancelBuild} data-testid="export-cancel-build">
        {intl.formatMessage(commonMessages.cancel)}
      </Button>
    );
    children = (
      <>
        <div className="flex items-center gap-3">
          <Spinner size="sm" />
          <Paragraph margin="none" emphasis="muted">
            {announcement}
          </Paragraph>
        </div>
        <ProgressBar
          orientation="horizontal"
          indeterminate={percent === null}
          percentProgress={percent ?? 0}
          label={intl.formatMessage(messages.exportProgress)}
          className="text-sea-green mt-4 h-2"
        />
        {flow.current !== null && flow.total !== null && (
          <Paragraph margin="none" emphasis="muted" className="mt-2 text-sm">
            {intl.formatMessage(messages.filesProgress, {
              current: flow.current,
              total: flow.total,
            })}
          </Paragraph>
        )}
      </>
    );
  } else if (flow.phase === 'error') {
    title = intl.formatMessage(messages.exportFailed);
    description = intl.formatMessage(messages.failedDescription);
    accent = 'destructive';
    dismissible = true;
    announcement = intl.formatMessage(messages.exportFailed);
    const copyText = [
      'Interviewer export failed.',
      `App version: ${APP_VERSION}`,
      '',
      flow.detail,
    ].join('\n');
    footer = <ExportErrorFooter copyText={copyText} onClose={onDismiss} />;
    children = (
      <Paragraph margin="none" className="mt-2">
        {intl.formatMessage(messages.yourInterviewDataIsUnchangedAndStored, {
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
    );
  } else {
    const saving = flow.phase === 'saving';
    const resolvedAction = action ?? 'download';
    const ActionIcon = READY_ACTION_ICONS[resolvedAction];
    title = intl.formatMessage(messages.archiveReady);
    description = intl.formatMessage(READY_DESCRIPTIONS[resolvedAction]);
    accent = 'success';
    dismissible = !saving;
    announcement = intl.formatMessage(messages.archiveReady);
    footer = (
      <>
        <Button
          onClick={onDismiss}
          disabled={saving}
          data-testid="export-dismiss"
        >
          {intl.formatMessage(commonMessages.cancel)}
        </Button>
        <Button
          ref={primaryActionRef}
          color="primary"
          icon={<ActionIcon aria-hidden />}
          onClick={onSave}
          disabled={saving}
          data-testid="data-save-export"
        >
          {intl.formatMessage(READY_ACTION_LABELS[resolvedAction])}
        </Button>
      </>
    );
    children = (
      <>
        <Surface spacing="xs" className="my-4 flex items-center gap-4">
          <FileArchive className="text-success size-8 shrink-0" aria-hidden />
          <div className="min-w-0">
            <Paragraph margin="none" className="font-semibold break-all">
              {flow.fileName}
            </Paragraph>
            <Paragraph emphasis="muted" margin="none" className="mt-1 text-sm">
              {intl.formatMessage(messages.contains, {
                count: flow.sessionIds.length,
              })}
            </Paragraph>
          </div>
        </Surface>
        {flow.failedCount > 0 && (
          <Alert variant="warning" className="mt-4">
            {intl.formatMessage(messages.incomplete, {
              count: flow.failedCount,
            })}
          </Alert>
        )}
      </>
    );
  }

  return (
    <Dialog
      open
      title={title}
      description={description}
      accent={accent}
      dismissible={dismissible}
      closeDialog={dismissible ? onDismiss : undefined}
      footer={footer}
    >
      {children}
      {/* Phase and stage transitions only — never per-tick progress, which
          would flood the screen reader. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Dialog>
  );
}
