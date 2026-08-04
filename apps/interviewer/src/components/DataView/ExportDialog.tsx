import { Download, Save, Share2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import { Alert } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { saveAction, type SaveAction } from '~/lib/files/download';

import type { ExportFlow } from './useSessionMutations';

// One whole string per save mechanism: the description must match the verb on
// the primary action, and sentence fragments would block localisation.
const READY_DESCRIPTIONS: Record<SaveAction, string> = {
  'save-as':
    'Choose where to save the archive. Interviews are marked as exported once the file is saved.',
  'share':
    'Share the archive to save or send it. Interviews are marked as exported once sharing completes.',
  'download':
    'Download the archive. Interviews are marked as exported once the download starts.',
};

const READY_ACTION_LABELS: Record<SaveAction, string> = {
  'save-as': 'Save…',
  'share': 'Share…',
  'download': 'Download',
};

const READY_ACTION_ICONS: Record<SaveAction, typeof Download> = {
  'save-as': Save,
  'share': Share2,
  'download': Download,
};

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
  let accent: 'destructive' | undefined;
  let dismissible: boolean;
  let announcement: string;
  let footer: ReactNode;
  let children: ReactNode = null;

  if (flow.phase === 'building') {
    title =
      flow.sessionCount === 1
        ? 'Exporting 1 interview'
        : `Exporting ${flow.sessionCount} interviews`;
    // An accidental backdrop click or Escape must not destroy a long build;
    // cancellation is the explicit footer action only.
    dismissible = false;
    announcement = flow.stageMessage;
    footer = (
      <Button onClick={onCancelBuild} data-testid="export-cancel-build">
        Cancel
      </Button>
    );
    children = (
      <>
        <ProgressBar
          orientation="horizontal"
          indeterminate={flow.percent === null}
          percentProgress={flow.percent ?? 0}
          label="Export progress"
          className="text-sea-green h-2"
        />
        <Paragraph emphasis="muted" className="mt-4 mb-0">
          {flow.stageMessage}
        </Paragraph>
      </>
    );
  } else if (flow.phase === 'error') {
    title = 'Export failed';
    description = flow.message;
    accent = 'destructive';
    dismissible = true;
    announcement = 'Export failed';
    footer = (
      <Button onClick={onDismiss} data-testid="export-dismiss">
        Close
      </Button>
    );
  } else {
    const saving = flow.phase === 'saving';
    const resolvedAction = action ?? 'download';
    const ActionIcon = READY_ACTION_ICONS[resolvedAction];
    title = 'Archive ready';
    description = READY_DESCRIPTIONS[resolvedAction];
    dismissible = !saving;
    announcement = 'Archive ready';
    footer = (
      <>
        <Button
          onClick={onDismiss}
          disabled={saving}
          data-testid="export-dismiss"
        >
          Cancel
        </Button>
        <Button
          ref={primaryActionRef}
          color="primary"
          icon={<ActionIcon aria-hidden />}
          onClick={onSave}
          disabled={saving}
          data-testid="data-save-export"
        >
          {READY_ACTION_LABELS[resolvedAction]}
        </Button>
      </>
    );
    children = (
      <>
        <Paragraph margin="none" className="font-semibold break-all">
          {flow.fileName}
        </Paragraph>
        <Paragraph emphasis="muted" margin="none" className="mt-1">
          {flow.sessionIds.length === 1
            ? 'Contains 1 interview.'
            : `Contains ${flow.sessionIds.length} interviews.`}
        </Paragraph>
        {flow.failedCount > 0 && (
          <Alert variant="warning" className="mt-4">
            {flow.failedCount === 1
              ? '1 interview could not be exported and is not included in this archive.'
              : `${flow.failedCount} interviews could not be exported and are not included in this archive.`}
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
