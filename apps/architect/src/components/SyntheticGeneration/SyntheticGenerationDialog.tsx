import { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { MAX_SYNTHETIC_INTERVIEWS } from '@codaco/protocol-utilities';
import type { CurrentProtocol } from '@codaco/protocol-validation';
import { SyntheticConflictList } from '~/components/Synthetic/SyntheticConflictAlert';
import type { SyntheticExportProgress } from '~/lib/syntheticExport/generateSyntheticExport';

import { useSyntheticGeneration } from './useSyntheticGeneration';

/**
 * "Generate synthetic data…": a batch of invented interviews drawn from the
 * open protocol and saved as a real export archive.
 *
 * The fields mirror Interviewer's Synthetic data panel — the same four
 * questions, the same wording — so a researcher who has generated data in one
 * product recognises the other. What differs is the destination: Interviewer
 * keeps its batch as sessions on the device, while Architect has nowhere to put
 * an interview, so the batch goes straight through the exporter and waits here
 * as CSV and GraphML for the researcher to download.
 */

const DEFAULT_COUNT = 10;

/**
 * Every phase change worth announcing to a screen reader, and no more — one
 * sentence per phase rather than one per interview, so the live region carries
 * the shape of the wait instead of a flood of counts.
 */
function progressAnnouncement(progress: SyntheticExportProgress): string {
  if (progress.phase === 'preparing') {
    return 'Preparing to generate synthetic data.';
  }
  if (progress.phase === 'generating') return 'Generating interviews.';
  return 'Writing the export files.';
}

function progressLabel(progress: SyntheticExportProgress): string {
  if (progress.phase === 'preparing') return 'Preparing…';
  if (progress.phase === 'generating') {
    return `Generating interview ${progress.current} of ${progress.total}`;
  }
  return progress.message === '' ? 'Writing files…' : progress.message;
}

/**
 * How far along, when that is knowable. Generation and export are reported
 * separately rather than merged into one bar: they are different work, of
 * unrelated duration, and a single bar that ran to the end and started again
 * would say less than a label that names the stage it is in.
 */
function progressPercent(progress: SyntheticExportProgress): number | null {
  if (progress.phase === 'generating') {
    return progress.total > 0
      ? (progress.current / progress.total) * 100
      : null;
  }
  if (progress.phase === 'exporting') {
    const { current, total } = progress;
    if (current === null || total === null || total <= 0) return null;
    return (current / total) * 100;
  }
  return null;
}

export type SyntheticGenerationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved protocol; `null` while none is open. */
  protocol: CurrentProtocol | null;
  /** The asset-store scope roster and map pools are resolved under. */
  protocolId: string | null;
};

