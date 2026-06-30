import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, screen, userEvent } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import StoryInterviewShell from '~/.storybook/StoryInterviewShell';

// ---------------------------------------------------------------------------
// Variable IDs — shared between the FamilyPedigree stage and NarrativePedigree
// stage, and used when seeding the network.
// ---------------------------------------------------------------------------
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';

// Edge variables
const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

// Disease variables (boolean node attributes)
const HUNTINGTONS_VAR = 'hasHuntingtons'; // autosomalDominant
const HAEMOPHILIA_VAR = 'hasHaemophilia'; // xLinkedRecessive
const CF_VAR = 'hasCysticFibrosis'; // autosomalRecessive
const MITO_VAR = 'hasMitochondrialMyopathy'; // mitochondrial

/**
 * Build a SyntheticInterview seeded with a four-generation pedigree plus a
 * FamilyPedigree source stage and a NarrativePedigree stage. The nominations are
 * chosen so each condition is GENETICALLY COHERENT for its inheritance pattern —
 * every affected person has the two-copy source (recessive) or an affected/
 * carrier ancestor (dominant / X-linked) in their own shown ancestry — and so
 * that several conditions reach ego's children down long family lines.
 *
 * Pedigree:
 *   Eleanor (F, mito) ── Arthur (M, HD)          Harold (M) ── Irene (F)
 *            └──────┬──────┘                              └────┬────┘
 *         Rose (F, HD)  Frank (M)                       David (M, haemophilia)
 *            └──────────────────────┬───────────────────────┘
 *                          ego "You" (F) ── Chris (M)        Alex (NB, ego's sib)
 *                                 └───────┬───────┘
 *                                  Leo (M)   Mia (F, CF)
 *   (Chris's parents: George (M) ── Helen (F).)
 *
 * Conditions and the scenario each demonstrates:
 *  - Huntington's (autosomal dominant): Arthur + Rose affected → the allele
 *    descends Arthur → Rose → ego → Leo & Mia, so ego's CHILDREN are at risk of
 *    a long-running dominant family condition.
 *  - Haemophilia A (X-linked recessive): David + Leo affected. David's X came
 *    from his carrier mother Irene; his daughter ego is therefore an OBLIGATE
 *    CARRIER, and her son Leo is affected — the classic carrier-mother →
 *    affected-son alternation reaching ego's son.
 *  - Cystic fibrosis (autosomal recessive): only Mia is affected. Her two copies
 *    must come from BOTH parents, so ego AND Chris are unaffected OBLIGATE
 *    CARRIERS and her brother Leo is at risk — two non-affected carrier parents
 *    passing a recessive condition to a child.
 *  - Mitochondrial myopathy (mitochondrial): Eleanor affected → the maternal line
 *    Eleanor → Rose → ego → Leo & Mia is at risk.
 *
 * Focal highlighting (Huntington's, focus Leo) lights the maternal dominant line
 * (ego, Rose, Arthur) and dims the paternal/partner sides, which carry no HD.
 */
