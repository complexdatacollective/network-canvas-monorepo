import { expect, type Locator } from '@playwright/test';

/**
 * The shared "Synthetic data" disclosure (`components/Synthetic/SyntheticSection`),
 * which every synthetic-authoring surface renders: the stage editor's section,
 * each NodePanel's nomination odds, and every codebook attribute's sub-editor.
 *
 * Facts verified against source, not guessed:
 * - The disclosure is a Base UI `Collapsible.Trigger`, i.e. a real `<button>`
 *   carrying `aria-expanded`. Its accessible name is the concatenation of the
 *   section TITLE, the resolved-parameter summary and the authored/default
 *   badge — so `^title` anchors it while the badge stays readable through
 *   `toHaveAccessibleName`, which is what makes "authored" observable without
 *   reaching for a class name.
 * - The reset affordance renders only while the surface is authored, and is
 *   named `Reset to default <title>` (its `aria-labelledby` names its own
 *   label span AND the title span, so two sections' reset buttons can be told
 *   apart). The leading `^` above is what keeps the disclosure locator from
 *   also matching it.
 * - The codebook renders one disclosure per attribute, titled by the
 *   attribute's own name (`CodebookVariablesSynthetic`), which is why `title`
 *   is a parameter rather than a constant.
 */

/**
 * The section title every stage-level and panel-level surface uses. The
 * codebook titles each attribute's disclosure by the attribute's own name
 * instead, which is why every helper below takes `title` as a parameter.
 */
const SYNTHETIC_TITLE = 'Synthetic data';

export const AUTHORED_BADGE = 'Authored';
export const DEFAULT_BADGE = 'Default';

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The disclosure trigger of the synthetic surface inside `scope`. */
export function syntheticDisclosure(
  scope: Locator,
  title: string = SYNTHETIC_TITLE,
): Locator {
  return scope.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(title)}(\\s|$)`),
  });
}

/**
 * Open the disclosure and return its trigger. Idempotent — expansion is
 * disclosure, not authoring, so re-running this never changes the protocol.
 */
export async function expandSynthetic(
  scope: Locator,
  title: string = SYNTHETIC_TITLE,
): Promise<Locator> {
  const trigger = syntheticDisclosure(scope, title);
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return trigger;
}

/**
 * The "Reset to default" button for the surface inside `scope`. Absent (count
 * 0) while the surface carries nothing authored, which is itself an assertion
 * worth making.
 */
export function syntheticReset(
  scope: Locator,
  title: string = SYNTHETIC_TITLE,
): Locator {
  return scope.getByRole('button', {
    name: `Reset to default ${title}`,
    exact: true,
  });
}
