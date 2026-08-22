import { describe, expect, it } from 'vitest';

import type { Stage } from '@codaco/protocol-validation';

import { REGISTRY } from '../../index';
import { simulateContentStage } from '../contentStages';
import { harnessFor, type Harness, parseProtocol } from './harness';

/**
 * C4 for the content stages: the interfaces that persist nothing, and the one
 * property that says so.
 *
 * "Writes nothing" is asserted against the write TRACE rather than against the
 * network, because a write can be a no-op in the fold and still be a write the
 * interface could not have made — a `transitionStage` a simulator dispatched
 * for itself, say, or an `updateNode` whose patch happened to be empty. The
 * folded session is compared as well, so a mutation that bypassed the engine
 * entirely would be caught too.
 *
 * The list is derived from the REGISTRY rather than written out here, so a
 * fifth stage type filed under the no-op — or one of these four quietly given
 * a simulator of its own — changes what this test runs rather than slipping
 * past it.
 */

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        nickname: { name: 'nickname', type: 'text', component: 'Text' },
        layout: { name: 'layout', type: 'layout' },
        hasCancer: { name: 'hasCancer', type: 'boolean' },
        egoIsEgo: { name: 'egoIsEgo', type: 'boolean' },
        personLabel: { name: 'personLabel', type: 'text' },
        personRel: { name: 'personRel', type: 'text' },
        personBioSex: { name: 'personBioSex', type: 'text' },
      },
    },
  },
  edge: {
    family: {
      name: 'Family',
      color: 'edge-color-seq-1',
      variables: {
        familyRelType: { name: 'familyRelType', type: 'text' },
        familyIsActive: { name: 'familyIsActive', type: 'boolean' },
        familyIsGc: { name: 'familyIsGc', type: 'boolean' },
        familyGameteRole: { name: 'familyGameteRole', type: 'text' },
      },
    },
  },
  ego: {
    variables: {
      consent: { name: 'consent', type: 'boolean' },
    },
  },
};

const familyPedigree = {
  id: 'fp1',
  type: 'FamilyPedigree',
  label: 'Your family',
  nodeConfig: {
    type: 'person',
    nodeLabelVariable: 'personLabel',
    egoVariable: 'egoIsEgo',
    relationshipVariable: 'personRel',
    biologicalSexVariable: 'personBioSex',
  },
  edgeConfig: {
    type: 'family',
    relationshipTypeVariable: 'familyRelType',
    isActiveVariable: 'familyIsActive',
    isGestationalCarrierVariable: 'familyIsGc',
    gameteRoleVariable: 'familyGameteRole',
  },
  censusPrompt: 'Build your family',
  framing: { mode: 'fixed', value: 'gamete' },
  boundaries: {
    requireGrandparents: 'off',
    requireChildrenContributors: 'off',
  },
};

/** One stage of each type the registry files under the no-op simulator. */
const CONTENT_STAGES: Record<string, Record<string, unknown>> = {
  Information: {
    id: 'information',
    type: 'Information',
    label: 'Welcome',
    title: 'Welcome',
    items: [{ id: 'i1', type: 'text', content: 'Thanks for taking part.' }],
  },
  Narrative: {
    id: 'narrative',
    type: 'Narrative',
    label: 'Your network',
    subject: { entity: 'node', type: 'person' },
    presets: [{ id: 'preset-1', label: 'Everyone', layoutVariable: 'layout' }],
    background: { concentricCircles: 3 },
  },
  Anonymisation: {
    id: 'anonymisation',
    type: 'Anonymisation',
    label: 'Protect your answers',
    explanationText: {
      title: 'Protect your answers',
      body: 'Choose a passphrase.',
    },
  },
  NarrativePedigree: {
    id: 'narrative-pedigree',
    type: 'NarrativePedigree',
    label: 'Your family history',
    sourceStageId: 'fp1',
    diseases: [
      {
        id: 'disease-1',
        label: 'Cancer',
        color: '#ff0000',
        variable: 'hasCancer',
        inheritancePattern: 'autosomalDominant',
      },
    ],
  },
};

/** Every stage type the registry files under the shared no-op. */
const registeredNoOps = Object.entries(REGISTRY)
  .filter(([, simulator]) => simulator === simulateContentStage)
  .map(([type]) => type)
  .toSorted();

/**
 * A session with something in every corner the engine can write to, so a
 * simulator that wrote anywhere has somewhere to be seen doing it.
 */
const setUp = (): Harness => {
  const protocol = parseProtocol(CODEBOOK, [
    familyPedigree,
    ...Object.values(CONTENT_STAGES),
  ]);
  const harness = harnessFor(protocol, { captureTrace: true });

  harness.seedAlters(3, {
    currentStep: 0,
    attributes: (index) => ({ nickname: `Alter ${index}` }),
  });
  harness.engine.addEdge({
    edgeType: 'family',
    uid: 'edge-0',
    from: 'alter-0',
    to: 'alter-1',
    attributeData: { familyIsActive: true },
    currentStep: 0,
  });
  harness.engine.updateEgo({
    attributePatch: { set: { consent: true }, unset: [] },
  });
  harness.engine.updateStageMetadata({
    currentStep: 0,
    metadata: [[0, 'alter-0', 'alter-1', true]],
  });

  return harness;
};

const stageNamed = (harness: Harness, id: string): Stage => {
  const stage = harness.context.protocol.stages.find(
    (candidate) => candidate.id === id,
  );
  if (!stage) throw new Error(`fixture is missing stage "${id}"`);
  return stage;
};

describe('the content stages', () => {
  it('are the four the registry files under the shared no-op', () => {
    expect(registeredNoOps).toEqual([
      'Anonymisation',
      'Information',
      'Narrative',
      'NarrativePedigree',
    ]);
  });

  it('has a fixture for each of them', () => {
    // A list derived from the registry could otherwise grow past the fixtures
    // and leave the cases below silently testing fewer stages than it names.
    expect(Object.keys(CONTENT_STAGES).toSorted()).toEqual(registeredNoOps);
  });

  it.each(registeredNoOps)('%s dispatches nothing', (type) => {
    const harness = setUp();
    const stage = stageNamed(harness, String(CONTENT_STAGES[type]?.id));
    const from = harness.trace().length;

    simulateContentStage(stage, harness.context, undefined);

    expect(harness.trace().slice(from)).toEqual([]);
  });

  it.each(registeredNoOps)(
    '%s leaves the session exactly as it was',
    (type) => {
      const harness = setUp();
      const stage = stageNamed(harness, String(CONTENT_STAGES[type]?.id));
      const before = structuredClone(harness.engine.draft);

      simulateContentStage(stage, harness.context, undefined);

      expect(harness.engine.draft).toStrictEqual(before);
    },
  );

  it('writes nothing across all four in one session either', () => {
    // Run back to back on one session, as the walk would: a simulator that
    // only wrote on a second visit, or only after another content stage had
    // run, would still be a write.
    const harness = setUp();
    const before = structuredClone(harness.engine.draft);
    const from = harness.trace().length;

    for (const type of registeredNoOps) {
      simulateContentStage(
        stageNamed(harness, String(CONTENT_STAGES[type]?.id)),
        harness.context,
        undefined,
      );
    }

    expect(harness.trace().slice(from)).toEqual([]);
    expect(harness.engine.draft).toStrictEqual(before);
  });
});
