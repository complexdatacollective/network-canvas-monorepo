import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

/**
 * Shared protocol setup: mirrors the structure in FamilyPedigree.stories.tsx so
 * the pedigree interface can resolve all required stage variables.
 */
function buildCousinProtocol(seed: number) {
  const si = new SyntheticInterview(seed);

  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });

  const nameVar = nodeType.addVariable({
    name: 'Name',
    type: 'text',
    component: 'Text',
  });

  const genderVar = nodeType.addVariable({
    id: 'gender_identity',
    name: 'Current Gender Identity',
    type: 'categorical',
    options: [
      { label: 'Man/boy', value: 'man' },
      { label: 'Woman/girl', value: 'woman' },
      { label: 'Non-binary', value: 'non_binary' },
    ],
    component: 'RadioGroup',
  });

  const isEgoVar = nodeType.addVariable({ name: 'Is Ego', type: 'boolean' });
  const relationshipToEgoVar = nodeType.addVariable({
    name: 'Relationship to Ego',
    type: 'text',
  });
  const biologicalSexVar = nodeType.addVariable({
    name: 'Biological Sex',
    type: 'text',
  });

  const edgeType = si.addEdgeType({ name: 'Family' });
  const relationshipVar = edgeType.addVariable({
    name: 'Relationship',
    type: 'categorical',
    options: [
      { label: 'Parent', value: 'parent' },
      { label: 'Child', value: 'child' },
      { label: 'Sibling', value: 'sibling' },
      { label: 'Partner', value: 'partner' },
    ],
  });
  const isActiveVar = edgeType.addVariable({
    name: 'Is Active',
    type: 'boolean',
  });
  const isGestCarrierVar = edgeType.addVariable({
    name: 'Is Gestational Carrier',
    type: 'boolean',
  });

  return {
    si,
    nodeType,
    nameVar,
    genderVar,
    isEgoVar,
    relationshipToEgoVar,
    biologicalSexVar,
    edgeType,
    relationshipVar,
    isActiveVar,
    isGestCarrierVar,
  };
}

