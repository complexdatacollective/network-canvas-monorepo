import { toPng } from 'html-to-image';

export async function exportSnapshot(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(element);

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