export function buildPedigreeInterview(seed: number, showAtRisk = false) {
  const si = new SyntheticInterview(seed);

  // --- Node type ----------------------------------------------------------
  // Standard pedigree shapes: square = male, circle = female, diamond =
  // other/unknown (Bennett 2022). Driven by the biological-sex variable so the
  // pedigree renders the conventional mix of shapes.
  const nodeType = si.addNodeType({
    name: 'Person',
    shape: {
      default: 'circle',
      dynamic: {
        type: 'discrete',
        variable: BIO_SEX_VAR,
        map: [
          { value: 'male', shape: 'square' },
          { value: 'female', shape: 'circle' },
          { value: 'other', shape: 'diamond' },
        ],
      },
    },
  });
  nodeType.addVariable({ id: NAME_VAR, name: NAME_VAR, type: 'text' });
  nodeType.addVariable({ id: EGO_VAR, name: EGO_VAR, type: 'boolean' });
  nodeType.addVariable({ id: BIO_SEX_VAR, name: BIO_SEX_VAR, type: 'text' });
  nodeType.addVariable({
    id: REL_TO_EGO_VAR,
    name: REL_TO_EGO_VAR,
    type: 'text',
  });
  nodeType.addVariable({
    id: HUNTINGTONS_VAR,
    name: HUNTINGTONS_VAR,
    type: 'boolean',
  });
  nodeType.addVariable({
    id: HAEMOPHILIA_VAR,
    name: HAEMOPHILIA_VAR,
    type: 'boolean',
  });
  nodeType.addVariable({ id: CF_VAR, name: CF_VAR, type: 'boolean' });
  nodeType.addVariable({ id: MITO_VAR, name: MITO_VAR, type: 'boolean' });

  // --- Edge type ----------------------------------------------------------
  const edgeType = si.addEdgeType({ name: 'Family' });
  edgeType.addVariable({
    id: REL_TYPE_VAR,
    name: REL_TYPE_VAR,
    type: 'categorical',
    options: [
      { label: 'biological', value: 'biological' },
      { label: 'partner', value: 'partner' },
    ],
  });
  edgeType.addVariable({
    id: IS_ACTIVE_VAR,
    name: IS_ACTIVE_VAR,
    type: 'boolean',
  });
  edgeType.addVariable({ id: IS_GEST_VAR, name: IS_GEST_VAR, type: 'boolean' });
  edgeType.addVariable({
    id: GAMETE_ROLE_VAR,
    name: GAMETE_ROLE_VAR,
    type: 'text',
  });

  // --- FamilyPedigree source stage ----------------------------------------
  const fpStage = si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: NAME_VAR,
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
    censusPrompt: 'Build your family pedigree.',
    nominationPrompts: [
      {
        id: 'nom-hd',
        text: "Who has been diagnosed with Huntington's disease?",
        variable: HUNTINGTONS_VAR,
      },
      {
        id: 'nom-hm',
        text: 'Who has been diagnosed with haemophilia?',
        variable: HAEMOPHILIA_VAR,
      },
      {
        id: 'nom-cf',
        text: 'Who has been diagnosed with cystic fibrosis?',
        variable: CF_VAR,
      },
      {
        id: 'nom-mt',
        text: 'Who has been diagnosed with mitochondrial myopathy?',
        variable: MITO_VAR,
      },
    ],
  });

  // --- NarrativePedigree stage --------------------------------------------
  si.addStage('NarrativePedigree', {
    label: 'Disease Pedigree Explorer',
    sourceStageId: fpStage.id,
    showAtRiskStatuses: showAtRisk,
    diseases: [
      {
        id: 'huntingtons',
        label: "Huntington's Disease",
        color: '#e53e3e',
        variable: HUNTINGTONS_VAR,
        inheritancePattern: 'autosomalDominant',
      },
      {
        id: 'haemophilia',
        label: 'Haemophilia A',
        color: '#3182ce',
        variable: HAEMOPHILIA_VAR,
        inheritancePattern: 'xLinkedRecessive',
      },
      {
        id: 'cysticFibrosis',
        label: 'Cystic Fibrosis',
        color: '#805ad5',
        variable: CF_VAR,
        inheritancePattern: 'autosomalRecessive',
      },
      {
        id: 'mitochondrial',
        label: 'Mitochondrial Myopathy',
        color: '#38a169',
        variable: MITO_VAR,
        inheritancePattern: 'mitochondrial',
      },
    ],
  });

  // --- Seed network nodes -------------------------------------------------
  // Using stable UIDs that match the edge wiring below.
  const fpId = fpStage.id;

  // addManualNode leaves unset attributes neutral (boolean -> false, text ->
  // ''), so each person only needs to declare the flags that are intentionally
  // true; ego identity and disease status stay deterministic.
  const person = (uid: string, attrs: Record<string, unknown>) =>
    si.addManualNode(fpId, nodeType.id, uid, attrs);

  // Maternal grandparents. Eleanor founds the mitochondrial line; Arthur founds
  // the autosomal-dominant Huntington's line.
  person('gm', {
    [NAME_VAR]: 'Eleanor',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });
  person('gf', {
    [NAME_VAR]: 'Arthur',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });

  // Paternal grandparents. Irene is the (carrier) source of David's X-linked
  // haemophilia; neither is nominated affected.
  person('gf-pat', { [NAME_VAR]: 'Harold', [BIO_SEX_VAR]: 'male' });
  person('gm-pat', { [NAME_VAR]: 'Irene', [BIO_SEX_VAR]: 'female' });

  // Mother (daughter of Eleanor + Arthur): Huntington's has manifested in this
  // second generation; she is also on Eleanor's maternal mitochondrial line.
  person('mother', {
    [NAME_VAR]: 'Rose',
    [BIO_SEX_VAR]: 'female',
    [HUNTINGTONS_VAR]: true,
  });

  // Father (son of Harold + Irene): affected with X-linked haemophilia (his X
  // from carrier mother Irene), so all his daughters are obligate carriers.
  person('father', {
    [NAME_VAR]: 'David',
    [BIO_SEX_VAR]: 'male',
    [HAEMOPHILIA_VAR]: true,
  });

  // Ego (daughter of mother + father): female, no confirmed disease
  person('ego', {
    [NAME_VAR]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });

  // Ego's non-binary sibling (child of mother + father): renders as a diamond,
  // so the pedigree shows all three standard pedigree shapes (square/circle/
  // diamond). 'other' resolves to unknown sex in the genetics engine; as a leaf
  // it does not alter anyone else's inheritance.
  person('sibling', { [NAME_VAR]: 'Alex', [BIO_SEX_VAR]: 'other' });

  // Ego's partner Chris, and his parents George + Helen. Chris carries a cystic-
  // fibrosis allele (inferred from his affected daughter Mia), but is not himself
  // nominated affected.
  person('partner', { [NAME_VAR]: 'Chris', [BIO_SEX_VAR]: 'male' });
  person('cf', { [NAME_VAR]: 'George', [BIO_SEX_VAR]: 'male' });
  person('cm', { [NAME_VAR]: 'Helen', [BIO_SEX_VAR]: 'female' });

  // Ego's son: affected with haemophilia — his single X came from carrier ego,
  // so this X-linked condition reaches ego's own child.
  person('son', {
    [NAME_VAR]: 'Leo',
    [BIO_SEX_VAR]: 'male',
    [HAEMOPHILIA_VAR]: true,
  });

  // Ego's daughter: affected with cystic fibrosis — two recessive copies, one
  // from each unaffected carrier parent (ego and Chris).
  person('daughter', {
    [NAME_VAR]: 'Mia',
    [BIO_SEX_VAR]: 'female',
    [CF_VAR]: true,
  });

  // Uncle (brother of Rose): not nominated affected — inferred at risk for the
  // Huntington's and mitochondrial lines he descends from.
  person('uncle', { [NAME_VAR]: 'Frank', [BIO_SEX_VAR]: 'male' });

  // --- Seed network edges -------------------------------------------------
  // getNetwork() passes edge attributes through verbatim (only NODE attributes
  // are randomised when unset), so edges only need their meaningful flags.
  const bioEdge = (uid: string, from: string, to: string) =>
    si.addManualEdge(edgeType.id, uid, from, to, {
      [REL_TYPE_VAR]: ['biological'],
      [IS_ACTIVE_VAR]: true,
    });

  const partnerEdge = (uid: string, a: string, b: string) =>
    si.addManualEdge(edgeType.id, uid, a, b, {
      [REL_TYPE_VAR]: ['partner'],
      [IS_ACTIVE_VAR]: true,
    });

  // Maternal grandparents → mother and uncle
  bioEdge('gm-mother', 'gm', 'mother');
  bioEdge('gf-mother', 'gf', 'mother');
  bioEdge('gm-uncle', 'gm', 'uncle');
  bioEdge('gf-uncle', 'gf', 'uncle');
  partnerEdge('gm-gf', 'gm', 'gf');

  // Paternal grandparents → father
  bioEdge('gfp-father', 'gf-pat', 'father');
  bioEdge('gmp-father', 'gm-pat', 'father');
  partnerEdge('gfp-gmp', 'gf-pat', 'gm-pat');

  // Parents → ego (and ego's non-binary sibling Alex)
  bioEdge('mother-ego', 'mother', 'ego');
  bioEdge('father-ego', 'father', 'ego');
  bioEdge('mother-sibling', 'mother', 'sibling');
  bioEdge('father-sibling', 'father', 'sibling');
  partnerEdge('mother-father', 'mother', 'father');

  // Partner-side grandparents → partner (Chris)
  bioEdge('cf-partner', 'cf', 'partner');
  bioEdge('cm-partner', 'cm', 'partner');
  partnerEdge('cf-cm', 'cf', 'cm');

  // Ego + partner → children
  bioEdge('ego-son', 'ego', 'son');
  bioEdge('partner-son', 'partner', 'son');
  bioEdge('ego-daughter', 'ego', 'daughter');
  bioEdge('partner-daughter', 'partner', 'daughter');
  partnerEdge('ego-partner', 'ego', 'partner');

  return si;
}

