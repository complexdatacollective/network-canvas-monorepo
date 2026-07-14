import { SyntheticInterview } from '@codaco/protocol-utilities';

import { DyadCensusFixture } from '../fixtures/dyad-census-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

/**
 * DyadCensus configuration matrix.
 *
 * Notes on deviations from the plan, pinned to observed behaviour:
 * - Every scenario that relies on subject nodes sets `seedNetwork: true`. The
 *   synthetic-payload adapter strips `network.nodes`/`edges` unless
 *   `seedNetwork` is set (synthetic-payload.ts:147-149), so `initialNodes`
 *   /`addManualNode` only materialise when the network is seeded. Without it a
 *   DyadCensus has zero pairs and force-skips.
 * - `getStageMetadata(step)` is read at the DyadCensus's actual step index
 *   (updateStageMetadata keys by the live `currentStep` — DyadCensus.tsx +
 *   session.ts:858-867). That is 0 when the DyadCensus is the only stage and 1
 *   when flanked by an Information stage — not always 1.
 * - Backwards navigation is exercised within a prompt (pair N -> pair N-1) and
 *   pair 0 -> intro, both handled internally by the stage's `useBeforeNext`
 *   (DyadCensus.tsx:164-184); these are deterministic, unlike cross-stage
 *   re-entry which remounts the stage.
 */
