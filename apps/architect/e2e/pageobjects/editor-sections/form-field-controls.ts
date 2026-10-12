import { expect, type Locator } from '@playwright/test';

// Form-field dialog controls shared by the stage-editor specs. Drives
// `@codaco/protocol-builder`'s `FormFieldsSection`.

/**
 * Open the rules a participant's answer has to satisfy, for the attribute the
 * given form-field dialog collects, and hand back the section holding them.
 *
 * A nested, toggleable "Validation" section at the end of the field dialog, as
 * Architect had it (`sections/ValidationSection.tsx`) — not a dialog of its
 * own, and with no submit: the rules belong to the CODEBOOK attribute and each
 * answerable change is written to it as the researcher makes it. The section is
 * rendered only against an attribute that exists, which is what makes this
 * reachable from a reopened field and not from the dialog that invents one.
 *
 * Switched on if it is not already: an attribute that arrives carrying rules
 * has it open, and clicking then would clear them.
 */
export async function openValidationSection(dialog: Locator): Promise<Locator> {
  const label = 'Validation';
  const toggle = dialog.getByRole('switch', { name: label, exact: true });
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await toggle.click();
  }
  const rules = dialog.getByRole('region', { name: label, exact: true });
  await expect(rules).toBeVisible();
  return rules;
}
