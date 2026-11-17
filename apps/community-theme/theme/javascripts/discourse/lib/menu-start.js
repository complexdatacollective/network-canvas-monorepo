/**
 * How far the forum's menu starts from the start edge of the panel it is
 * placed in, so that it opens under Community (`header.scss` sets it as the
 * menu's `inset-inline-start`). The start edge is the left one in a
 * left-to-right page and the right one in a right-to-left page.
 *
 * @param {{ left: number, right: number }} anchor where Community is
 * @param {{ left: number, right: number }} panel where the menu's panel is
 * @param {string} direction the panel's direction, "ltr" or "rtl"
 * @returns {number} the offset in pixels
 */
export function menuStart(anchor, panel, direction) {
  return direction === 'rtl'
    ? panel.right - anchor.right
    : anchor.left - panel.left;
}