export function SyntheticGenerationDialog({
  open,
  onOpenChange,
  protocol,
  protocolId,
}: SyntheticGenerationDialogProps) {
  const { state, generate, reset, saveArchive } = useSyntheticGeneration({
    protocol,
    protocolId,
  });

  const [count, setCount] = useState(DEFAULT_COUNT);
  const [seedInput, setSeedInput] = useState('');
  const [simulateDropOut, setSimulateDropOut] = useState(true);
  // Defaults on: skip logic and filters are part of what the protocol says an
  // interview is, so generated data that ignores them is not data this protocol
  // could have produced.
  const [respectSkipLogic, setRespectSkipLogic] = useState(true);

  const isRunning = state.status === 'running';
  const archiveReady = state.status === 'done';

  // Reopening starts a clean slate: the previous run's outcome belongs to the
  // batch that produced it, and leaving a stale "Generated 10 interviews" above
  // a fresh form would read as though this one had already run.
  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const handleGenerate = useCallback(() => {
    const parsedSeed = Number.parseInt(seedInput.trim(), 10);
    void generate({
      count,
      ...(Number.isFinite(parsedSeed) ? { seed: parsedSeed } : {}),
      simulateDropOut,
      respectSkipLogic,
    });
  }, [count, generate, respectSkipLogic, seedInput, simulateDropOut]);

  const handleClose = useCallback(() => {
    // A run has no cancel: the engine draws a batch in one synchronous call, so
    // there is no point between clicks at which it could be stopped. Closing
    // mid-run would hide it without ending it.
    if (isRunning) return;
    onOpenChange(false);
  }, [isRunning, onOpenChange]);

  return (
    <Dialog
      open={open}
      closeDialog={handleClose}
      dismissible={!isRunning}
      title="Generate synthetic data"
      size="readable"
      footer={
        <>
          <Button color="default" onClick={handleClose} disabled={isRunning}>
            Close
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isRunning || protocol === null}
          >
            {isRunning ? 'Generating…' : 'Generate'}
          </Button>
          {/* In the footer rather than inside the confirmation: the footer is
              fixed while the dialog body scrolls, so the one control that
              actually delivers the archive cannot end up below the fold on a
              short viewport — losing sight of it is losing the batch. It is
              also, once a batch exists, the dialog's next step: take the file. */}
          {archiveReady ? (
            <Button onClick={saveArchive}>Download archive</Button>
          ) : null}
        </>
      }
    >
      <Paragraph>
        Generate a batch of invented interviews from this protocol and download
        them as an export archive — the same CSV and GraphML files a completed
        study produces. Use it to check your analysis against the data your
        protocol will actually collect, before anyone is interviewed.
      </Paragraph>
      <Paragraph intent="smallText" emphasis="muted">
        Nothing generated here is real. Every answer is drawn from the
        parameters set on your stages and variables, so the archive has the
        shape of your study without any participant in it.
      </Paragraph>

      <UnconnectedField
        name="syntheticCount"
        label="Number of sessions"
        hint="How many interviews to generate. Each one walks the whole protocol as a participant would."
        component={InputField}
        type="number"
        min={1}
        max={MAX_SYNTHETIC_INTERVIEWS}
        value={String(count)}
        disabled={isRunning}
        onChange={(next: string | undefined) => {
          const parsed = Number.parseInt(next ?? '', 10);
          if (Number.isFinite(parsed) && parsed > 0) {
            setCount(Math.min(MAX_SYNTHETIC_INTERVIEWS, Math.max(1, parsed)));
          }
        }}
      />
      <UnconnectedField
        name="syntheticSeed"
        label="Random seed"
        hint="Leave blank for a new batch each time. Every batch reports the seed it used — enter that seed to regenerate exactly the same interviews."
        component={InputField}
        type="number"
        min={0}
        value={seedInput}
        disabled={isRunning}
        onChange={(next: string | undefined) => setSeedInput(next ?? '')}
      />
      <UnconnectedField
        name="simulateDropOut"
        label="Simulate participant drop-out"
        hint="Some interviews will be left incomplete, to mirror real-world data."
        inline
        component={ToggleField}
        value={simulateDropOut}
        disabled={isRunning}
        onChange={(next: boolean | undefined) =>
          setSimulateDropOut(next === true)
        }
      />
      <UnconnectedField
        name="respectSkipLogic"
        label="Respect skip logic and filtering"
        hint="Apply this protocol's skip logic and stage filters while generating. Turn off to make every interview visit every stage."
        inline
        component={ToggleField}
        value={respectSkipLogic}
        disabled={isRunning}
        onChange={(next: boolean | undefined) =>
          setRespectSkipLogic(next === true)
        }
      />

      {state.status === 'running' ? (
        <div className="my-6">
          <ProgressBar
            orientation="horizontal"
            percentProgress={progressPercent(state.progress) ?? 0}
            indeterminate={progressPercent(state.progress) === null}
            label="Synthetic data progress"
            className="text-sea-green h-2"
          />
          <p className="text-text/60 mt-2 text-sm" aria-hidden>
            {progressLabel(state.progress)}
          </p>
          {/* `output` is a live region by default (implicit role="status"),
              which is exactly what this is: the result of work in progress,
              announced politely when the reader is idle. */}
          <output className="sr-only">
            {progressAnnouncement(state.progress)}
          </output>
        </div>
      ) : null}

      {state.status === 'done' ? (
        <Alert variant="success">
          <AlertTitle>
            {state.summary.sessionCount === 1
              ? 'Generated 1 interview'
              : `Generated ${state.summary.sessionCount} interviews`}
          </AlertTitle>
          <AlertDescription>
            {/* Never "saved" until it has been: the archive exists in the page
                until the researcher clicks Download, and a confirmation that
                got ahead of that click would send them looking through their
                downloads folder for a file nobody wrote. */}
            <p>
              {state.saved
                ? `Saved as ${state.summary.fileName}. Download it again if you need another copy.`
                : `Your archive is ready to download as ${state.summary.fileName}.`}
            </p>
            <p>
              This batch used seed {state.summary.seed} — enter that seed above
              to generate exactly these interviews again.
            </p>
            {state.summary.failedCount > 0 ? (
              <p>
                {state.summary.failedCount === 1
                  ? '1 interview could not be written to the archive.'
                  : `${state.summary.failedCount} interviews could not be written to the archive.`}
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {state.status === 'refused' ? (
        <div className="my-6 flex flex-col gap-3">
          <Alert variant="destructive">
            <AlertTitle>Synthetic data could not be generated</AlertTitle>
            <AlertDescription>
              This protocol asks for values that cannot all exist at once.
              Update the rules below and try again.
            </AlertDescription>
          </Alert>
          <SyntheticConflictList conflicts={state.conflicts} />
        </div>
      ) : null}

      {state.status === 'failed' ? (
        <Alert variant="destructive">
          <AlertTitle>Synthetic data could not be generated</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </Dialog>
  );
}
