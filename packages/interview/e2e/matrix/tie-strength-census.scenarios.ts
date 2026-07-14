import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { TieStrengthCensusFixture } from '../fixtures/tie-strength-census-fixture.js';
import type { InterfaceScenarios } from './types.js';

// Ordinal option set reused by most scenarios. Values seed the option-card
// `data-value`s; labels seed the rendered card text.
const STRENGTH_OPTIONS = [
  { label: 'Weak', value: 1 },
  { label: 'Moderate', value: 2 },
  { label: 'Strong', value: 3 },
];

/**
 * NOTE (deviations from the plan section, forced by observed behaviour):
 *
 * - Every scenario sets `seedNetwork: true`. A census cannot create alters, so
 *   its pairs come entirely from the seeded network; `buildSyntheticPayload`
 *   only installs the builder's nodes/edges when `seedNetwork` is true
 *   (synthetic-payload.ts:147-149), otherwise the interview starts empty and
 *   the stage FORCE-skips (TieStrengthCensus.tsx:234-237).
 * - Edge attributes are keyed by the codebook variable id, and network
 *   entities use the `_uid`/`attributes` shared-consts keys — not literal
 *   `.id`/`.Strength`. Each edge variable is given an explicit kebab-case id so
 *   assertions can read it precisely (VariableNameSchema allows [a-z0-9._:-]).
 * - `addEdge`/`updateEdge` are async thunks, so post-mutation network reads are
 *   wrapped in `expect.poll` rather than read synchronously.
 * - The e2e host mounts Shell without stage navigation (App.tsx:151-161), so
 *   there is no stages menu; the label/interviewScript dead-config scenario
 *   asserts by absence instead of opening a menu.
 * - `edge-color-custom` seeds the edge instead of clicking, so the connector's
 *   showEdge state is deterministic and not racing the 350ms auto-advance.
 */
