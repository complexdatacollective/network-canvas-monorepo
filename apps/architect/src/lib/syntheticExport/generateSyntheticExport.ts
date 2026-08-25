import type { InterviewExportInput } from '@codaco/network-exporters/input';
import type { ExportOptions } from '@codaco/network-exporters/options';
import {
  freshBatchStartWindow,
  generateInterviewsAsync,
} from '@codaco/protocol-utilities';
import {
  CURRENT_SCHEMA_VERSION,
  hashProtocol,
  validateProtocol,
  type CurrentProtocol,
} from '@codaco/protocol-validation';
import { appVersion } from '~/utils/appVersion';
import { downloadTimestamp } from '~/utils/downloadBlob';
import { collectSyntheticAssetData } from '~/utils/syntheticAssetData';

import { SyntheticGenerationError } from './errors';
import { runExportPipeline } from './runExportPipeline';

/**
 * "Generate synthetic data…" end to end: draw a batch of interviews from the
 * saved protocol, run them through the real export pipeline, and hand back the
 * finished archive.
 *
 * Every step is the same one the products it stands in for take — the engine
 * Interviewer generates with, the exporter Interviewer and Fresco export with,
 * the download rung Architect saves a `.netcanvas` with — so an archive
 * produced here is an archive a real study would produce. That is the point of
 * the feature: a researcher can check their analysis scripts against the
 * columns their protocol will actually emit before recruiting anyone.
 *
 * The one step this does NOT take is the save itself. Saving belongs to the
 * researcher's click on Download, for the reason set out on `archive` below.
 */

/**
 * What the researcher is waiting on. Reported separately because the two halves
 * have very different shapes: generation counts interviews, the export reports
 * its own named stages, and a long pause in either one should say which.
 */
export type SyntheticExportProgress =
  | { phase: 'preparing' }
  | { phase: 'generating'; current: number; total: number }
  | {
      phase: 'exporting';
      message: string;
      current: number | null;
      total: number | null;
    };

export type SyntheticExportSummary = {
  /** Interviews written into the archive. */
  sessionCount: number;
  /** The seed the batch actually ran on. Half of its identity; see below. */
  seed: number;
  /**
   * The start-window anchor its sessions are dated against — the OTHER half.
   *
   * A batch is a pure function of both, so a summary reporting the seed alone
   * would promise a replay the engine cannot give: every timestamp, and every
   * date-relative drawn value, follows the day of the rerun. Reported together
   * as one copyable token (`formatSyntheticBatchToken`), exactly as
   * Interviewer reports its own batches.
   */
  startWindow: string;
  /** What the archive will be called once it is saved. */
  fileName: string;
  /** Interviews the exporter could not write a file for. */
  failedCount: number;
  /**
   * The archive itself, handed back rather than saved.
   *
   * `downloadBlob` has to run inside a user gesture or Safari treats the click
   * as a pop-up and drops it, and by the time a batch has been validated,
   * generated and exported the gesture that started the run is long spent. The
   * drop is silent — the page is never told a file was refused — so a save
   * from here would leave the researcher reading a confirmation for a file
   * that does not exist. The archive waits here instead, and the researcher's
   * own click on Download is the gesture that saves it.
   */
  archive: Blob;
};

export type GenerateSyntheticExportOptions = {
  /** The SAVED protocol, as stored — parsed here, never trusted as parsed. */
  protocol: CurrentProtocol;
  /** The asset-store scope roster and Geospatial pools resolve under. */
  protocolId: string | null;
  count: number;
  /** Pin the draws. Omitted, a fresh seed is drawn and reported back. */
  seed?: number;
  /**
   * Pin the day the sessions are dated against. Omitted, a fresh day-quantised
   * anchor is drawn and reported back: the seed alone does not identify a
   * batch, because session dates and every date-relative drawn value follow
   * the anchor.
   */
  startWindow?: string;
  simulateDropOut: boolean;
  /**
   * The dialog's combined toggle: skip logic AND stage filters together,
   * exactly as its label promises. Threaded to both of the engine's flags.
   */
  respectSkipLogic: boolean;
  onProgress?: (progress: SyntheticExportProgress) => void;
};

/**
 * A fresh seed for a batch nobody pinned.
 *
 * The one place entropy is allowed: the engine is a pure function of its seed
 * and its anchor, which is what makes a batch reproducible, so the unrepeatable
 * part has to be chosen here and handed back to the researcher. A 32-bit
 * integer is short enough to read off a confirmation and type back into the
 * batch-token field.
 */
function drawSeed(): number {
  const [value] = crypto.getRandomValues(new Uint32Array(1));
  return value ?? 0;
}

/**
 * The archive's name. Deliberately NOT the exporter's own
 * `networkCanvasExport-…` default: this file holds fabricated interviews, and a
 * researcher whose downloads folder cannot tell it apart from a real export is
 * one mis-click away from analysing invented data. Naming follows Architect's
 * other download — the protocol name, spaces underscored, then a local
 * timestamp.
 */
export function syntheticArchiveName(
  protocolName: string | undefined,
  now: Date = new Date(),
): string {
  const stem =
    (protocolName ?? 'protocol').trim().replace(/\s+/g, '_') || 'protocol';
  return `${stem}-synthetic-${downloadTimestamp(now)}.zip`;
}

/**
 * The saved protocol, re-parsed through the current schema.
 *
 * The engine refuses a stage that declares no `synthetic` parameters, because
 * those parameters are supplied BY PARSING rather than by defaulting inside the
 * engine — one model of what a stage generates, owned by the schema. The
 * protocol in the store is whatever the schema looked like when it was last
 * written, so generation parses it again here rather than trusting the row.
 */
