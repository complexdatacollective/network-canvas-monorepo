// Mirrors the renderer's UpdateInfo (src/lib/update/types.ts). Kept as a
// separate declaration because the main process is a distinct TS build that
// does not include renderer sources; shared here between updater.ts and
// devSimulation.ts.
export type UpdateInfo = {
  version: string;
  currentVersion: string;
  releaseName: string;
  releaseNotesMarkdown: string;
  releaseUrl: string;
  publishedAt: string | null;
};

export type UpdateProgress = {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
};
