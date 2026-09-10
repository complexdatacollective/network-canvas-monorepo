import type { Page } from '@playwright/test';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import {
  selectOrCreateEdgeType,
  selectOrCreateNodeType,
} from '../../pageobjects/editor-sections/entity-types.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// Each of the pedigree's attribute slots picks from the codebook, and creates
// what it needs beside the picker rather than through a shared spotlight:
// `SlotVariableField` renders a `VariablePickerField` (a native select of the
// attributes of the chosen type) and a `CreateVariableButton` next to it,
// named for the slot it fills ("Create a new display label attribute", …).
// That button opens the codebook's own attribute editor with the type locked
// to what the slot binds — so the type control offers nothing to choose, a
// slot with a canonical value set shows those values read-only, and the only
// control to fill is "Attribute name". The dialog carries the button's own
// words as its title, "Create attribute" commits the codebook write, and the
// slot binds the new attribute as soon as it lands.
//
// The create button is a SIBLING of the field rather than inside it, so it is
// resolved on the page by its own name — which names the slot, so each of the
// eight is unambiguous without scoping.
async function createSlotAttribute(
  page: Page,
  createLabel: string,
  attributeName: string,
): Promise<void> {
  await page.getByRole('button', { name: createLabel, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: createLabel });
  await dialog
    .getByRole('textbox', { name: 'Attribute name', exact: true })
    .fill(attributeName);
  const submit = dialog.getByRole('button', {
    name: 'Create attribute',
    exact: true,
  });
  await submit.click();
  // The codebook write is a round trip to the host, and the next slot's dialog
  // animates in over this one's exit — so wait for this dialog to leave the
  // DOM rather than for it to be hidden.
  await submit.waitFor({ state: 'detached' });
}

test('creates a valid FamilyPedigree stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(emptyProtocol());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('FamilyPedigree');
  await editor.setStageName('Your Family');

  const expectHalfWidthAttributePicker = async (fieldName: string) => {
    const field = editor.field(fieldName);
    const picker = field.locator(`[data-name="${fieldName}"]`);
    const [fieldBox, pickerBox] = await Promise.all([
      field.boundingBox(),
      picker.boundingBox(),
    ]);

    if (!fieldBox || !pickerBox) {
      throw new Error(`Could not measure the ${fieldName} attribute picker`);
    }

    expect(pickerBox.width / fieldBox.width).toBeCloseTo(0.5, 2);
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
  await selectOrCreateNodeType(architectPage, 'person');

  // "Family member data" renders the node type picker and, once a type is
  // chosen, FOUR attribute slots at once (nodeLabelVariable / egoVariable /
  // relationshipVariable / biologicalSexVariable —
  // `PedigreeNodeConfigurationSection.tsx`). Each is a `SlotVariableField`,
  // which is why every attribute below is created through the slot's own
  // create button rather than through one shared picker.
  //
  // The slots' types are fixed by the interface, not chosen here: text
  // (`nodeLabelVariable`, `relationshipVariable`), boolean (`egoVariable`,
  // `isActiveVariable`, `isGestationalCarrierVariable`) and categorical
  // (`biologicalSexVariable`, `relationshipTypeVariable`, `gameteRoleVariable`,
  // whose canonical values the interface owns and locks). The editor is opened
  // with `allowedVariableTypes` holding that one type and `lockedOptions`
  // holding those values, so no type is picked and no option is authored for
  // any of the eight — the name is the whole of the authoring.
  await createSlotAttribute(
    architectPage,
    'Create a new display label attribute',
    'name',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new participant identifier attribute',
    'is_ego',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new relationship attribute',
    'relationship_to_ego',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new biological sex attribute',
    'biologicalSex',
  );

  await expectHalfWidthAttributePicker('nodeConfig.egoVariable');

  // `nodeConfig.form` is optional. A new pedigree therefore leaves the family
  // member form switched off, so it registers nothing and the saved stage
  // carries no `form` key.
  await expect(
    architectPage.getByRole('switch', { name: 'Family member form' }),
  ).not.toBeChecked();

  await selectOrCreateEdgeType(architectPage, 'family_edge');

  await createSlotAttribute(
    architectPage,
    'Create a new relationship type attribute',
    'relationshipType',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new active status attribute',
    'isActive',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new gestational carrier attribute',
    'isGestationalCarrier',
  );
  await createSlotAttribute(
    architectPage,
    'Create a new gamete role attribute',
    'gameteRole',
  );

  await expectHalfWidthAttributePicker('edgeConfig.relationshipTypeVariable');

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
