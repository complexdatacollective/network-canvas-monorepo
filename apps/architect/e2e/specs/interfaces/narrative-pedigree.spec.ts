import type { Page } from '@playwright/test';

import {
  asEntityAttributeReference,
  type CurrentProtocol,
  PEDIGREE_RELATIONSHIP_KIND_OPTIONS,
  PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readProtocolJson } from '../../helpers/read-store.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import { chooseAttribute } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

const SOURCE_STAGE_ID = 'family-pedigree-1';

// Unlike every other interface spec in this suite, the seeded protocol here
// already has ONE stage (the FamilyPedigree prerequisite) before this spec's
// own `editor.save()` adds a second — so polling on "is index 0 truthy" would
// resolve immediately against the seeded pedigree rather than wait for the
// saved stage. Polling until a stage with the expected `type` appears
// anywhere in the array is race-free regardless of which index the app
// inserts at.
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

// A narrative pedigree's `sourceStageId` lists only the Family Pedigree
// stages that run BEFORE it, and its `diseases[].attribute` picker offers only
// boolean attributes of that pedigree's people (its stage subject) which one
// of its nomination prompts records — both read from the protocol's existing
// stages and codebook, not from anything authored inside this stage editor.
// Seed the prerequisite directly so this spec isolates NarrativePedigree. The
// shape is a hand-typed twin of `packages/protocols/e2e/all-interfaces/
// protocol.json`'s `family-pedigree-1` stage and the codebook entries it
// names, including the boolean `hasConditionX` its nomination prompt records
// and this spec's disease reads.
//
// Attribute references are `entityAttributeReference`-branded strings, so
// they are built with the library's own `asEntityAttributeReference` rather
// than cast here. The interface-owned option sets carry plain-string labels;
// a protocol's codebook localizes them.
const localizedOptions = (
  options: readonly { value: string; label: string }[],
) => options.map(({ value, label }) => ({ value, label: { en: label } }));

function protocolWithFamilyPedigreeStage(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      node: {
        person: {
          name: 'person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', label: 'Name', type: 'text' },
            is_ego: { name: 'is_ego', label: 'Is ego', type: 'boolean' },
            sexAssignedAtBirth: {
              name: 'sexAssignedAtBirth',
              label: 'Sex assigned at birth',
              type: 'categorical',
              options: localizedOptions(PEDIGREE_SEX_ASSIGNED_AT_BIRTH_OPTIONS),
            },
            hasConditionX: {
              name: 'hasConditionX',
              label: 'Has condition X',
              type: 'boolean',
            },
          },
        },
      },
      edge: {
        family_edge: {
          name: 'family_edge',
          label: { en: 'Family edge' },
          color: 'edge-color-seq-1',
          variables: {
            relationshipKind: {
              name: 'relationshipKind',
              label: 'Relationship kind',
              type: 'categorical',
              options: localizedOptions(PEDIGREE_RELATIONSHIP_KIND_OPTIONS),
            },
            isGestationalCarrier: {
              name: 'isGestationalCarrier',
              label: 'Is gestational carrier',
              type: 'boolean',
            },
            isCurrentPartner: {
              name: 'isCurrentPartner',
              label: 'Is current partner',
              type: 'boolean',
            },
          },
        },
      },
    },
    stages: [
      {
        id: SOURCE_STAGE_ID,
        type: 'FamilyPedigree',
        label: { en: 'Family Pedigree' },
        subject: { entity: 'node', type: 'person' },
        prompt: { en: 'Who is in your family?' },
        nodeConfiguration: {
          nameAttribute: asEntityAttributeReference('name'),
          nameField: { prompt: { en: 'Name (optional)' } },
          sexAssignedAtBirthAttribute:
            asEntityAttributeReference('sexAssignedAtBirth'),
          egoAttribute: asEntityAttributeReference('is_ego'),
        },
        edgeConfiguration: {
          type: 'family_edge',
          kindAttribute: asEntityAttributeReference('relationshipKind'),
          gestationalCarrierAttribute: asEntityAttributeReference(
            'isGestationalCarrier',
          ),
          currentPartnerAttribute:
            asEntityAttributeReference('isCurrentPartner'),
        },
        nominationPrompts: [
          {
            id: 'nomination-1',
            text: {
              en: 'Who in your family has been diagnosed with condition X?',
            },
            attribute: asEntityAttributeReference('hasConditionX'),
          },
        ],
      },
      ...emptyProtocol().stages,
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
  // only read a Family Pedigree that runs earlier in the interview, so a
  // stage created at index 0 is offered nothing.
  await editor.createNew('NarrativePedigree', 1);
  await editor.setStageName('Family Health History');

  // `sourceStageId` is a native select labelled "Source stage", so the choice
  // is made with `selectOption`. The diseases section reads its people's type
  // from this field's live value, so it is set before the disease dialog's
  // attribute picker has anything to offer. Selected by value (the source
  // stage's own id, which the assertion below reads back) rather than by its
  // "Stage {position} — {label}" text.
  await editor
    .field('sourceStageId')
    .getByRole('combobox', { name: 'Source stage' })
    .selectOption(SOURCE_STAGE_ID);

  await addPrompt(
    editor.field('diseases'),
    async () => {
      await architectPage
        .getByRole('textbox', { name: 'Disease label', exact: true })
        .fill('Condition X');

      // "Neon Coral" is `node-color-seq-1`, which the saved disease carries.
      await architectPage
        .getByRole('radio', { name: 'Neon Coral', exact: true })
        .click();

      // Pick-only: a disease READS an attribute the source pedigree records,
      // so the picker lists only `hasConditionX`, which the seeded nomination
      // prompt records.
      await chooseAttribute(
        architectPage
          .getByRole('dialog', { name: 'Create disease' })
          .locator('[data-field-name="attribute"]'),
        'hasConditionX',
      );

      await architectPage
        .getByRole('combobox', { name: 'Inheritance pattern' })
        .selectOption({ label: 'Autosomal dominant' });
    },
    { addButtonLabel: 'Create new disease' },
  );

  // `showAtRiskStatuses` starts `false` from the interface's own template and
  // is deliberately left untouched.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readNarrativePedigreeStage(architectPage);
  expect(stage.type).toBe('NarrativePedigree');
  expect(stage.sourceStageId).toBe(SOURCE_STAGE_ID);

  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'narrative-pedigree-stage.json',
  );
});