async function parseSavedProtocol(
  protocol: CurrentProtocol,
): Promise<CurrentProtocol> {
  const validation = await validateProtocol(protocol);
  if (!validation.success) {
    throw new SyntheticGenerationError(
      'This protocol has validation errors, so synthetic data cannot be generated from it. Fix the issues reported for the protocol and try again.',
      { cause: validation.error },
    );
  }
  if (validation.data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new SyntheticGenerationError(
      'This protocol was written for an older version of Network Canvas, so synthetic data cannot be generated from it.',
    );
  }
  return validation.data;
}

/**
 * The export settings a synthetic archive is written with.
 *
 * Both formats, always: the whole reason to generate here is to see what a
 * protocol exports, and a researcher who has to guess which half they got has
 * not been shown that. The screen-layout options match the shipped defaults of
 * the apps that do offer them, so the numeric coordinates in this archive are
 * the ones a fresh install would produce.
 */
function syntheticExportOptions(): ExportOptions {
  return {
    exportGraphML: true,
    exportCSV: true,
    globalOptions: {
      useScreenLayoutCoordinates: false,
      screenLayoutHeight: 1080,
      screenLayoutWidth: 1920,
    },
    appVersion,
    commitHash: 'architect',
  };
}

export async function generateSyntheticExport({
  protocol,
  protocolId,
  count,
  seed: pinnedSeed,
  startWindow: pinnedStartWindow,
  simulateDropOut,
  respectSkipLogic,
  onProgress,
}: GenerateSyntheticExportOptions): Promise<SyntheticExportSummary> {
  onProgress?.({ phase: 'preparing' });

  const parsed = await parseSavedProtocol(protocol);

  // Roster rows and Geospatial answer pools, resolved from the editor's own
  // asset store under the engine's host contract. A stage whose asset cannot
  // be resolved contributes no key, which the engine reads as "the host looked
  // and could not resolve this" — grounds for a refusal rather than a
  // fabricated pool.
  const assetData =
    protocolId === null
      ? {}
      : await collectSyntheticAssetData(parsed, protocolId);

  const seed = pinnedSeed ?? drawSeed();
  const startWindow = pinnedStartWindow ?? freshBatchStartWindow();

  // Nothing has been written yet, so a refusal here — the engine proving up
  // front that the protocol's rules cannot all be satisfied — leaves the
  // researcher exactly where they were. It reaches the caller as the engine's
  // own `SyntheticDataConstraintError`, conflicts and all.
  //
  // Drawn through the engine's yielding driver because this runs on the tab's
  // only thread. A session costs real work and a batch may ask for a thousand
  // of them, so the synchronous driver would hold the thread for the whole run
  // — the dialog frozen, the progress below reporting into frames that never
  // come, and the browser eventually offering to kill the page.
  const results = await generateInterviewsAsync(
    parsed,
    {
      count,
      seed,
      startWindow,
      simulateDropOut,
      respectSkipLogic,
      // One dialog toggle, both engine flags: its label has always promised
      // "skip logic and filtering", and stage filters are the second half of
      // that promise. Left unset, the engine defaults filtering back ON, so a
      // researcher who turned the toggle off still got filtered networks.
      respectFiltering: respectSkipLogic,
    },
    assetData,
    (current, total) => onProgress?.({ phase: 'generating', current, total }),
  );

  // Hashed from the SAVED document, never from the parse of it.
  //
  // `hashProtocol` hashes the codebook and stages as they are written, and
  // parsing expands every field the schema defaults — so the two copies hash
  // differently for any protocol that leaves a default unstated. Interviewer
  // hashes the document as it arrived for exactly this reason
  // (`apps/interviewer/src/lib/protocol/importProtocol.ts`), and a researcher
  // who compares this archive with a real one from the same `.netcanvas` is
  // grouping by that identifier. Hashing the parse here would give the same
  // protocol two identities and silently split those analyses.
  //
  // The parsed copy still supplies the codebook: it is what generation drew
  // against, so it is what describes the columns in this archive.
  const hash = hashProtocol(protocol);
  const sessions: InterviewExportInput[] = results.map(({ session }) => ({
    id: session.id,
    // The same case id Interviewer gives a generated session, so the two
    // products' synthetic exports are recognisable as synthetic in the same
    // way — and by the same string.
    participantIdentifier: `synthetic-${session.id}`,
    startTime: new Date(session.startTime),
    finishTime: session.finishTime ? new Date(session.finishTime) : null,
    network: session.network,
    protocolHash: hash,
  }));

  const { result, blob } = await runExportPipeline({
    data: {
      sessions,
      protocols: {
        [hash]: { hash, name: parsed.name, codebook: parsed.codebook },
      },
    },
    options: syntheticExportOptions(),
    onEvent: (event) => {
      if (event.type === 'stage') {
        // Progress is stage-local: carrying the previous stage's counts
        // forward would show a full bar for work that has not started.
        onProgress?.({
          phase: 'exporting',
          message: event.message,
          current: null,
          total: null,
        });
        return;
      }
      onProgress?.({
        phase: 'exporting',
        message: '',
        current: event.current,
        total: event.total,
      });
    },
  });

  if (!blob) {
    throw new SyntheticGenerationError(
      'The interviews were generated, but the export finished without producing a file.',
    );
  }

  // `successfulExports`/`failedExports` carry one entry per generated file
  // (format × partition), not per interview — collapse to interview level
  // before anything the researcher reads consumes it.
  const failedCount = new Set(result.failedExports.map((f) => f.sessionId))
    .size;

  return {
    sessionCount: results.length,
    seed,
    startWindow,
    fileName: syntheticArchiveName(parsed.name),
    failedCount,
    archive: blob,
  };
}
