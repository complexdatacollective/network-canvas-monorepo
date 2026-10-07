import type { Locator, Page } from '@playwright/test';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type {
  PedigreeRelationshipKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';

import type { ProtocolPayload } from '../../src/contract/types.js';
import { expect } from '../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios } from './types.js';

type Seed = {
  name?: string;
  sex?: PedigreeSexAssignedAtBirth;
  isEgo?: boolean;
  /** The conditions (by the names given to `scaffoldPedigree`) they have. */
  affected?: string[];
};

type PedigreeScaffold = {
  synth: SyntheticInterview;
  fpStageId: string;
  /** The person attribute the source pedigree's nomination prompt for a
   * condition sets, which a disease reads. */
  attributeOf: (condition: string) => string;
  /** Seed a person with an explicit uid. */
  person: (uid: string, seed: Seed) => void;
  /** Seed a family relationship from `from` to `to` (parent to child, or
   * between partners). */
  relate: (
    uid: string,
    from: string,
    to: string,
    kind: PedigreeRelationshipKind,
    options?: { current?: boolean; carrier?: boolean },
  ) => void;
  /** Seed a biological parent(from) -> child(to) relationship. */
  bioEdge: (uid: string, from: string, to: string) => void;
  /** Seed a current partnership between two people. */
  partnerEdge: (uid: string, a: string, b: string) => void;
  /** Seed a tie of another type, as a sociogram on another stage might. */
  friendship: (uid: string, a: string, b: string) => void;
};

/**
 * A Family Pedigree source stage on a fresh SyntheticInterview, recording each
 * named condition through a nomination prompt, as a researcher sets one up for
 * a Narrative Pedigree to read. The family is entirely pre-seeded through the
 * pedigree's own attributes — no participant interaction reaches the pedigree,
 * so the stage exists only to give the Narrative Pedigree its people,
 * relationships and condition attributes. The person type's shape follows sex
 * assigned at birth (male square, female circle, anyone else a diamond).
 */
function scaffoldPedigree(conditions: string[]): PedigreeScaffold {
  const synth = new SyntheticInterview();
  const people = synth.addNodeType({ name: 'Person' });
  const fp = synth.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: people.id },
    framing: 'gamete',
    askGenderIdentity: false,
    prompt: 'Build the family tree.',
    // Each condition's attribute takes the builder's own `conditionN` name,
    // since a condition's wording is not a valid variable name.
    nominationPrompts: conditions.map((condition) => ({
      text: `Who has ${condition}?`,
    })),
  });
  people.setShape({
    default: 'diamond',
    dynamic: {
      variable: fp.sexAssignedAtBirth,
      type: 'discrete',
      map: [
        { value: 'male', shape: 'square' },
        { value: 'female', shape: 'circle' },
      ],
    },
  });
  const friends = synth.addEdgeType({ name: 'Friendship' });

  const attributes = new Map(
    conditions.map((condition, index) => [condition, fp.nominations[index]]),
  );
  const attributeOf = (condition: string) => {
    const attribute = attributes.get(condition);
    if (!attribute) throw new Error(`No nomination prompt for ${condition}`);
    return attribute;
  };
  // getNetwork() may fill an unset boolean on a manual node, so every flag is
  // seeded false and only the participant and the affected override it.
  const boolDefaults = Object.fromEntries(
    [fp.ego, ...conditions.map(attributeOf)].map((id) => [id, false]),
  );

  const relate: PedigreeScaffold['relate'] = (uid, from, to, kind, options) =>
    synth.addManualEdge(fp.edgeType, uid, from, to, {
      [fp.kind]: [kind],
      ...(kind === 'partner'
        ? { [fp.currentPartner]: options?.current ?? true }
        : { [fp.gestationalCarrier]: options?.carrier ?? false }),
    });

  return {
    synth,
    fpStageId: fp.id,
    attributeOf,
    person: (uid, { name, sex, isEgo, affected = [] }) =>
      synth.addManualNode(fp.id, people.id, uid, {
        ...boolDefaults,
        ...(name === undefined ? {} : { [fp.name]: name }),
        ...(sex === undefined ? {} : { [fp.sexAssignedAtBirth]: [sex] }),
        ...(isEgo ? { [fp.ego]: true } : {}),
        ...Object.fromEntries(affected.map((c) => [attributeOf(c), true])),
      }),
    relate,
    bioEdge: (uid, from, to) => relate(uid, from, to, 'biological'),
    partnerEdge: (uid, a, b) => relate(uid, a, b, 'partner'),
    friendship: (uid, a, b) => synth.addManualEdge(friends.id, uid, a, b, {}),
  };
}

