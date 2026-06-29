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
const MITO_VAR = 'hasMitochondrialMyopathy'; // mitochondrial

/**
 * Build a SyntheticInterview seeded with a three-generation pedigree plus a
 * FamilyPedigree source stage and a NarrativePedigree stage. The pedigree
 * nodes carry disease booleans and biological-sex / gameteRole so the genetics
 * engine can resolve statuses for autosomalDominant, xLinkedRecessive, and
 * mitochondrial patterns.
 *
 * Pedigree shape:
 *   grandmother (mito+) ── grandfather
 *          │
 *   mother (mito carrier line) ── father (haemophilia+)
 *                │
 *          ┌─────┴─────┐
 *         ego (female)  uncle (HD+)
 *        / \
 *     son  daughter
 *
 * ego also has a paternal lineage: grandfather-paternal (HD+) ── gm-paternal
 *   father is ego's biological father (and haemophilia carrier for XLR).
 *   grandfather-paternal has Huntington's → father → ego at-risk.
 *
 * Partner-side disease scenario:
 *   Chris's father (cf) has Huntington's Disease. cf + Chris's mother (cm) →
 *   Chris. Chris + ego → Leo (son) and Mia (daughter). Selecting a child as
 *   focal in Huntington's-only mode lights the partner-side (Chris, cf) and
 *   dims ego's maternal side (Eleanor, Arthur, Rose) which do not carry HD.
 */
export function buildPedigreeInterview(seed: number) {
  const si = new SyntheticInterview(seed);

  // --- Node type ----------------------------------------------------------
  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'circle' },
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

  // Maternal grandparents: grandmother has mitochondrial myopathy
  person('gm', {
    [NAME_VAR]: 'Eleanor',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });
  person('gf', { [NAME_VAR]: 'Arthur', [BIO_SEX_VAR]: 'male' });

  // Paternal grandparents: paternal grandfather has Huntington's
  person('gf-pat', {
    [NAME_VAR]: 'Harold',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });
  person('gm-pat', { [NAME_VAR]: 'Irene', [BIO_SEX_VAR]: 'female' });

  // Mother (daughter of Eleanor + Arthur): in the mitochondrial carrier line
  person('mother', { [NAME_VAR]: 'Rose', [BIO_SEX_VAR]: 'female' });

  // Father (son of Harold + Irene): haemophilia affected; also at-risk for HD
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

  // Ego's partner: Chris
  person('partner', { [NAME_VAR]: 'Chris', [BIO_SEX_VAR]: 'male' });

  // Partner-side disease: Chris's father (cf) has Huntington's Disease.
  // This introduces a second HD lineage entering the children via Chris's side,
  // so that selecting a child as focal (in HD-only mode) lights the partner-side
  // contributors (cf, Chris) while dimming ego's maternal side (Eleanor, Arthur,
  // Rose) which carry no HD allele.
  person('cf', {
    [NAME_VAR]: 'George',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });
  person('cm', { [NAME_VAR]: 'Helen', [BIO_SEX_VAR]: 'female' });

  // Ego's son (at risk for HD from both paternal lineage and partner's side)
  person('son', { [NAME_VAR]: 'Leo', [BIO_SEX_VAR]: 'male' });

  // Ego's daughter
  person('daughter', { [NAME_VAR]: 'Mia', [BIO_SEX_VAR]: 'female' });

  // Uncle (brother of mother): has Huntington's — shows AD in maternal line
  person('uncle', {
    [NAME_VAR]: 'Frank',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });

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

  // Parents → ego
  bioEdge('mother-ego', 'mother', 'ego');
  bioEdge('father-ego', 'father', 'ego');
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
// always-present StickerKeyPanel legend also renders Sticker glyphs carrying
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
// Story 3: Focal contributors — partner-side disease scenario
// Select Huntington's Disease via the condition Select (single-disease mode), then click
// Leo (the partner-side child). The partner-side contributors (Chris = partner,
// and Chris's father George = cf who has HD) must be un-dimmed
// (data-dimmed="false"), while ego's maternal side (Eleanor = gm, Arthur = gf,
// Rose = mother) which carry no HD must be dimmed (data-dimmed="true").
// Clicking "Clear focus" un-dims all nodes.
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
    // ancestors, excluding ego's maternal side.
    await userEvent.click(await screen.findByRole('combobox'));
    await userEvent.click(
      await screen.findByRole('option', { name: "Huntington's Disease" }),
    );

    // Click the son node (Leo) to set the focal. The focal container has
    // aria-label "Focus on Leo".
    const leoBtn = await screen.findByRole('button', {
      name: /focus on Leo/i,
    });
    await userEvent.click(leoBtn);

    // Partner-side contributors must be un-dimmed.
    const partnerNode = document.querySelector('[data-node-id="partner"]');
    expect(partnerNode?.getAttribute('data-dimmed')).toBe('false');

    const cfNode = document.querySelector('[data-node-id="cf"]');
    expect(cfNode?.getAttribute('data-dimmed')).toBe('false');

    // Ego's maternal side carries no HD → must be dimmed.
    const gmNode = document.querySelector('[data-node-id="gm"]');
    expect(gmNode?.getAttribute('data-dimmed')).toBe('true');

    const gfNode = document.querySelector('[data-node-id="gf"]');
    expect(gfNode?.getAttribute('data-dimmed')).toBe('true');

    const motherNode = document.querySelector('[data-node-id="mother"]');
    expect(motherNode?.getAttribute('data-dimmed')).toBe('true');

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
