import { expect, test } from '../fixtures/architect-test.js';
import { loadAllInterfacesFixture } from '../helpers/load-fixture.js';
import { configureSkipLogic } from '../pageobjects/editor-sections/skip-logic.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

/**
 * #1399: a skip-logic rule card was a `<button>` containing another
 * `<button>` (the entity chip) and a handful of `<div>`s, which is invalid
 * HTML and gave assistive technology a second, dead target inside the real
 * one. Every card was also named "Edit rule", and every delete control
 * "Delete rule".
 *
 * These assertions live here rather than only in vitest because the two
 * things that were broken depend on a real browser: the accessible name of
 * the card is computed by the browser from the rule's own sentence — spacing
 * included, which jsdom cannot decide without a stylesheet — and the names are
 * assembled through `aria-labelledby` references to hidden elements, a rule
 * of the accessible-name algorithm rather than of the DOM.
 */

const FLAGGED_RULE =
  'person where boolean variable flagged is exactly equal to true';
const HIGHLIGHTED_RULE =
  'person where boolean variable highlighted is exactly equal to true';

test('skip-logic rule cards carry valid, distinct semantics', async ({
  architectPage,
  seed,
}) => {
  const { protocol, assets } = loadAllInterfacesFixture();
  await seed(protocol, { name: 'All Interfaces', assets });

  const editor = new StageEditor(architectPage);
  await editor.createNew('Information');
  await editor.setStageName('Skippable Screen');

  await configureSkipLogic(editor, architectPage, {
    action: 'Skip this stage',
    rules: [
      {
        kind: 'alterBooleanAttribute',
        nodeTypeName: 'person',
        variableName: 'flagged',
        value: true,
      },
      {
        kind: 'alterBooleanAttribute',
        nodeTypeName: 'person',
        variableName: 'highlighted',
        value: true,
      },
    ],
    join: 'Any rule',
  });

  const section = editor.section('Skip Logic');
  const rules = section.getByRole('group', { name: 'Rules' });

  // The rule builder is a named, required region — the visible "Rules *"
  // label used to point at nothing at all.
  await expect(rules).toHaveAttribute('aria-required', 'true');
  await expect(rules.getByRole('list').getByRole('listitem')).toHaveCount(2);

  for (const sentence of [FLAGGED_RULE, HIGHLIGHTED_RULE]) {
    await expect(
      section.getByRole('button', {
        name: `Edit rule: ${sentence}`,
        exact: true,
      }),
    ).toHaveCount(1);
    await expect(
      section.getByRole('button', {
        name: `Delete rule: ${sentence}`,
        exact: true,
      }),
    ).toHaveCount(1);
  }

  // `<button>` takes phrasing content and never another control.
  const card = section.getByRole('button', {
    name: `Edit rule: ${FLAGGED_RULE}`,
    exact: true,
  });
  expect(
    await card.evaluate((element) => ({
      controls: element.querySelectorAll(
        'button, a, input, select, textarea, [tabindex]',
      ).length,
      flow: element.querySelectorAll('div, p, fieldset, ul, ol, li').length,
    })),
  ).toEqual({ controls: 0, flow: 0 });

  // The field's `<label for>` resolves to the group it names.
  expect(
    await editor.field('skipLogic.filter').evaluate((element) => {
      const label = element.querySelector('label');
      const target = label && document.getElementById(label.htmlFor);
      return target?.getAttribute('role') ?? null;
    }),
  ).toBe('group');
});
