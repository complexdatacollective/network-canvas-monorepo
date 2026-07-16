import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../../.storybook/StoryInterviewShell';

function createNarrativeInterview(seed: number) {
  const si = new SyntheticInterview(seed);
  const nt = si.addNodeType({ name: 'Person' });
  const layoutVar1 = nt.addVariable({
    type: 'layout',
    name: 'Narrative Layout 1',
  });
  const layoutVar2 = nt.addVariable({
    type: 'layout',
    name: 'Narrative Layout 2',
  });
  const closeVar = nt.addVariable({
    type: 'boolean',
    name: 'Close Friend',
  });
  const trustedVar = nt.addVariable({
    type: 'boolean',
    name: 'Trusted',
  });
  const communityVar = nt.addVariable({
    type: 'categorical',
    name: 'Community',
    options: [
      { label: 'Family', value: 'family' },
      { label: 'Work', value: 'work' },
      { label: 'School', value: 'school' },
      { label: 'Neighborhood', value: 'neighborhood' },
    ],
  });
  const friendshipEt = si.addEdgeType({ name: 'Friendship' });
  const professionalEt = si.addEdgeType({ name: 'Professional' });
  return {
    si,
    nt,
    layoutVar1,
    layoutVar2,
    closeVar,
    trustedVar,
    communityVar,
    friendshipEt,
    professionalEt,
  };
}

function NarrativeStoryWrapper({
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
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/Narrative',
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj;

// --- Build functions ---

// Args-driven configuration for the primary `Default` story, so the Narrative
// interface options can be toggled live from the Storybook controls panel rather
// than being hard-coded per story. Group / edge / highlight data is seeded for as
// many nodes as `nodeCount` requests; turning an option off simply omits it from
// the preset, and a count of 0 reproduces the empty-network state.
type NarrativeArgs = {
  nodeCount: number;
  groups: boolean;
  edges: boolean;
  highlight: boolean;
  automaticLayout: boolean;
  allowRepositioning: boolean;
  freeDraw: boolean;
  concentricCircles: number;
};

const COMMUNITY_VALUES = ['family', 'work', 'school', 'neighborhood'] as const;

const buildFromArgs = (args: NarrativeArgs) => {
  const { si, layoutVar1, closeVar, communityVar, friendshipEt } =
    createNarrativeInterview(100);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });

  const stage = si.addStage('Narrative', {
    ...(args.nodeCount > 0 ? { initialNodes: { count: args.nodeCount } } : {}),
    behaviours: {
      automaticLayout: args.automaticLayout,
      allowRepositioning: args.allowRepositioning,
      freeDraw: args.freeDraw,
    },
    ...(args.concentricCircles > 0
      ? {
          background: {
            concentricCircles: args.concentricCircles,
            skewedTowardCenter: true,
          },
        }
      : {}),
  });

  stage.addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar1.id,
    ...(args.groups ? { groupVariable: communityVar.id } : {}),
    ...(args.edges ? { edges: { display: [friendshipEt.id] } } : {}),
    ...(args.highlight ? { highlight: [closeVar.id] } : {}),
  });

  if (args.groups) {
    for (let i = 0; i < args.nodeCount; i++) {
      si.setNodeAttribute(
        i,
        communityVar.id,
        COMMUNITY_VALUES[i % COMMUNITY_VALUES.length],
      );
    }
  }
  if (args.highlight) {
    for (let i = 0; i < args.nodeCount; i++) {
      si.setNodeAttribute(
        i,
        closeVar.id,
        i % 3 === 0 ? true : i % 3 === 1 ? false : null,
      );
    }
  }
  if (args.edges && args.nodeCount > 1) {
    const edgePairs: [number, number][] = [];
    for (let i = 0; i < args.nodeCount - 1; i++) edgePairs.push([i, i + 1]);
    for (let i = 0; i + 3 < args.nodeCount; i += 3) edgePairs.push([i, i + 3]);
    si.addEdges(edgePairs, friendshipEt.id);
  }

  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

