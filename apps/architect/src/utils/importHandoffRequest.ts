import { enqueueLaunchRead } from './fileLaunchQueue';
import { takeHandoff } from './handoffStore';
import { takeImportRequest } from './urlEntryRequests';

/**
 * Open the file Architect 8 staged for this app (`/?import=<key>`) as if the
 * OS had launched it, so it meets the same dialogs. Taking the record deletes
 * it, so a second tab cannot open the same file again. A key with no record
 * for this app (already taken, expired, or staged for Architect 8) is reported
 * as an unreadable launch.
 */
export const queueRequestedImport = (): void => {
  const key = takeImportRequest();
  if (!key) return;
  enqueueLaunchRead(async () => {
    const record = await takeHandoff(key);
    return record
      ? new File([record.file], record.fileName, { type: record.file.type })
      : null;
  });
};
