/**
 * Interview sessions as the schema 8 interview recorded them against the
 * released CEGRM template (`eco-genetic-relationship-maps.schema-8.json`),
 * whose Family Pedigree is stage 3 and has an introduction screen.
 *
 * The shapes follow the schema 8 runtime on `main` (packages/interview/src/
 * interfaces/FamilyPedigree/store.ts): finalizing wrote each person with
 * `addNode` (stage id set, no prompt, the computed relationship to the
 * participant added) and each relationship with `addEdge`, then
 * `syncMetadata` wrote the stage record under the pedigree's stage index:
 * `{ isNetworkCommitted, edgeIdVersion, nodes, edges, noChildrenAffirmed,
 * selectedFraming }`, `nodes` being `{ id, label, isEgo }` with a person's
 * name, or the label the interview computed for them, as `label`.
 */

export const PEDIGREE_INDEX = 3;

const person = (
  id: string,
  attributes: Record<string, unknown>,
): Record<string, unknown> => ({
  _uid: id,
  type: 'person',
  attributes,
  promptIDs: [],
  stageId: 'family-pedigree',
});

const relationship = (
  id: string,
  from: string,
  to: string,
  attributes: Record<string, unknown>,
) => ({ _uid: id, type: 'family_relationship', from, to, attributes });

/** The family a participant drew: themself, their parents and a sister. */
export const pedigreePeople = [
  person('ego-1', {
    is_ego: true,
    biologicalSex: ['female'],
    living_status: ['living'],
    birth_year: 1971,
    has_condition: true,
  }),
  person('mother-1', {
    is_ego: false,
    biologicalSex: ['female'],
    living_status: ['deceased'],
    birth_year: 1945,
    relationship_to_ego: 'Mother',
    has_condition: true,
    had_testing: false,
  }),
  person('father-1', {
    is_ego: false,
    name: 'Joe',
    biologicalSex: ['male'],
    living_status: ['living'],
    relationship_to_ego: 'Father',
  }),
  person('sister-1', {
    is_ego: false,
    name: 'Ana',
    biologicalSex: ['female'],
    living_status: ['living'],
    birth_year: 1974,
    relationship_to_ego: 'Sister',
    had_testing: true,
  }),
];

export const pedigreeRelationships = [
  relationship('edge-mother-ego', 'mother-1', 'ego-1', {
    relationshipType: ['biological'],
    gameteRole: ['egg'],
    isGestationalCarrier: true,
  }),
  relationship('edge-father-ego', 'father-1', 'ego-1', {
    relationshipType: ['biological'],
    gameteRole: ['sperm'],
  }),
  relationship('edge-mother-sister', 'mother-1', 'sister-1', {
    relationshipType: ['biological'],
    gameteRole: ['egg'],
    isGestationalCarrier: true,
  }),
  relationship('edge-father-sister', 'father-1', 'sister-1', {
    relationshipType: ['biological'],
    gameteRole: ['sperm'],
  }),
  relationship('edge-parents', 'mother-1', 'father-1', {
    relationshipType: ['partner'],
    isActive: false,
  }),
];

/** Someone named on the later "People in your life" stage, of the same type. */
export const friend = {
  _uid: 'friend-1',
  type: 'person',
  attributes: {
    name: 'Sam',
    tie_type: ['friend'],
    closeness: 4,
    exch_emotional: true,
  },
  promptIDs: ['p-friends'],
  stageId: 'ng-non-kin',
};

const labels: Record<string, string> = {
  'ego-1': '',
  'mother-1': 'Mother',
  'father-1': 'Joe',
  'sister-1': 'Ana',
};

const recordNodes = (people: readonly Record<string, unknown>[]) =>
  people.map((node) => ({
    id: node._uid as string,
    label: labels[node._uid as string] ?? '',
    isEgo: (node.attributes as Record<string, unknown>).is_ego === true,
  }));

const recordEdges = (edges: readonly Record<string, unknown>[]) =>
  edges.map((edge) => ({
    id: edge._uid as string,
    from: edge.from as string,
    to: edge.to as string,
    attributes: edge.attributes as Record<string, unknown>,
  }));

/** The stage record a finalized pedigree left. */
export const committedRecord = () => ({
  isNetworkCommitted: true,
  edgeIdVersion: 1 as const,
  nodes: recordNodes(pedigreePeople),
  edges: recordEdges(pedigreeRelationships),
  noChildrenAffirmed: true,
  selectedFraming: 'gendered' as const,
});

/**
 * The stage record a participant left by ticking "no children" while still
 * building: marked as finalized, with the in-memory family's ids, none of it
 * in the network. Person attributes other than the label and ego flag were
 * never written anywhere.
 */
export const uncommittedRecord = () => ({
  ...committedRecord(),
  selectedFraming: 'gamete' as const,
});

export const ego = {
  _uid: 'network-ego',
  attributes: { participant_consent: true, ego_age: 54 },
};

/**
 * A session finalized past the pedigree, resuming at `currentStep`, with the
 * friend named on the later stage.
 */
export const committedSession = (currentStep: number) => ({
  network: {
    ego: structuredClone(ego),
    nodes: structuredClone([...pedigreePeople, friend]),
    edges: structuredClone(pedigreeRelationships),
  },
  stageMetadata: { [PEDIGREE_INDEX]: committedRecord() },
  currentStep,
});

/** A session whose family exists only in the pedigree's stage record. */
export const uncommittedSession = () => ({
  network: {
    ego: structuredClone(ego),
    nodes: [] as Record<string, unknown>[],
    edges: [] as Record<string, unknown>[],
  },
  stageMetadata: { [PEDIGREE_INDEX]: uncommittedRecord() },
  currentStep: PEDIGREE_INDEX,
});
