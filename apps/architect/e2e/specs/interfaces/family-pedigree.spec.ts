import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  selectOrCreateEdgeType,
  selectOrCreateNodeType,
} from '../../pageobjects/editor-sections/entity-types.js';
import { createAttribute } from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// The two codebook types this pedigree binds are SEEDED rather than authored
// here, which is the one thing this spec cannot do from the editor. The
// "Family member data" and "Relationship data" sections mount the package's
// `EntityTypePickerField` directly, and that control deliberately offers no
// create-a-type affordance — creating a codebook entity is the Codebook
// screen's job, and only the sections built on `SubjectSection` put a
// "Create new node type" button beside the picker. So a Family Pedigree
// cannot be given its types from inside the stage editor at all; seeding them
// keeps this spec about the pedigree editor rather than about the codebook
// screen, and every part of the STAGE is still authored below.
//
// Their ids are uuid-shaped on purpose. `normalizeStage` replaces every uuid
// it meets with a placeholder numbered by where it first appears, so a seeded
// uuid normalises exactly as a freshly minted one did and the committed
// snapshot is unchanged; a readable key like `person` would reach the snapshot
// verbatim. The types carry no attributes — all eight are created through the
// editor below, as before.
const PERSON_TYPE_ID = '3b1a5c7e-2d4f-4a86-9c1b-7e05d2f61a38';
const FAMILY_EDGE_TYPE_ID = '9d2c4e61-7a03-4b58-8f2d-1c6b9a03e7f4';

function protocolWithPedigreeTypes(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      node: {
        [PERSON_TYPE_ID]: {
          name: 'person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
        },
      },
      edge: {
        [FAMILY_EDGE_TYPE_ID]: {
          name: 'family_edge',
          color: 'edge-color-seq-1',
        },
      },
    },
  };
}

// Each of the pedigree's attribute slots picks from the codebook and invents
// what it needs from the picker's OWN create row — no create control sits
// beside a picker any more. `SlotVariableField` hands the picker the props
// `useCreateAttributeForSlot` answers with, and what the row does next is
// decided by the kind of answer the slot binds:
//
// - `text` and `boolean` slots (display label, participant identifier,
//   relationship, active status, gestational carrier) are finished by a name,
//   so the row writes the codebook and binds the result with no dialog at all.
// - The three whose VALUES the interface owns (biological sex, relationship
//   type, gamete role) are `categorical` with `lockedOptions`, which a name
//   cannot finish — so the row escalates to the codebook's own editor, titled
//   with the slot's own words and opened already holding the typed name. Those
//   values arrive seeded and read-only, so the name is still the whole of the
//   authoring; nothing is entered in the editor beyond pressing "Create
//   attribute".