function ConfigurableNarrative(props: NarrativeArgs) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildFromArgs(props).getInterviewPayload({ currentStep: 1 }),
      ),
    // Rebuild only when an arg actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(props)],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const buildConcentricCirclesBackground = () => {
  const { si, layoutVar1 } = createNarrativeInterview(102);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 8 },
    background: { concentricCircles: 4, skewedTowardCenter: true },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar1.id,
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildWithEdges = () => {
  const { si, layoutVar1, friendshipEt } = createNarrativeInterview(103);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 6 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
  });
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
      [3, 5],
      [4, 5],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildWithConvexHulls = () => {
  const { si, layoutVar1, communityVar } = createNarrativeInterview(104);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Community Groups',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
  });
  const groupValues: (string | string[] | null)[] = [
    'family',
    'family',
    'family',
    'work',
    'work',
    'work',
    'school',
    'school',
    'school',
    ['family', 'work'],
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildWithHighlighting = () => {
  const { si, layoutVar1, closeVar, trustedVar } =
    createNarrativeInterview(105);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 8 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Close Friends',
    layoutVariable: layoutVar1.id,
    highlight: [closeVar.id, trustedVar.id],
  });
  const hlValues = [true, false, true, null, true, false, true, false];
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildFullFeatured = () => {
  const {
    si,
    layoutVar1,
    closeVar,
    communityVar,
    friendshipEt,
    professionalEt,
  } = createNarrativeInterview(106);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Full View',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id, professionalEt.id] },
    groupVariable: communityVar.id,
    highlight: [closeVar.id],
  });
  const hlValues = [
    true,
    false,
    true,
    null,
    true,
    false,
    true,
    false,
    null,
    true,
  ];
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  const groupValues: (string | string[] | null)[] = [
    'family',
    'family',
    'family',
    'work',
    'work',
    'work',
    'school',
    'school',
    'school',
    ['family', 'school'],
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [1, 2],
      [3, 4],
      [4, 5],
    ],
    friendshipEt.id,
  );
  si.addEdges(
    [
      [3, 4],
      [3, 5],
      [6, 7],
    ],
    professionalEt.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildMultiplePresets = () => {
  const {
    si,
    layoutVar1,
    layoutVar2,
    closeVar,
    trustedVar,
    communityVar,
    friendshipEt,
    professionalEt,
  } = createNarrativeInterview(107);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: { automaticLayout: true },
  });
  stage.addPreset({
    label: 'Social View',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
    groupVariable: communityVar.id,
    highlight: [closeVar.id],
  });
  stage.addPreset({
    label: 'Professional View',
    layoutVariable: layoutVar2.id,
    edges: { display: [professionalEt.id] },
    highlight: [trustedVar.id],
  });
  stage.addPreset({
    label: 'Community Map',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
  });
  const hlValues = [
    true,
    false,
    true,
    null,
    true,
    false,
    true,
    false,
    null,
    true,
  ];
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  const groupValues: (string | string[] | null)[] = [
    'family',
    'family',
    'work',
    'work',
    'school',
    'school',
    ['family', 'school'],
    'work',
    'family',
    'school',
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  const trustedValues = Array.from({ length: 10 }, (_, i) =>
    i % 3 === 0 ? true : i % 3 === 1 ? false : null,
  );
  trustedValues.forEach((v, i) => {
    si.setNodeAttribute(i, trustedVar.id, v);
  });
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [4, 5],
      [6, 7],
    ],
    friendshipEt.id,
  );
  si.addEdges(
    [
      [0, 3],
      [1, 4],
      [5, 8],
      [6, 9],
    ],
    professionalEt.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildWithFreeDraw = () => {
  const { si, layoutVar1 } = createNarrativeInterview(108);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 5 },
    behaviours: { freeDraw: true, automaticLayout: true },
  }).addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar1.id,
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildWithRepositioning = () => {
  const { si, layoutVar1 } = createNarrativeInterview(109);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 6 },
    behaviours: { allowRepositioning: true, automaticLayout: true },
  }).addPreset({
    label: 'Social Network',
    layoutVariable: layoutVar1.id,
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildAllBehaviours = () => {
  const {
    si,
    layoutVar1,
    closeVar,
    communityVar,
    friendshipEt,
    professionalEt,
  } = createNarrativeInterview(110);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: {
      freeDraw: true,
      allowRepositioning: true,
      automaticLayout: true,
    },
  }).addPreset({
    label: 'Full View',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id, professionalEt.id] },
    groupVariable: communityVar.id,
    highlight: [closeVar.id],
  });
  const hlValues = [
    true,
    false,
    true,
    null,
    true,
    false,
    true,
    false,
    null,
    true,
  ];
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  const groupValues: (string | string[] | null)[] = [
    'family',
    'family',
    'family',
    'work',
    'work',
    'work',
    'school',
    'school',
    'school',
    ['family', 'work'],
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [3, 4],
      [4, 5],
      [6, 7],
      [7, 8],
    ],
    friendshipEt.id,
  );
  si.addEdges(
    [
      [0, 3],
      [3, 6],
      [1, 4],
    ],
    professionalEt.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildManyNodes = () => {
  const {
    si,
    layoutVar1,
    closeVar,
    communityVar,
    friendshipEt,
    professionalEt,
  } = createNarrativeInterview(111);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 15 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Full View',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id, professionalEt.id] },
    groupVariable: communityVar.id,
    highlight: [closeVar.id],
  });
  const hlValues = Array.from({ length: 15 }, (_, i) =>
    i % 3 === 0 ? true : i % 3 === 1 ? false : null,
  );
  hlValues.forEach((v, i) => {
    si.setNodeAttribute(i, closeVar.id, v);
  });
  const catValues = ['family', 'work', 'school', 'neighborhood'] as const;
  const groupValues = Array.from({ length: 15 }, (_, i) => catValues[i % 4]);
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [0, 5],
      [2, 7],
      [4, 9],
    ],
    friendshipEt.id,
  );
  si.addEdges(
    [
      [0, 4],
      [1, 8],
      [3, 11],
      [6, 14],
    ],
    professionalEt.id,
  );
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildSingleNodeGroups = () => {
  const { si, layoutVar1, communityVar } = createNarrativeInterview(112);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 4 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Community Groups',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
  });
  const groupValues: string[] = ['family', 'work', 'school', 'neighborhood'];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

