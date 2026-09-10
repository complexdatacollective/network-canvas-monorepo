/**
 * What a list of options a caller wants an attribute to hold looks like.
 *
 * The rest of this module went with the spotlight it described: the shared
 * `@codaco/protocol-builder` editors ship none — the string "spotlight"
 * appears nowhere in that package — and each picker now asks in its own way.
 * A form field chooses its attribute from a native `<select>` carrying a
 * "Create a new attribute…" option (`form-field-controls.ts`); a prompt or a
 * slot has its own "Create a new … attribute" button beside the picker, which
 * opens the codebook's attribute editor. So there is nothing left to share
 * but the shape of a row.
 */
export type OptionRow = { label: string; value: string };