// ---------------------------------------------------------------------------
// Story wrapper
// ---------------------------------------------------------------------------

function NarrativePedigreeStoryWrapper({
  buildFn,
  startStep,
}: {
  buildFn: () => SyntheticInterview;
  startStep: number;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        interview.getInterviewPayload({ currentStep: startStep }),
      ),
    [interview, startStep],
  );

  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/NarrativePedigree',
  parameters: { layout: 'fullscreen' },
  // `buildPedigreeInterview` is a fixture helper (also imported by the unit
  // tests), not a story. Without this, CSF auto-registers it as a story;
  // opening it calls the helper with Storybook's (args, context) instead of a
  // numeric seed and then tries to render/serialize the returned
  // SyntheticInterview graph, which hangs the browser. Keep it out of the
  // story set.
  excludeStories: ['buildPedigreeInterview'],
};

export default meta;
type Story = StoryObj;

// The NarrativePedigree stage is at index 1 in the protocol (FamilyPedigree is
// at index 0). currentStep is a 0-based index into the stages array
// (getCurrentStage reads `stages[currentStep]`).
const NP_STEP = 1;

// Node-render-mode markers ([data-sticker-status] / [data-notation-status])
// must be queried inside the pedigree view, not the whole document: the
// always-present ConditionPanel legend also renders Sticker glyphs carrying
// [data-sticker-status] as an overlay sibling. A document-wide query would
// always match those and never reflect the node-rendering mode.
function viewScope(): Element {
  const view = document.querySelector('[data-narrative-pedigree-view]');
  if (!view) {
    throw new Error('expected the pedigree view to be mounted');
  }
  return view;
}

