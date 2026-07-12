import type { Download, Page } from '@playwright/test';
import JSZip from 'jszip';

// Forces saveBlob's object-URL <a download> branch (deletes the File System
// Access + Web Share entry points) so page.waitForEvent('download') fires, then
// captures + unzips the exported archive into decoded text entries.
export class DownloadFixture {
  constructor(private page: Page) {}

  async installStubs(): Promise<void> {
    await this.page.addInitScript(() => {
      // @ts-expect-error runtime deletion of optional capability
      delete window.showSaveFilePicker;
      // @ts-expect-error runtime deletion of optional capability
      delete navigator.canShare;
      // @ts-expect-error runtime deletion of optional capability
      delete navigator.share;
    });
  }

  // Runs `trigger` (which must click Export then Save export), captures the
  // download, and returns each archive entry decoded as text.
  async captureExport(
    trigger: () => Promise<void>,
  ): Promise<{ fileName: string; files: Record<string, string> }> {
    const downloadPromise: Promise<Download> =
      this.page.waitForEvent('download');
    await trigger();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const zip = await JSZip.loadAsync(Buffer.concat(chunks));
    const files: Record<string, string> = {};
    await Promise.all(
      Object.values(zip.files).map(async (entry) => {
        if (!entry.dir) files[entry.name] = await entry.async('string');
      }),
    );
    return { fileName: download.suggestedFilename(), files };
  }
}