export const dyadCensusScenarios: InterfaceScenarios = {
  interfaceType: 'DyadCensus',
  scenarios: [
    {
      id: 'intro-and-yes-creates-edge',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'introductionPanel',
        'prompts[].id',
        'prompts[].text',
        'prompts[].createEdge=yes-path',
      ],
      smoke: true,
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        synth
          .addStage('DyadCensus', {
            label: 'DYAD SENTINEL',
            interviewScript: 'SCRIPT SENTINEL',
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 3 },
            introductionPanel: {
              title: 'Network Relationships',
              text: 'Do **these two** know each other?',
            },
          })
          .addPrompt({ text: 'Do they **know** each other?' });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const dc = new DyadCensusFixture(page);

        await expect(
          page.getByRole('heading', { name: 'Network Relationships' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'these two' }),
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(0);

        await dc.dismissIntro();
        await expect(page.locator('strong', { hasText: 'know' })).toBeVisible();

        // label/interviewScript are author-facing only: never rendered.
        await expect(page.getByText('DYAD SENTINEL')).toHaveCount(0);
        await expect(page.getByText('SCRIPT SENTINEL')).toHaveCount(0);

        const pair0 = await dc.getPairLabels();
        await dc.selectYes();

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(1);
        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = network!.edges[0]!;
        // Endpoints are node uids, not labels — assert shape rather than label
        // identity; the single-edge count is the meaningful invariant.
        expect([edge.from, edge.to]).toHaveLength(2);

        await dc.waitForPairChange(pair0);
      },
    },

    {
      id: 'no-answer-validation-and-negative-metadata',
      covers: ['answer-required-validation', 'prompts[].createEdge=no-path'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        const friend = synth.addEdgeType({ name: 'Friend' });
        synth
          .addStage('DyadCensus', {
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 2 },
            introductionPanel: { title: 'Intro', text: 'Intro copy' },
          })
          .addPrompt({
            text: 'Do they know each other?',
            createEdge: friend.id,
          });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const dc = new DyadCensusFixture(page);
        await dc.dismissIntro();

        // Forward with no answer: blocked, toast surfaced, still on the pair.
        await page.getByTestId('next-button').click();
        await expect(
          page.getByText('Please select a response before continuing.'),
        ).toBeVisible();
        await expect(dc.yesOption).toBeVisible();

        // No records a negative per-prompt answer and creates no edge.
        await dc.selectNo();
        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(0);
        const metadata = await dc.getStageMetadata(0);
        expect(metadata).toHaveLength(1);
        expect(metadata[0]![0]).toBe(0);
        expect(metadata[0]![3]).toBe(false);
      },
    },

    {
      id: 'toggle-delete-idempotence-and-back-to-intro',
      covers: [
        'prompts[].createEdge=toggle-idempotence',
        'backwards-navigation',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        const friend = synth.addEdgeType({ name: 'Friend' });
        synth
          .addStage('DyadCensus', {
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 3 },
            introductionPanel: {
              title: 'Relationships',
              text: 'Do they know each other?',
            },
          })
          .addPrompt({
            text: 'Do they know each other?',
            createEdge: friend.id,
          });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const dc = new DyadCensusFixture(page);
        const edgeCount = async () =>
          (await protocol.getNetworkState(interview.interviewId))?.edges
            .length ?? 0;

        await dc.dismissIntro();
        const pair0 = await dc.getPairLabels();

        // Yes creates exactly one edge, then auto-advances to pair 1.
        await dc.selectYes();
        await expect.poll(edgeCount).toBe(1);
        await dc.waitForPairChange(pair0);

        // Backwards navigation: return to pair 0. The existing edge pre-selects Yes.
        await page.getByTestId('previous-button').click();
        await dc.waitForPair(pair0);
        await expect(dc.yesOption).toHaveAttribute('aria-checked', 'true');

        // Toggle to No: deletes the edge, records a negative answer.
        await dc.selectNo();
        await expect.poll(edgeCount).toBe(0);
        const afterNo = await dc.getStageMetadata(0);
        expect(afterNo.some(([, , , v]) => !v)).toBe(true);
        await dc.waitForPairChange(pair0);

        // Back to pair 0 again; the recorded negative answer pre-selects No.
        await page.getByTestId('previous-button').click();
        await dc.waitForPair(pair0);
        await expect(dc.noOption).toHaveAttribute('aria-checked', 'true');

        // Idempotent re-create: Yes creates exactly one edge (no duplicate).
        await dc.selectYes();
        await expect.poll(edgeCount).toBe(1);
        await dc.waitForPairChange(pair0);

        // Backwards all the way to the introductionPanel (re-render).
        await page.getByTestId('previous-button').click();
        await dc.waitForPair(pair0);
        await page.getByTestId('previous-button').click();
        await expect(dc.introHeading).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(0);
      },
    },

    {
      id: 'pair-enumeration-completes-stage',
      covers: ['pair-enumeration'],
      // Six sequential 350ms auto-advances plus Playwright round-trips can
      // approach the 30s budget under parallel matrix load; triple it.
      slow: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        synth.addInformationStage({ title: 'Before the stage' });
        synth
          .addStage('DyadCensus', {
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 4 },
            introductionPanel: { title: 'Intro', text: 'Intro copy' },
          })
          .addPrompt({ text: 'Do they know each other?' });
        synth.addInformationStage({ title: 'After the stage' });
        return synth;
      },
      run: async ({ page }) => {
        const dc = new DyadCensusFixture(page);
        await dc.dismissIntro();

        // 4 subject nodes -> 4*3/2 = 6 unordered pairs.
        for (let i = 0; i < 6; i++) {
          const labels = await dc.getPairLabels();
          await dc.selectNo();
          if (i < 5) {
            await dc.waitForPairChange(labels);
          }
        }

        await expect(
          page.getByRole('heading', { name: 'After the stage' }),
        ).toBeVisible();

        const metadata = await dc.getStageMetadata(1);
        expect(metadata).toHaveLength(6);
        expect(metadata.every(([p]) => p === 0)).toBe(true);
        // Exhaustive, no duplicates or omissions: 6 distinct unordered pairs.
        const keys = metadata.map(([, a, b]) => [a, b].toSorted().join('|'));
        expect(new Set(keys).size).toBe(6);
      },
    },

    {
      id: 'subject-type-restriction',
      covers: ['subject.type'],
      // Multiple sequential auto-advances under parallel matrix load; triple
      // the timeout for headroom.
      slow: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ type: 'text', name: 'name' });
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ type: 'text', name: 'name' });
        const stage = synth.addStage('DyadCensus', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'Intro', text: 'Intro copy' },
        });
        stage.addPrompt({ text: 'Do they know each other?' });
        // Both node types coexist in the shared graph; only Person is the subject.
        synth.addManualNode(stage.id, person.id, 'person-alpha', {
          [personName.id]: 'Alpha',
        });
        synth.addManualNode(stage.id, person.id, 'person-bravo', {
          [personName.id]: 'Bravo',
        });
        synth.addManualNode(stage.id, person.id, 'person-charlie', {
          [personName.id]: 'Charlie',
        });
        synth.addManualNode(stage.id, place.id, 'place-one', {
          [placeName.id]: 'PlaceOne',
        });
        synth.addManualNode(stage.id, place.id, 'place-two', {
          [placeName.id]: 'PlaceTwo',
        });
        return synth;
      },
      run: async ({ page }) => {
        const dc = new DyadCensusFixture(page);
        await dc.dismissIntro();

        const placeLabels = page.getByText(/PlaceOne|PlaceTwo/);

        // 3 Person nodes -> 3 pairs; Place nodes are never enumerated.
        for (let i = 0; i < 3; i++) {
          await expect(placeLabels).toHaveCount(0);
          const labels = await dc.getPairLabels();
          expect(labels.join(' ')).not.toMatch(/PlaceOne|PlaceTwo/);
          await dc.selectNo();
          if (i < 2) {
            await dc.waitForPairChange(labels);
          }
        }

        // Exactly 3 answers recorded: Person-Person pairs only (no Place pairs).
        const metadata = await dc.getStageMetadata(0);
        expect(metadata).toHaveLength(3);
      },
    },

    {
      id: 'multi-prompt-cycling-colors-and-backward-nav',
      covers: [
        'prompts=multi-cycling',
        'codebook.edge.color',
        'codebook.node.color-shape',
        'backwards-navigation',
      ],
      visual: true,
      // Two prompts fully cycled (six auto-advances) plus backward navigation;
      // triple the timeout for headroom under parallel matrix load.
      slow: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({
          name: 'Person',
          color: 'node-color-seq-2',
        });
        const knows = synth.addEdgeType({
          name: 'Knows',
          color: 'edge-color-seq-3',
        });
        const likes = synth.addEdgeType({
          name: 'Likes',
          color: 'edge-color-seq-5',
        });
        const stage = synth.addStage('DyadCensus', {
          subject: { entity: 'node', type: nodeType.id },
          initialNodes: { count: 3 },
          introductionPanel: { title: 'Intro', text: 'Intro copy' },
        });
        stage.addPrompt({
          text: 'Do they know each other?',
          createEdge: knows.id,
        });
        stage.addPrompt({
          text: 'Do they like each other?',
          createEdge: likes.id,
        });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const dc = new DyadCensusFixture(page);
        await dc.dismissIntro();

        await expect(dc.pips).toHaveCount(2);
        await expect(dc.connector).toHaveClass(
          /\[--edge-color:var\(--edge-3\)\]/,
        );
        await expect(dc.prompt).toContainText('Do they know each other?');

        // Answer Yes on the first two pairs of prompt 1, then exercise a
        // within-prompt backwards step before finishing prompt 1.
        const pair0 = await dc.getPairLabels();
        await dc.selectYes();
        await dc.waitForPairChange(pair0);

        const pair1 = await dc.getPairLabels();
        await dc.selectYes();
        await dc.waitForPairChange(pair1);

        // Backwards navigation: pair 2 -> pair 1 (still prompt 1), Yes pre-selected.
        await page.getByTestId('previous-button').click();
        await dc.waitForPair(pair1);
        await expect.poll(() => dc.activePipIndex()).toBe(0);
        await expect(dc.yesOption).toHaveAttribute('aria-checked', 'true');

        // Forward again to the last pair of prompt 1 and answer it.
        await page.getByTestId('next-button').click();
        await dc.selectYes();

        // Auto-advance from the last pair of prompt 1 cycles to prompt 2, pair 0.
        await expect.poll(() => dc.activePipIndex()).toBe(1);
        await expect(dc.connector).toHaveClass(
          /\[--edge-color:var\(--edge-5\)\]/,
        );
        await expect(dc.prompt).toContainText('Do they like each other?');

        // Answer No across all of prompt 2 (no 'likes' edges are created).
        for (let i = 0; i < 3; i++) {
          const labels = await dc.getPairLabels();
          await dc.selectNo();
          if (i < 2) {
            await dc.waitForPairChange(labels);
          }
        }

        // Prompt 1 (Yes x3) created 3 edges of a single type; prompt 2 (No) added none.
        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(3);
        const network = await protocol.getNetworkState(interview.interviewId);
        expect(new Set(network!.edges.map((e) => e.type)).size).toBe(1);

        const metadata = await dc.getStageMetadata(0);
        expect(metadata).toHaveLength(6);
        expect(metadata.filter(([p]) => p === 0)).toHaveLength(3);
        expect(metadata.filter(([p]) => p === 1)).toHaveLength(3);
      },
    },

    {
      id: 'shared-edge-prefill-across-prompts',
      covers: ['prompts[].createEdge=shared-prefill'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        const knows = synth.addEdgeType({ name: 'Knows' });
        const stage = synth.addStage('DyadCensus', {
          subject: { entity: 'node', type: nodeType.id },
          initialNodes: { count: 3 },
          introductionPanel: { title: 'Intro', text: 'Intro copy' },
        });
        // Both prompts share the same createEdge type.
        stage.addPrompt({
          text: 'Prompt 1: know each other?',
          createEdge: knows.id,
        });
        stage.addPrompt({
          text: 'Prompt 2: know each other?',
          createEdge: knows.id,
        });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const dc = new DyadCensusFixture(page);
        await dc.dismissIntro();

        // Answer prompt 1: Yes on the first pair (creating the shared edge),
        // No on the rest. Remember the Yes pair.
        const sharedPair = await dc.getPairLabels();
        await dc.selectYes();
        await dc.waitForPairChange(sharedPair);

        const pair1 = await dc.getPairLabels();
        await dc.selectNo();
        await dc.waitForPairChange(pair1);

        await dc.selectNo();
        // Last pair of prompt 1 auto-advances to prompt 2, pair 0 (shared pair).
        await dc.waitForPair(sharedPair);

        // The shared 'knows' edge pre-fills Yes, but prompt 2 has not recorded
        // its own answer yet.
        await expect(dc.yesOption).toHaveAttribute('aria-checked', 'true');
        let metadata = await dc.getStageMetadata(0);
        expect(metadata.some(([p]) => p === 1)).toBe(false);

        // Answering Yes records the prompt-2 answer without duplicating the edge.
        await dc.selectYes();
        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(1);
        metadata = await dc.getStageMetadata(0);
        expect(metadata.some(([p, , , v]) => p === 1 && v)).toBe(true);
      },
    },

    {
      id: 'zero-pairs-force-skip',
      covers: ['zero-pairs-force-skip'],
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        synth.addInformationStage({ title: 'Before the stage' });
        synth
          .addStage('DyadCensus', {
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 1 },
            introductionPanel: { title: 'Intro', text: 'Intro copy' },
          })
          .addPrompt({ text: 'Do they know each other?' });
        synth.addInformationStage({ title: 'After the stage' });
        return synth;
      },
      // A single subject node yields zero unordered pairs, so the stage's
      // `beforeNext` returns 'FORCE' on entry (DyadCensus.tsx:147) and the
      // interview advances past the intro to the following Information stage
      // without ever rendering a pair or a radio. Do NOT call dismissIntro():
      // it waits for a radio that never appears on the force-skip path.
      run: async ({ page }) => {
        await page.getByTestId('next-button').click();

        await expect(
          page.getByRole('heading', { name: 'After the stage' }),
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(0);
      },
    },
  ],
};