const buildTwoNodeGroup = () => {
  const { si, layoutVar1, communityVar } = createNarrativeInterview(113);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 4 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Community Groups',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
  });
  const groupValues: string[] = ['family', 'family', 'work', 'work'];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addInformationStage({
    title: 'Complete',
    text: 'After the main stage.',
  });
  return si;
};

// --- SNA topology demos ---
//
// Each topology authors explicit, well-spread seed positions on the layout
// variable (normalized 0-1) so the read-only cohesion + collision layout has a
// realistic Sociogram-style arrangement to refine, rather than a pre-clustered
// blob. Positions are set via setNodeAttribute on the layout variable; nodes
// without a layout value are not rendered by the Narrative interface.

type Point = { x: number; y: number };

const setLayout = (
  si: SyntheticInterview,
  layoutVariableId: string,
  positions: Point[],
) => {
  positions.forEach((position, i) => {
    si.setNodeAttribute(i, layoutVariableId, position);
  });
};

const buildDyad = () => {
  const { si, layoutVar1, friendshipEt } = createNarrativeInterview(200);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 2 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Dyad',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
  });
  setLayout(si, layoutVar1.id, [
    { x: 0.32, y: 0.5 },
    { x: 0.68, y: 0.5 },
  ]);
  si.addEdges([[0, 1]], friendshipEt.id);
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildTriad = () => {
  const { si, layoutVar1, friendshipEt } = createNarrativeInterview(201);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 3 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Triad',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
  });
  setLayout(si, layoutVar1.id, [
    { x: 0.5, y: 0.28 },
    { x: 0.3, y: 0.66 },
    { x: 0.7, y: 0.66 },
  ]);
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildStar = () => {
  const { si, layoutVar1, friendshipEt } = createNarrativeInterview(202);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 7 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Hub and Spoke',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
  });
  // Node 0 is the central hub; nodes 1-6 are leaves arranged around it.
  setLayout(si, layoutVar1.id, [
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.18 },
    { x: 0.78, y: 0.32 },
    { x: 0.8, y: 0.68 },
    { x: 0.5, y: 0.82 },
    { x: 0.2, y: 0.68 },
    { x: 0.22, y: 0.32 },
  ]);
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildClique = () => {
  const { si, layoutVar1, communityVar, friendshipEt } =
    createNarrativeInterview(203);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 5 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Clique',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
    edges: { display: [friendshipEt.id] },
  });
  setLayout(si, layoutVar1.id, [
    { x: 0.5, y: 0.22 },
    { x: 0.78, y: 0.42 },
    { x: 0.68, y: 0.76 },
    { x: 0.32, y: 0.76 },
    { x: 0.22, y: 0.42 },
  ]);
  // All five nodes belong to a single group.
  for (let i = 0; i < 5; i++) {
    si.setNodeAttribute(i, communityVar.id, 'family');
  }
  si.addEdges(
    [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 2],
      [1, 3],
      [1, 4],
      [2, 3],
      [2, 4],
      [3, 4],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildPathChain = () => {
  const { si, layoutVar1, friendshipEt } = createNarrativeInterview(204);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 6 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Path',
    layoutVariable: layoutVar1.id,
    edges: { display: [friendshipEt.id] },
  });
  // Six nodes spread along a gentle line so the chain stays legible.
  setLayout(si, layoutVar1.id, [
    { x: 0.12, y: 0.4 },
    { x: 0.27, y: 0.56 },
    { x: 0.42, y: 0.42 },
    { x: 0.57, y: 0.58 },
    { x: 0.72, y: 0.44 },
    { x: 0.87, y: 0.6 },
  ]);
  si.addEdges(
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildTwoCommunitiesBroker = () => {
  const { si, layoutVar1, communityVar, friendshipEt } =
    createNarrativeInterview(205);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Two Communities + Broker',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
    edges: { display: [friendshipEt.id] },
  });
  // Nodes 0-4 are the left community (broker = node 4); nodes 5-9 are the right
  // community (broker = node 5). Seeded on opposite sides of the canvas.
  setLayout(si, layoutVar1.id, [
    { x: 0.16, y: 0.22 },
    { x: 0.1, y: 0.55 },
    { x: 0.22, y: 0.78 },
    { x: 0.3, y: 0.4 },
    { x: 0.38, y: 0.55 },
    { x: 0.62, y: 0.45 },
    { x: 0.7, y: 0.6 },
    { x: 0.78, y: 0.22 },
    { x: 0.9, y: 0.45 },
    { x: 0.84, y: 0.78 },
  ]);
  const groupValues: string[] = [
    'family',
    'family',
    'family',
    'family',
    'family',
    'work',
    'work',
    'work',
    'work',
    'work',
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      // Left community internal ties.
      [0, 1],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 4],
      [3, 4],
      // Right community internal ties.
      [5, 6],
      [5, 8],
      [6, 9],
      [7, 8],
      [8, 9],
      [5, 7],
      // Single bridge edge between the two brokers (node 4 and node 5).
      [4, 5],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildCorePeriphery = () => {
  const { si, layoutVar1, communityVar, friendshipEt } =
    createNarrativeInterview(206);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 10 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Core-Periphery',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
    edges: { display: [friendshipEt.id] },
  });
  // Nodes 0-3 are a dense central core (one group); nodes 4-9 are peripheral,
  // each tied to a single core node.
  setLayout(si, layoutVar1.id, [
    { x: 0.42, y: 0.4 },
    { x: 0.58, y: 0.4 },
    { x: 0.58, y: 0.6 },
    { x: 0.42, y: 0.6 },
    { x: 0.5, y: 0.14 },
    { x: 0.86, y: 0.26 },
    { x: 0.88, y: 0.74 },
    { x: 0.5, y: 0.88 },
    { x: 0.14, y: 0.74 },
    { x: 0.12, y: 0.26 },
  ]);
  // Only the core shares a group so a single hull surrounds it.
  for (let i = 0; i < 4; i++) {
    si.setNodeAttribute(i, communityVar.id, 'family');
  }
  si.addEdges(
    [
      // Dense core: every pair connected.
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 2],
      [1, 3],
      [2, 3],
      // Periphery: each leaf tied to one core node.
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
      [0, 8],
      [1, 9],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const buildEgoNetwork = () => {
  const { si, layoutVar1, communityVar, friendshipEt } =
    createNarrativeInterview(207);
  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('Narrative', {
    initialNodes: { count: 8 },
    behaviours: { automaticLayout: true },
  }).addPreset({
    label: 'Ego Network',
    layoutVariable: layoutVar1.id,
    groupVariable: communityVar.id,
    edges: { display: [friendshipEt.id] },
  });
  // Node 0 is the ego, centrally placed; nodes 1-7 are alters grouped by type
  // and arranged around the ego.
  setLayout(si, layoutVar1.id, [
    { x: 0.5, y: 0.5 },
    { x: 0.28, y: 0.2 },
    { x: 0.5, y: 0.14 },
    { x: 0.74, y: 0.22 },
    { x: 0.84, y: 0.55 },
    { x: 0.68, y: 0.84 },
    { x: 0.3, y: 0.84 },
    { x: 0.16, y: 0.52 },
  ]);
  // Ego unassigned; alters split across family / work / school so multiple
  // hulls render. Node 4 belongs to TWO groups (work + school) to exercise
  // between-hulls placement for a multi-membership alter.
  const groupValues: (string | string[] | null)[] = [
    null,
    'family',
    'family',
    'work',
    ['work', 'school'],
    'school',
    'school',
    'family',
  ];
  groupValues.forEach((v, i) => {
    si.setNodeAttribute(i, communityVar.id, v);
  });
  si.addEdges(
    [
      // Ego tied to every alter.
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [0, 7],
      // A few alter-alter ties within shared groups.
      [1, 2],
      [5, 6],
      [3, 4],
    ],
    friendshipEt.id,
  );
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

// --- Stories ---

// Primary, fully configurable story: every Narrative interface option is wired
// to a Storybook control so the layout can be explored without editing code.
// A node count of 0 reproduces the former empty-network story.
export const Default: StoryObj<NarrativeArgs> = {
  args: {
    nodeCount: 8,
    groups: true,
    edges: true,
    highlight: false,
    automaticLayout: true,
    allowRepositioning: true,
    freeDraw: false,
    concentricCircles: 4,
  },
  argTypes: {
    nodeCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    groups: { control: 'boolean' },
    edges: { control: 'boolean' },
    highlight: { control: 'boolean' },
    automaticLayout: { control: 'boolean' },
    allowRepositioning: { control: 'boolean' },
    freeDraw: { control: 'boolean' },
    concentricCircles: { control: { type: 'range', min: 1, max: 6, step: 1 } },
  },
  render: (args) => <ConfigurableNarrative {...args} />,
};

export const ConcentricCirclesBackground: Story = {
  render: () => (
    <NarrativeStoryWrapper buildFn={buildConcentricCirclesBackground} />
  ),
};

export const WithEdges: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildWithEdges} />,
};

