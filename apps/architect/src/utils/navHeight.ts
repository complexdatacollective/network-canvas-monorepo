/**
 * How tall Architect's navigation bar is, as a CSS custom property on the
 * document root.
 *
 * The bar is `position: sticky` at the top of every project screen, so it
 * covers the first stretch of anything else that sticks to the top and the
 * landing point of anything scrolled into view. Nothing about it is a constant
 * a stylesheet could carry: the pill inside it wraps at narrow widths, the
 * language control and the project actions change what is in it, and the type
 * scale is responsive — so it is measured where it is drawn (`NavShell`) and
 * read from here by everything that has to stay clear of it.
 *
 * `architect-theme.css` declares a starting value, so a page laid out before
 * `NavShell`'s first measurement still resolves to a real height instead of
 * dropping the declaration that reads it.
 */
export const NAV_HEIGHT_VARIABLE = '--architect-nav-height';

/**
 * How far down from the top of the nav its bar reaches, as a CSS custom
 * property on the document root: the part of a page scrolled under the nav
 * that the bar covers. Less than `NAV_HEIGHT_VARIABLE`, which counts the
 * space the header keeps under the bar, where the page shows through.
 * Measured on the bar in `NavShell`; read by the stage editor, whose
 * settings over the page keep clear of it.
 */
export const NAV_BAR_REACH_VARIABLE = '--architect-nav-bar-reach';
