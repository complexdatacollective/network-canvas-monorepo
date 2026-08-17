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
// - Destination is a native select named 'When this stage is skipped'. 'End
//   the interview' parses to `{type:'finish'}`; the untouched default ('Next
//   available stage') parses to undefined so no `destination` key is ever
//   written (SkipLogicDestinationField.tsx parseSkipLogicDestination).
// - With 2+ rules the 'Must match' radios appear and a join is required
//   (ruleValidator blocks save until picked).
export async function configureSkipLogic(
  editor: StageEditor,
  _page: Page,
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
    await section
      .getByRole('combobox', { name: 'When this stage is skipped' })
      .selectOption({ label: opts.destination });
  }
}