// ---------------------------------------------------------------------------
// Story 1: All-diseases sticker view (default render)
// ≥2 diseases active → StickerNode rendered → [data-sticker-status] in DOM.
// ---------------------------------------------------------------------------
export const AllDiseasesStickerView: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(1)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Wait for the pedigree view to mount before querying.
    await screen.findByTestId('next-button');

    const stickers = viewScope().querySelectorAll('[data-sticker-status]');
    expect(stickers.length).toBeGreaterThan(0);
  },
};

// ---------------------------------------------------------------------------
// Story 2: Select single disease via the condition Select
// Pick a disease in the condition Select → single-condition mode →
// single-condition node ([data-notation-status]) present, stickers absent.
// Pick "All conditions" → stickers return.
// ---------------------------------------------------------------------------
export const SelectSingleDisease: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(2)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Wait for the pedigree to mount.
    await screen.findByTestId('next-button');

    // Open the condition Select and pick Huntington's Disease.
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: "Huntington's Disease" }),
    );

    // Single-disease mode: classic notation present, no stickers.
    const notationNodes = viewScope().querySelectorAll(
      '[data-notation-status]',
    );
    expect(notationNodes.length).toBeGreaterThan(0);

    const stickerNodes = viewScope().querySelectorAll('[data-sticker-status]');
    expect(stickerNodes.length).toBe(0);

    // Picking "All conditions" restores sticker mode.
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: 'All conditions' }),
    );

    const stickersAfter = viewScope().querySelectorAll('[data-sticker-status]');
    expect(stickersAfter.length).toBeGreaterThan(0);
  },
};

// ---------------------------------------------------------------------------
// Story 2b: Selecting a disease by clicking a person's STICKER (pointer path).
// userEvent.click respects pointer-events in a real browser, so this also
// guards the regression where an interactive sticker inherits pointer-events:
// none from its overlay parent (the click would then never reach it).
// ---------------------------------------------------------------------------
export const SelectDiseaseBySticker: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(2)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    await screen.findByTestId('next-button');

    // Click a person's sticker directly. A pointer-events:none sticker would
    // make userEvent throw here rather than select the disease.
    const sticker = viewScope().querySelector('[data-sticker-status]');
    if (!(sticker instanceof HTMLElement)) {
      throw new Error('expected at least one sticker to be rendered');
    }
    await userEvent.click(sticker);

    // The view switches to single-disease (classic) mode for that disease.
    const notationNodes = viewScope().querySelectorAll(
      '[data-notation-status]',
    );
    expect(notationNodes.length).toBeGreaterThan(0);
    expect(viewScope().querySelectorAll('[data-sticker-status]').length).toBe(
      0,
    );
  },
};

