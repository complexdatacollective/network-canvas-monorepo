import type { Page } from '@playwright/test';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { asEntityAttributeReference } from '@codaco/protocol-validation';
import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson } from '../../helpers/read-store.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { createVariableViaSpotlight } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

const SOURCE_STAGE_ID = 'family-pedigree-1';

// Unlike every other interface spec in this suite, the seeded protocol here
// already has ONE stage (the FamilyPedigree prerequisite) before this spec's
// own `editor.save()` adds a second — so `readStageJson(page, 0)` (Task 3's
// helper) can't be used unmodified: index 0 is truthy from the moment the
// protocol is seeded, long before the new stage's debounced autosave write
// actually lands, so polling on "is index 0 truthy" resolves immediately
// against the STALE pre-save row instead of waiting for the real one (caught
// live: the assertion below failed with the seeded FamilyPedigree stage's
// `type`, not a timeout). Polling until a stage with the expected `type`
// appears anywhere in the array is race-free regardless of which index the
// app inserts at.
type NarrativePedigreeStage = Extract<
  CurrentProtocol['stages'][number],
  { type: 'NarrativePedigree' }
>;

async function readNarrativePedigreeStage(
  page: Page,
): Promise<NarrativePedigreeStage> {
  let stage: NarrativePedigreeStage | undefined;
  await expect
    .poll(
      async () => {
        const protocol = await readProtocolJson(page);
        stage = protocol.stages.find(
          (candidate): candidate is NarrativePedigreeStage =>
            candidate.type === 'NarrativePedigree',
        );
        return stage ? 'ready' : 'pending';
      },
      { timeout: 5_000 },
    )
    .toBe('ready');
  if (!stage) {
    throw new Error('NarrativePedigree stage not found after autosave poll');
  }
  return stage;
}

// NarrativePedigree's `sourceStageId` (SourceStage.tsx) only lists stages
// already present in the live redux store (`getStageList(state).filter(...
// type === 'FamilyPedigree')`), and its `diseases[].variable` picker
// (DiseaseFields.tsx) only offers boolean variables belonging to that source
// stage's `nodeConfig.type` — both read from the SEEDED protocol's `stages`/
// `codebook`, not anything this spec authors live. `seed.ts`'s
// `page.addInitScript` re-stamps the seeded sessionStorage snapshot on every
// navigation (documented in tie-strength-census.spec.ts), so a source stage
// authored live via a first `editor.createNew('FamilyPedigree')` /
// `editor.save()` round trip would NOT survive the subsequent
// `editor.createNew('NarrativePedigree')` navigation — it has to be seeded
// directly, mirroring `protocolWithCloseEdgeType` in tie-strength-census.spec.ts.
// The codebook/stage shape below is a hand-typed twin of
// `packages/protocols/e2e/all-interfaces/protocol.json`'s validated
// `family-pedigree-1` stage and its referenced `person`/`family_edge` codebook
// entries (confirmed against that fixture, which Task 7's fixture-validation
// test already keeps schema-valid), plus one extra boolean node variable
// (`hasConditionX`) for this spec's own disease binding.
//
// `nodeConfig`/`edgeConfig`'s variable-reference fields are
// `entityAttributeReference`-branded strings (`FamilyPedigreeNodeConfigSchema`
// et al.) — a bare string literal fails typecheck, and per this repo's rules
// a manual `as` cast is not an acceptable way around that. `@codaco/
// protocol-validation`'s exported `asEntityAttributeReference` is the
// library's own sanctioned constructor for the branded type (the cast lives
// inside the library, not here), matching how e.g.
// `packages/interview/src/interfaces/NarrativePedigree/components/
// NarrativePedigreeView.stories.tsx` already builds pedigree fixtures.
function protocolWithFamilyPedigreeStage(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text' },
            is_ego: { name: 'is_ego', type: 'boolean' },
            relationship_to_ego: { name: 'relationship_to_ego', type: 'text' },
            biologicalSex: {
              name: 'biologicalSex',
              type: 'categorical',
              options: BIOLOGICAL_SEX_OPTIONS,
              readOnly: true,
            },
            hasConditionX: { name: 'hasConditionX', type: 'boolean' },
          },
        },
      },
      edge: {
        family_edge: {
          name: 'family_edge',
          color: 'edge-color-seq-1',
          variables: {
            relationshipType: {
              name: 'relationshipType',
              type: 'categorical',
              options: RELATIONSHIP_TYPE_OPTIONS,
              readOnly: true,
            },
            isActive: { name: 'isActive', type: 'boolean' },
            isGestationalCarrier: {
              name: 'isGestationalCarrier',
              type: 'boolean',
            },
            gameteRole: {
              name: 'gameteRole',
              type: 'categorical',
              options: GAMETE_ROLE_OPTIONS,
              readOnly: true,
            },
          },
        },
      },
    },
    stages: [
      {
        id: SOURCE_STAGE_ID,
        type: 'FamilyPedigree',
        label: 'Family Pedigree',
        nodeConfig: {
          type: 'person',
          nodeLabelVariable: asEntityAttributeReference('name'),
          egoVariable: asEntityAttributeReference('is_ego'),
          relationshipVariable: asEntityAttributeReference(
            'relationship_to_ego',
          ),
          biologicalSexVariable: asEntityAttributeReference('biologicalSex'),
        },
        edgeConfig: {
          type: 'family_edge',
          relationshipTypeVariable:
            asEntityAttributeReference('relationshipType'),
          isActiveVariable: asEntityAttributeReference('isActive'),
          isGestationalCarrierVariable: asEntityAttributeReference(
            'isGestationalCarrier',
          ),
          gameteRoleVariable: asEntityAttributeReference('gameteRole'),
        },
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        censusPrompt: 'Who is in your family?',
      },
    ],
  };
}

