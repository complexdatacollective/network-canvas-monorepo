import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  selectOrCreateEdgeType,
  selectOrCreateNodeType,
} from '../../pageobjects/editor-sections/entity-types.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
} from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

test('creates a valid FamilyPedigree stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('FamilyPedigree');
  await editor.setStageName('Your Family');

  // StageEditor/Interfaces.tsx: `FamilyPedigree.sections = [FramingConfig,
  // BoundaryOptions, IntroScreen, FamilyPedigreeNodeConfiguration,
  // FamilyPedigreeEdgeConfiguration, CensusPrompt, NominationPrompts,
  // SkipLogic, InterviewScript]`, and the interface's `template` (Interfaces.tsx)
  // pre-seeds `framing: {mode:'fixed', value:'gamete'}`,
  // `boundaries: {requireGrandparents:'off', requireChildrenContributors:'off'}`,
  // and a one-item `introScreen` — all already schema-valid, so
  // FramingConfig/BoundaryOptions/IntroScreen are deliberately left untouched
  // here (same reasoning as NetworkComposer's optional Group-hulls/Edge
  // Configuration sections).
  await selectOrCreateNodeType(architectPage, 'person');

  // NodeConfiguration.tsx renders FOUR `VariablePicker`s (nodeLabelVariable/
  // egoVariable/relationshipVariable/biologicalSexVariable) simultaneously
  // inside one always-visible surface once `nodeConfig.type` is set — the
  // same multi-picker shape NetworkComposer's NodeConfiguration.tsx already
  // forced `createVariableViaSpotlight`'s `scope` option to handle (Task 19's
  // network-composer.spec.ts). Each picker IS wrapped through
  // `VariablePicker`'s own internal `FrescoReduxField`, so
  // `editor.field(name)` resolves it correctly for scoping even though the
  // row itself is hand-rolled JSX (`VariableRow`), not a bare
  // `FrescoReduxField` call site.
  //
  // Every one of the 4 node + 4 edge variables below routes through
  // NodeConfiguration.tsx's/EdgeConfiguration.tsx's own `handleNewXxxVariable`
  // callbacks, which ALL call `openVariableWindow` unconditionally (unlike
  // NetworkComposer's quick-add/layout, which use the "simple creation"
  // path) — so EVERY variable here opens NewVariableWindow, regardless of
  // whether its locked type is text/boolean/categorical:
  //   - text (`nodeLabelVariable`, `relationshipVariable`) and boolean
  //     (`egoVariable`, `isActiveVariable`, `isGestationalCarrierVariable`)
  //     variables set `initialValues.type` (text/boolean) with no
  //     `lockedOptions` — NewVariableWindow.tsx disables "Variable type"
  //     whenever `initialValues?.type` is set, and neither type is
  //     ordinal/categorical, so the Options subsection never renders at all.
  //   - categorical variables (`biologicalSexVariable`, matching
  //     `BIOLOGICAL_SEX_OPTIONS`; `relationshipTypeVariable`, matching
  //     `RELATIONSHIP_TYPE_OPTIONS`; `gameteRoleVariable`, matching
  //     `GAMETE_ROLE_OPTIONS`) additionally pass `lockedOptions` —
  //     NewVariableWindow.tsx disables "Variable type" for the same reason AND
  //     merges `lockedOptions` into the form's initial `options`, rendering
  //     `<LockedOptions>` (a read-only display, no "Add new" button) instead
  //     of the editable `<Options>` editor.
  // In both cases the "Variable type" combobox ends up disabled and no
  // interactive Options editor renders, so `createVariableWithOptions`'s
  // existing `isEnabled()` branch and its empty-`options`-array no-op loop
  // already do exactly the right thing for all 8 variables uniformly — live
  // verification found no helper fix needed here.
  await createVariableViaSpotlight(architectPage, {
    variableName: 'name',
    scope: editor.field('nodeConfig.nodeLabelVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'name',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'is_ego',
    scope: editor.field('nodeConfig.egoVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'is_ego',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'relationship_to_ego',
    scope: editor.field('nodeConfig.relationshipVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'relationship_to_ego',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'biologicalSex',
    scope: editor.field('nodeConfig.biologicalSexVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'biologicalSex',
    options: [],
  });

  await selectOrCreateEdgeType(architectPage, 'family_edge');

  await createVariableViaSpotlight(architectPage, {
    variableName: 'relationshipType',
    scope: editor.field('edgeConfig.relationshipTypeVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'relationshipType',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'isActive',
    scope: editor.field('edgeConfig.isActiveVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'isActive',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'isGestationalCarrier',
    scope: editor.field('edgeConfig.isGestationalCarrierVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'isGestationalCarrier',
    options: [],
  });

  await createVariableViaSpotlight(architectPage, {
    variableName: 'gameteRole',
    scope: editor.field('edgeConfig.gameteRoleVariable'),
  });
  await createVariableWithOptions(architectPage, {
    variableName: 'gameteRole',
    options: [],
  });

  // CensusPrompt.tsx: `Section title="Census Prompt"`, a single RichText
  // field labelled "Prompt for building the family pedigree" (labelHidden).
  await editor.fillRichText(
    'Prompt for building the family pedigree',
    'Who is in your family?',
  );

  // NominationPrompts.tsx's `nominationPrompts` array is optional
  // (`familyPedigreeStage`'s zod schema) and deliberately left untouched.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('FamilyPedigree');
  expect(stageSnapshotJson(stage)).toMatchSnapshot(
    'family-pedigree-stage.json',
  );
});
