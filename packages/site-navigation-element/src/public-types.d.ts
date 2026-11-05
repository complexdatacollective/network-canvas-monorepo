/**
 * Public type surface for the published bundle. `dist/element.js` is a
 * side-effect module (importing it registers the custom element), so a
 * TypeScript consumer needs the tag-name registration and the element's own
 * API: the method a host calls to return focus to its entry in the embedded
 * header, and the event that entry dispatches.
 * Copied to `dist/element.d.ts` by scripts/build.mjs.
 */
export type NcHostMenuToggleDetail = {
  /** Where the host's entry is on the page, to hang its menu from. */
  anchor: DOMRect;
};

export interface NcSiteNavigationElement extends HTMLElement {
  /**
   * Moves focus to the host's entry in the embedded header. Returns whether
   * there was one.
   */
  focusHostMenuTrigger(): boolean;
}

declare global {
  interface HTMLElementTagNameMap {
    'nc-site-navigation': NcSiteNavigationElement;
  }
}