test('creates a valid NarrativePedigree stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithFamilyPedigreeStage());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('NarrativePedigree');
  await editor.setStageName('Family Health History');

  // SourceStage.tsx: `Field name="sourceStageId" ... fieldComponent={
  // FrescoStyledSelectField} label="Family Pedigree stage"` — a Base UI
  // Select combobox (same "combobox" trigger role + "option" item role
  // pattern `createVariableWithOptions` already exercises for "Variable
  // type"), listing only the seeded FamilyPedigree stage by its `label`.
  // Diseases.tsx reads `nodeType` from THIS field's live value (via
  // `getStage(state, sourceStageId)`), so it must be set before the disease
  // dialog's variable picker has anything to offer — hence selecting it
  // first, as the task brief specifies.
  await editor
    .field('sourceStageId')
    .getByRole('combobox', { name: 'Family Pedigree stage' })
    .click();
  await architectPage.getByRole('option', { name: 'Family Pedigree' }).click();

  // Diseases.tsx wraps its `diseases` array in the same DialogArrayField
  // pattern every other prompt-array section in this suite uses (addPrompt's
  // "Create new"/"Add" contract), even though the section is titled
  // "Diseases" rather than "Prompts".
  await addPrompt(editor.section('Diseases'), async () => {
    // DiseaseFields.tsx: "Disease label" (labelHidden InputField).
    await architectPage
      .getByRole('textbox', { name: 'Disease label' })
      .fill('Condition X');

    // ColorPicker (`palette: 'node-color-seq'`, `paletteRange: 10`) renders a
    // Base UI RadioGroup of 10 swatch buttons, each `role="radio"` with
    // `aria-label` `node-color-seq-{n}` (ColorPicker.tsx's `asColorOption`) —
    // same Base UI Radio primitive already confirmed for
    // EntitySelectField's node/edge-type pills. Any swatch is a valid,
    // non-empty color; picking the first keeps this deterministic.
    await architectPage.getByRole('radio').first().click();

    // DiseaseFields.tsx's "variable" VariablePicker passes NO
    // `onCreateOption` (unlike every other variable picker in this suite),
    // so its `onCreateOption` no-ops — this is a genuinely pick-only picker,
    // as the task brief specifies. `createVariableViaSpotlight` still works
    // unmodified: searching the EXACT existing variable name
    // (`hasConditionX`, seeded above on the source stage's node type) means
    // VariableSpotlight's "Create new variable called…" row never appears
    // (an exact match exists), so the helper's fallback branch
    // (`search.press('Enter')`, selecting the single filtered match) fires
    // instead of ever attempting to create anything.
    await createVariableViaSpotlight(architectPage, {
      variableName: 'hasConditionX',
    });

    // "Inheritance pattern" (labelHidden FrescoStyledSelectField) — options
    // are `startCase(INHERITANCE_PATTERNS[n])`; 'autosomalDominant' ->
    // "Autosomal Dominant".
    await architectPage
      .getByRole('combobox', { name: 'Inheritance pattern' })
      .click();
    await architectPage
      .getByRole('option', { name: 'Autosomal Dominant' })
      .click();
  });

  // AtRiskStatuses.tsx's `showAtRiskStatuses` toggle defaults to `false` via
  // the interface's own `template` (Interfaces.tsx) and is optional/boolean
  // in the schema — deliberately left untouched.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readNarrativePedigreeStage(architectPage);
  expect(stage.type).toBe('NarrativePedigree');
  expect(stage.sourceStageId).toBe(SOURCE_STAGE_ID);

  expect(stageSnapshotJson(stage)).toMatchSnapshot(
    'narrative-pedigree-stage.json',
  );
});
