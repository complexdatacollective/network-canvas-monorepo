/**
 * The DOM id of the stage editor's form.
 *
 * Named rather than generated: the toolbar's save control lives outside the
 * form and reaches it by id, and every dialog the editor opens derives its own
 * form id from this one.
 */
export const STAGE_FORM_ID = 'edit-stage';
