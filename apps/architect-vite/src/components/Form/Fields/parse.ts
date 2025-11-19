/**
 * Hack for `>` characters that already exist in some protocols
 * and will be interpreted as block quotes on first load
 * Encoding this way forces slate to treat them as paragraphs.
 *
 * This function is also used by <Markdown> to sanitize incoming
 * strings.
 *
 * This was implemented as two successive 'replace' operations
 * rather than a single regex, because Safari does not support
 * lookbehind.
 */
export const escapeAngleBracket = (value = ""): string => value.replace(/>/g, "&gt;").replace(/<br&gt;/g, "<br>");
