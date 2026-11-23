/**
 * How far up from the bottom of the window the action toolbar reaches, as a
 * CSS custom property on the document root: the part of a page it covers,
 * the space it is held off the bottom included. Nothing about it is a
 * constant: the toolbar wraps a control at a time at narrower widths. So it
 * is measured where it is drawn (`ActionToolbar`), and set only while a
 * toolbar is; read by the stage editor, whose settings over the page keep
 * clear of it.
 */
export const ACTION_TOOLBAR_REACH_VARIABLE = '--architect-action-toolbar-reach';
