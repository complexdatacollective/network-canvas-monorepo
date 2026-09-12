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

// Nothing is seeded: this pedigree is built on an empty protocol, and the two
// codebook types it binds are AUTHORED from inside the stage editor, through
// the type picker's own "Create new {node|edge} type" button. That button is
// part of `EntityTypePickerField` itself, so every stage that picks a type
// offers it — which is what stops a Family Pedigree on a fresh protocol from
// dead-ending at "No node types currently defined", with nothing on screen
// saying where node types come from.
//
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
  await seed(emptyProtocol());
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
  // The type is CREATED here: the codebook has none, so the shared helper
  // takes its create branch, which presses the picker's own button, names the
  // type in the codebook editor the button opens, and answers the stage's
  // question about what choosing it costs.
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
