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
    // The document is mounted off-screen (position: fixed; left: -100000px) so
    // it never flashes on screen. html-to-image clones the element's computed
    // style, so without this the clone keeps that positioning and renders the
    // whole subtree outside the captured area — producing a blank PNG. Reset the
    // clone (only) to in-flow so it renders at the origin of the capture.
    style: { position: 'static', left: '0px', top: '0px' },
  });

  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
