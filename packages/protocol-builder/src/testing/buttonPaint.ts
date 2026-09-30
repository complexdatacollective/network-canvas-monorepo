/**
 * What a button actually paints, read off the rendered element.
 *
 * Architect says what a button is FOR with `color` on fresco-ui's filled
 * variant — primary to create or submit, default to cancel, destructive to
 * remove — and never with `variant="outline"` or `variant="dashed"`. A story
 * play could assert the class list instead, but a class list is the call site
 * written out a second time: it agrees with the source whatever the source
 * says. These five values are what a researcher sees.
 *
 * `--component-text` is the colour the filled variant fills with and
 * `--component-bg` the ink it writes in; both are resolved here, so a
 * comparison is against the theme's own `--primary` or `--destructive` rather
 * than against the word in a class. `background` separates filled from hollow:
 * outline and dashed leave the ground transparent and paint a 2px border
 * instead, which `borderStyle` and `borderWidth` name.
 *
 * Browser only — `getComputedStyle` in jsdom resolves no Tailwind class at
 * all, so these reads belong in the `storybook` project.
 */
export function buttonPaint(button: Element): {
  colour: string;
  ink: string;
  background: string;
  borderStyle: string;
  borderWidth: string;
  token: (name: string) => string;
} {
  const styles = getComputedStyle(button);
  return {
    colour: styles.getPropertyValue('--component-text').trim(),
    ink: styles.getPropertyValue('--component-bg').trim(),
    background: styles.backgroundColor,
    borderStyle: styles.borderTopStyle,
    borderWidth: styles.borderTopWidth,
    /** A theme token as it resolves at this element, e.g. `primary`. */
    token: (name: string) => styles.getPropertyValue(`--${name}`).trim(),
  };
}

/** The ground of a hollow button, which a filled one never has. */
export const TRANSPARENT = 'rgba(0, 0, 0, 0)';
