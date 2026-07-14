import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  BIOLOGICAL_SEX_OPTIONS,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import type { InterfaceScenarios } from './types.js';

// --- Codebook variable names (identifier-style, no spaces) ------------------
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';
const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

type PedigreeScaffold = {
  synth: SyntheticInterview;
  nodeTypeId: string;
  edgeTypeId: string;
  nameVarId: string;
  fpStageId: string;
  /** Seed a Person node with an explicit uid and attributes. */
  person: (uid: string, attrs: Record<string, unknown>) => void;
  /** Seed a directed biological parent(from) -> child(to) edge. */
  bioEdge: (uid: string, from: string, to: string) => void;
  /** Seed a partner edge between two people. */
  partnerEdge: (uid: string, a: string, b: string) => void;
};

/**
 * Builds the shared Person/Family codebook + a FamilyPedigree source stage on a
 * fresh SyntheticInterview. The pedigree is entirely pre-seeded via
 * addManualNode/addManualEdge — no participant interaction reaches the census, so
 * the FamilyPedigree stage exists only to give NarrativePedigree a source of
 * node/edge config. The Person node type uses the dynamic sex→shape mapping
 * (male→square, female→circle, other→diamond) that `resolveSex`/`resolveNodeShape`
 * read; the Family edge type carries the locked relationship-type / gamete-role
 * categoricals plus the isActive / isGestationalCarrier booleans.
 */
function scaffoldPedigree(diseaseVarIds: string[]): PedigreeScaffold {
  const synth = new SyntheticInterview();
  const nodeType = synth.addNodeType({
    name: 'Person',
    shape: {
      default: 'circle',
      dynamic: {
        type: 'discrete',
        variable: BIO_SEX_VAR,
        map: [
          { value: 'male', shape: 'square' },
          { value: 'female', shape: 'circle' },
          { value: 'intersex', shape: 'diamond' },
        ],
      },
    },
  });
  const nameVarId = nodeType.addVariable({ name: NAME_VAR, type: 'text' }).id;
  nodeType.addVariable({ id: EGO_VAR, name: EGO_VAR, type: 'boolean' });
  // biologicalSex is categorical (not text) so it can drive the discrete
  // sex->shape mapping the schema requires for a dynamic node shape.
  nodeType.addVariable({
    id: BIO_SEX_VAR,
    name: BIO_SEX_VAR,
    type: 'categorical',
    options: BIOLOGICAL_SEX_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    })),
  });
  nodeType.addVariable({ id: REL_TO_EGO_VAR, name: REL_TO_EGO_VAR, type: 'text' });
  for (const id of diseaseVarIds) {
    nodeType.addVariable({ id, name: id, type: 'boolean' });
  }

  const edgeType = synth.addEdgeType({ name: 'Family' });
  edgeType.addVariable({
    id: REL_TYPE_VAR,
    name: REL_TYPE_VAR,
    type: 'categorical',
    options: RELATIONSHIP_TYPE_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    })),
  });
  edgeType.addVariable({ id: IS_ACTIVE_VAR, name: IS_ACTIVE_VAR, type: 'boolean' });
  edgeType.addVariable({ id: IS_GEST_VAR, name: IS_GEST_VAR, type: 'boolean' });
  edgeType.addVariable({
    id: GAMETE_ROLE_VAR,
    name: GAMETE_ROLE_VAR,
    type: 'categorical',
    options: GAMETE_ROLE_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    })),
  });

  const fpStage = synth.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: nameVarId,
      egoVariable: EGO_VAR,
      relationshipVariable: REL_TO_EGO_VAR,
      biologicalSexVariable: BIO_SEX_VAR,
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: REL_TYPE_VAR,
      isActiveVariable: IS_ACTIVE_VAR,
      isGestationalCarrierVariable: IS_GEST_VAR,
      gameteRoleVariable: GAMETE_ROLE_VAR,
    },
    censusPrompt: 'Build the family tree.',
  });

  const boolDefaults = Object.fromEntries(
    [EGO_VAR, ...diseaseVarIds].map((v) => [v, false]),
  );

  return {
    synth,
    nodeTypeId: nodeType.id,
    edgeTypeId: edgeType.id,
    nameVarId,
    fpStageId: fpStage.id,
    person: (uid, attrs) => {
      // biologicalSex is categorical, so store its value as a single-element
      // array (the shape/genetics resolvers read either form, but the array is
      // the canonical categorical representation).
      const normalised = { ...attrs };
      const sex = normalised[BIO_SEX_VAR];
      if (typeof sex === 'string') {
        normalised[BIO_SEX_VAR] = [sex];
      }
      synth.addManualNode(fpStage.id, nodeType.id, uid, {
        ...boolDefaults,
        ...normalised,
      });
    },
    bioEdge: (uid, from, to) =>
      synth.addManualEdge(edgeType.id, uid, from, to, {
        [REL_TYPE_VAR]: ['biological'],
        [IS_ACTIVE_VAR]: true,
      }),
    partnerEdge: (uid, a, b) =>
      synth.addManualEdge(edgeType.id, uid, a, b, {
        [REL_TYPE_VAR]: ['partner'],
        [IS_ACTIVE_VAR]: true,
      }),
  };
}

