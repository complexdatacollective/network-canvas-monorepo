/**
 * A question of a form, placed in the form's text. The form's text is one
 * markdown document per language, and each question the participant answers
 * is a block of it, written as a markdown image with no description whose
 * address names the field by its id in the form's `fields`:
 *
 *     ![](field:8a2f0c1e-…)
 *
 * The form is plain CommonMark, like an asset block's (see `assetBlock.ts`),
 * so every markdown parser reads it, and it contains no braces, so it is
 * literal text inside the ICU messages that localized text is. The field's
 * question, hint and attribute are in the form's `fields`, not here: one
 * field can be placed in the document of each language.
 *
 * A field block is the only content of a paragraph that is a direct child of
 * the document, or of a version of a logic block (see `contentDocument.ts`).
 * It is written exactly as `fieldBlockMarkdown` writes it: a form that
 * CommonMark also reads as the same image (with a title, or with the address
 * in angle brackets) is a problem of the document (`fieldNotStandard`).
 */
const FIELD_BLOCK_SCHEME = 'field:';

/** Whether a markdown image's address names a field of the form. */
export const isFieldBlockUrl = (url: string): boolean =>
  url.slice(0, FIELD_BLOCK_SCHEME.length).toLowerCase() === FIELD_BLOCK_SCHEME;

// `encodeURIComponent` leaves these as they are, and each means something in
// a markdown address (a parenthesis closes it) or in an ICU message (an
// apostrophe opens a quoted run). A field id is a UUID, which has none of
// them; the encoding keeps any other id readable as one address.
const ALSO_ENCODED = /[!'()*]/g;

const encodeFieldId = (fieldId: string): string =>
  encodeURIComponent(fieldId).replace(
    ALSO_ENCODED,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );

/**
 * The id of the field an address names, or `undefined` when the address does
 * not name a field. An address that names a field without an id, or with one
 * that cannot be decoded, gives the empty string, which no field has.
 */
export const readFieldBlockUrl = (url: string): string | undefined => {
  if (!isFieldBlockUrl(url)) return undefined;
  const encoded = url.slice(FIELD_BLOCK_SCHEME.length);
  try {
    return decodeURIComponent(encoded);
  } catch (error) {
    if (error instanceof URIError) return '';
    throw error;
  }
};

/** The address of the block for `fieldId`. */
export const fieldBlockUrl = (fieldId: string): string =>
  `${FIELD_BLOCK_SCHEME}${encodeFieldId(fieldId)}`;

/** The markdown a field block is written as: a paragraph of its own. */
export const fieldBlockMarkdown = (fieldId: string): string =>
  `![](${fieldBlockUrl(fieldId)})`;

/**
 * `message` with each field block that names a field in `renames` naming the
 * field's new id instead. A field block's address contains nothing that ICU
 * reads, so the message is rewritten as it is written, and anything else in
 * it is left exactly as it was. Every field block of a valid document is
 * written as `fieldBlockMarkdown` writes it, so this finds each of them.
 */
export const renameFieldBlocks = (
  message: string,
  renames: ReadonlyMap<string, string>,
): string => {
  if (renames.size === 0 || !message.includes(FIELD_BLOCK_SCHEME)) {
    return message;
  }
  // One pass, so that a new id that is another field's old id is not
  // renamed again.
  return message.replace(
    /\(field:([^)\s]*)\)/gi,
    (address, encoded: string) => {
      const fieldId = readFieldBlockUrl(`${FIELD_BLOCK_SCHEME}${encoded}`);
      const renamed = fieldId === undefined ? undefined : renames.get(fieldId);
      return renamed === undefined ? address : `(${fieldBlockUrl(renamed)})`;
    },
  );
};
