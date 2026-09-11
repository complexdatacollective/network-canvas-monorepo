import type { Page } from '@playwright/test';

import {
  asEntityAttributeReference,
  BIOLOGICAL_SEX_OPTIONS,
  type CurrentProtocol,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson } from '../../helpers/read-store.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

const SOURCE_STAGE_ID = 'family-pedigree-1';

// Unlike every other interface spec in this suite, the seeded protocol here
// already has ONE stage (the FamilyPedigree prerequisite) before this spec's
// own `editor.save()` adds a second — so `readStageJson(page, 0)` (Task 3's
// helper) can't be used unmodified: index 0 is truthy from the moment the
// protocol is seeded, long before the new stage's accepted commit actually
// lands, so polling on "is index 0 truthy" resolves immediately
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
    throw new Error('NarrativePedigree stage not found after commit poll');
  }
  return stage;
}

// NarrativePedigree's `sourceStageId` (`SourcePedigreeSection.tsx`) only
// lists the Family Pedigree stages the protocol already holds that run BEFORE
// this one, and its `diseases[].variable` picker (`DiseaseRow.tsx`) only
// offers boolean attributes of that source stage's `nodeConfig.type` which one
// of its nomination prompts actually records — both read from the protocol's
// existing stages and codebook, not anything authored inside this stage
// editor. Seed the prerequisite directly so this spec isolates
// NarrativePedigree instead of coupling it to a separate FamilyPedigree
// authoring flow. The codebook/stage shape below is a hand-typed twin of
// `packages/protocols/e2e/all-interfaces/protocol.json`'s validated
// `family-pedigree-1` stage and its referenced `person`/`family_edge` codebook
// entries (confirmed against that fixture, which Task 7's fixture-validation
// test already keeps schema-valid), including the boolean node variable
// (`hasConditionX`) the pedigree's nomination prompt records and this spec's
// disease binds. The prompt is not decoration: a Family Pedigree writes a
// member's disease boolean only through a nomination prompt, so a disease
// mapped to an attribute no prompt records draws an unmarked family, and the
// editor rule that keeps such attributes out of the disease picker needs the
// prompt here to offer `hasConditionX` at all.
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
        nominationPrompts: [
          {
            id: 'nomination-1',
            text: 'Who in your family has been diagnosed with condition X?',
            variable: asEntityAttributeReference('hasConditionX'),
          },
        ],
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
  // Created AFTER the seeded pedigree, not before it. A narrative pedigree may
  // only read a Family Pedigree that runs earlier in the interview
  // (`resolveSourceStages` in `sections/sourceStage.ts`, which reads the
  // position the host is about to insert at), so a stage created at index 0
  // runs before the only pedigree there is, is offered nothing, and has its
  // source control disabled with "No pedigree to read" beside it.
  await editor.createNew('NarrativePedigree', 1);
  await editor.setStageName('Family Health History');

  // `SourcePedigreeSection.tsx` owns `sourceStageId` through
  // `SourcePedigreePickerField`, which is a NATIVE select (fresco-ui's
  // `Select/Native`) labelled "Source stage" — so the choice is made with
  // `selectOption` rather than by opening a listbox.
  // The diseases section reads its node type from THIS field's live value, so
  // it must be set before the disease dialog's attribute picker has anything
  // to offer — hence selecting it first.
  //
  // Selected by VALUE (the source stage's own id, which the assertion below
  // reads back) rather than by the option's text: each option is labelled
  // "Stage {position} — {label}", and the position it counts for a stage that
  // PRECEDES the one being created is currently one too high (see the report
  // on `resolveSourceStages`), so matching the text would pin a number that is
  // wrong today and would have to change when it is fixed.
  await editor
    .field('sourceStageId')
    .getByRole('combobox', { name: 'Source stage' })
    .selectOption(SOURCE_STAGE_ID);

  // The `diseases` list is the package's shared row-dialog list
  // (`form/rowDialog.tsx`), the same one every prompt array in this suite
  // uses, so the add button is named for what it adds and addPrompt is told
  // which label to click.
  await addPrompt(
    editor.field('diseases'),
    async () => {
      // DiseaseRow.tsx's `label` field, which asks for the name the
      // participant reads in the pedigree's key.
      await architectPage
        .getByRole('textbox', { name: 'Disease name', exact: true })
        .fill('Condition X');

      // fresco-ui's ColorPicker over `NodeColorSequence` renders a radio group
      // of swatch buttons. The palette's colours are the study's own theme
      // colours and have no names of their own, so each swatch is named for
      // its position — "Color 1" is `node-color-seq-1`, which is what the
      // saved disease carries.
      await architectPage
        .getByRole('radio', { name: 'Color 1', exact: true })
        .click();

      // The attribute picker is deliberately pick-only: a disease READS an
      // attribute the source pedigree records, so there is no create
      // affordance beside it (DiseaseRow.tsx says so, and the picker's empty
      // message points at the pedigree's nomination prompts instead). It lists
      // only attributes a nomination prompt of the source stage records —
      // `hasConditionX`, seeded above — as a native select.
      await architectPage
        .getByRole('combobox', { name: 'Affected-status attribute' })
        .selectOption('hasConditionX');

      // "Inheritance pattern" is a native select whose options are written out
      // per pattern rather than derived from the schema token, so
      // 'autosomalDominant' reads "Autosomal dominant".
      await architectPage
        .getByRole('combobox', { name: 'Inheritance pattern' })
        .selectOption({ label: 'Autosomal dominant' });
    },
    { addButtonLabel: 'Create new disease' },
  );

  // `showAtRiskStatuses` starts `false` from the interface's own template
  // (`interfaces/templates.ts`) and is optional/boolean in the schema — the
  // "At-risk statuses" switch is deliberately left untouched.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readNarrativePedigreeStage(architectPage);
  expect(stage.type).toBe('NarrativePedigree');
  expect(stage.sourceStageId).toBe(SOURCE_STAGE_ID);

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'narrative-pedigree-stage.json',
  );
});
