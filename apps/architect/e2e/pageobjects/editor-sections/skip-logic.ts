import { type Page } from '@playwright/test';

import { type StageEditor } from '../stage-editor.js';
import {
  addSkipLogicRule,
  assertJoinMatchesRules,
  chooseJoin,
  type RuleSpec,
} from './rule-builder.js';

// SkipLogic section (sections/SkipLogic.tsx, `Section title="Skip Logic"`,
// toggleable, collapsed on a fresh stage, never subject-gated). Facts
// verified against source:
// - Toggling ON writes nothing; the action radios ('Show this stage' /
//   'Skip this stage') live under data-field-name="skipLogic.action"
//   (SkipLogicFields.tsx).
// - The rules UI is the shared Query primitive with `type="query"` (ego
//   rules available); it has NO data-field-name seam — everything is scoped
//   through the section.
// - Destination is a Base UI Select (combobox 'When this stage is skipped',
//   options portal to page level — NOT selectOption). 'End the interview'
//   parses to `{type:'finish'}`; the untouched default ('Next available
//   stage') parses to undefined so no `destination` key is ever written
//   (SkipLogicDestinationField.tsx parseSkipLogicDestination).
// - With 2+ rules the 'Must match' radios appear and a join is required
//   (ruleValidator blocks save until picked).
export async function configureSkipLogic(
  editor: StageEditor,
  page: Page,
  opts: {
    action: 'Skip this stage' | 'Show this stage';
    rules: RuleSpec[];
    join?: 'All rules' | 'Any rule';
    destination?: 'End the interview';
  },
): Promise<void> {
  assertJoinMatchesRules(opts.rules, opts.join);
  const section = editor.section('Skip Logic');
  await section.getByRole('switch', { name: 'Skip Logic' }).click();
  await editor
    .field('skipLogic.action')
    .getByRole('radio', { name: opts.action, exact: true })
    .click();
  for (const rule of opts.rules) {
    await addSkipLogicRule(section, rule);
  }
  if (opts.join) {
    await chooseJoin(section, opts.join);
  }
  if (opts.destination) {
    // The Base UI select trigger renders with NO accessible name (verified
    // live: the 'When this stage is skipped' label is a sibling node, not
    // wired to the trigger), and it is the only combobox inside the Skip
    // Logic section once the rule dialog has closed.
    await section.getByRole('combobox').click();
    await page
      .getByRole('option', { name: opts.destination, exact: true })
      .click();
  }
}
