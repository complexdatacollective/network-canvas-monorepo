export type DownloadResult = {
  saved: boolean;
  path?: string;
};

export async function downloadBlob(
  blob: Blob,
  suggestedName: string,
): Promise<DownloadResult> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { saved: true };
}
