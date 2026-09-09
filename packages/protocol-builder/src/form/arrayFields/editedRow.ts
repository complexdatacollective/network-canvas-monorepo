import { createContext, useContext } from 'react';

/**
 * Whether the row a dialog is editing is still one of the list's rows.
 *
 * `DialogArrayField` deliberately keeps a row editor open after its row leaves
 * the array — removed by a collaborator, rolled back with a lease — so the
 * draft in it can be read and rescued rather than vanishing with the row. What
 * it CANNOT do is commit: the row is addressed by its own id, and there is no
 * row of that id left to write to, so every save from that point is refused
 * with "this row was removed".
 *
 * Fields mounted inside such a dialog have to know, because some of them write
 * somewhere else. A prompt's codebook controls send a compound edit to the
 * CODEBOOK and then point the row at what came back: the codebook half lands
 * whole, the row half can never be saved, and the protocol is left carrying an
 * attribute nothing points at — invented for a question the researcher can no
 * longer ask. The same is true of a connection type created from a census
 * prompt.
 *
 * `true` where there is no row dialog at all, which is what a field mounted
 * straight into a section is: a section's own controls are not editing a row,
 * so nothing about them can be detached from one.
 */
const EditedRowAttachmentContext = createContext<boolean | null>(null);

export default EditedRowAttachmentContext;

/**
 * Whether the row this field sits in can still be saved.
 *
 * Read by anything inside a row dialog that writes to a section OTHER than the
 * row's own — see the context above for why those are the writes that matter.
 * A field that only fills in the row itself has no use for it: what it writes
 * is the draft the dialog is holding, and the dialog reports for itself that
 * the draft can no longer be committed.
 */
export function useEditedRowStillInTheList(): boolean {
  return useContext(EditedRowAttachmentContext) ?? true;
}
