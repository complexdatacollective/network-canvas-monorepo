/**
 * Which link addresses are drawn as links. Stored text is shown by the
 * interview (`RenderMarkdown`), by Architect's rich text editor and by
 * `RichTextRenderer`; each asks this, so a link one of them draws is a link
 * in all of them, and a link one refuses is shown as its words everywhere.
 * The editor's link field accepts the same addresses (`LINK_ADDRESS_PATTERN`).
 *
 * An address is a link when it is a whole web address (`http://` or
 * `https://`), an email address (`mailto:`) or a telephone number (`tel:`).
 * Anything else is refused: an address with no scheme, with only `//`, or
 * with a web scheme not followed by `//` (`https:example.org`), each of which
 * a browser reads relative to whichever app is showing the interview; a
 * scheme that runs code or reads files, such as `javascript:`, `data:` or
 * `file:`; an address the URL parser rejects; and one holding a control
 * character, which browsers drop silently.
 */

/**
 * How an address that is a link starts, as a pattern for an input's
 * `pattern` attribute (which must match the whole value) or for `RegExp`.
 */
const LINK_ADDRESS_START =
  '(?:[Hh][Tt][Tt][Pp][Ss]?://|[Mm][Aa][Ii][Ll][Tt][Oo]:|[Tt][Ee][Ll]:)';

/** The `pattern` of a field that takes a link's address. */
export const LINK_ADDRESS_PATTERN = `${LINK_ADDRESS_START}.*`;

const STARTS_AS_LINK = new RegExp(`^${LINK_ADDRESS_START}`);

const hasControlCharacter = (address: string): boolean =>
  Array.from(address).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

const parses = (address: string): boolean => {
  try {
    return new URL(address).protocol !== '';
  } catch {
    return false;
  }
};

/**
 * The address `value` links to, trimmed but otherwise as written, or
 * `undefined` when it is not one that is drawn as a link (see above).
 */
export const linkAddress = (
  value: string | null | undefined,
): string | undefined => {
  const address = value?.trim();
  if (!address || hasControlCharacter(address)) return undefined;
  return STARTS_AS_LINK.test(address) && parses(address) ? address : undefined;
};
