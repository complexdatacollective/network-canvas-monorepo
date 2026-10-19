import { enqueueLaunchRead } from '~/lib/pwa/fileLaunchQueue';

import { takeHandoff, writeHandoff } from './handoffStore';
import {
  interviewer9ImportUrl,
  leaveForInterviewer9,
} from './interviewer9Navigation';

// The two directions a protocol file travels between Interviewer 8 (a /v8/
// build) and Interviewer 9 through the hand-off store.

// The file Interviewer 9 staged keeps the name it was chosen under; give it
// the .netcanvas extension the import pipeline and its labels expect.
const asNetcanvasFileName = (fileName: string): string => {
  const trimmed = fileName.trim();
  if (trimmed.toLowerCase().endsWith('.netcanvas')) return trimmed;
  return `${trimmed === '' ? 'protocol' : trimmed}.netcanvas`;
};

/**
 * Import the file Interviewer 9 staged under `handoffKey` (`?import=`),
 * through the same queue as an OS-launched file, so it imports on Home once
 * the app is unlocked, with the normal import's progress card and messages.
 * A record that is missing, or staged for Interviewer 9, is reported as an
 * unreadable launched file.
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

const stageForInterviewer9 = async (file: File): Promise<string> =>
  interviewer9ImportUrl(
    await writeHandoff({ targetMajor: 9, fileName: file.name, file }),
  );

/**
 * Hand a protocol made for a newer schema to Interviewer 9's import flow. The
 * caller is Home, acting on the researcher's own import, so the page leaves at
 * once. Resolves false, staying here, when the file could not be staged.
 */
export const forwardFileToInterviewer9 = async (
  file: File,
): Promise<boolean> => {
  let url: string;
  try {
    url = await stageForInterviewer9(file);
  } catch (error) {
    // oxlint-disable-next-line no-console -- only diagnostic for a failed hand-off; the import then runs here and explains itself
    console.error('Could not stage a protocol for Interviewer 9', error);
    return false;
  }
  leaveForInterviewer9(url);
  return true;
};

// A navigation to Interviewer 9 requested outside React — an OS file launch
// reaching an Interviewer 8 window, which can happen before the app has even
// rendered — waits here for Interviewer9NavigationRequests, which leaves only
// when no interview is on screen.
let pendingNavigation: string | null = null;
const navigationListeners = new Set<() => void>();

export const subscribeInterviewer9Navigation = (
  listener: () => void,
): (() => void) => {
  navigationListeners.add(listener);
  return () => {
    navigationListeners.delete(listener);
  };
};

export const getInterviewer9Navigation = (): string | null => pendingNavigation;

export const takeInterviewer9Navigation = (): string | null => {
  const url = pendingNavigation;
  pendingNavigation = null;
  return url;
};

const requestInterviewer9Navigation = (url: string): void => {
  pendingNavigation = url;
  for (const listener of Array.from(navigationListeners)) listener();
};

/**
 * `routeFiles` for the launch queue in a /v8/ build. Interviewer 9 owns
 * `.netcanvas` launches (this build declares no file handler), but a launch
 * can still reach a window of the installed app that is showing Interviewer 8.
 * Hand the file to Interviewer 9's import flow, which decides which app keeps
 * it.
 *
 * A hand-off carries one protocol (`/?import=<key>`), and leaving for
 * Interviewer 9 ends this page, so a launch of several files is not handed
 * over: all of them import here, through the normal queue, where each one gets
 * its own progress card and message. If staging fails the file imports here
 * too, so no launched file is ever dropped.
 */
export const forwardLaunchFilesToInterviewer9 = async (
  files: File[],
): Promise<File[]> => {
  const [file] = files;
  if (!file || files.length > 1) return files;
  try {
    requestInterviewer9Navigation(await stageForInterviewer9(file));
    return [];
  } catch (error) {
    // oxlint-disable-next-line no-console -- only diagnostic for a failed hand-off; the file then imports here
    console.error('Could not hand a launched file to Interviewer 9', error);
    return [file];
  }
};