/** A person on the canvas, by the name the participant hears. */
const member = (page: Page, name: string): Locator =>
  page.getByRole('button', { name: `Focus on ${name}`, exact: true });

/** How far the canvas is zoomed: the scale of its panned content. */
const canvasScale = (page: Page): Promise<number> =>
  page.getByTestId('pedigree-canvas').evaluate((viewport) => {
    const content = viewport.lastElementChild;
    return content
      ? new DOMMatrix(getComputedStyle(content).transform).a
      : Number.NaN;
  });

const HD = "Huntington's disease";

/**
 * grandparent(affected, HD) -> parent -> ego, plus an aunt on grandparent's
 * line who is never an ancestor of ego (so she stays dimmed when ego is
 * focused). One autosomal-dominant disease, at-risk display off. Reused by the
 * focal, read-only, and misconfigured scenarios.
 */
function buildAdScenario(): SyntheticInterview {
  const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
    scaffoldPedigree([HD]);
  person('grandparent', { name: 'George', sex: 'male', affected: [HD] });
  person('grandparent-partner', { name: 'Nancy', sex: 'female' });
  // A collateral aunt — a child of the grandparents, so never in ego's
  // ancestral line — giving the focal scenario someone who must stay dimmed.
  person('aunt', { name: 'Margaret', sex: 'female' });
  person('parent', { name: 'Rose', sex: 'female' });
  person('parent-partner', { name: 'David', sex: 'male' });
  person('ego', { name: 'Jo', isEgo: true, sex: 'female' });
  partnerEdge('u1', 'grandparent', 'grandparent-partner');
  bioEdge('b1', 'grandparent', 'parent');
  bioEdge('b2', 'grandparent-partner', 'parent');
  bioEdge('b3', 'grandparent', 'aunt');
  bioEdge('b4', 'grandparent-partner', 'aunt');
  partnerEdge('u2', 'parent', 'parent-partner');
  bioEdge('b5', 'parent', 'ego');
  bioEdge('b6', 'parent-partner', 'ego');

  synth.addStage('NarrativePedigree', {
    label: 'Inheritance Pathways',
    sourceStageId: fpStageId,
    showAtRiskStatuses: false,
    diseases: [
      {
        id: 'hd',
        label: "Huntington's Disease",
        color: 'node-color-seq-1',
        attribute: attributeOf(HD),
        inheritancePattern: 'autosomalDominant',
      },
    ],
  });
  return synth;
}

const CF = 'cystic fibrosis';

/**
 * A consanguineous (first-cousin union) autosomal-recessive pedigree: two
 * shared great-grandparents, their two children (the grandparents of ego,
 * siblings), each partnered with a married-in spouse to produce mother and
 * father — who are therefore first cousins — and their affected child (ego).
 * Both parents resolve to obligate carriers and the four grandparents to
 * at-risk carriers. Shared by the at-risk-hidden and at-risk-shown scenarios;
 * only `showAtRiskStatuses` differs.
 */
