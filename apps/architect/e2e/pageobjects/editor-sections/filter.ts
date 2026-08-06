import { type StageEditor } from '../stage-editor.js';
import { addRule, chooseJoin, type RuleSpec } from './rule-builder.js';

// Stage-level network filter (sections/Filter.tsx, `Section title="Filter"`,
// toggleable, collapsed on a fresh stage). Rendered NESTED inside the
// "Node Type" section by FilteredNodeType (NodeType.tsx `withFilter`), but
// `[data-name="Filter"]` is globally unique on the sample-protocol stage
// types, so `editor.section('Filter')` resolves it directly. The rules UI is
// the shared Query primitive with `type="filter"` — no ego rules here.
// Toggling ON writes nothing; a single-rule filter writes no `join` key.
//
// ORDER: the subject (Node Type) must be selected BEFORE configuring the
// filter — changing the subject afterwards resets `filter` (and `skipLogic`)
// via useResetStageOnSubjectChange.
export async function configureStageFilter(
  editor: StageEditor,
  opts: { rules: RuleSpec[]; join?: 'All rules' | 'Any rule' },
): Promise<void> {
  const section = editor.section('Filter');
  await section
    .getByRole('switch', { name: 'Turn this feature on or off' })
    .click();
  for (const rule of opts.rules) {
    await addRule(section, rule);
  }
  if (opts.join) {
    await chooseJoin(section, opts.join);
  }
}
