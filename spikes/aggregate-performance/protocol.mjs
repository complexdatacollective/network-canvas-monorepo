// The synthetic protocol used to seed the spike: one person node type with
// realistic attribute variables, two edge types collected by dyad-census
// stages. Sized (via generation config) to land under the brief's bounds of
// <100 nodes / <300 edges per session.

export const codebook = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      variables: {
        'var-name': { name: 'name', type: 'text' },
        'var-age': { name: 'age', type: 'number' },
        'var-support': { name: 'providesSupport', type: 'boolean' },
      },
    },
  },
  edge: {
    know: { name: 'Knows', color: 'edge-color-seq-1' },
    support: { name: 'Supports', color: 'edge-color-seq-2' },
  },
};

export const stages = [
  {
    id: 'stage-ng',
    type: 'NameGenerator',
    label: 'People you know',
    subject: { entity: 'node', type: 'person' },
    form: {
      title: 'Add a person',
      fields: [
        { variable: 'var-name', prompt: 'What is their name?' },
        { variable: 'var-age', prompt: 'How old are they?' },
        { variable: 'var-support', prompt: 'Do they support you?' },
      ],
    },
    prompts: [{ id: 'p-ng', text: 'Who do you know?' }],
  },
  {
    id: 'stage-census-know',
    type: 'DyadCensus',
    label: 'Who knows whom',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p-know', text: 'Do these people know each other?', createEdge: 'know' },
    ],
  },
  {
    id: 'stage-census-support',
    type: 'DyadCensus',
    label: 'Who supports whom',
    subject: { entity: 'node', type: 'person' },
    prompts: [
      { id: 'p-support', text: 'Does one support the other?', createEdge: 'support' },
    ],
  },
];

// Node window 70–95 and per-pair census probability tuned so a session lands
// around 60–95 nodes and 150–290 edges.
export const generationConfig = {
  nodeCount: { min: 70, max: 95 },
  censusEdgeProbability: { min: 0.025, max: 0.045 },
};
