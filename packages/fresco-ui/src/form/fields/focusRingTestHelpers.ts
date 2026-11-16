import { expect, userEvent, waitFor } from 'storybook/test';

type FocusStop = {
  /** The element the keyboard lands on. */
  control: HTMLElement;
  /**
   * What draws the ring: the control itself, or the wrapper around it that
   * stands in for an input with no outline of its own.
   */
  ringOn: 'control' | 'wrapper';
};

const ringElement = ({ control, ringOn }: FocusStop) => {
  if (ringOn === 'control') return control;
  if (!control.parentElement) throw new Error('The control has no wrapper');
  return control.parentElement;
};

const outlineOf = (element: Element) => {
  const { outlineStyle, outlineWidth, outlineOffset, outlineColor } =
    getComputedStyle(element);
  return { outlineStyle, outlineWidth, outlineOffset, outlineColor };
};

/**
 * Tabs to a valid control, then to the invalid one that follows it, and holds
 * the invalid one to the ring the valid one drew.
 *
 * The valid control is the reference rather than a set of numbers written
 * here, so the two cannot differ in a way this misses: a browser's own
 * outline on the invalid control fails as surely as no outline. The valid
 * control is still held to being a ring at all, or two controls with no ring
 * would agree.
 *
 * The two controls must be the next two tab stops when this is called. A
 * story that calls this reads styles that exist only while a control matches
 * `:focus-visible`, so it has to be kept out of Chromatic, whose capture tab
 * is never focused.
 */
export async function expectInvalidControlToKeepFocusRing(
  valid: FocusStop,
  invalid: FocusStop,
) {
  const validRing = ringElement(valid);
  const invalidRing = ringElement(invalid);

  await expect(outlineOf(validRing).outlineStyle).toBe('none');
  await expect(outlineOf(invalidRing).outlineStyle).toBe('none');

  await userEvent.tab();
  await waitFor(() => expect(valid.control).toHaveFocus());
  // The ring eases in, so it is read once it has settled.
  await waitFor(() =>
    expect(outlineOf(validRing)).toMatchObject({
      outlineStyle: 'solid',
      outlineWidth: '2px',
      outlineOffset: '3px',
    }),
  );
  const expected = outlineOf(validRing);
  const validBorder = getComputedStyle(validRing).borderTopColor;

  await userEvent.tab();
  await waitFor(() => expect(invalid.control).toHaveFocus());
  await waitFor(() => expect(outlineOf(invalidRing)).toEqual(expected));
  // The ring is added to the error border, not drawn in place of it.
  await expect(getComputedStyle(invalidRing).borderTopColor).not.toBe(
    validBorder,
  );
}
