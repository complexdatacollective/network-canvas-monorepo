/**
 * Public type surface for the published bundle. `dist/element.js` is a
 * side-effect module (importing it registers the custom element), so the
 * only thing a TypeScript consumer needs is the tag-name registration.
 * Copied to `dist/element.d.ts` by scripts/build.mjs.
 */
declare global {
  interface HTMLElementTagNameMap {
    'nc-site-navigation': HTMLElement;
  }
}
