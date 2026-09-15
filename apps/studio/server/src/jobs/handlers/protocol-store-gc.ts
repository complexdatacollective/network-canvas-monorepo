import type pg from 'pg';

import { gcProtocolStore, type GcOptions } from '../../protocol/gc.ts';
import { logJobOutcome } from '../log.ts';
import type { HandledJob } from './job.ts';

// The protocol store's hourly sweep. The sweep itself has existed since #1247
// and has never run in a deployment: there was nothing to run it. This is that
// something (#1895), and the whole of the handler is calling it and saying
// what it collected.

/**
 * What the deployment's sweep keeps. These are the production bounds rather
 * than a caller's choice, because the sweep is not addressed at anything — the
 * cron sends an empty payload and every tenant is visited the same way — so a
 * bound that varied by job would only ever be a way to get them wrong.
 *
 * A thousand manifests per draft is far more history than a researcher can
 * reach through the editor and small enough that a long-lived draft does not
 * grow without bound.
 *
 * The two windows answer different questions and are deliberately different
 * lengths. A command-log row survives a day because that is how long a client
 * whose acknowledgement was lost has to retransmit and find its recorded
 * result; nothing but that client reads it.
 *
 * A section's grace is three days because a deleted section is not only a
 * live client's problem: backups are taken daily (#1901), so a window shorter
 * than the backup interval can delete bytes that no backup ever captured, and
 * a restore then produces a manifest naming a section that exists nowhere. It
 * has to exceed the interval, not merely match it — a backup that runs late,
 * or a sweep that runs just before one, would otherwise close the gap — so
 * three days for a daily backup (#1909).
 */
export const PROTOCOL_STORE_GC_BOUNDS: GcOptions = {
  retainManifestsPerDraft: 1000,
  sectionGraceMs: 259_200_000,
  commandRetryHorizonMs: 86_400_000,
};

export type ProtocolStoreGcHandlerDeps = {
  /**
   * The sweep visits every tenant, which only the maintenance role may do:
   * `gcProtocolStore` refuses any other role rather than reporting a clean
   * pass it never made.
   */
  maintenancePool: pg.Pool;
};

export function createProtocolStoreGcHandler({
  maintenancePool,
}: ProtocolStoreGcHandlerDeps): (jobs: HandledJob[]) => Promise<void> {
  return async (jobs) => {
    // One job at a time by registration; the loop is there so a future batch
    // size does not silently drop the rest of the batch.
    for (const job of jobs) {
      const attempt = job.retryCount + 1;
      try {
        const swept = await gcProtocolStore(
          maintenancePool,
          PROTOCOL_STORE_GC_BOUNDS,
        );
        logJobOutcome({
          queue: 'protocol-store-gc',
          jobId: job.id,
          outcome: 'completed',
          attempt,
          // The counts are the only evidence a deployment has that the sweep
          // is keeping up; a pass that collects nothing and one that collects
          // thousands are both normal, and only the series tells them apart.
          detail: `manifests ${swept.manifestsDeleted}, sections ${swept.sectionsDeleted}, command log ${swept.commandLogDeleted}`,
        });
      } catch (error) {
        // The queue retries nothing: the sweep is idempotent and the next hour
        // picks up whatever this pass left, which is a better answer than
        // retrying a pass that failed halfway through a tenant.
        logJobOutcome({
          queue: 'protocol-store-gc',
          jobId: job.id,
          outcome: 'failed',
          attempt,
          error,
        });
        throw error;
      }
    }
  };
}
