import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

/**
 * Shared protocol setup: mirrors FamilyPedigree.cousins.stories.tsx so the
 * pedigree interface can resolve all required stage variables.
 */
function buildConsanguinityProtocol(seed: number) {
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

function ConsanguinityStoryWrapper({
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
  title: 'Interfaces/FamilyPedigree/Consanguinity',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

// ---------------------------------------------------------------------------
// Representation story
//
// A consanguineous union: ego and a first cousin who are partners and share a
// child. They descend from a common grandparent couple, so the partner line
// between them renders as a double line (group === 2).
//
//   George(3) ⚭ Helen(4)
//         |         |
//      Robert(2)  Carol(5)        (siblings — both children of George+Helen)
//         |           |
//       ego(0) ⚭ cousin(1)        (first cousins, partnered)
//                |
//            child(6)
// ---------------------------------------------------------------------------

export const ConsanguineousUnionRepresentation: Story = {
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
      } = buildConsanguinityProtocol(30);

      si.addInformationStage({ title: 'Welcome', text: 'Before the stage.' });

      // Seed 7 nodes as part of the FamilyPedigree stage.
      // Indices: 0=ego 1=cousin(Maria) 2=Robert(ego's father)
      //          3=George(grandfather) 4=Helen(grandmother)
      //          5=Carol(cousin's mother) 6=shared child (Emma)
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

      // Names and ego flag. The cousin is named (Maria) so it is selectable by
      // label; the shared child is named (Emma).
      si.setNodeAttribute(0, nameVar.id, 'You');
      si.setNodeAttribute(0, isEgoVar.id, true);
      si.setNodeAttribute(1, nameVar.id, 'Maria');
      si.setNodeAttribute(1, isEgoVar.id, false);
      si.setNodeAttribute(2, nameVar.id, 'Robert');
      si.setNodeAttribute(2, isEgoVar.id, false);
      si.setNodeAttribute(3, nameVar.id, 'George');
      si.setNodeAttribute(3, isEgoVar.id, false);
      si.setNodeAttribute(4, nameVar.id, 'Helen');
      si.setNodeAttribute(4, isEgoVar.id, false);
      si.setNodeAttribute(5, nameVar.id, 'Carol');
      si.setNodeAttribute(5, isEgoVar.id, false);
      si.setNodeAttribute(6, nameVar.id, 'Emma');
      si.setNodeAttribute(6, isEgoVar.id, false);

      // Edges (edge index = declaration order):
      // e0: George → Robert (biological)
      // e1: Helen  → Robert (biological)
      // e2: George → Carol  (biological)
      // e3: Helen  → Carol  (biological)
      // e4: George ⚭ Helen  (partner)
      // e5: Robert → ego    (biological)
      // e6: Carol  → cousin (biological)
      // e7: ego    ⚭ cousin (partner — the consanguineous union)
      // e8: ego    → child  (biological)
      // e9: cousin → child  (biological)
      si.addEdges(
        [
          [3, 2], // George → Robert
          [4, 2], // Helen → Robert
          [3, 5], // George → Carol
          [4, 5], // Helen → Carol
          [3, 4], // George ⚭ Helen
          [2, 0], // Robert → ego
          [5, 1], // Carol → cousin
          [0, 1], // ego ⚭ cousin
          [0, 6], // ego → child
          [1, 6], // cousin → child
        ],
        edgeType.id,
      );

      // Relationship types stored as single-element arrays (categorical variable).
      si.setEdgeAttribute(0, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(0, isActiveVar.id, true);
      si.setEdgeAttribute(1, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(1, isActiveVar.id, true);
      si.setEdgeAttribute(2, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(2, isActiveVar.id, true);
      si.setEdgeAttribute(3, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(3, isActiveVar.id, true);
      si.setEdgeAttribute(4, relationshipVar.id, ['partner']);
      si.setEdgeAttribute(4, isActiveVar.id, true);
      si.setEdgeAttribute(5, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(5, isActiveVar.id, true);
      si.setEdgeAttribute(6, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(6, isActiveVar.id, true);
      si.setEdgeAttribute(7, relationshipVar.id, ['partner']);
      si.setEdgeAttribute(7, isActiveVar.id, true);
      si.setEdgeAttribute(8, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(8, isActiveVar.id, true);
      si.setEdgeAttribute(9, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(9, isActiveVar.id, true);

      return si;
    };

    return <ConsanguinityStoryWrapper buildFn={buildFn} />;
  },

  play: async () => {
    // The pedigree renders without the quick-start wizard because the network
    // is pre-seeded. If the consanguinity layout (ancestor traversal on the
    // partner loop, double-line geometry, shared-child routing) threw, the
    // error boundary would replace the canvas and these node buttons would be
    // absent — so finding them asserts a clean render.
    const childNode = await screen.findByRole('button', { name: 'Emma' });
    expect(childNode).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Maria' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'George' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Helen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carol' })).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Creation-via-wizard story
//
// Starts from a network where ego, ego's parents/grandparents and the cousin's
// branch already exist (but ego and the cousin are NOT yet partnered). A partner
// edge is undirected, so the union is built by opening "Add partner" on the
// NAMED cousin Maria (an accessible, name-targetable node) and picking her
// eligible first cousin — ego, who appears in the picker as "You". (Ego's own
// node button renders inside an aria-hidden subtree, so it can never be located
// by findByRole; targeting Maria sidesteps that pre-existing ego-rendering
// behaviour while producing exactly the same consanguineous union.)
//
// The play function:
//   1. Opens "Add partner" on Maria and selects her existing cousin ego ("You").
//   2. Opens "Add child" on Maria and records a child shared with ego.
//   3. Asserts the union (Maria still present) and the shared child appear.
// ---------------------------------------------------------------------------

const WIZARD_TIMEOUT = { timeout: 8000 };

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

// The "Add partner" form dialog submits via a button labelled "Add" (its
// submitLabel) rather than the wizard's "Continue"/"Finish", so it needs its
// own submitter.
async function clickAdd() {
  const dialog = await screen.findByRole('dialog', {}, WIZARD_TIMEOUT);
  const buttons = await within(dialog).findAllByRole('button', {});
  const btn = buttons.find((b) => b.textContent === 'Add');
  if (!btn) throw new Error('No Add button found in the Add-partner dialog');
  await userEvent.click(btn);
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

async function openNodeContextMenu(nodeName: string) {
  const nodeBtn = await screen.findByRole(
    'button',
    { name: nodeName },
    WIZARD_TIMEOUT,
  );
  await userEvent.click(nodeBtn);
  await screen.findByRole('menu', {}, WIZARD_TIMEOUT);
}

export const ConsanguineousUnionCreationViaWizard: Story = {
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
      } = buildConsanguinityProtocol(40);

      si.addInformationStage({ title: 'Welcome', text: 'Before the stage.' });

      // Seed ego, ego's parents/grandparents and the cousin's branch — but no
      // partner edge between ego and the cousin yet (the wizard creates it).
      // Indices: 0=ego 1=Maria(cousin) 2=Robert(ego's father)
      //          3=George(grandfather) 4=Helen(grandmother)
      //          5=Carol(cousin's mother)
      si.addStage('FamilyPedigree', {
        label: 'Family Pedigree',
        subject: { entity: 'node', type: nodeType.id },
        // Fixed gamete framing: no FramingSelectionStep or IntroStep in the
        // wizard, so the quick-start opens directly on BioParentsIntroStep.
        framing: { mode: 'fixed', value: 'gamete' },
        boundaries: {
          requireGrandparents: 'off',
          requireChildrenContributors: 'off',
        },
        initialNodes: { count: 6 },
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

      si.setNodeAttribute(0, nameVar.id, 'You');
      si.setNodeAttribute(0, isEgoVar.id, true);
      si.setNodeAttribute(1, nameVar.id, 'Maria');
      si.setNodeAttribute(1, isEgoVar.id, false);
      si.setNodeAttribute(2, nameVar.id, 'Robert');
      si.setNodeAttribute(2, isEgoVar.id, false);
      si.setNodeAttribute(3, nameVar.id, 'George');
      si.setNodeAttribute(3, isEgoVar.id, false);
      si.setNodeAttribute(4, nameVar.id, 'Helen');
      si.setNodeAttribute(4, isEgoVar.id, false);
      si.setNodeAttribute(5, nameVar.id, 'Carol');
      si.setNodeAttribute(5, isEgoVar.id, false);

      // Edges (edge index = declaration order):
      // e0: George → Robert (biological)
      // e1: Helen  → Robert (biological)
      // e2: George → Carol  (biological)
      // e3: Helen  → Carol  (biological)
      // e4: George ⚭ Helen  (partner)
      // e5: Robert → ego    (biological)
      // e6: Carol  → Maria  (biological)
      si.addEdges(
        [
          [3, 2], // George → Robert
          [4, 2], // Helen → Robert
          [3, 5], // George → Carol
          [4, 5], // Helen → Carol
          [3, 4], // George ⚭ Helen
          [2, 0], // Robert → ego
          [5, 1], // Carol → Maria
        ],
        edgeType.id,
      );

      si.setEdgeAttribute(0, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(0, isActiveVar.id, true);
      si.setEdgeAttribute(1, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(1, isActiveVar.id, true);
      si.setEdgeAttribute(2, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(2, isActiveVar.id, true);
      si.setEdgeAttribute(3, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(3, isActiveVar.id, true);
      si.setEdgeAttribute(4, relationshipVar.id, ['partner']);
      si.setEdgeAttribute(4, isActiveVar.id, true);
      si.setEdgeAttribute(5, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(5, isActiveVar.id, true);
      si.setEdgeAttribute(6, relationshipVar.id, ['biological']);
      si.setEdgeAttribute(6, isActiveVar.id, true);

      return si;
    };

    return <ConsanguinityStoryWrapper buildFn={buildFn} />;
  },

  play: async () => {
    // -----------------------------------------------------------------------
    // Step 1: Open "Add partner" on the named cousin Maria and choose ego.
    // -----------------------------------------------------------------------
    // Maria is an accessible, name-targetable node. partnerCandidates(Maria)
    // excludes only Maria, her parents and her full siblings — so her first
    // cousin ego is eligible and the existing-person picker lists ego as "You"
    // (buildNodeOptions labels ego specially). Selecting it forms the
    // undirected partner edge: the same consanguineous union as ego ⚭ Maria.
    await openNodeContextMenu('Maria');
    await userEvent.click(
      await screen.findByText('Add partner', {}, WIZARD_TIMEOUT),
    );

    // AddPersonFields: pick the existing-person branch, then ego ("You") from
    // the candidate picker. The current/ex question defaults to "current".
    await setFieldInput('partnerType', 'Yes — already in the family tree');
    await setFieldInput('existingPartnerId', 'You');
    await clickAdd();

    // The consanguineous union now exists; Maria remains on the canvas.
    await screen.findByRole('button', { name: 'Maria' }, WIZARD_TIMEOUT);

    // -----------------------------------------------------------------------
    // Step 2: Add a child shared by Maria and ego via the Add-child wizard.
    // -----------------------------------------------------------------------
    // getPreselection(Maria) seeds Maria as the egg source and her partner ego
    // as the sperm source, so the child descends from both members of the
    // consanguineous union. ego is re-selected explicitly for robustness.
    await openNodeContextMenu('Maria');
    await userEvent.click(
      await screen.findByText('Add child', {}, WIZARD_TIMEOUT),
    );

    await setFieldInput('child.name', 'Emma');
    await setFieldInput('child.gender_identity', 'Woman/girl');
    await clickContinue(); // Child details → BioTriadStep

    await setFieldInput('sperm-source', 'You');
    await clickContinue(); // BioTriadStep → Other parents

    // Both genetic parents (Maria, ego) already exist, so the new-parent
    // partnership step is skipped and this continue finalises the wizard.
    await setFieldInput('hasOtherParents', false);
    await clickContinue(); // Other parents → done

    // -----------------------------------------------------------------------
    // Step 3: The union and the shared child render cleanly.
    // -----------------------------------------------------------------------
    const emmaNode = await screen.findByRole(
      'button',
      { name: 'Emma' },
      WIZARD_TIMEOUT,
    );
    expect(emmaNode).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Maria' })).toBeInTheDocument();
  },
};
