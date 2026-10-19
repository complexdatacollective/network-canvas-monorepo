import { enqueueLaunchRead } from './fileLaunchQueue';
import { takeHandoff, writeHandoff } from './handoffStore';
import { reportError } from './reportError';

// Architect 9 is served at the origin root, with this build at /v8/ inside its
// deploy. Its entry points are root-absolute, never under this build's base,
// and each is reached by a full-page navigation: they belong to another app.

/** Architect 9's upgrade confirmation for a row of this app's library. */
export const architect9UpgradeUrl = (protocolId: string): string =>
  `/?upgrade=${encodeURIComponent(protocolId)}`;

/** Architect 9's open flow, for a file staged in the hand-off store. */
const architect9ImportUrl = (handoffKey: string): string =>
  `/?import=${encodeURIComponent(handoffKey)}`;

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

// A navigation to Architect 9 requested before, or outside, React — an OS file
// launch reaching an Architect 8 window — waits here for the component that
// can honour the leave-editor rule (useNavigateToArchitect9).
let pendingNavigation: string | null = null;
const navigationListeners = new Set<() => void>();

export const subscribeArchitect9Navigation = (
  listener: () => void,
): (() => void) => {
  navigationListeners.add(listener);
  return () => {
    navigationListeners.delete(listener);
  };
};

export const takeArchitect9Navigation = (): string | null => {
  const url = pendingNavigation;
  pendingNavigation = null;
  return url;
};

const requestArchitect9Navigation = (url: string): void => {
  pendingNavigation = url;
  for (const listener of Array.from(navigationListeners)) listener();
};

/**
 * `routeFiles` for the launch queue in a /v8/ build. Architect 9 owns
 * `.netcanvas` launches (this build declares no file handler), but a launch can
 * still reach a window of the installed app that is showing Architect 8. Hand
 * the file to Architect 9's open flow, which offers the schema choice.
 *
 * If staging fails the file opens here instead, so a launch is never dropped.
 */
export const forwardLaunchFilesToArchitect9 = async (
  files: File[],
): Promise<File[]> => {
  // Like Open file, a launch opens one protocol.
  const [file] = files;
  if (!file) return [];
  try {
    const key = await writeHandoff({
      targetMajor: 9,
      fileName: file.name,
      file,
    });
    requestArchitect9Navigation(architect9ImportUrl(key));
    return [];
  } catch (error) {
    reportError(error, { operation: 'fileLaunchForward' });
    return [file];
  }
};

/** The full-page navigation itself, kept here so tests can stand in for it. */
export const leaveForArchitect9 = (url: string): void => {
  window.location.assign(url);
};
