import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// KNOWN APP BUG, worked around below — NarrativePresets/withPresetProps.tsx's
// `handleCreateLayoutVariable` (wired to the "Layout Variable" `VariablePicker`'s
// `onCreateOption`) destructures `dispatch` straight from its own props:
//
//   handleCreateLayoutVariable:
//     ({ form, changeForm, createVariable, dispatch, entity, type }) =>
//     async (name) => {
//       const result = await dispatch(createVariable({ ... })).unwrap();
//       ...
//
// but this component's `connect(mapStateToProps, mapDispatchToProps)` passes
// `mapDispatchToProps` as a plain OBJECT (`{ createVariable: ..., deleteVariable:
// ..., changeForm: change }`), not a function — react-redux's object shorthand
// wraps each entry with `bindActionCreators(mapDispatchToProps, dispatch)` and
// deliberately does NOT also inject a raw `dispatch` prop (that only happens
// when `mapDispatchToProps` is omitted entirely, or a function form explicitly
// returns one). So `dispatch` here is always `undefined`, and every attempt to
// CREATE a new layout variable from a Narrative preset throws `TypeError:
// dispatch is not a function` inside an unhandled promise rejection — silently,
// with no chance for `changeForm(form, 'layoutVariable', variable)` to ever run.
// The dialog's own "Layout Variable" field is correctly left blank + `Required`
// (no corrupted data — this is a broken/unusable feature, not a data-integrity
// bug), but "Add" can never succeed for a *brand-new* layout variable.
//
// Reproduced deterministically, twice: once against the production build via
// `page.on('pageerror')` (minified: "r is not a function"), and again against
// the unminified Vite dev server (unminified stack trace resolves to
// `withPresetProps.tsx:29`, `const result = await dispatch(createVariable(...`)
// — driven live via the browser MCP + `getBoundingClientRect`/native-value-setter
// DOM calls rather than trusted from source reading alone. Confirmed this is
// isolated to `NarrativePresets/withPresetProps.tsx`'s old-style class-component
// `connect + withHandlers` pattern: every other canvas-family layout-variable
// creation path in this suite (Sociogram's prompt "Layout" section,
// NetworkComposer's NodeConfiguration) instead goes through
// `withCreateVariableHandler.tsx`, which gets `dispatch` correctly via the
// `useAppDispatch()` hook — so those two ARE the "simple creation path"
// (`createVariableViaSpotlight` unmodified) and are exercised as such in
// sociogram.spec.ts / network-composer.spec.ts.
//
// Not app-fixed here, per this task's "flag, don't silently app-fix" instruction
// — this is a two-line production fix (thread a real `dispatch` prop through,
// or switch to the hook-based handler like the other two interfaces already
// do), but out of scope for an e2e-authoring task. Worked around at the TEST
// level in a way that mirrors a real author action: SociogramPrompts'
// PromptFieldsLayout.tsx's own UI copy encourages reusing one shared layout
// variable across multiple canvas-family stages/prompts ("If you use the same
// layout variable across all prompts, the position of nodes will be
// automatically set..."), so a protocol already having a `layout`-type variable
// defined for the `person` node type before a Narrative preset needs one is a
// completely ordinary starting state — not a test-only fiction. The seeded
// variable is only ever SELECTED here (the spotlight's non-"create" list-item
// path, which never touches `handleCreateLayoutVariable`), never created.
function protocolWithPersonLayoutVariable(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      node: {
        // uuid-shaped so `normalize-stage.ts`'s `UUID_RE` placeholder-maps
        // these the same way live-created ids would be.
        '11111111-1111-4111-8111-111111111111': {
          name: 'person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            '22222222-2222-4222-8222-222222222222': {
              name: 'layout',
              type: 'layout',
            },
          },
        },
      },
    },
  };
}

test('creates a valid Narrative stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithPersonLayoutVariable());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('Narrative');
  await editor.setStageName('Explore Your Network');

  // StageEditor/Interfaces.tsx: `Narrative.sections = [FilteredNodeType,
  // Background, NarrativePresets, NarrativeBehaviours, SkipLogic,
  // InterviewScript]`. `selectOrCreateEntityType` (entity-types.ts) SELECTS
  // the seeded "person" type (its radio already exists) rather than creating
  // a second one — real authors reuse an existing node type across stages
  // just as readily as they reuse a layout variable.
  await selectOrCreateNodeType(architectPage, 'person');

  // Background.tsx: `allowsBackgroundImage('Narrative')` is the one `false`
  // case (the schema's Narrative `background` object has no `image` key at
  // all) — the image-type toggle never renders, so the concentric-circles
  // number input (role "spinbutton") is the section's only field either way.
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // NarrativePresets.tsx, `Section title="Narrative Presets"` — the same
  // DialogArrayField shape as every other prompts/presets array in this
  // suite ("Create new" opens the dialog, "Add" submits a new item).
  // PresetFields.tsx renders "Preset Label" first: a plain `FrescoReduxField`
  // text input (`name="label"`) with `labelHidden` and a real `placeholder`,
  // located directly rather than by (hidden) accessible name. Its "Layout
  // Variable" section follows; "Group Variable"/"Display Edges"/"Highlight
  // Node Attributes" are all `toggleable` and collapsed by default, so the
  // Layout Variable `VariablePicker` is the only "Select variable" button
  // visible — no `scope` needed, unlike NetworkComposer's NodeConfiguration.
  //
  // The picker's options list (`layoutVariablesForSubject`,
  // NarrativePresets/selectors.ts's `getNarrativeVariables`) already contains
  // the seeded "layout" variable, so typing its exact name leaves
  // `hasExactFilterMatch` true and VariableSpotlight never renders a "Create
  // new variable called…" row at all — only the existing variable's own
  // `spotlight-list-item`, which this clicks. That routes through
  // `VariablePickerControl.handleSelectVariable` -> the field's own
  // `onChange`, never through the broken `handleCreateLayoutVariable` above.
  await addPrompt(editor.section('Narrative Presets'), async () => {
    await architectPage
      .getByPlaceholder('Enter a label for the preset...')
      .fill('Default view');

    await architectPage
      .getByRole('button', { name: 'Select variable' })
      .click();
    const search = architectPage.getByRole('searchbox', {
      name: 'Find or create a variable',
    });
    await search.fill('layout');
    await architectPage
      .getByTestId('spotlight-list-item')
      .filter({ hasText: 'layout' })
      .first()
      .click();
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('Narrative');
  expect(stageSnapshotJson(stage)).toMatchSnapshot('narrative-stage.json');
});