// ---------------------------------------------------------------------------
// Story 3: Focal contributors — inheritance-aware highlighting
// Select Huntington's Disease (single-disease mode), then focus Leo (ego's son).
// Huntington's descends the maternal line Arthur (gf) → Rose (mother) → ego →
// Leo, so those ancestors must be un-dimmed (data-dimmed="false"), while the
// paternal/partner sides — which carry no HD allele — must be dimmed
// (data-dimmed="true"). Clicking "Clear focus" un-dims all nodes.
// ---------------------------------------------------------------------------
export const FocalContributors: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(3)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Wait for the pedigree to mount.
    await screen.findByTestId('next-button');

    // Switch to Huntington's-only mode so computeContributors walks only HD
    // ancestors.
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: "Huntington's Disease" }),
    );

    // Focus Leo (ego's son). Target by data-node-id rather than label, since the
    // displayed labels are relationship descriptions, not seeded names.
    const leoFocal = viewScope().querySelector('[data-node-id="son"]');
    if (!(leoFocal instanceof HTMLElement)) {
      throw new Error('expected the son focal control to be rendered');
    }
    await userEvent.click(leoFocal);

    const dimmedFor = (id: string) =>
      document
        .querySelector(`[data-node-id="${id}"]`)
        ?.getAttribute('data-dimmed');

    // The maternal Huntington's line that transmits to Leo must be un-dimmed.
    expect(dimmedFor('ego')).toBe('false');
    expect(dimmedFor('mother')).toBe('false'); // Rose
    expect(dimmedFor('gf')).toBe('false'); // Arthur

    // Sides carrying no HD allele must be dimmed.
    expect(dimmedFor('partner')).toBe('true'); // Chris
    expect(dimmedFor('cf')).toBe('true'); // George
    expect(dimmedFor('father')).toBe('true'); // David (paternal, haemophilia)
    expect(dimmedFor('gm')).toBe('true'); // Eleanor (mitochondrial, not HD)

    // Clicking "Clear focus" resets — all nodes un-dimmed.
    const clearBtn = await screen.findByRole('button', { name: 'Clear focus' });
    await userEvent.click(clearBtn);

    const allMembers = document.querySelectorAll(
      '[data-pedigree-member="true"]',
    );
    for (const member of allMembers) {
      expect(member.getAttribute('data-dimmed')).toBe('false');
    }
  },
};

// ---------------------------------------------------------------------------
// Story 4: Save snapshot ActionButton
// The "Save snapshot" ActionButton is present and clickable.
// ---------------------------------------------------------------------------
export const SaveSnapshot: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(4)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // The ActionButton is rendered regardless of disease selection.
    const saveBtn = await screen.findByRole('button', {
      name: /save snapshot/i,
    });
    expect(saveBtn).toBeDefined();

    // Clicking must not throw. The async toPng call may fail in the test
    // environment (no DOM-to-image support) but the handler is fire-and-forget.
    await userEvent.click(saveBtn);
  },
};

// ---------------------------------------------------------------------------
// Story 5: Labels
// Assert that each seeded named node shows its deterministic name and exactly
// one node is labelled "You" (the ego).
// ---------------------------------------------------------------------------
export const Labels: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(5)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Wait for nodes to render.
    await screen.findByTestId('next-button');

    // Each node's focal control is the `role="button"` container with an
    // `aria-label` of `Focus on <label>` — target it directly (not the inner
    // fresco-ui Node <button>, whose label is generic).
    const focusControls = document.querySelectorAll(
      '[data-pedigree-member="true"][role="button"]',
    );
    const focusLabels = Array.from(focusControls).map((el) =>
      el.getAttribute('aria-label'),
    );
    const youFocusCount = focusLabels.filter((l) =>
      l?.includes('Focus on You'),
    ).length;
    expect(youFocusCount).toBe(1);

    // Each seeded name must appear somewhere in a node focus-button label.
    for (const name of [
      'Eleanor',
      'Arthur',
      'Harold',
      'Rose',
      'David',
      'Chris',
      'Leo',
      'Mia',
      'Frank',
      'George',
      'Helen',
    ]) {
      const found = focusLabels.some((l) => l?.includes(name));
      expect(found, `Expected to find node labelled "${name}"`).toBe(true);
    }
  },
};

// ---------------------------------------------------------------------------
// Story 6: At-risk statuses OFF (the stage default)
// The key panel lists only the certain markers — the "may have / may carry"
// rows and the more-seriously-affected (homozygous) row are absent.
// ---------------------------------------------------------------------------
export const AtRiskStatusesOff: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(6, false)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    await screen.findByTestId('next-button');

    expect(screen.queryByText('May develop this condition')).toBeNull();
    expect(screen.queryByText('May carry this condition')).toBeNull();
    expect(
      screen.queryByText(/More seriously affected|two copies/i),
    ).toBeNull();
  },
};

// ---------------------------------------------------------------------------
// Story 7: At-risk statuses ON
// The key panel reflects the larger displayed set — the at-risk rows and the
// more-seriously-affected (homozygous) row are present.
// ---------------------------------------------------------------------------
export const AtRiskStatusesOn: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(7, true)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    await screen.findByTestId('next-button');

    expect(await screen.findByText('May develop this condition')).toBeDefined();
    expect(await screen.findByText('May carry this condition')).toBeDefined();
    expect(await screen.findByText(/two copies/i)).toBeDefined();
  },
};
