/**
 * Which link addresses are drawn as links. Stored text is shown by the
 * interview (`RenderMarkdown`), by Architect's rich text editor and by
 * `RichTextRenderer`; each asks this, so a link one of them draws is a link
 * in all of them, and a link one refuses is shown as its words everywhere.
 *
 * An address is a link when it is a whole web address (`http:` or
 * `https:`), an email address (`mailto:`) or a telephone number (`tel:`),
 * which are what the editor's link field accepts. Anything else is refused:
 * an address with no scheme or only `//`, which would point into whichever
 * app is showing the interview; a scheme that runs code or reads files, such
 * as `javascript:`, `data:` or `file:`; an address the URL parser rejects;
 * and one holding a control character, which browsers drop silently.
 */

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

const hasControlCharacter = (address: string): boolean =>
  Array.from(address).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });

/**
 * The address `value` links to, trimmed, or `undefined` when it is not one
 * that is drawn as a link (see above).
 */
export const linkAddress = (
  value: string | null | undefined,
): string | undefined => {
  const address = value?.trim();
  if (!address || hasControlCharacter(address)) return undefined;
  try {
    return LINK_PROTOCOLS.has(new URL(address).protocol) ? address : undefined;
  } catch {
    return undefined;
  }
};
