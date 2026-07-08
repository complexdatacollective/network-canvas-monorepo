import { userEvent, within } from 'storybook/test';

/**
 * Shared play-function helpers for the FamilyPedigree quick-start wizard
 * stories. Kept in a plain `.ts` module (not a `*.stories.tsx`) so Storybook
 * does not index it as a story file.
 */

/**
 * Answer the "About you" (EgoSexStep) biological-sex question within an
 * already-open wizard dialog. The radios are labelled by their option label
 * (from BIOLOGICAL_SEX_OPTIONS; the default here is "Female"). Callers own the
 * dialog lookup and the subsequent "Continue" click, which differ per story
 * file.
 */
export async function selectBiologicalSex(
  dialog: HTMLElement,
  label = 'Female',
) {
  const field = dialog.querySelector('[data-field-name="biologicalSex"]');
  if (!(field instanceof HTMLElement))
    throw new Error('No biologicalSex field found (EgoSexStep)');
  const radio = within(field).getByRole('radio', { name: label });
  await userEvent.click(radio);
}
