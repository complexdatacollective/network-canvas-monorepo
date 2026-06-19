// Normalized "an update is available" payload shared by the renderer UI, the
// platform-dispatching `checkForUpdate`, and the Electron `update:check` IPC.
export type UpdateInfo = {
  version: string;
  currentVersion: string;
  releaseName: string;
  releaseNotesMarkdown: string;
  releaseUrl: string;
  publishedAt: string | null;
};