function CousinStoryWrapper({
  buildFn,
}: {
  buildFn: () => SyntheticInterview;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );
  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/FamilyPedigree/Cousins',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Task 3 — Representation story
//
// Network: ego → two parents (Linda ⚭ Robert) → both paternal grandparents
// (George ⚭ Helen) who are also Robert's parents → Robert's sibling (Aunt
// Carol) → Carol's child (the first cousin, unnamed so getDisplayLabel
// returns "Cousin" via path parent,parent,child,child).
// ---------------------------------------------------------------------------

export const FirstCousinRepresentation: Story = {
  render: () => {
    const buildFn = () => {
      const {
        si,
        nodeType,
        nameVar,
        genderVar,
        isEgoVar,
        relationshipToEgoVar,
        biologicalSexVar,
        edgeType,
        relationshipVar,
        isActiveVar,
        isGestCarrierVar,
      } = buildCousinProtocol(10);

      si.addInformationStage({ title: 'Welcome', text: 'Before the stage.' });

      // Seed 7 nodes as part of the FamilyPedigree stage.
      // Indices: 0=ego 1=Linda(mother) 2=Robert(father) 3=George(paternal gf)
      //          4=Helen(paternal gm) 5=Carol(aunt) 6=unnamed cousin
      si.addStage('FamilyPedigree', {
        label: 'Family Pedigree',
        subject: { entity: 'node', type: nodeType.id },
        // framing and boundaries are mandatory schema fields: the provider reads
        // framingConfig.mode and the checklist reads boundaries.requireGrandparents.
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        initialNodes: { count: 7 },
        nodeConfig: {
          type: nodeType.id,
          nodeLabelVariable: nameVar.id,
          egoVariable: isEgoVar.id,
          relationshipVariable: relationshipToEgoVar.id,
          biologicalSexVariable: biologicalSexVar.id,
          form: [{ variable: genderVar.id, prompt: 'Gender identity?' }],
        },
        edgeConfig: {
          type: edgeType.id,
          relationshipTypeVariable: relationshipVar.id,
          isActiveVariable: isActiveVar.id,
          isGestationalCarrierVariable: isGestCarrierVar.id,
        },
        censusPrompt: 'Build your family pedigree.',
      });

      si.addInformationStage({ title: 'Complete', text: 'After the stage.' });

      // Set node names and ego flag.
      // Node 6 (the first cousin) has no name. Because its parent Carol IS
      // named, getDisplayLabel uses the named-intermediary possessive
      // ("Carol's Child") rather than the generic "Cousin" relationship label
      // (which only applies when no intermediary on the path is named).
      si.setNodeAttribute(0, nameVar.id, 'You');
      si.setNodeAttribute(0, isEgoVar.id, true);
      si.setNodeAttribute(1, nameVar.id, 'Linda');
      si.setNodeAttribute(1, isEgoVar.id, false);
      si.setNodeAttribute(2, nameVar.id, 'Robert');
      si.setNodeAttribute(2, isEgoVar.id, false);
      si.setNodeAttribute(3, nameVar.id, 'George');
      si.setNodeAttribute(3, isEgoVar.id, false);
      si.setNodeAttribute(4, nameVar.id, 'Helen');
      si.setNodeAttribute(4, isEgoVar.id, false);
      si.setNodeAttribute(5, nameVar.id, 'Carol');
      si.setNodeAttribute(5, isEgoVar.id, false);
      si.setNodeAttribute(6, nameVar.id, '');
      si.setNodeAttribute(6, isEgoVar.id, false);

      // Edges (created in this order by addEdges, edge index = declaration order):
      // e0: Linda → ego (biological, active) — Linda is mother of ego
      // e1: Robert → ego (biological, active) — Robert is father of ego
      // e2: Linda ⚭ Robert (partner, active)
      // e3: George → Robert (biological, active) — George is father of Robert
      // e4: Helen → Robert (biological, active) — Helen is mother of Robert
      // e5: George → Carol (biological, active) — George is father of Carol
      // e6: Helen → Carol (biological, active) — Helen is mother of Carol
      // e7: George ⚭ Helen (partner, active)
      // e8: Carol → cousin (biological, active)
      si.addEdges(
        [
          [1, 0], // Linda → ego
          [2, 0], // Robert → ego
          [1, 2], // Linda ⚭ Robert
          [3, 2], // George → Robert
          [4, 2], // Helen → Robert
          [3, 5], // George → Carol
          [4, 5], // Helen → Carol
          [3, 4], // George ⚭ Helen
          [5, 6], // Carol → cousin
        ],
        edgeType.id,
      );

      // Relationship types stored as single-element arrays (categorical variable).
      si.setEdgeAttribute(0, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(0, isActiveVar.id, true);
      si.setEdgeAttribute(1, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(1, isActiveVar.id, true);
      si.setEdgeAttribute(2, relationshipVar.id, ['partner']);
      si.setEdgeAttribute(2, isActiveVar.id, true);
      si.setEdgeAttribute(3, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(3, isActiveVar.id, true);
      si.setEdgeAttribute(4, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(4, isActiveVar.id, true);
      si.setEdgeAttribute(5, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(5, isActiveVar.id, true);
      si.setEdgeAttribute(6, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(6, isActiveVar.id, true);
      si.setEdgeAttribute(7, relationshipVar.id, ['partner']);
      si.setEdgeAttribute(7, isActiveVar.id, true);
      si.setEdgeAttribute(8, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(8, isActiveVar.id, true);

      return si;
    };

    return <CousinStoryWrapper buildFn={buildFn} />;
  },

  play: async () => {
    // The pedigree renders without the quick-start wizard because the
    // network is pre-seeded. The unnamed first cousin (path
    // parent,parent,child,child) is labelled relative to its named parent
    // Carol, so it renders as "Carol's Child".
    const cousinNode = await screen.findByRole('button', {
      name: "Carol's Child",
    });
    expect(cousinNode).toBeInTheDocument();

    // Sanity-check that named intermediaries are also on the canvas.
    expect(screen.getByRole('button', { name: 'Linda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'George' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Helen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carol' })).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Task 4 — Creation-via-wizard story
//
// Exercises the full interactive path:
//   1. Quick-start wizard: ego with parents Linda (egg) and Robert (sperm),
//      who are current partners.
//   2. Before adding grandparents: assert "Add sibling" is DISABLED on
//      Robert (canAddSibling is false — no parents recorded yet).
//   3. Open Robert's context menu → "Add parent" → DefineParentsWizard
//      (BioTriadStep) → record both grandparents (Helen egg, George sperm).
//   4. After grandparents exist: assert "Add sibling" is now ENABLED on
//      Robert (canAddSibling flips true). This is the Feature #2 verification.
//   5. "Add sibling" on Robert → AddSiblingWizard → name Carol, accept
//      shared grandparents as parents.
//   6. "Add child" on Carol → AddChildWizard → name Emma (the cousin).
//   7. Assert Emma appears on the pedigree canvas.
// ---------------------------------------------------------------------------

const WIZARD_TIMEOUT = { timeout: 8000 };

async function clickGetStarted() {
  const btn = await screen.findByRole('button', {
    name: 'Build family pedigree',
  });
  await userEvent.click(btn);
  await screen.findByRole('dialog', {}, WIZARD_TIMEOUT);
}

async function findContinueButton() {
  const buttons = await screen.findAllByRole('button', {});
  const btn = buttons.find(
    (b) => b.textContent === 'Finish' || b.textContent === 'Continue',
  );
  if (!btn) throw new Error('No Finish or Continue button found');
  return btn;
}

async function clickContinue() {
  await userEvent.click(await findContinueButton());
}

async function getDialog() {
  return screen.findByRole('dialog', {}, WIZARD_TIMEOUT);
}

async function setFieldInput(fieldName: string, value: boolean | string) {
  const dialog = await getDialog();
  const container = dialog.querySelector(
    `[data-field-name="${CSS.escape(fieldName)}"]`,
  );
  if (!container)
    throw new Error(`No field found with data-field-name="${fieldName}"`);

  if (typeof value === 'boolean') {
    const toggle = container.querySelector('[role="switch"]');
    if (toggle) {
      const isChecked = toggle.getAttribute('aria-checked') === 'true';
      if (isChecked !== value) await userEvent.click(toggle);
      return;
    }
    const radios = within(container as HTMLElement).getAllByRole('radio');
    const target = value ? radios[0] : radios[1];
    if (!target)
      throw new Error(`No radio for value=${String(value)} in "${fieldName}"`);
    await userEvent.click(target);
    return;
  }

  // String value — RadioGroup or text input
  const radios = (container as HTMLElement).querySelectorAll('[role="radio"]');
  if (radios.length > 0) {
    const target = Array.from(radios).find(
      (r) => r.getAttribute('aria-label') === value,
    );
    if (target) {
      await userEvent.click(target);
      return;
    }
    const byValue = Array.from(radios).find((r) => {
      const input = r.querySelector('input[type="radio"]');
      return input?.getAttribute('value') === value;
    });
    if (byValue) {
      await userEvent.click(byValue);
      return;
    }
    throw new Error(`No radio option matching "${value}" in "${fieldName}"`);
  }

  const input = within(container as HTMLElement).getByRole('textbox');
  await userEvent.clear(input);
  await userEvent.type(input, value);
}

async function setPartnership(
  focalId: string,
  partnerLabel: string,
  optionLabel: string,
) {
  const dialog = await getDialog();
  const matrix = dialog.querySelector(
    `[data-field-name="${CSS.escape(`partnerships.${focalId}`)}"]`,
  );
  if (!matrix) throw new Error(`No partnership matrix for focal "${focalId}"`);
  const group = within(matrix as HTMLElement).getByRole('radiogroup', {
    name: partnerLabel,
  });
  await userEvent.click(
    within(group).getByRole('radio', { name: optionLabel }),
  );
}

async function openNodeContextMenu(nodeName: string) {
  const nodeBtn = await screen.findByRole(
    'button',
    { name: nodeName },
    WIZARD_TIMEOUT,
  );
  await userEvent.click(nodeBtn);
  await screen.findByRole('menu', {}, WIZARD_TIMEOUT);
}

/**
 * Answer the "About you" (EgoSexStep) biological-sex question and continue. It
 * is the first quick-start step for fixed-framing protocols (no leading
 * Introduction or FramingSelection step). The radios are labelled by their
 * option label (from BIOLOGICAL_SEX_OPTIONS; the default here is "Female").
 */
async function selectEgoSex(label = 'Female') {
  const dialog = await getDialog();
  const field = dialog.querySelector('[data-field-name="biologicalSex"]');
  if (!field) throw new Error('No biologicalSex field found (EgoSexStep)');
  const radio = within(field as HTMLElement).getByRole('radio', {
    name: label,
  });
  await userEvent.click(radio);
  await clickContinue();
}

export const FirstCousinCreationViaWizard: Story = {
  render: () => {
    const buildFn = () => {
      const {
        si,
        nodeType,
        nameVar,
        genderVar,
        isEgoVar,
        relationshipToEgoVar,
        biologicalSexVar,
        edgeType,
        relationshipVar,
        isActiveVar,
        isGestCarrierVar,
      } = buildCousinProtocol(20);

      si.addInformationStage({ title: 'Welcome', text: 'Before the stage.' });

      si.addStage('FamilyPedigree', {
        label: 'Family Pedigree',
        subject: { entity: 'node', type: nodeType.id },
        // Fixed gamete framing: no FramingSelectionStep or IntroStep in the
        // wizard, so the quick-start opens directly on EggParentStep.
        framing: { mode: 'fixed', value: 'gamete' },
        // boundaries is a mandatory schema field read by the checklist.
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        nodeConfig: {
          type: nodeType.id,
          nodeLabelVariable: nameVar.id,
          egoVariable: isEgoVar.id,
          relationshipVariable: relationshipToEgoVar.id,
          biologicalSexVariable: biologicalSexVar.id,
          form: [{ variable: genderVar.id, prompt: 'Gender identity?' }],
        },
        edgeConfig: {
          type: edgeType.id,
          relationshipTypeVariable: relationshipVar.id,
          isActiveVariable: isActiveVar.id,
          isGestationalCarrierVariable: isGestCarrierVar.id,
        },
        censusPrompt: 'Build your family pedigree.',
      });

      si.addInformationStage({ title: 'Complete', text: 'After the stage.' });

      return si;
    };

    return <CousinStoryWrapper buildFn={buildFn} />;
  },

  play: async () => {
    // -----------------------------------------------------------------------
    // Step 1: Quick-start wizard — ego with parents Linda (egg) and Robert.
    // Fixed gamete framing means the wizard opens on the "About you"
    // (EgoSexStep) step first (no leading IntroStep or FramingSelectionStep),
    // then EggParentStep.
    // -----------------------------------------------------------------------
    await clickGetStarted();

    await selectEgoSex();

    await setFieldInput('egg-parent.is-donor', false);
    await setFieldInput('egg-parent.name', 'Linda');
    await setFieldInput('egg-parent.gestationalCarrier', true);
    await setFieldInput('egg-parent.gender_identity', 'Woman/girl');
    await clickContinue();

    await setFieldInput('sperm-parent.is-donor', false);
    await setFieldInput('sperm-parent.name', 'Robert');
    await setFieldInput('sperm-parent.gender_identity', 'Man/boy');
    await clickContinue();

    await setFieldInput('hasOtherParents', false);
    await clickContinue();

    await setPartnership('egg-parent', 'Robert', 'Current partner');
    await clickContinue();

    await setFieldInput('hasPartner', false);
    await clickContinue();

    // Dismiss the post-wizard "Building the rest of your pedigree" hint.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it' }, WIZARD_TIMEOUT),
    );

    // -----------------------------------------------------------------------
    // Step 2: Assert "Add sibling" is DISABLED on Robert (no parents yet).
    // This is the Feature #2 "before" state.
    // -----------------------------------------------------------------------
    await openNodeContextMenu('Robert');
    const menuBeforeGrandparents = await screen.findByRole(
      'menu',
      {},
      WIZARD_TIMEOUT,
    );

    // Inline hint "Add a parent first" is visible.
    expect(
      within(menuBeforeGrandparents).getByText(/add a parent first/i),
    ).toBeInTheDocument();

    // The menuitem itself carries aria-disabled="true".
    const addSiblingBeforeText = within(menuBeforeGrandparents).getByText(
      'Add sibling',
    );
    const addSiblingMenuItemBefore =
      addSiblingBeforeText.closest('[role="menuitem"]');
    expect(addSiblingMenuItemBefore).toBeTruthy();
    expect(addSiblingMenuItemBefore?.getAttribute('aria-disabled')).toBe(
      'true',
    );

    await userEvent.keyboard('{Escape}');

    // -----------------------------------------------------------------------
    // Step 3: Add parents (grandparents) to Robert.
    //
    // Robert has 0 genetic parents → "Add parent" opens DefineParentsWizard
    // (BioTriadStep). Name Helen (egg) and George (sperm), no other parents,
    // mark them as current partners.
    // -----------------------------------------------------------------------
    await openNodeContextMenu('Robert');
    await userEvent.click(
      await screen.findByText('Add parent', {}, WIZARD_TIMEOUT),
    );

    // DefineParentsWizard opens on BioTriadStep. Robert has no existing parents,
    // so the egg-/sperm-source selectors auto-resolve to "new" (rendered hidden)
    // and we fill the new-person fields. is-donor defaults false and
    // egg-parent-carried defaults true, so those are left at their defaults.
    await setFieldInput('new-egg-source.name', 'Helen');
    await setFieldInput('new-egg-source.gender_identity', 'Woman/girl');
    await setFieldInput('new-sperm-source.name', 'George');
    await setFieldInput('new-sperm-source.gender_identity', 'Man/boy');
    await clickContinue(); // BioTriadStep → Other parents

    await setFieldInput('hasOtherParents', false);
    await clickContinue(); // Other parents → Parent partnerships

    // Helen and George are both newly created, so one partnership question
    // appears ("Are Helen and George partners?"). The radio options are matched
    // by their visible label. Mark them current partners.
    await setFieldInput(
      'partnership-egg-source-sperm-source',
      'Current partners',
    );
    await clickContinue(); // partnerships → done

    await screen.findByRole('button', { name: 'George' }, WIZARD_TIMEOUT);
    await screen.findByRole('button', { name: 'Helen' }, WIZARD_TIMEOUT);

    // -----------------------------------------------------------------------
    // Step 4: Assert "Add sibling" is now ENABLED on Robert.
    // This is the Feature #2 "after" state — the key regression test.
    // -----------------------------------------------------------------------
    await openNodeContextMenu('Robert');
    const menuAfterGrandparents = await screen.findByRole(
      'menu',
      {},
      WIZARD_TIMEOUT,
    );

    // Hint is gone.
    expect(
      within(menuAfterGrandparents).queryByText(/add a parent first/i),
    ).toBeNull();

    // The menuitem is enabled (aria-disabled absent or 'false').
    const addSiblingAfterText = within(menuAfterGrandparents).getByText(
      'Add sibling',
    );
    const addSiblingMenuItemAfter =
      addSiblingAfterText.closest('[role="menuitem"]');
    expect(addSiblingMenuItemAfter).toBeTruthy();
    const disabledAttr = addSiblingMenuItemAfter?.getAttribute('aria-disabled');
    expect(disabledAttr === null || disabledAttr === 'false').toBe(true);

    // -----------------------------------------------------------------------
    // Step 5: "Add sibling" on Robert → AddSiblingWizard → create Carol.
    // -----------------------------------------------------------------------
    await userEvent.click(addSiblingAfterText);

    await setFieldInput('sibling.name', 'Carol');
    await setFieldInput('sibling.biologicalSex', 'Female');
    await setFieldInput('sibling.gender_identity', 'Woman/girl');
    await clickContinue(); // Sibling details → BioTriadStep

    // George and Helen are pre-offered as Carol's parents; accept the defaults.
    await clickContinue(); // BioTriadStep → Other parents

    await setFieldInput('hasOtherParents', false);
    // Both of Carol's parents already exist (neither is new), so the partnership
    // step is skipped (shouldSkipNewParentPartnerships) — this continue finalises
    // the wizard.
    await clickContinue(); // Other parents → done

    await screen.findByRole('button', { name: 'Carol' }, WIZARD_TIMEOUT);

    // -----------------------------------------------------------------------
    // Step 6: "Add child" on Carol → AddChildWizard → create Emma (cousin).
    // -----------------------------------------------------------------------
    await openNodeContextMenu('Carol');
    await userEvent.click(
      await screen.findByText('Add child', {}, WIZARD_TIMEOUT),
    );

    await setFieldInput('child.name', 'Emma');
    await setFieldInput('child.biologicalSex', 'Female');
    await setFieldInput('child.gender_identity', 'Woman/girl');
    await clickContinue(); // Child details → BioTriadStep

    // Carol is preselected as the egg source. She has no recorded partner, so
    // the sperm source is unset and required — create a new (unknown) person for
    // Emma's other parent so the step can advance.
    await setFieldInput('sperm-source', 'Create a new person');
    await clickContinue(); // BioTriadStep → Other parents

    await setFieldInput('hasOtherParents', false);
    await clickContinue(); // Other parents → Parent partnerships

    // Carol and the new (unknown) sperm parent form a partnership pair.
    await setFieldInput(
      'partnership-egg-source-sperm-source',
      'Never partners',
    );
    await clickContinue(); // done

    // -----------------------------------------------------------------------
    // Step 7: Emma (the first cousin) appears on the pedigree.
    //
    // Emma has a name, so getDisplayLabel returns "Emma" rather than "Cousin".
    // The cousin relationship is nonetheless correct: the graph path
    // parent,parent,child,child via Robert resolves to RelationshipKind "cousin".
    // -----------------------------------------------------------------------
    const emmaNode = await screen.findByRole(
      'button',
      { name: 'Emma' },
      WIZARD_TIMEOUT,
    );
    expect(emmaNode).toBeInTheDocument();
  },
};
