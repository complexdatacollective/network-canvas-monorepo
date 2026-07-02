import { toPng } from 'html-to-image';

export async function exportSnapshot(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(element, {
    // The snapshot document is printed on white paper.
    backgroundColor: '#ffffff',
    // Render at 2× for a crisp image regardless of the display's pixel ratio.
    pixelRatio: 2,
  });

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
