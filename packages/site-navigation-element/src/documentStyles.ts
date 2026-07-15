import documentFontsCss from '../.generated/document-fonts.css?inline';
import documentPropertiesCss from '../.generated/document-properties.css?inline';

const MARKER_ATTRIBUTE = 'data-nc-site-navigation';

/**
 * `@font-face` and `@property` rules only take effect at document level, so
 * they can't ship inside the element's shadow stylesheet. In production the
 * woff2 files sit next to the bundle (dist/fonts/) and resolve via
 * import.meta.url; the Vite dev server and vitest serve them from
 * public/fonts instead, where import.meta.url would point into /src.
 */
const fontBase = import.meta.env.DEV
  ? '/fonts'
  : new URL('./fonts', import.meta.url).href;

export function ensureDocumentStyles(): void {
  if (document.head.querySelector(`style[${MARKER_ATTRIBUTE}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(MARKER_ATTRIBUTE, '');
  style.textContent = `${documentFontsCss.replaceAll(
    '__NC_FONT_BASE__',
    fontBase,
  )}\n\n${documentPropertiesCss}`;
  document.head.append(style);
}
