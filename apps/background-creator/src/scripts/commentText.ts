// Collapses every line separator and other control character in a value to a
// single space so free text (a reopened SVG's title) embedded in a generated
// Python/R header comment cannot break out of its leading "# " and become
// executable code. Covers bare CR (which both interpreters treat as a line
// break, unlike the old `\r?\n`-only replacement), LF/CRLF, the Unicode line and
// paragraph separators (U+2028/U+2029), and C0/C1 controls. A code-point scan is
// used rather than a regex because a control-character character class trips
// `no-control-regex`.
export function commentText(value: string): string {
  let out = '';
  let lastWasSpace = false;
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    const isControl =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029;
    if (isControl) {
      if (!lastWasSpace) {
        out += ' ';
        lastWasSpace = true;
      }
    } else {
      out += ch;
      lastWasSpace = false;
    }
  }
  return out;
}