export const tieStrengthCensusScenarios: InterfaceScenarios = {
  interfaceType: 'TieStrengthCensus',
  scenarios: [
    {
      id: 'intro-panel-and-first-selection',
      covers: [
        'id',
        'label',
        'interviewScript',
        'introductionPanel',
        'prompts[].createEdge',
        'prompts[].text',
        'codebook.edge.variable.options',
        'codebook.edge.color',
      ],
      smoke: true,
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships (menu)',
          interviewScript: 'Internal note: use a warm tone.',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'You will be shown pairs of people from your network. For each pair, indicate the strength of their relationship.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const tsc = new TieStrengthCensusFixture(page);

        await expect(
          page.getByRole('heading', { name: 'Rate Your Relationships' }),
        ).toBeVisible();
        await expect(page.getByRole('listbox')).toHaveCount(0);
        // label is menu-only config; interviewScript is authoring-only.
        await expect(page.getByText('Rate Relationships (menu)')).toHaveCount(
          0,
        );
        await expect(
          page.getByText('Internal note: use a warm tone.'),
        ).toHaveCount(0);

        const urlBefore = page.url();
        await tsc.dismissIntro();
        // The first Next dismisses the intro without advancing the URL step.
        expect(page.url()).toBe(urlBefore);

        const options = page.getByRole('option');
        await expect(options).toHaveCount(4);
        await expect(options.nth(0)).toHaveAttribute('data-value', '1');
        await expect(options.nth(0)).toHaveText(/Weak/);
        await expect(options.nth(1)).toHaveAttribute('data-value', '2');
        await expect(options.nth(1)).toHaveText(/Moderate/);
        await expect(options.nth(2)).toHaveAttribute('data-value', '3');
        await expect(options.nth(2)).toHaveText(/Strong/);
        await expect(options.nth(3)).toHaveText(/Not close/);

        const [fromName, toName] = await tsc.getPairLabels();
        await tsc.selectOption(2);

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(1);

        const network = await protocol.getNetworkState(interview.interviewId);
        const edge = network!.edges[0]!;
        expect(edge[entityAttributesProperty].strength).toBe(2);
        expect(edge.type).toBeTruthy();

        const fromNode = network!.nodes.find(
          (n) => n[entityPrimaryKeyProperty] === edge.from,
        );
        const toNode = network!.nodes.find(
          (n) => n[entityPrimaryKeyProperty] === edge.to,
        );
        expect(Object.values(fromNode![entityAttributesProperty])).toContain(
          fromName,
        );
        expect(Object.values(toNode![entityAttributesProperty])).toContain(
          toName,
        );
      },
    },
    {
      id: 'subject-type-scoping',
      covers: ['subject.type'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ type: 'text', name: 'name' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const censusStage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        censusStage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        // Two Place nodes that must never be paired or connected.
        synth.addManualNode(censusStage.id, place.id, 'place-alpha', {
          [placeName.id]: 'Alpha Place',
        });
        synth.addManualNode(censusStage.id, place.id, 'place-beta', {
          [placeName.id]: 'Beta Place',
        });
        synth.addInformationStage({
          title: 'Scoping Complete',
          items: [
            {
              id: 'done-item',
              type: 'text',
              content: 'You have finished the census.',
            },
          ],
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();

        const collected: [string, string][] = [];
        for (let i = 0; i < 3; i++) {
          const labels = await tsc.getPairLabels();
          collected.push(labels);
          await tsc.selectOption(2);
          if (i < 2) {
            await tsc.waitForPairChange(labels);
          } else {
            await expect(
              page.getByRole('heading', { name: 'Scoping Complete' }),
            ).toBeVisible();
          }
        }

        // No pair ever surfaced a Place node's name.
        for (const [a, b] of collected) {
          for (const placeLabel of ['Alpha Place', 'Beta Place']) {
            expect(a).not.toContain(placeLabel);
            expect(b).not.toContain(placeLabel);
          }
        }

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(3);

        const network = await protocol.getNetworkState(interview.interviewId);
        const placeUids = new Set(['place-alpha', 'place-beta']);
        const personUids = new Set(
          network!.nodes
            .map((n) => n[entityPrimaryKeyProperty])
            .filter((uid) => !placeUids.has(uid)),
        );
        expect(personUids.size).toBe(3);
        for (const edge of network!.edges) {
          expect(personUids.has(edge.from)).toBe(true);
          expect(personUids.has(edge.to)).toBe(true);
        }
      },
    },
    {
      id: 'prompts-multiple-and-sibling-scoping',
      covers: [
        'prompts[].multiple',
        'sibling-prompt-scoping',
        'prompts[].edgeVariable',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Low', value: 1 },
            { label: 'Medium', value: 2 },
            { label: 'High', value: 3 },
          ],
        });
        friendship.addVariable({
          id: 'closeness',
          name: 'Closeness',
          type: 'ordinal',
          options: [
            { label: 'Distant', value: 1 },
            { label: 'Neutral', value: 2 },
            { label: 'Close', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'Prompt A text',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'No Friendship',
        });
        stage.addPrompt({
          text: 'Prompt B text',
          createEdge: friendship.id,
          edgeVariable: 'closeness',
          negativeLabel: 'No Closeness',
        });
        synth.addInformationStage({
          title: 'Census Complete',
          items: [{ id: 'done-item', type: 'text', content: 'All done.' }],
        });
        return synth;
      },
      run: async ({ page, interview, protocol, stage }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();
        // One pip per prompt.
        await expect(page.locator('[data-active]')).toHaveCount(2);

        const pair1Labels = await tsc.getPairLabels();
        let previousLabels = pair1Labels;
        for (const value of [2, 1, 3]) {
          await tsc.selectOption(value);
          await tsc.waitForPairChange(previousLabels);
          previousLabels = await tsc.getPairLabels();
        }

        // Prompt B: pairIndex reset to pair 1.
        await expect(stage.getPrompt('Prompt B text')).toBeVisible();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1Labels);

        // Sibling scoping: the Friendship edge already exists (created by
        // prompt A), yet prompt B's edgeVariable is unset, so nothing is
        // pre-selected.
        for (const value of [1, 2, 3]) {
          await expect(tsc.getOption(value)).toHaveAttribute(
            'aria-selected',
            'false',
          );
        }

        // Response-required still fires despite the pre-existing edge.
        const before = await protocol.getNetworkState(interview.interviewId);
        await page.getByTestId('next-button').click();
        await expect(
          page.getByText('Please select a response before continuing.'),
        ).toBeVisible();
        const afterToast = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterToast?.edges.length).toBe(before?.edges.length);

        previousLabels = pair1Labels;
        for (const value of [1, 2, 3]) {
          await tsc.selectOption(value);
          if (value !== 3) {
            await tsc.waitForPairChange(previousLabels);
            previousLabels = await tsc.getPairLabels();
          }
        }

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(3);

        const network = await protocol.getNetworkState(interview.interviewId);
        // One Friendship edge per pair, each carrying BOTH prompt variables.
        for (const edge of network!.edges) {
          expect(edge[entityAttributesProperty].strength).toBeDefined();
          expect(edge[entityAttributesProperty].closeness).toBeDefined();
        }
      },
    },
    {
      id: 'response-required-validation',
      covers: ['response-required-validation'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();
        const pairLabelsBefore = await tsc.getPairLabels();

        await interview.nextButton.click();

        await expect(
          page.getByText('Please select a response before continuing.'),
        ).toBeVisible();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pairLabelsBefore);

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(0);
      },
    },
    {
      id: 'edge-variable-write-then-update-via-back',
      covers: ['prompts[].edgeVariable', 'auto-advance-timing'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();
        const pair1Labels = await tsc.getPairLabels();

        await tsc.selectOption(2);
        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(1);
        let network = await protocol.getNetworkState(interview.interviewId);
        const edgeId = network!.edges[0]![entityPrimaryKeyProperty];
        expect(network!.edges[0]![entityAttributesProperty].strength).toBe(2);

        // Auto-advance fired on the real 350ms timer.
        await tsc.waitForPairChange(pair1Labels);

        await page.getByTestId('previous-button').click();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1Labels);
        await expect(tsc.getOption(2)).toHaveAttribute('aria-selected', 'true');

        await tsc.selectOption(3);
        // updateEdge (not a second addEdge): same edge id, new value.
        await expect
          .poll(async () => {
            const net = await protocol.getNetworkState(interview.interviewId);
            return net?.edges[0]?.[entityAttributesProperty].strength;
          })
          .toBe(3);
        network = await protocol.getNetworkState(interview.interviewId);
        expect(network!.edges).toHaveLength(1);
        expect(network!.edges[0]![entityPrimaryKeyProperty]).toBe(edgeId);
      },
    },
    {
      id: 'pre-selection-and-decline',
      covers: [
        'pre-selection',
        'prompts[].negativeLabel',
        'backwards-navigation',
      ],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        // Pre-seed an edge on pair 1 (nodes[0]-nodes[1]) with Strength = 3.
        synth.addEdges([[0, 1]], friendship.id);
        synth.setEdgeAttribute(0, 'strength', 3);
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();
        const pair1Labels = await tsc.getPairLabels();

        // Pre-selection reflects the seeded edge value and connector state.
        await expect(tsc.getOption(3)).toHaveAttribute('aria-selected', 'true');
        expect(await tsc.isConnectorShowingEdge()).toBe(true);

        const networkBefore = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(networkBefore?.edges).toHaveLength(1);
        const seededEdge = networkBefore!.edges[0]!;

        await tsc.selectDecline('Not close');

        // The edge between pair 1's nodes is removed.
        await expect
          .poll(async () => {
            const net = await protocol.getNetworkState(interview.interviewId);
            return (
              net?.edges.some(
                (edge) =>
                  edge.from === seededEdge.from && edge.to === seededEdge.to,
              ) ?? false
            );
          })
          .toBe(false);

        await tsc.waitForPairChange(pair1Labels);

        await page.getByTestId('previous-button').click();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1Labels);
        // Decline persists via stage metadata (network state alone can't show it).
        await expect(tsc.getDeclineOption('Not close')).toHaveAttribute(
          'aria-selected',
          'true',
        );
      },
    },
    {
      id: 'backwards-navigation-and-full-census-completion',
      covers: [
        'prompts[].multiple',
        'backwards-navigation',
        'stage-completion',
      ],
      slow: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const trust = synth.addEdgeType({ name: 'Trust' });
        trust.addVariable({
          id: 'level',
          name: 'Level',
          type: 'ordinal',
          options: [
            { label: 'Low', value: 1 },
            { label: 'Medium', value: 2 },
            { label: 'High', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'Rate friendship strength',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'No Friendship',
        });
        stage.addPrompt({
          text: 'Rate trust level',
          createEdge: trust.id,
          edgeVariable: 'level',
          negativeLabel: 'No Trust',
        });
        synth.addInformationStage({
          title: 'Census Complete',
          items: [{ id: 'done-item', type: 'text', content: 'All done.' }],
        });
        return synth;
      },
      run: async ({ page, interview, protocol, stage }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();

        // Prompt A forward pass.
        const pair1 = await tsc.getPairLabels();
        await tsc.selectOption(2);
        await tsc.waitForPairChange(pair1);
        const pair2 = await tsc.getPairLabels();
        await tsc.selectOption(1);
        await tsc.waitForPairChange(pair2);
        const pair3 = await tsc.getPairLabels();
        await tsc.selectDecline('No Friendship');
        await tsc.waitForPairChange(pair3);

        await expect(stage.getPrompt('Rate trust level')).toBeVisible();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1);

        // Back 1 -> prompt A pair 3 (declined).
        await page.getByTestId('previous-button').click();
        await expect(stage.getPrompt('Rate friendship strength')).toBeVisible();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair3);
        await expect(tsc.getDeclineOption('No Friendship')).toHaveAttribute(
          'aria-selected',
          'true',
        );

        // Back 2 -> pair 2 (Strength = 1).
        await page.getByTestId('previous-button').click();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair2);
        await expect(tsc.getOption(1)).toHaveAttribute('aria-selected', 'true');

        // Back 3 -> pair 1 (Strength = 2).
        await page.getByTestId('previous-button').click();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1);
        await expect(tsc.getOption(2)).toHaveAttribute('aria-selected', 'true');

        // Back 4 -> intro.
        await page.getByTestId('previous-button').click();
        await expect(
          page.getByRole('heading', { name: 'Rate Your Relationships' }),
        ).toBeVisible();

        // Re-advance forward through prompt A; every pair is already answered.
        await tsc.dismissIntro();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1);
        await page.getByTestId('next-button').click();
        await tsc.waitForPairChange(pair1);
        await page.getByTestId('next-button').click();
        await tsc.waitForPairChange(pair2);
        await page.getByTestId('next-button').click();
        await tsc.waitForPairChange(pair3);

        await expect(stage.getPrompt('Rate trust level')).toBeVisible();
        await expect.poll(() => tsc.getPairLabels()).toEqual(pair1);

        // Prompt B forward pass.
        await tsc.selectDecline('No Trust');
        await tsc.waitForPairChange(pair1);
        await tsc.selectOption(3);
        await tsc.waitForPairChange(pair2);
        await tsc.selectOption(1);

        // Full census completion advances to the following stage.
        await expect(
          page.getByRole('heading', { name: 'Census Complete' }),
        ).toBeVisible();

        await expect
          .poll(
            async () =>
              (await protocol.getNetworkState(interview.interviewId))?.edges
                .length ?? 0,
          )
          .toBe(4);

        const network = await protocol.getNetworkState(interview.interviewId);
        const uidFor = (label: string): string | undefined =>
          network!.nodes.find((n) =>
            Object.values(n[entityAttributesProperty]).includes(label),
          )?.[entityPrimaryKeyProperty];
        const edgeBetween = (
          a: string | undefined,
          b: string | undefined,
          key: string,
        ) =>
          network!.edges.find(
            (e) =>
              key in e[entityAttributesProperty] &&
              ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
          );

        const [p1a, p1b] = [uidFor(pair1[0]), uidFor(pair1[1])];
        const [p2a, p2b] = [uidFor(pair2[0]), uidFor(pair2[1])];
        const [p3a, p3b] = [uidFor(pair3[0]), uidFor(pair3[1])];

        // Friendship (strength): pair 1 = 2, pair 2 = 1, pair 3 declined.
        expect(
          edgeBetween(p1a, p1b, 'strength')?.[entityAttributesProperty]
            .strength,
        ).toBe(2);
        expect(
          edgeBetween(p2a, p2b, 'strength')?.[entityAttributesProperty]
            .strength,
        ).toBe(1);
        expect(edgeBetween(p3a, p3b, 'strength')).toBeUndefined();

        // Trust (level): pair 2 = 3, pair 3 = 1, pair 1 declined.
        expect(
          edgeBetween(p2a, p2b, 'level')?.[entityAttributesProperty].level,
        ).toBe(3);
        expect(
          edgeBetween(p3a, p3b, 'level')?.[entityAttributesProperty].level,
        ).toBe(1);
        expect(edgeBetween(p1a, p1b, 'level')).toBeUndefined();
      },
    },
    {
      id: 'edge-color-custom',
      covers: ['codebook.edge.color'],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({
          name: 'Friendship',
          color: 'edge-color-seq-3',
        });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        // Seed pair 1's edge so the connector deterministically shows its edge
        // colour without racing the auto-advance timer.
        synth.addEdges([[0, 1]], friendship.id);
        synth.setEdgeAttribute(0, 'strength', 2);
        return synth;
      },
      run: async ({ page }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();

        await expect(tsc.getOption(2)).toHaveAttribute('aria-selected', 'true');
        // edgeColorMap['edge-color-seq-3'] === '[--edge-color:var(--edge-3)]'.
        await expect(tsc.connector.first()).toHaveClass(/edge-3/);
        expect(await tsc.isConnectorShowingEdge()).toBe(true);
      },
    },
    {
      id: 'label-and-interviewscript-menu-dead-config',
      covers: ['label', 'interviewScript'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        friendship.addVariable({
          id: 'strength',
          name: 'Strength',
          type: 'ordinal',
          options: STRENGTH_OPTIONS,
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Census menu label',
          interviewScript: 'Never rendered in the interview DOM.',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: 'strength',
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page }) => {
        const tsc = new TieStrengthCensusFixture(page);
        await tsc.dismissIntro();
        await expect(tsc.listbox).toBeVisible();

        // The e2e host mounts Shell without stage navigation, so no stages
        // menu exists; label is menu-only config and interviewScript is
        // authoring-only. Neither appears in the interview DOM.
        await expect(
          page.getByRole('button', { name: 'Go to a stage' }),
        ).toHaveCount(0);
        await expect(page.getByText('Census menu label')).toHaveCount(0);
        await expect(
          page.getByText('Never rendered in the interview DOM.'),
        ).toHaveCount(0);
      },
    },
  ],
};
