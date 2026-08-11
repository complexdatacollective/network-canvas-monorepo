import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import { OneToManyDyadCensusFixture } from '../fixtures/one-to-many-dyad-census-fixture.js';
import type { InterfaceScenarios } from './types.js';

/** Build a node type with a real "name" text variable id. */
function addPersonType(synth: SyntheticInterview, typeName = 'Person') {
  const nt = synth.addNodeType({ name: typeName });
  const nameVar = nt.addVariable({ name: 'name', type: 'text' });
  return { nt, nameVarId: nameVar.id };
}

export const oneToManyDyadCensusScenarios: InterfaceScenarios = {
  interfaceType: 'OneToManyDyadCensus',
  scenarios: [
    {
      id: 'basic-source-target-edge-creation',
      covers: [
        'subject.type',
        'prompts[].createEdge',
        'prompts[].text',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      // Manual nodes only reach the session network when seedNetwork is set;
      // buildSyntheticPayload wipes nodes/edges otherwise (synthetic-payload.ts).
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth, 'Person');
        const { nt: place, nameVarId: placeNameVarId } = addPersonType(
          synth,
          'Place',
        );
        const friendship = synth.addEdgeType({ name: 'Friendship' });

        const stage = synth.addStage('OneToManyDyadCensus', {
          label: 'INTERNAL LABEL SHOULD NOT SHOW',
          interviewScript: 'INTERNAL SCRIPT SHOULD NOT SHOW',
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });

        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        synth.addManualNode(stage.id, place.id, 'pl-library', {
          [placeNameVarId]: 'Library',
        });
        synth.addManualNode(stage.id, place.id, 'pl-park', {
          [placeNameVarId]: 'Park',
        });

        stage.addPrompt({
          text: '**Bold** dyad prompt with _italic_ text',
          createEdge: friendship.id,
        });

        return synth;
      },
      run: async ({ page, stage }) => {
        const census = new OneToManyDyadCensusFixture(page);

        // subject.type: only the Person nodes are focal/target candidates; the
        // 2 Place nodes never appear as focal or target candidates.
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');
        await expect
          .poll(() => census.getTargetLabels())
          .toEqual(['Alice', 'Bob']);
        await expect(page.getByRole('option', { name: 'Library' })).toHaveCount(
          0,
        );
        await expect(page.getByRole('option', { name: 'Park' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Library' })).toHaveCount(
          0,
        );
        await expect(page.getByRole('button', { name: 'Park' })).toHaveCount(0);

        // prompts[].text: markdown renders as elements, not literal syntax.
        const prompt = stage.getPrompt();
        await expect(
          prompt.locator('strong', { hasText: 'Bold' }),
        ).toBeVisible();
        await expect(prompt.locator('em', { hasText: 'italic' })).toBeVisible();

        // Single prompt renders no Pips.
        await expect(census.getPips()).toHaveCount(0);

        // label / interviewScript: author-only, never rendered (base.ts, #663).
        await expect(
          page.getByText('INTERNAL LABEL SHOULD NOT SHOW'),
        ).toHaveCount(0);
        await expect(
          page.getByText('INTERNAL SCRIPT SHOULD NOT SHOW'),
        ).toHaveCount(0);

        // prompts[].createEdge: clicking a target toggles a typed edge.
        await census.toggleTarget('Alice');
        await expect.poll(() => census.isTargetSelected('Alice')).toBe(true);
        expect(await census.isTargetSelected('Bob')).toBe(false);
      },
    },

    {
      id: 'remove-after-consideration-true',
      covers: ['behaviours.removeAfterConsideration'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: true },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({ createEdge: friendship.id });
        return synth;
      },
      run: async ({ page, interview }) => {
        const census = new OneToManyDyadCensusFixture(page);
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');

        // Within-stage focal advance: the URL step doesn't change, so
        // interview.next() (which waits for a step change) would hang. Click
        // the raw next button and settle on the new focal label instead.
        await interview.nextButton.click();
        await expect.poll(() => census.getSourceLabel()).toBe('Alice');

        // Carol was already the focal/considered node — pruned from Alice's
        // target list (OneToManyDyadCensus.tsx:154-162).
        await expect(census.getTargetNode('Carol')).toHaveCount(0);
        await expect(census.getTargetNode('Bob')).toBeVisible();
      },
    },

    {
      id: 'remove-after-consideration-false',
      covers: ['behaviours.removeAfterConsideration'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({ createEdge: friendship.id });
        return synth;
      },
      run: async ({ page, interview }) => {
        const census = new OneToManyDyadCensusFixture(page);
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');

        await interview.nextButton.click();
        await expect.poll(() => census.getSourceLabel()).toBe('Alice');

        // false: Carol is NOT pruned from later target lists — proves the
        // passthrough branch (OneToManyDyadCensus.tsx:155) is taken.
        await expect(census.getTargetNode('Carol')).toBeVisible();
      },
    },

    {
      id: 'multi-prompt-createEdge-per-prompt-and-back-nav',
      covers: ['prompts (array length > 1)', 'prompts[].createEdge'],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const advice = synth.addEdgeType({ name: 'Advice' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          text: 'Prompt one: friendship',
          createEdge: friendship.id,
        });
        stage.addPrompt({ text: 'Prompt two: advice', createEdge: advice.id });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        const census = new OneToManyDyadCensusFixture(page);

        // 2 prompts: exactly 2 pip dots, first active.
        await expect(census.getPips()).toHaveCount(2);
        await expect.poll(() => census.getActivePipIndex()).toBe(0);

        // Prompt 0, focal Carol: create a Friendship edge to Alice.
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');
        await census.toggleTarget('Alice');
        await expect.poll(() => census.isTargetSelected('Alice')).toBe(true);

        // Advance through the remaining focal nodes of prompt 0 (Alice, Bob)
        // then cross the prompt boundary into prompt 1. Each of these is a
        // within-stage advance that leaves the URL step unchanged, so raw
        // nextButton clicks + content waits are required (interview.next()
        // would hang waiting for a step change that never comes).
        await interview.nextButton.click(); // Carol -> Alice
        await expect.poll(() => census.getSourceLabel()).toBe('Alice');
        await interview.nextButton.click(); // Alice -> Bob
        await expect.poll(() => census.getSourceLabel()).toBe('Bob');
        await interview.nextButton.click(); // Bob -> crosses into prompt 1

        await expect(stage.getPrompt('Prompt two: advice')).toBeVisible();
        await expect.poll(() => census.getActivePipIndex()).toBe(1);
        // Forward entry reseeds to the FIRST focal node.
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');

        // Prompt 1, focal Carol again: create an Advice edge to the same
        // Alice target — same pair, different edge type.
        await census.toggleTarget('Alice');
        await expect.poll(() => census.isTargetSelected('Alice')).toBe(true);

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(2);
        const carolUid = 'p-carol';
        const aliceUid = 'p-alice';
        const friendshipEdge = network!.edges.find(
          (e) => e.from === carolUid && e.to === aliceUid,
        );
        const adviceEdge = network!.edges.find(
          (e) =>
            e.from === carolUid && e.to === aliceUid && e !== friendshipEdge,
        );
        expect(friendshipEdge).toBeDefined();
        expect(adviceEdge).toBeDefined();
        expect(friendshipEdge?.type).not.toBe(adviceEdge?.type);

        // Back once from prompt 1's first focal node: crosses back into
        // prompt 0 and resumes on the LAST node (Bob), not the first — the
        // #668 regression this option specifically documents.
        await page.getByTestId('previous-button').click();
        await expect(stage.getPrompt('Prompt one: friendship')).toBeVisible();
        await expect.poll(() => census.getActivePipIndex()).toBe(0);
        await expect.poll(() => census.getSourceLabel()).toBe('Bob');
        // The boundary crossing re-runs the target list's exit + entrance
        // choreography, and the source label settles before the targets do.
        // Wait for both targets so the visual capture (and baseline
        // regeneration) can't record the transient empty panel — the bad
        // chromium baseline committed in #1057.
        await census.waitForTargetSettled('Carol');
        await census.waitForTargetSettled('Alice');
      },
    },

    {
      id: 'bucket-sort-order-name-asc',
      covers: ['prompts[].bucketSortOrder'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          bucketSortOrder: [{ property: nameVarId, direction: 'asc' }],
        });
        return synth;
      },
      run: async ({ page, interview }) => {
        const census = new OneToManyDyadCensusFixture(page);
        // Alice, not Carol: the sort overrides creation order.
        await expect.poll(() => census.getSourceLabel()).toBe('Alice');
        await interview.nextButton.click();
        await expect.poll(() => census.getSourceLabel()).toBe('Bob');
        await interview.nextButton.click();
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');
      },
    },

    {
      id: 'bin-sort-order-name-asc',
      covers: ['prompts[].binSortOrder'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        // Deliberately non-alphabetical creation order so binSortOrder is
        // observable in the target list.
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          binSortOrder: [{ property: nameVarId, direction: 'asc' }],
        });
        return synth;
      },
      run: async ({ page }) => {
        const census = new OneToManyDyadCensusFixture(page);
        await expect.poll(() => census.getSourceLabel()).toBe('Carol');
        // Alphabetical, NOT the creation-remainder order ['Bob','Alice'] that
        // would render absent binSortOrder.
        await expect
          .poll(() => census.getTargetLabels())
          .toEqual(['Alice', 'Bob']);
      },
    },

    {
      id: 'creation-order-sort-rule-asterisk',
      covers: ['prompts[].bucketSortOrder'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          bucketSortOrder: [{ property: '*', direction: 'desc' }],
        });
        return synth;
      },
      run: async ({ page }) => {
        const census = new OneToManyDyadCensusFixture(page);
        // Bob is the LAST-created node: '*' sorts by creation index and
        // direction:'desc' reverses insertion order — proving the magic '*'
        // property key is a resolvable sort rule, not an implicit fallback.
        await expect.poll(() => census.getSourceLabel()).toBe('Bob');
      },
    },
  ],
};
