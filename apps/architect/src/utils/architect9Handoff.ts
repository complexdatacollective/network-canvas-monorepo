import { enqueueLaunchRead } from './fileLaunchQueue';
import { takeHandoff } from './handoffStore';

// Architect 9 is served at the origin root, with this build at /v8/ inside its
// deploy. Architect 9 does all the opening: it sends a protocol here with
// `?open=` or `?import=`, and this build only ever goes back to its start
// screen, which is root-absolute, never under this build's base.

/** Architect 9's start screen, where this build returns when the editor closes. */
const ARCHITECT_9_START_SCREEN_URL = '/';

// The file Architect 9 staged keeps the name it was opened under; Open file
// refuses anything without the .netcanvas extension, so make sure it has one.
const asNetcanvasFileName = (fileName: string): string => {
  const trimmed = fileName.trim();
  if (trimmed.toLowerCase().endsWith('.netcanvas')) return trimmed;
  return `${trimmed === '' ? 'protocol' : trimmed}.netcanvas`;
};

/**
 * Open the file Architect 9 staged under `handoffKey` (`?import=`), through
 * the same queue as an OS-launched file, so it gets Open file's migration
 * dialog and lands in this app's library as a new protocol.
 */
export const stageHandoffImport = (handoffKey: string): void => {
  enqueueLaunchRead(async () => {
    const record = await takeHandoff(handoffKey);
    if (!record) return null;
    return new File([record.file], asNetcanvasFileName(record.fileName), {
      type: record.file.type,
    });
  });
};

let left = false;

/**
 * Go back to Architect 9's start screen: a full-page navigation to another
 * app, kept here so tests can stand in for it. It replaces this page in
 * history, so Back from Architect 9 never lands on an empty page that would
 * only send it forward again. Once the page is leaving, a second call does
 * nothing rather than replace the first.
 */
export const returnToArchitect9 = (): void => {
  if (left) return;
  left = true;
  window.location.replace(ARCHITECT_9_START_SCREEN_URL);
};
