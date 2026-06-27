import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen } from 'storybook/test';
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
      // Node 6 (cousin) has no name so getDisplayLabel falls back to "Cousin".
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
    // network is pre-seeded. Verify the unnamed cousin node is labelled
    // "Cousin" — the path parent,parent,child,child resolves via Robert.
    const cousinNode = await screen.findByRole('button', { name: 'Cousin' });
    expect(cousinNode).toBeInTheDocument();

    // Sanity-check that named intermediaries are also on the canvas.
    expect(screen.getByRole('button', { name: 'Linda' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robert' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'George' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Helen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Carol' })).toBeInTheDocument();
  },
};