function buildCousinUnion(showAtRiskStatuses: boolean): SyntheticInterview {
  const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
    scaffoldPedigree([CF]);

  person('great-grandfather', { name: 'Albert', sex: 'male' });
  person('great-grandmother', { name: 'Mabel', sex: 'female' });
  person('maternal-grandmother', { name: 'Iris', sex: 'female' });
  person('maternal-grandfather', { name: 'Frank', sex: 'male' });
  person('paternal-grandfather', { name: 'Ernest', sex: 'male' });
  person('paternal-grandmother', { name: 'Vera', sex: 'female' });
  person('mother', { name: 'Diane', sex: 'female' });
  person('father', { name: 'Roy', sex: 'male' });
  person('ego', { name: 'Jo', isEgo: true, sex: 'female', affected: [CF] });

  partnerEdge('u1', 'great-grandfather', 'great-grandmother');
  partnerEdge('u2', 'maternal-grandmother', 'maternal-grandfather');
  partnerEdge('u3', 'paternal-grandfather', 'paternal-grandmother');
  partnerEdge('u4', 'mother', 'father');

  // The two shared great-grandparents produce the two sibling grandparents.
  bioEdge('b1', 'great-grandfather', 'maternal-grandmother');
  bioEdge('b2', 'great-grandmother', 'maternal-grandmother');
  bioEdge('b3', 'great-grandfather', 'paternal-grandfather');
  bioEdge('b4', 'great-grandmother', 'paternal-grandfather');
  // Each sibling grandparent + married-in spouse produce one parent.
  bioEdge('b5', 'maternal-grandmother', 'mother');
  bioEdge('b6', 'maternal-grandfather', 'mother');
  bioEdge('b7', 'paternal-grandfather', 'father');
  bioEdge('b8', 'paternal-grandmother', 'father');
  // The first-cousin union produces the affected child.
  bioEdge('b9', 'mother', 'ego');
  bioEdge('b10', 'father', 'ego');

  synth.addStage('NarrativePedigree', {
    label: 'Inheritance Pathways',
    sourceStageId: fpStageId,
    showAtRiskStatuses,
    diseases: [
      {
        id: 'cf',
        label: 'Cystic Fibrosis',
        color: 'node-color-seq-3',
        attribute: attributeOf(CF),
        inheritancePattern: 'autosomalRecessive',
      },
    ],
  });
  return synth;
}

