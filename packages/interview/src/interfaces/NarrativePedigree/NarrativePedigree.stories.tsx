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
 */
function buildPedigreeInterview(seed: number) {
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
    presets: [
      {
        id: 'multi-disease',
        label: 'All diseases (stickers)',
        diseases: ['huntingtons', 'haemophilia', 'mitochondrial'],
        focal: 'ego',
      },
      {
        id: 'single-hd',
        label: "Huntington's only (classic)",
        diseases: ['huntingtons'],
        focal: 'everyone',
      },
      {
        id: 'focal-reselect',
        label: 'Explore by member',
        diseases: ['huntingtons', 'mitochondrial'],
        focal: 'ego',
      },
    ],
    allowFocalReselection: true,
  });

  // --- Seed network nodes -------------------------------------------------
  // Using stable UIDs that match the edge wiring below.
  const fpId = fpStage.id;

  // Maternal grandparents: grandmother has mitochondrial myopathy
  si.addManualNode(fpId, nodeType.id, 'gm', {
    [NAME_VAR]: 'Eleanor',
    [BIO_SEX_VAR]: 'female',
    [MITO_VAR]: true,
  });
  si.addManualNode(fpId, nodeType.id, 'gf', {
    [NAME_VAR]: 'Arthur',
    [BIO_SEX_VAR]: 'male',
  });

  // Paternal grandparents: paternal grandfather has Huntington's
  si.addManualNode(fpId, nodeType.id, 'gf-pat', {
    [NAME_VAR]: 'Harold',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });
  si.addManualNode(fpId, nodeType.id, 'gm-pat', {
    [NAME_VAR]: 'Irene',
    [BIO_SEX_VAR]: 'female',
  });

  // Mother (daughter of Eleanor + Arthur): in the mitochondrial carrier line
  si.addManualNode(fpId, nodeType.id, 'mother', {
    [NAME_VAR]: 'Rose',
    [BIO_SEX_VAR]: 'female',
  });

  // Father (son of Harold + Irene): haemophilia affected; also at-risk for HD
  si.addManualNode(fpId, nodeType.id, 'father', {
    [NAME_VAR]: 'David',
    [BIO_SEX_VAR]: 'male',
    [HAEMOPHILIA_VAR]: true,
  });

  // Ego (daughter of mother + father): female, no confirmed disease
  si.addManualNode(fpId, nodeType.id, 'ego', {
    [NAME_VAR]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });

  // Ego's partner
  si.addManualNode(fpId, nodeType.id, 'partner', {
    [NAME_VAR]: 'Chris',
    [BIO_SEX_VAR]: 'male',
  });

  // Ego's son (at risk for HD from paternal line; at risk for haemophilia affected from father via XLR)
  si.addManualNode(fpId, nodeType.id, 'son', {
    [NAME_VAR]: 'Leo',
    [BIO_SEX_VAR]: 'male',
  });

  // Ego's daughter
  si.addManualNode(fpId, nodeType.id, 'daughter', {
    [NAME_VAR]: 'Mia',
    [BIO_SEX_VAR]: 'female',
  });

  // Uncle (brother of mother): has Huntington's — shows AD in maternal line
  si.addManualNode(fpId, nodeType.id, 'uncle', {
    [NAME_VAR]: 'Frank',
    [BIO_SEX_VAR]: 'male',
    [HUNTINGTONS_VAR]: true,
  });

  // --- Seed network edges -------------------------------------------------
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
};

export default meta;
type Story = StoryObj;

// The NarrativePedigree stage is at index 1 in the protocol (FamilyPedigree is
// at index 0). currentStep is 1-based in StoryInterviewShell.
const NP_STEP = 2;