test('creates a valid FamilyPedigree stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithPedigreeTypes());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('FamilyPedigree');
  await editor.setStageName('Your Family');

  // The picker fills its field. Architect's own pedigree sections laid these
  // out two to a row, so the control was half the width of the field around
  // it; the protocol-builder editors lay every field out one after another at
  // full width, spaced by the field's own margin
  // (docs/superpowers/plans/2026-09-09-protocol-builder-rework.md, "Layout of
  // fields"). Measured rather than assumed, because a picker that had lost its
  // width entirely would still be on screen.
  const expectFullWidthAttributePicker = async (fieldName: string) => {
    const field = editor.field(fieldName);
    const picker = field.locator(`[data-name="${fieldName}"]`);
    const [fieldBox, pickerBox] = await Promise.all([
      field.boundingBox(),
      picker.boundingBox(),
    ]);

    if (!fieldBox || !pickerBox) {
      throw new Error(`Could not measure the ${fieldName} attribute picker`);
    }

    expect(pickerBox.width / fieldBox.width).toBeCloseTo(1, 2);
  };

  // `@codaco/protocol-builder`'s `FamilyPedigreeStageEditor.ts` composes
  // `[stageHeading, framingConfig, boundaryOptions, pedigreeNodeConfiguration,
  // pedigreeEdgeConfiguration, contentBlocks({variant:'introScreen'}),
  // censusPrompt, nominationPrompts, skipLogic, interviewerGuidance]`, and the
  // interface's template (`interfaces/templates.ts`) pre-seeds
  // `framing: {mode:'fixed', value:'gamete'}`,
  // `boundaries: {requireGrandparents:'off', requireChildrenContributors:'off'}`
  // and a one-block `introScreen` — all already schema-valid, so the framing,
  // boundary and introduction sections are deliberately left untouched here
  // (same reasoning as NetworkComposer's optional Group-hulls/Edge
  // Configuration sections).
  //
  // The seeded types are PICKED here rather than created: the shared helper
  // takes its existing-type branch, which clicks the chip named for the type
  // and requires the control to report itself checked before anything bound to
  // it is driven.
  await selectOrCreateNodeType(architectPage, 'person');

  // "Family member data" renders the node type picker and, once a type is
  // chosen, FOUR attribute slots at once (nodeLabelVariable / egoVariable /
  // relationshipVariable / biologicalSexVariable —
  // `PedigreeNodeConfigurationSection.tsx`). Each is a `SlotVariableField`,
  // which is why every attribute below is created through that slot's own
  // picker rather than through one shared control.
  //
  // The slots' types are fixed by the interface, not chosen here: text
  // (`nodeLabelVariable`, `relationshipVariable`), boolean (`egoVariable`,
  // `isActiveVariable`, `isGestationalCarrierVariable`) and categorical
  // (`biologicalSexVariable`, `relationshipTypeVariable`, `gameteRoleVariable`,
  // whose canonical values the interface owns and locks). So no type is picked
  // and no option is authored for any of the eight — the name is the whole of
  // the authoring, whether the row writes it directly or hands it to the
  // editor.
  await createAttribute(editor.field('nodeConfig.nodeLabelVariable'), 'name');
  await createAttribute(editor.field('nodeConfig.egoVariable'), 'is_ego');
  await createAttribute(
    editor.field('nodeConfig.relationshipVariable'),
    'relationship_to_ego',
  );
  await createAttribute(
    editor.field('nodeConfig.biologicalSexVariable'),
    'biologicalSex',
    {
      title: 'Create a new biological sex attribute',
    },
  );

  await expectFullWidthAttributePicker('nodeConfig.egoVariable');

  // `nodeConfig.form` is optional. A new pedigree therefore leaves the family
  // member form switched off, so it registers nothing and the saved stage
  // carries no `form` key.
  await expect(
    architectPage.getByRole('switch', { name: 'Family member form' }),
  ).not.toBeChecked();

  await selectOrCreateEdgeType(architectPage, 'family_edge');

  await createAttribute(
    editor.field('edgeConfig.relationshipTypeVariable'),
    'relationshipType',
    {
      title: 'Create a new relationship type attribute',
    },
  );
  await createAttribute(
    editor.field('edgeConfig.isActiveVariable'),
    'isActive',
  );
  await createAttribute(
    editor.field('edgeConfig.isGestationalCarrierVariable'),
    'isGestationalCarrier',
  );
  await createAttribute(
    editor.field('edgeConfig.gameteRoleVariable'),
    'gameteRole',
    {
      title: 'Create a new gamete role attribute',
    },
  );

  await expectFullWidthAttributePicker('edgeConfig.relationshipTypeVariable');

  // The "Family-building prompt" section holds one RichText field, and the
  // field owns the visible label rather than proxying it through the section
  // heading (`CensusPromptSection.tsx`).
  await editor.fillRichText('Census prompt', 'Who is in your family?');

  // `nominationPrompts` is optional (`familyPedigreeStage`'s zod schema), and
  // its section is a capability switched off by default, so it is deliberately
  // left untouched.

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('FamilyPedigree');
  expect(await stageSnapshotJson(stage)).toMatchSnapshot(
    'family-pedigree-stage.json',
  );
});