export const WithConvexHulls: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildWithConvexHulls} />,
};

export const WithHighlighting: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildWithHighlighting} />,
};

export const FullFeatured: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildFullFeatured} />,
};

export const MultiplePresets: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildMultiplePresets} />,
};

export const WithFreeDraw: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildWithFreeDraw} />,
};

export const WithRepositioning: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildWithRepositioning} />,
};

export const AllBehaviours: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildAllBehaviours} />,
};

export const ManyNodes: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildManyNodes} />,
};

export const SingleNodeGroups: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildSingleNodeGroups} />,
};

export const TwoNodeGroup: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildTwoNodeGroup} />,
};

// --- SNA topology demo stories ---

export const Dyad: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildDyad} />,
  parameters: {
    docs: {
      description: {
        story: 'Dyad: two connected nodes joined by a single edge.',
      },
    },
  },
};

export const Triad: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildTriad} />,
  parameters: {
    docs: {
      description: {
        story: 'Triad: three nodes forming a closed triangle (three edges).',
      },
    },
  },
};

export const Star: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildStar} />,
  parameters: {
    docs: {
      description: {
        story:
          'Star / hub-and-spoke: one central hub connected to six surrounding leaves.',
      },
    },
  },
};

export const Clique: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildClique} />,
  parameters: {
    docs: {
      description: {
        story:
          'Clique: five fully connected nodes, all belonging to a single group.',
      },
    },
  },
};

export const PathChain: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildPathChain} />,
  parameters: {
    docs: {
      description: {
        story:
          'Path / chain: six nodes connected in a line, testing that collision keeps the chain legibly spaced.',
      },
    },
  },
};

export const TwoCommunitiesBroker: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildTwoCommunitiesBroker} />,
  parameters: {
    docs: {
      description: {
        story:
          'Two communities + broker: two internally well-connected groups joined by a single bridge edge between one broker node in each.',
      },
    },
  },
};

export const CorePeriphery: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildCorePeriphery} />,
  parameters: {
    docs: {
      description: {
        story:
          'Core-periphery: a dense interconnected core (one group) surrounded by peripheral nodes each tied to a core node.',
      },
    },
  },
};

export const EgoNetwork: Story = {
  render: () => <NarrativeStoryWrapper buildFn={buildEgoNetwork} />,
  parameters: {
    docs: {
      description: {
        story:
          'Ego network: an ego connected to seven alters grouped by type (family, work, school), with one alter in two groups and a few alter-alter ties.',
      },
    },
  },
};
