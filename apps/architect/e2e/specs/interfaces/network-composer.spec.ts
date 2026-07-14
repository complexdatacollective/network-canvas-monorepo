import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { createVariableViaSpotlight } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid NetworkComposer stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NetworkComposer');
  await editor.setStageName('Build Your Network');

  // StageEditor/Interfaces.tsx: `NetworkComposer.sections = [NodeType,
  // NodeConfiguration, EdgeConfiguration, Background, SkipLogic,
  // InterviewScript]` — the plain `NodeType`, not `FilteredNodeType`.
  await selectOrCreateNodeType(architectPage, 'person');

  // NodeConfiguration.tsx renders THREE `VariablePicker`s inside one always-
  // visible `Section` (no per-subsection toggle/collapse): "Quick add
  // variable" (`quickAdd`), "Node positions" (`layoutVariable`), and "Group
  // hulls" (`convexHullVariable`) — all showing the picker's unselected-state
  // "Select variable" button simultaneously once `subject.type` is set
  // (`withDisabledSubjectRequired`'s `Section disabled` unmounts children
  // entirely while disabled — confirmed in Section.tsx's `fieldsetContent`,
  // so nothing renders before this point either). An unscoped
  // `createVariableViaSpotlight` would hit all three "Select variable"
  // buttons and throw a Playwright strict-mode violation — this is the first
  // spec in the suite to exercise a section with more than one simultaneous
  // `VariablePicker`. Fixed by giving `createVariableViaSpotlight` an
  // optional `scope` (a `Locator`, e.g. `editor.field(name)` — the
  // `data-field-name` seam, Task 2) that scopes only the initial trigger
  // click; the spotlight dialog itself is a page-level portal, so the rest of
  // the flow still resolves against the page (see variables.ts's own
  // comment).
  await createVariableViaSpotlight(architectPage, {
    variableName: 'name',
    scope: editor.field('quickAdd'),
  });

  // `layoutVariable`'s `onCreateOption` wires directly to
  // `handleCreateVariable(value, 'layout', 'layoutVariable')`
  // (withCreateVariableHandler.tsx) — a direct `createVariableAsync` dispatch
  // with `configuration.type: 'layout'` pre-supplied by the call site, not
  // the NewVariableWindow/enabled-combobox path (unlike "Group hull
  // variable", which this spec deliberately leaves untouched: it's optional
  // per `networkComposerStage`'s zod schema and its `onCreateOption` DOES
  // open `NewVariableWindow` with a pre-locked `type: 'categorical'` — out of
  // scope here).
  await createVariableViaSpotlight(architectPage, {
    variableName: 'layout',
    scope: editor.field('layoutVariable'),
  });

  // Background.tsx: `allowsBackgroundImage('NetworkComposer')` is true, but
  // `useImage` again defaults to `false` (see sociogram.spec.ts), so the
  // concentric-circles number input (role "spinbutton") renders by default.
  await editor
    .field('background.concentricCircles')
    .getByRole('spinbutton')
    .fill('4');

  // EdgeConfiguration.tsx is `required={false}` and `edges` is optional per
  // `networkComposerStage`'s zod schema (the editor's `prune` strips an empty
  // `edges` array on save) — deliberately left untouched, same reasoning as
  // "Group hulls" above.
  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('NetworkComposer');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'network-composer-stage.json',
  );
});
