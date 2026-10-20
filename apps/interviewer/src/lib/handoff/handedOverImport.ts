import { queueLaunchFileRead } from '../pwa/fileLaunchQueue';
import { pruneExpiredHandoffs, takeHandoff } from './handoffStore';
import { takeImportRequest } from './urlEntryRequests';

/**
 * Act on a `/?import=<key>` this page was opened with (captured before
 * analytics by `captureUrlEntryRequests`): the file Interviewer 8 staged is
 * imported as if the OS had launched it, so it waits for unlock and meets the
 * same import on Home. Taking the record deletes it, so a second tab cannot
 * import it again; a key with no record for this app counts as a file that
 * could not be read.
 *
 * Also removes hand-offs that were never taken, for either major.
 */
export function startHandedOverImport(): void {
  const key = takeImportRequest();
  if (key) {
    queueLaunchFileRead(async () => {
      const record = await takeHandoff(key);
      return record
        ? new File([record.file], record.fileName, { type: record.file.type })
        : undefined;
    });
  }

  pruneExpiredHandoffs().catch((error: unknown) => {
    // oxlint-disable-next-line no-console -- only diagnostic for a failed hand-off clean-up; the next start retries it
    console.error('Removing expired hand-offs failed', error);
  });
}