// ---------------------------------------------------------------------------
// Story 1: Multi-disease STICKER view
// Preset 0 shows all three diseases (≥ 2) → StickerNode rendered.
// Play function asserts that [data-sticker-status] elements are present.
// ---------------------------------------------------------------------------
export const MultiDiseaseStickerView: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(1)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // The interface renders immediately (no wizard interaction needed).
    // The first preset ("All diseases (stickers)") is active by default —
    // ≥2 diseases → StickerNode → sticker markers present in the DOM.
    //
    // Wait for the pedigree view to mount before querying.
    await screen.findByTestId('next-button');

    // data-sticker-status is the attribute on each StickerMarker <span>.
    const stickers = document.querySelectorAll('[data-sticker-status]');

    // At least some nodes should have stickers rendered.
    expect(stickers.length).toBeGreaterThan(0);
  },
};

// ---------------------------------------------------------------------------
// Story 2: Single-disease CLASSIC view
// Preset 1 shows only Huntington's → ClassicNotationNode rendered.
// Play function clicks the second preset button and asserts notation symbol.
// ---------------------------------------------------------------------------
export const SingleDiseaseClassicView: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(2)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Wait for the interface to mount, then advance to the second preset
    // ("Huntington's only (classic)", index 1) using the PresetSwitcher's
    // "Next preset" button.
    const nextPresetBtn = await screen.findByRole('button', {
      name: 'Next preset',
    });
    await userEvent.click(nextPresetBtn);

    // After switching to single-disease mode, ClassicNotationNode renders
    // with a data-notation-status attribute.
    const notationNodes = document.querySelectorAll('[data-notation-status]');
    expect(notationNodes.length).toBeGreaterThan(0);

    // No sticker markers should be present in classic (single-disease) mode.
    const stickerNodes = document.querySelectorAll('[data-sticker-status]');
    expect(stickerNodes.length).toBe(0);
  },
};

// ---------------------------------------------------------------------------
// Story 3: Focal reselection
// Preset 2 has allowFocalReselection: true — clicking a member changes the
// focal (the clicked node becomes un-dimmed while others dim).
// ---------------------------------------------------------------------------
export const FocalReselection: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(3)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // Advance to the third preset "Explore by member" (index 2) by clicking
    // "Next preset" twice.
    const nextBtn = await screen.findByRole('button', { name: 'Next preset' });
    await userEvent.click(nextBtn);
    await userEvent.click(nextBtn);

    // allowFocalReselection is true on this preset — node members are
    // rendered as clickable buttons.
    const memberButtons = await screen.findAllByRole('button', {
      name: /focus on/i,
    });

    expect(memberButtons.length).toBeGreaterThan(0);

    const firstButton = memberButtons[0];
    if (!firstButton) return;

    await userEvent.click(firstButton);

    // After clicking, the data-dimmed attribute should differ between nodes —
    // the clicked node should be un-dimmed (data-dimmed="false").
    const members = document.querySelectorAll('[data-pedigree-member="true"]');
    const unDimmed = Array.from(members).filter(
      (el) => el.getAttribute('data-dimmed') === 'false',
    );
    expect(unDimmed.length).toBeGreaterThan(0);
  },
};

// ---------------------------------------------------------------------------
// Story 4: PNG export smoke test
// Asserts the "Save snapshot" button is present and wired (clicking it does
// not throw). html-to-image's toPng is not mocked here; the button click is
// exercised to ensure the handler is reachable. The download side-effect is
// browser-only and not asserted.
// ---------------------------------------------------------------------------
export const ExportSnapshotSmoke: Story = {
  render: () => (
    <NarrativePedigreeStoryWrapper
      buildFn={() => buildPedigreeInterview(4)}
      startStep={NP_STEP}
    />
  ),
  play: async () => {
    // The "Save snapshot" button is rendered in the NarrativePedigreeView
    // footer regardless of preset.
    const saveBtn = await screen.findByRole('button', {
      name: /save snapshot/i,
    });
    expect(saveBtn).toBeDefined();

    // Clicking it must not throw synchronously. The async toPng call may
    // fail in the test environment (no DOM-to-image support) but the handler
    // is fire-and-forget (void), so no error propagates to the test.
    await userEvent.click(saveBtn);
  },
};