const HD_VAR = 'hasHuntingtons';

/**
 * grandparent(affected, HD) -> parent -> ego, plus a married-in aunt on
 * grandparent's line who is never an ancestor of ego (so she stays dimmed when
 * ego is focused). One autosomal-dominant disease, at-risk display off. Reused by
 * the focal, read-only, and misconfigured scenarios.
 */
function buildAdScenario(): SyntheticInterview {
  const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
    scaffoldPedigree([HD_VAR]);
  person('grandparent', {
    [nameVarId]: 'George',
    [BIO_SEX_VAR]: 'male',
    [HD_VAR]: true,
  });
  person('grandparent-partner', { [nameVarId]: 'Nancy', [BIO_SEX_VAR]: 'female' });
  // A collateral aunt — a child of the grandparents, so never in ego's ancestral
  // line — giving the focal scenario a node that must stay dimmed.
  person('aunt', { [nameVarId]: 'Margaret', [BIO_SEX_VAR]: 'female' });
  person('parent', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
  person('parent-partner', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
  person('ego', {
    [nameVarId]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });
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
        color: '#e53e3e',
        variable: HD_VAR,
        inheritancePattern: 'autosomalDominant',
      },
    ],
  });
  return synth;
}

const CF_VAR = 'hasCf';

/**
 * A consanguineous (first-cousin union) autosomal-recessive pedigree: two shared
 * great-grandparents, their two children (the grandparents of ego, siblings), each
 * partnered with a married-in spouse to produce mother and father — who are
 * therefore first cousins — and their affected child (ego). Both parents resolve
 * to obligate carriers and the four grandparents to at-risk carriers. Shared by the
 * at-risk-hidden and at-risk-shown scenarios; only `showAtRiskStatuses` differs.
 */
