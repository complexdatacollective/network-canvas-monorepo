import { stageHandoff } from '../handoff/handoffStore';
import {
  type BundledLegacyInterviewer,
  goToLegacyInterviewer,
  legacyImportUrl,
} from '../legacyInterviewer';

// Where a protocol file below this app's schema goes, once the researcher has
// chosen (see `ImportProtocolMigrationRequired`):
//
// - Keep on schema 8: the file is staged for Interviewer 8 in the hand-off
//   store and the page goes to `/v8/?import=<key>`, where Interviewer 8
//   imports it through its own normal import.
// - Upgrade to schema 9: the normal import again, with `allowMigration`.
//
// A file at this app's schema imports as it always has, and one above it gets
// the newer-version message the import already gives.

export type KeepOnInterviewer8Result =
  | { ok: true }
  /** Nothing was staged and the page stays: show the researcher an error. */
  | { ok: false; error: unknown };

/**
 * Hand `file` to the bundled Interviewer 8: stage it, then navigate there with
 * a full page load. Navigates only once the record is durable.
 */
export async function keepOnInterviewer8(
  file: File,
  interviewer: BundledLegacyInterviewer,
  navigate: (url: string) => void = goToLegacyInterviewer,
): Promise<KeepOnInterviewer8Result> {
  let key: string;
  try {
    key = await stageHandoff({ targetMajor: 8, file, fileName: file.name });
  } catch (error) {
    return { ok: false, error };
  }
  navigate(legacyImportUrl(interviewer, key));
  return { ok: true };
}