export const narrativePedigreeScenarios: InterfaceScenarios = {
  interfaceType: 'NarrativePedigree',
  scenarios: [
    {
      id: 'default-all-conditions-happy-path',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'sourceStageId',
        'diseases',
      ],
      smoke: true,
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
          scaffoldPedigree([HD, CF]);
        person('mother', { name: 'Rose', sex: 'female' });
        person('father', { name: 'David', sex: 'male' });
        person('ego', { name: 'Jo', isEgo: true, sex: 'female' });
        partnerEdge('u1', 'mother', 'father');
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          interviewScript: 'Explain the pedigree to the participant.',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: 'node-color-seq-1',
              attribute: attributeOf(HD),
              inheritancePattern: 'autosomalDominant',
            },
            {
              id: 'cf',
              label: 'Cystic Fibrosis',
              color: 'node-color-seq-3',
              attribute: attributeOf(CF),
              inheritancePattern: 'autosomalRecessive',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        await expect(
          page.locator('aside[aria-label="Condition key"]'),
        ).toBeVisible();
        await expect(
          page.getByRole('region', { name: 'Your family' }),
        ).toBeVisible();
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(
          3,
        );
        // The participant is "You", whatever name they gave themselves.
        await expect(member(page, 'You')).toBeVisible();
        await expect(member(page, 'Rose')).toBeVisible();
        await expect(page.getByText('Showing all conditions')).toBeVisible();
        await expect(page.locator('[data-notation-status]')).toHaveCount(0);
        // Dead-config guards: neither the interviewScript nor the label reaches
        // the DOM.
        await expect(
          page.getByText('Explain the pedigree to the participant.'),
        ).toHaveCount(0);
        await expect(page.getByText('Inheritance Pathways')).toHaveCount(0);
      },
    },
    {
      id: 'condition-select-toggle-color-attribute-focal-disabled',
      covers: [
        'diseases[].id',
        'diseases[].label',
        'diseases[].color',
        'diseases[].attribute',
        'focalAffordanceDisabled',
        'diseases[].inheritancePattern=autosomalDominant',
      ],
      visual: true,
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: buildAdScenario,
      run: async ({ page }) => {
        // Focusing on someone is disabled until a condition is selected:
        // clicking the participant is a no-op (no focus is established).
        const egoFocal = member(page, 'You');
        await expect(egoFocal).toHaveAttribute('aria-disabled', 'true');
        // Force the click past Playwright's disabled-element guard: the DOM
        // event fires but the handler no-ops (no condition selected).
        await egoFocal.click({ force: true });
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toHaveCount(0);
        await expect(page.locator('[data-dimmed="true"]')).toHaveCount(0);

        const conditionButton = page.getByRole('button', {
          name: "Huntington's Disease",
          exact: true,
        });
        await conditionButton.click();
        await expect(conditionButton).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.locator('[data-node-id="grandparent"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'affected');
        await expect(
          page.locator('[data-node-id="grandparent"] [data-filled-shape]'),
        ).toHaveCount(1);
        // Architect persists a node palette token; the runtime resolves it to
        // the matching theme variable for both CSS and SVG consumers.
        await expect(
          conditionButton.locator('span[aria-hidden]').first(),
        ).toHaveAttribute('style', 'background-color: var(--node-1);');
        await expect(
          page.locator('[data-node-id="grandparent"] [data-filled-shape]'),
        ).toHaveAttribute('fill', 'var(--node-1)');
        await expect(
          page.getByText("Showing Huntington's Disease"),
        ).toBeVisible();

        await conditionButton.click();
        await expect(conditionButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('[data-notation-status]')).toHaveCount(0);
        await expect(page.getByText('Showing all conditions')).toBeVisible();
      },
    },
    {
      id: 'focal-highlight-clear-focus-readonly',
      covers: ['focalHighlighting', 'readOnlyInvariant'],
      currentStep: 1,
      seedNetwork: true,
      build: buildAdScenario,
      run: async ({ page, protocol, interview }) => {
        const before = await protocol.getNetworkState(interview.interviewId);

        await page
          .getByRole('button', { name: "Huntington's Disease", exact: true })
          .click();

        const egoFocal = member(page, 'You');
        await egoFocal.click();
        await expect(egoFocal).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toBeVisible();
        await expect(
          page.locator('[data-node-id="grandparent"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(page.locator('[data-node-id="aunt"]')).toHaveAttribute(
          'data-dimmed',
          'true',
        );
        await expect(
          page.getByText(
            'Focused on You. Showing who contributes to their inheritance.',
            { exact: false },
          ),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Clear focus' }).click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toHaveCount(0);
        await expect(page.locator('[data-dimmed="true"]')).toHaveCount(0);

        // Re-focus, then clear a second time with Escape on the canvas.
        await egoFocal.click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toBeVisible();
        await egoFocal.press('Escape');
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toHaveCount(0);

        // Read-only invariant: nothing the participant did mutated the network.
        const after = await protocol.getNetworkState(interview.interviewId);
        expect(after).toEqual(before);
      },
    },
    {
      id: 'at-risk-statuses-hidden',
      covers: [
        'showAtRiskStatuses=false',
        'diseases[].inheritancePattern=autosomalRecessive',
      ],
      currentStep: 1,
      seedNetwork: true,
      build: () => buildCousinUnion(false),
      run: async ({ page }) => {
        await page
          .getByRole('button', { name: 'Cystic Fibrosis', exact: true })
          .click();

        // The affected child and its two obligate-carrier parents show certain
        // notation; the carriers draw the hatch-fill glyph.
        await expect(
          page.locator('[data-node-id="ego"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'affected');
        await expect(
          page.locator('[data-node-id="mother"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateCarrier');
        await expect(
          page.locator('[data-node-id="father"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateCarrier');
        await expect(
          page.locator('[data-node-id="mother"] [data-hatch-fill]'),
        ).toHaveCount(1);

        // At-risk display is OFF: the probabilistic statuses collapse to
        // unknown, so no at-risk glyphs are drawn anywhere and no "?" appears.
        await expect(
          page.locator('[data-notation-status="atRiskAffected"]'),
        ).toHaveCount(0);
        await expect(
          page.locator('[data-notation-status="atRiskCarrier"]'),
        ).toHaveCount(0);
        await expect(page.locator('[data-question-mark]')).toHaveCount(0);

        // The condition key omits the two at-risk rows.
        await expect(page.getByText('May develop this condition')).toHaveCount(
          0,
        );
        await expect(page.getByText('May carry this condition')).toHaveCount(0);

        // A relative the engine computes as at-risk is announced to screen
        // readers as "Status unknown" (mirroring the collapsed display).
        await expect(
          page.locator('#np-status-maternal-grandmother'),
        ).toHaveText('Cystic Fibrosis: Status unknown');
      },
    },
    {
      id: 'at-risk-statuses-shown',
      covers: ['showAtRiskStatuses=true'],
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => buildCousinUnion(true),
      run: async ({ page }) => {
        await page
          .getByRole('button', { name: 'Cystic Fibrosis', exact: true })
          .click();

        // With at-risk display ON the same relative now carries an
        // at-risk-carrier glyph with a "?".
        await expect(
          page.locator(
            '[data-node-id="maternal-grandmother"] [data-notation-status]',
          ),
        ).toHaveAttribute('data-notation-status', 'atRiskCarrier');
        await expect(
          page.locator(
            '[data-node-id="maternal-grandmother"] [data-question-mark]',
          ),
        ).toHaveCount(1);

        // The condition key now lists both at-risk rows.
        await expect(
          page.getByText('May develop this condition'),
        ).toBeVisible();
        await expect(page.getByText('May carry this condition')).toBeVisible();
      },
    },
    {
      id: 'sex-linked-and-mitochondrial-patterns',
      covers: [
        'diseases[].inheritancePattern=xLinkedRecessive',
        'diseases[].inheritancePattern=xLinkedDominant',
        'diseases[].inheritancePattern=yLinked',
        'diseases[].inheritancePattern=mitochondrial',
      ],
      slow: true,
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const HAEMOPHILIA = 'haemophilia';
        const HYPOPHOSPHATAEMIA = 'hypophosphataemia';
        const HEARING_LOSS = 'hearing loss';
        const MYOPATHY = 'mitochondrial myopathy';
        const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
          scaffoldPedigree([
            HAEMOPHILIA,
            HYPOPHOSPHATAEMIA,
            HEARING_LOSS,
            MYOPATHY,
          ]);

        // Paternal line: the Y-linked condition down grandfather->father->ego,
        // and the X-linked-dominant condition on the affected father.
        person('paternal-grandfather', {
          name: 'Walter',
          sex: 'male',
          affected: [HEARING_LOSS],
        });
        person('paternal-grandmother', { name: 'Edith', sex: 'female' });
        person('father', {
          name: 'Gerald',
          sex: 'male',
          affected: [HYPOPHOSPHATAEMIA],
        });

        // Maternal line: the mtDNA source (great-grandmother) and the X-linked
        // recessive carrier line (grandmother, obligate via two affected sons).
        person('maternal-great-grandmother', {
          name: 'Agnes',
          sex: 'female',
          affected: [MYOPATHY],
        });
        person('maternal-great-grandfather', { name: 'Herbert', sex: 'male' });
        person('maternal-grandmother', { name: 'Iris', sex: 'female' });
        person('maternal-grandfather', { name: 'Frank', sex: 'male' });
        person('uncle', { name: 'Alan', sex: 'male', affected: [HAEMOPHILIA] });
        person('uncle-two', {
          name: 'Bruce',
          sex: 'male',
          affected: [HAEMOPHILIA],
        });
        person('mother', { name: 'Diane', sex: 'female' });

        person('ego', { name: 'Jo', isEgo: true, sex: 'male' });
        person('sister', { name: 'Helen', sex: 'female' });

        partnerEdge('u1', 'paternal-grandfather', 'paternal-grandmother');
        partnerEdge(
          'u2',
          'maternal-great-grandmother',
          'maternal-great-grandfather',
        );
        partnerEdge('u3', 'maternal-grandmother', 'maternal-grandfather');
        partnerEdge('u4', 'father', 'mother');

        bioEdge('b1', 'paternal-grandfather', 'father');
        bioEdge('b2', 'paternal-grandmother', 'father');
        bioEdge('b3', 'maternal-great-grandmother', 'maternal-grandmother');
        bioEdge('b4', 'maternal-great-grandfather', 'maternal-grandmother');
        bioEdge('b5', 'maternal-grandmother', 'uncle');
        bioEdge('b6', 'maternal-grandfather', 'uncle');
        bioEdge('b7', 'maternal-grandmother', 'uncle-two');
        bioEdge('b8', 'maternal-grandfather', 'uncle-two');
        bioEdge('b9', 'maternal-grandmother', 'mother');
        bioEdge('b10', 'maternal-grandfather', 'mother');
        bioEdge('b11', 'father', 'ego');
        bioEdge('b12', 'mother', 'ego');
        bioEdge('b13', 'father', 'sister');
        bioEdge('b14', 'mother', 'sister');

        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: true,
          diseases: [
            {
              id: 'haemophilia',
              label: 'Haemophilia',
              color: 'node-color-seq-6',
              attribute: attributeOf(HAEMOPHILIA),
              inheritancePattern: 'xLinkedRecessive',
            },
            {
              id: 'hypophosphataemia',
              label: 'Hypophosphataemia',
              color: 'node-color-seq-5',
              attribute: attributeOf(HYPOPHOSPHATAEMIA),
              inheritancePattern: 'xLinkedDominant',
            },
            {
              id: 'hearing-loss',
              label: 'Hearing Loss',
              color: 'node-color-seq-8',
              attribute: attributeOf(HEARING_LOSS),
              inheritancePattern: 'yLinked',
            },
            {
              id: 'myopathy',
              label: 'Mitochondrial Myopathy',
              color: 'node-color-seq-3',
              attribute: attributeOf(MYOPATHY),
              inheritancePattern: 'mitochondrial',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        const egoFocal = member(page, 'You');
        const clearFocus = page.getByRole('button', { name: 'Clear focus' });

        // X-linked recessive: affected uncle, obligate-carrier maternal
        // grandmother (two affected sons), and a maternal-line-only focal walk.
        const haemophiliaButton = page.getByRole('button', {
          name: 'Haemophilia',
          exact: true,
        });
        await haemophiliaButton.click();
        await expect(
          page.locator('[data-node-id="uncle"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'affected');
        await expect(
          page.locator(
            '[data-node-id="maternal-grandmother"] [data-notation-status]',
          ),
        ).toHaveAttribute('data-notation-status', 'obligateCarrier');
        await egoFocal.click();
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="maternal-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="maternal-great-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'true');
        await clearFocus.click();
        await haemophiliaButton.click(); // deselect

        // X-linked dominant: every daughter of the affected father is
        // non-unknown; a son of the same father stays unknown.
        const hypophosphataemiaButton = page.getByRole('button', {
          name: 'Hypophosphataemia',
          exact: true,
        });
        await hypophosphataemiaButton.click();
        await expect(
          page.locator('[data-node-id="sister"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="ego"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'unknown');
        await hypophosphataemiaButton.click(); // deselect

        // Y-linked: only males down the paternal line carry a non-unknown
        // status; a daughter is unknown; focusing the grandson highlights only
        // the paternal father->son chain.
        const hearingLossButton = page.getByRole('button', {
          name: 'Hearing Loss',
          exact: true,
        });
        await hearingLossButton.click();
        await expect(
          page.locator('[data-node-id="father"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="ego"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="sister"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'unknown');
        await egoFocal.click();
        await expect(page.locator('[data-node-id="father"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'true',
        );
        await clearFocus.click();
        await hearingLossButton.click(); // deselect

        // Mitochondrial: focusing a maternal-line descendant highlights only
        // the egg (cytoplasm) chain up to the great-grandmother source; a
        // paternal-line relative stays dimmed.
        const myopathyButton = page.getByRole('button', {
          name: 'Mitochondrial Myopathy',
          exact: true,
        });
        await myopathyButton.click();
        await egoFocal.click();
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="maternal-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="maternal-great-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'true');
      },
    },
    {
      id: 'multifactorial-and-unknown-patterns',
      covers: [
        'diseases[].inheritancePattern=multifactorial',
        'diseases[].inheritancePattern=unknown',
      ],
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const MULTI = 'heart disease';
        const UNKNOWN = 'a rare condition';
        const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
          scaffoldPedigree([MULTI, UNKNOWN]);

        // 5 people. Two carry the multifactorial trait (mother, ego); one
        // carries the unknown-pattern trait (father); the other two neither.
        person('grandparent', { name: 'Mary', sex: 'female' });
        person('mother', { name: 'Diane', sex: 'female', affected: [MULTI] });
        person('father', { name: 'Roy', sex: 'male', affected: [UNKNOWN] });
        person('ego', {
          name: 'Jo',
          isEgo: true,
          sex: 'female',
          affected: [MULTI],
        });
        person('sibling', { name: 'Sam', sex: 'male' });

        partnerEdge('u1', 'mother', 'father');
        bioEdge('b1', 'grandparent', 'mother');
        bioEdge('b2', 'mother', 'ego');
        bioEdge('b3', 'father', 'ego');
        bioEdge('b4', 'mother', 'sibling');
        bioEdge('b5', 'father', 'sibling');

        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: true,
          diseases: [
            {
              id: 'heart-disease',
              label: 'Heart Disease',
              color: 'node-color-seq-4',
              attribute: attributeOf(MULTI),
              inheritancePattern: 'multifactorial',
            },
            {
              id: 'rare-condition',
              label: 'Rare Condition',
              color: 'node-color-seq-2',
              attribute: attributeOf(UNKNOWN),
              inheritancePattern: 'unknown',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        // Multifactorial: only the two nominated people are affected; no
        // carrier/at-risk inference is made, so everyone else is unknown.
        await page
          .getByRole('button', { name: 'Heart Disease', exact: true })
          .click();
        await expect(
          page.locator('[data-notation-status="affected"]'),
        ).toHaveCount(2);
        await expect(
          page.locator('[data-notation-status="unknown"]'),
        ).toHaveCount(3);
        await expect(
          page.locator('[data-notation-status="obligateCarrier"]'),
        ).toHaveCount(0);
        await expect(
          page.locator('[data-notation-status="atRiskAffected"]'),
        ).toHaveCount(0);
        await expect(
          page.locator('[data-notation-status="atRiskCarrier"]'),
        ).toHaveCount(0);

        // Unknown pattern: the single nominated person is affected, the rest
        // unknown — again with no inference.
        await page
          .getByRole('button', { name: 'Heart Disease', exact: true })
          .click(); // deselect
        await page
          .getByRole('button', { name: 'Rare Condition', exact: true })
          .click();
        await expect(
          page.locator('[data-notation-status="affected"]'),
        ).toHaveCount(1);
        await expect(
          page.locator('[data-notation-status="unknown"]'),
        ).toHaveCount(4);
      },
    },
    {
      id: 'membership-family-connections',
      covers: ['sourceStageId.membershipScoping'],
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const {
          synth,
          fpStageId,
          attributeOf,
          person,
          relate,
          bioEdge,
          partnerEdge,
          friendship,
        } = scaffoldPedigree([HD]);
        person('mother', { name: 'Rose', sex: 'female' });
        person('father', { name: 'David', sex: 'male' });
        person('ego', { name: 'Jo', isEgo: true, sex: 'female' });
        partnerEdge('u1', 'mother', 'father');
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        // However indirect, everyone connected to the participant through
        // the pedigree's relationships is family: the father's ended
        // partnership, the half-sibling it produced, and a surrogate who
        // carried the participant.
        person('ex', { name: 'Ann', sex: 'female' });
        person('half-sibling', { name: 'Max', sex: 'male' });
        person('surrogate', { name: 'Liz', sex: 'female' });
        relate('u2', 'father', 'ex', 'partner', { current: false });
        bioEdge('b3', 'father', 'half-sibling');
        bioEdge('b4', 'ex', 'half-sibling');
        relate('s1', 'surrogate', 'ego', 'surrogate', { carrier: true });
        // People of the same type who are not family: a friend tied to the
        // participant by another kind of connection, and a couple related
        // only to each other.
        person('friend', { name: 'Priya', sex: 'female' });
        friendship('f1', 'ego', 'friend');
        person('stranger-a', { name: 'Tom', sex: 'male' });
        person('stranger-b', { name: 'Kate', sex: 'female' });
        partnerEdge('u3', 'stranger-a', 'stranger-b');
        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: 'node-color-seq-1',
              attribute: attributeOf(HD),
              inheritancePattern: 'autosomalDominant',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(
          6,
        );
        for (const name of ['Ann', 'Max', 'Liz']) {
          await expect(member(page, name)).toBeVisible();
        }
        for (const id of ['friend', 'stranger-a', 'stranger-b']) {
          await expect(page.locator(`[data-node-id="${id}"]`)).toHaveCount(0);
        }
      },
    },
    {
      id: 'misconfigured-source-stage-id',
      covers: ['sourceStageId.misconfigured'],
      currentStep: 1,
      seedNetwork: true,
      // The standard install (below) uses a valid pedigree so the
      // schema-checked install succeeds and the initial aria snapshot captures
      // a valid render.
      build: buildAdScenario,
      run: async ({ page, protocol, interview }) => {
        // Hand-construct a second payload whose NarrativePedigree
        // sourceStageId is rewritten to an unresolvable id AFTER schema
        // validation, reproducing a hand-edited protocol the app must fail
        // gracefully on.
        const synth = buildAdScenario();
        const built = buildSyntheticPayload(synth, {
          protocolName: 'matrix-narrative-pedigree-misconfigured',
          currentStep: 1,
          seedNetwork: true,
        });
        const corruptedStages = built.protocol.stages.map((stage) =>
          stage.type === 'NarrativePedigree'
            ? { ...stage, sourceStageId: 'does-not-exist' }
            : stage,
        );
        const corrupted = { ...built.protocol, stages: corruptedStages };

        await page.evaluate(
          (serializedPayload: string) =>
            window.__test.installProtocol(
              JSON.parse(serializedPayload) as ProtocolPayload,
            ),
          JSON.stringify(corrupted),
        );
        const interviewId = await protocol.createInterview(
          corrupted.id,
          'e2e-narrative-pedigree-misconfigured',
          { network: built.session.network },
        );
        interview.interviewId = interviewId;
        await interview.goto(1);

        await expect(
          page.getByText(
            'This stage references a family pedigree that could not be found.',
          ),
        ).toBeVisible();
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(
          0,
        );
      },
    },
    {
      id: 'zoom-keyboard-save-snapshot-readonly',
      covers: [
        'zoomControls',
        'keyboardOperation',
        'saveSnapshot',
        'label',
        'readOnlyInvariant',
      ],
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const { synth, fpStageId, attributeOf, person, bioEdge, partnerEdge } =
          scaffoldPedigree([HD]);
        person('mother', { name: 'Rose', sex: 'female' });
        person('father', { name: 'David', sex: 'male' });
        person('ego', {
          name: 'Jo',
          isEgo: true,
          sex: 'female',
          affected: [HD],
        });
        partnerEdge('u1', 'mother', 'father');
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: 'node-color-seq-1',
              attribute: attributeOf(HD),
              inheritancePattern: 'autosomalDominant',
            },
          ],
        });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const before = await protocol.getNetworkState(interview.interviewId);
        const you = member(page, 'You');
        await expect(you).toBeVisible();

        // The toolbar zooms in and out, and brings the whole family back.
        const opened = await canvasScale(page);
        // Each step waits for the zoom it asked for: a scale read straight
        // after a click can still be the previous step's.
        const zoomInButton = page.getByRole('button', { name: 'Zoom in' });
        await zoomInButton.click();
        await expect.poll(() => canvasScale(page)).toBeGreaterThan(opened);
        const zoomedOnce = await canvasScale(page);
        await zoomInButton.click();
        await expect.poll(() => canvasScale(page)).toBeGreaterThan(zoomedOnce);
        const zoomedTwice = await canvasScale(page);

        await page.getByRole('button', { name: 'Zoom out' }).click();
        await expect.poll(() => canvasScale(page)).toBeLessThan(zoomedTwice);

        await page
          .getByRole('button', { name: 'Show the whole family' })
          .click();
        await expect
          .poll(async () => Math.abs((await canvasScale(page)) - opened))
          .toBeLessThan(0.01);

        // The family is a single tab stop; the arrow keys move between people
        // by where they sit in the tree, and + zooms in.
        await expect(you).toHaveAttribute('tabindex', '0');
        await you.focus();
        await page.keyboard.press('ArrowUp');
        await expect(page.locator(':focus')).toHaveAttribute(
          'aria-label',
          /^Focus on (Rose|David)$/,
        );
        const beforeKeyZoom = await canvasScale(page);
        await page.keyboard.press('Equal');
        await expect
          .poll(() => canvasScale(page))
          .toBeGreaterThan(beforeKeyZoom);

        // Once a condition is chosen, Enter focuses on a person.
        await page
          .getByRole('button', { name: "Huntington's Disease", exact: true })
          .click();
        await you.focus();
        await page.keyboard.press('Enter');
        await expect(you).toHaveAttribute('aria-pressed', 'true');

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save snapshot' }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(
          /^inheritance-pathways.*\.png$/i,
        );

        // Read-only invariant, under a zoom/keyboard/snapshot interaction mix.
        const after = await protocol.getNetworkState(interview.interviewId);
        expect(after).toEqual(before);
      },
    },
  ],
} satisfies InterfaceScenarios;