function buildCousinUnion(showAtRiskStatuses: boolean): SyntheticInterview {
  const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
    scaffoldPedigree([CF_VAR]);

  person('great-grandfather', { [nameVarId]: 'Albert', [BIO_SEX_VAR]: 'male' });
  person('great-grandmother', { [nameVarId]: 'Mabel', [BIO_SEX_VAR]: 'female' });
  person('maternal-grandmother', { [nameVarId]: 'Iris', [BIO_SEX_VAR]: 'female' });
  person('maternal-grandfather', { [nameVarId]: 'Frank', [BIO_SEX_VAR]: 'male' });
  person('paternal-grandfather', { [nameVarId]: 'Ernest', [BIO_SEX_VAR]: 'male' });
  person('paternal-grandmother', { [nameVarId]: 'Vera', [BIO_SEX_VAR]: 'female' });
  person('mother', { [nameVarId]: 'Diane', [BIO_SEX_VAR]: 'female' });
  person('father', { [nameVarId]: 'Roy', [BIO_SEX_VAR]: 'male' });
  person('ego', {
    [nameVarId]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
    [CF_VAR]: true,
  });

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
        color: '#805ad5',
        variable: CF_VAR,
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
        'sourceStageId.membershipScoping',
        'diseases',
      ],
      smoke: true,
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const { synth, nameVarId, fpStageId, person, bioEdge } = scaffoldPedigree([
          HD_VAR,
          CF_VAR,
        ]);
        person('mother', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
        person('father', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
        });
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
              color: '#e53e3e',
              variable: HD_VAR,
              inheritancePattern: 'autosomalDominant',
            },
            {
              id: 'cf',
              label: 'Cystic Fibrosis',
              color: '#805ad5',
              variable: CF_VAR,
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
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(3);
        await expect(
          page.locator('[role="button"][aria-label="Focus on You"]'),
        ).toBeVisible();
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
      id: 'condition-select-toggle-color-variable-focal-disabled',
      covers: [
        'diseases[].id',
        'diseases[].label',
        'diseases[].color',
        'diseases[].variable',
        'focalAffordanceDisabled',
        'diseases[].inheritancePattern=autosomalDominant',
      ],
      visual: true,
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: buildAdScenario,
      run: async ({ page }) => {
        // Focal affordance is disabled until a condition is selected: clicking the
        // ego node is a no-op (no focus is established).
        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
        await expect(egoFocal).toHaveAttribute('aria-disabled', 'true');
        // Force the click past Playwright's disabled-element guard: the DOM event
        // fires but the handler no-ops (no condition selected), so no focus is
        // established.
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
        // The condition-key swatch renders in the disease's authored colour.
        await expect(
          conditionButton.locator('span[aria-hidden]').first(),
        ).toHaveCSS('background-color', 'rgb(229, 62, 62)');
        await expect(page.getByText("Showing Huntington's Disease")).toBeVisible();

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

        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
        await egoFocal.click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toBeVisible();
        await expect(page.locator('[data-node-id="grandparent"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
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

        // Re-focus, then clear a second time with Escape inside the viewport.
        await egoFocal.click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toBeVisible();
        await page.locator('[data-narrative-pedigree-view]').press('Escape');
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

        // At-risk display is OFF: the probabilistic statuses collapse to unknown,
        // so no at-risk glyphs are drawn anywhere and no "?" appears.
        await expect(
          page.locator('[data-notation-status="atRiskAffected"]'),
        ).toHaveCount(0);
        await expect(
          page.locator('[data-notation-status="atRiskCarrier"]'),
        ).toHaveCount(0);
        await expect(page.locator('[data-question-mark]')).toHaveCount(0);

        // The condition key omits the two at-risk rows.
        await expect(page.getByText('May develop this condition')).toHaveCount(0);
        await expect(page.getByText('May carry this condition')).toHaveCount(0);

        // A relative the engine computes as at-risk is announced to screen readers
        // as "Status unknown" (mirroring the collapsed display).
        await expect(page.locator('#np-status-maternal-grandmother')).toHaveText(
          'Cystic Fibrosis: Status unknown',
        );
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

        // With at-risk display ON the same relative now carries an at-risk-carrier
        // glyph with a "?".
        await expect(
          page.locator(
            '[data-node-id="maternal-grandmother"] [data-notation-status]',
          ),
        ).toHaveAttribute('data-notation-status', 'atRiskCarrier');
        await expect(
          page.locator('[data-node-id="maternal-grandmother"] [data-question-mark]'),
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
        const HAEMOPHILIA_VAR = 'hasHaemophilia';
        const HYPOPHOSPHATAEMIA_VAR = 'hasHypophosphataemia';
        const HEARING_LOSS_VAR = 'hasHearingLoss';
        const MYOPATHY_VAR = 'hasMyopathy';
        const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
          scaffoldPedigree([
            HAEMOPHILIA_VAR,
            HYPOPHOSPHATAEMIA_VAR,
            HEARING_LOSS_VAR,
            MYOPATHY_VAR,
          ]);

        // Paternal line: the Y-linked condition down grandfather->father->ego, and
        // the X-linked-dominant condition on the affected father.
        person('paternal-grandfather', {
          [nameVarId]: 'Walter',
          [BIO_SEX_VAR]: 'male',
          [HEARING_LOSS_VAR]: true,
        });
        person('paternal-grandmother', {
          [nameVarId]: 'Edith',
          [BIO_SEX_VAR]: 'female',
        });
        person('father', {
          [nameVarId]: 'Gerald',
          [BIO_SEX_VAR]: 'male',
          [HYPOPHOSPHATAEMIA_VAR]: true,
        });

        // Maternal line: the mtDNA source (great-grandmother) and the X-linked
        // recessive carrier line (grandmother, obligate via two affected sons).
        person('maternal-great-grandmother', {
          [nameVarId]: 'Agnes',
          [BIO_SEX_VAR]: 'female',
          [MYOPATHY_VAR]: true,
        });
        person('maternal-great-grandfather', {
          [nameVarId]: 'Herbert',
          [BIO_SEX_VAR]: 'male',
        });
        person('maternal-grandmother', {
          [nameVarId]: 'Iris',
          [BIO_SEX_VAR]: 'female',
        });
        person('maternal-grandfather', {
          [nameVarId]: 'Frank',
          [BIO_SEX_VAR]: 'male',
        });
        person('uncle', {
          [nameVarId]: 'Alan',
          [BIO_SEX_VAR]: 'male',
          [HAEMOPHILIA_VAR]: true,
        });
        person('uncle-two', {
          [nameVarId]: 'Bruce',
          [BIO_SEX_VAR]: 'male',
          [HAEMOPHILIA_VAR]: true,
        });
        person('mother', { [nameVarId]: 'Diane', [BIO_SEX_VAR]: 'female' });

        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'male',
        });
        person('sister', { [nameVarId]: 'Helen', [BIO_SEX_VAR]: 'female' });

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
              color: '#3182ce',
              variable: HAEMOPHILIA_VAR,
              inheritancePattern: 'xLinkedRecessive',
            },
            {
              id: 'hypophosphataemia',
              label: 'Hypophosphataemia',
              color: '#38a169',
              variable: HYPOPHOSPHATAEMIA_VAR,
              inheritancePattern: 'xLinkedDominant',
            },
            {
              id: 'hearing-loss',
              label: 'Hearing Loss',
              color: '#d69e2e',
              variable: HEARING_LOSS_VAR,
              inheritancePattern: 'yLinked',
            },
            {
              id: 'myopathy',
              label: 'Mitochondrial Myopathy',
              color: '#805ad5',
              variable: MYOPATHY_VAR,
              inheritancePattern: 'mitochondrial',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
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

        // X-linked dominant: every daughter of the affected father is non-unknown;
        // a son of the same father stays unknown.
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

        // Y-linked: only males down the paternal line carry a non-unknown status;
        // a daughter is unknown; focusing the grandson highlights only the
        // paternal father->son chain.
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

        // Mitochondrial: focusing a maternal-line descendant highlights only the
        // female-parent (egg-cytoplasm) chain up to the great-grandmother source;
        // a paternal-line relative stays dimmed.
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
        const MULTI_VAR = 'hasHeartDisease';
        const UNKNOWN_VAR = 'hasRareCondition';
        const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
          scaffoldPedigree([MULTI_VAR, UNKNOWN_VAR]);

        // 5 people. Two carry the multifactorial trait (mother, ego); one carries
        // the unknown-pattern trait (father); the remaining two carry neither.
        person('grandparent', {
          [nameVarId]: 'Mary',
          [BIO_SEX_VAR]: 'female',
        });
        person('mother', {
          [nameVarId]: 'Diane',
          [BIO_SEX_VAR]: 'female',
          [MULTI_VAR]: true,
        });
        person('father', {
          [nameVarId]: 'Roy',
          [BIO_SEX_VAR]: 'male',
          [UNKNOWN_VAR]: true,
        });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
          [MULTI_VAR]: true,
        });
        person('sibling', { [nameVarId]: 'Sam', [BIO_SEX_VAR]: 'male' });

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
              color: '#dd6b20',
              variable: MULTI_VAR,
              inheritancePattern: 'multifactorial',
            },
            {
              id: 'rare-condition',
              label: 'Rare Condition',
              color: '#319795',
              variable: UNKNOWN_VAR,
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
      id: 'membership-scoping-committed',
      covers: ['sourceStageId.membershipScoping'],
      currentStep: 1,
      seedNetwork: true,
      // The committed FamilyPedigree membership (stage index 0) lists only the
      // three pedigree members, so the extra same-typed 'outsider' node — a
      // later-stage nomination sharing the pedigree node type — is scoped out.
      stageMetadata: {
        0: {
          isNetworkCommitted: true,
          nodes: [
            { id: 'mother', label: 'Mother', isEgo: false },
            { id: 'father', label: 'Father', isEgo: false },
            { id: 'ego', label: 'You', isEgo: true },
          ],
        },
      },
      build: (): SyntheticInterview => {
        const { synth, nameVarId, fpStageId, person, bioEdge } = scaffoldPedigree([
          HD_VAR,
        ]);
        person('mother', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
        person('father', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
        });
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        // A same-typed node with no family edges, absent from the committed list.
        person('outsider', {
          [nameVarId]: 'Outsider',
          [BIO_SEX_VAR]: 'intersex',
        });
        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: '#e53e3e',
              variable: HD_VAR,
              inheritancePattern: 'autosomalDominant',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(3);
        await expect(page.locator('[data-node-id="outsider"]')).toHaveCount(0);
      },
    },
    {
      id: 'misconfigured-source-stage-id',
      covers: ['sourceStageId.misconfigured'],
      currentStep: 1,
      seedNetwork: true,
      // The standard install (below) uses a valid pedigree so the schema-checked
      // install succeeds and the initial aria snapshot captures a valid render.
      build: buildAdScenario,
      run: async ({ page, protocol, interview }) => {
        // Hand-construct a second payload whose NarrativePedigree sourceStageId is
        // rewritten to an unresolvable id AFTER schema validation, reproducing a
        // hand-edited / pre-migration protocol the app must fail gracefully on.
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
          (protocolPayload) => window.__test.installProtocol(protocolPayload),
          corrupted,
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
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(0);
      },
    },
    {
      id: 'zoom-controls-save-snapshot-readonly',
      covers: ['zoomControls', 'saveSnapshot', 'label', 'readOnlyInvariant'],
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const { synth, nameVarId, fpStageId, person, bioEdge } = scaffoldPedigree([
          HD_VAR,
        ]);
        person('mother', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
        person('father', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
          [HD_VAR]: true,
        });
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
              color: '#e53e3e',
              variable: HD_VAR,
              inheritancePattern: 'autosomalDominant',
            },
          ],
        });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const before = await protocol.getNetworkState(interview.interviewId);

        const zoomContent = page.locator('[data-testid="np-zoom-content"]');
        const zoomInButton = page.getByRole('button', { name: 'Zoom in' });
        const zoomOutButton = page.getByRole('button', { name: 'Zoom out' });
        const resetZoomButton = page.getByRole('button', { name: 'Reset zoom' });

        await zoomInButton.click();
        await zoomInButton.click();
        await expect
          .poll(async () =>
            Number(await zoomContent.getAttribute('data-zoom-level')),
          )
          .toBeGreaterThan(1);
        const zoomedInLevel = Number(
          await zoomContent.getAttribute('data-zoom-level'),
        );

        await zoomOutButton.click();
        await expect
          .poll(async () => {
            const level = Number(
              await zoomContent.getAttribute('data-zoom-level'),
            );
            return level > 1 && level < zoomedInLevel;
          })
          .toBe(true);

        await resetZoomButton.click();
        await expect(zoomContent).toHaveAttribute('data-zoom-level', '1');

        await page
          .getByRole('button', { name: "Huntington's Disease", exact: true })
          .click();

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save snapshot' }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(
          /^inheritance-pathways.*\.png$/i,
        );

        // Read-only invariant, under a zoom/snapshot interaction mix.
        const after = await protocol.getNetworkState(interview.interviewId);
        expect(after).toEqual(before);
      },
    },
  ],
} satisfies InterfaceScenarios;
