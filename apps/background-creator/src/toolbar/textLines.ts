// A text element stores its content as `lines: string[]` (one <tspan> per line),
// but it is edited as a single multi-line string in a textarea. These helpers
// convert between the two representations.

// Joins the model's line array into the textarea's single string.
export function linesToText(lines: string[]): string {
  return lines.join('\n');
}

// Splits the textarea's string back into the model's line array. `String.split`
// always yields at least one element (an empty string becomes `['']`), so a text
// element never ends up with an empty `lines` array (the model requires ≥ 1).
export function textToLines(text: string): string[] {
  return text.split('\n');
}
