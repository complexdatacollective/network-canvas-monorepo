import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type { NcEdge, NcNetwork, NcNode } from '@codaco/shared-consts';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  GAMETE_ROLE_OPTIONS,
  RELATIONSHIP_TYPE_OPTIONS,
} from '@codaco/shared-consts';

import { FamilyPedigreeFixture } from '../fixtures/family-pedigree-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type { ProtocolFixture } from '../fixtures/protocol-fixture.js';
import { DEV_PROTOCOL_ASSETS_DIR } from '../helpers/protocol-paths.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

const ATTR = entityAttributesProperty;
const PK = entityPrimaryKeyProperty;

const FIXED_GAMETE = { mode: 'fixed', value: 'gamete' } as const;
const FIXED_GENDERED = { mode: 'fixed', value: 'gendered' } as const;
const PARTICIPANT_CHOICE = { mode: 'participantChoice' } as const;
const BOUNDARIES_OFF = {
  requireGrandparents: 'off',
  requireChildrenContributors: 'off',
} as const;
const CENSUS_PROMPT = 'Please build your family pedigree.';

type FormFieldEntry = {
  variable: string;
  prompt: string;
  hint?: string;
  showValidationHints?: boolean;
};

/**
 * Create the Person node type and Family edge type with the full variable set a
 * FamilyPedigree stage references, returning every variable ref so a scenario's
 * `run()` can assert against the committed network by real ids. `nodeConfig.form`
 * is left empty here — the wizard's built-in fields (name/is-donor/
 * gestationalCarrier/biologicalSex) are enough to walk it, and biological sex is
 * inferred from gamete role rather than asked, so no gender/attribute form field
 * is needed. The one scenario that exercises form fields adds them itself.
 */
function buildBaseFamilyPedigree(si: SyntheticInterview) {
  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });
  const nameVar = nodeType.addVariable({
    name: 'name',
    type: 'text',
    component: 'Text',
  });
  const isEgoVar = nodeType.addVariable({ name: 'isEgo', type: 'boolean' });
  const relToEgoVar = nodeType.addVariable({
    name: 'relationshipToEgo',
    type: 'text',
  });
  const bioSexVar = nodeType.addVariable({
    name: 'biologicalSex',
    type: 'text',
  });

  const edgeType = si.addEdgeType({ name: 'Family' });
  // relationshipType and gameteRole are locked to canonical option sets by the
  // FamilyPedigree superRefine (schema.ts:625-645) — use them verbatim.
  const relTypeVar = edgeType.addVariable({
    name: 'relationship',
    type: 'categorical',
    options: RELATIONSHIP_TYPE_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    })),
  });
  const isActiveVar = edgeType.addVariable({
    name: 'isActive',
    type: 'boolean',
  });
  const isGestCarrierVar = edgeType.addVariable({
    name: 'isGestationalCarrier',
    type: 'boolean',
  });
  const gameteRoleVar = edgeType.addVariable({
    name: 'gameteRole',
    type: 'categorical',
    options: GAMETE_ROLE_OPTIONS.map((o) => ({
      label: o.label,
      value: o.value,
    })),
  });

  return {
    nodeType,
    nameVar,
    isEgoVar,
    relToEgoVar,
    bioSexVar,
    edgeType,
    relTypeVar,
    isActiveVar,
    isGestCarrierVar,
    gameteRoleVar,
  };
}

type Base = ReturnType<typeof buildBaseFamilyPedigree>;

function nodeConfigOf(base: Base, form: FormFieldEntry[] = []) {
  return {
    type: base.nodeType.id,
    nodeLabelVariable: base.nameVar.id,
    egoVariable: base.isEgoVar.id,
    relationshipVariable: base.relToEgoVar.id,
    biologicalSexVariable: base.bioSexVar.id,
    form,
  };
}

function edgeConfigOf(base: Base) {
  return {
    type: base.edgeType.id,
    relationshipTypeVariable: base.relTypeVar.id,
    isActiveVariable: base.isActiveVar.id,
    isGestationalCarrierVariable: base.isGestCarrierVar.id,
    gameteRoleVariable: base.gameteRoleVar.id,
  };
}

function commonConfig(base: Base) {
  return {
    subject: { entity: 'node' as const, type: base.nodeType.id },
    edgeConfig: edgeConfigOf(base),
    censusPrompt: CENSUS_PROMPT,
  };
}

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function nodeByName(
  net: NcNetwork,
  nameVarId: string,
  name: string,
): NcNode | undefined {
  return net.nodes.find((n) => n[ATTR][nameVarId] === name);
}

function egoNode(net: NcNetwork, egoVarId: string): NcNode | undefined {
  return net.nodes.find((n) => n[ATTR][egoVarId] === true);
}

function edgeBetween(
  net: NcNetwork,
  from: string | undefined,
  to: string | undefined,
): NcEdge | undefined {
  return net.edges.find((e) => e.from === from && e.to === to);
}

/**
 * Poll the interview network until the pedigree finalize has written its nodes,
 * then return the committed network. The pedigree lives in a private Zustand
 * store until finalize commits it to the shared interview graph, so the write is
 * asynchronous relative to the confirm click.
 */
async function pollCommittedNetwork(
  protocol: ProtocolFixture,
  interviewId: string,
  expectedNodeCount: number,
): Promise<NcNetwork> {
  await expect
    .poll(
      async () =>
        (await protocol.getNetworkState(interviewId))?.nodes.length ?? 0,
    )
    .toBe(expectedNodeCount);
  const network = await protocol.getNetworkState(interviewId);
  if (!network)
    throw new Error('Committed network was undefined after finalize');
  return network;
}

// --- Scenario builders -----------------------------------------------------
// Each factory builds its SyntheticInterview once so `build()` and `run()` share
// the generated variable ids through the closure (the ids are assigned at
// addNodeType/addVariable time and are stable across the non-mutating
// getInterviewPayload reads the payload adapter performs).

function smokeNuclearFamily(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const {
    nodeType,
    nameVar,
    isEgoVar,
    bioSexVar,
    edgeType,
    isGestCarrierVar,
    gameteRoleVar,
  } = base;

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    label: 'INTERNAL: Do Not Show This',
    interviewScript:
      'Author-only note: walk the participant through the quick-start wizard.',
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'smoke-nuclear-family',
    covers: [
      'label',
      'interviewScript',
      'nodeConfig.type',
      'nodeConfig.nodeLabelVariable',
      'nodeConfig.egoVariable',
      'nodeConfig.biologicalSexVariable',
      'edgeConfig.type',
      'edgeConfig.relationshipTypeVariable',
      'edgeConfig.gameteRoleVariable',
      'edgeConfig.isGestationalCarrierVariable',
      'framing=fixed(gamete)',
      'censusPrompt',
      'nominationPrompts=absent',
      'boundaries.requireGrandparents=off',
    ],
    smoke: true,
    visual: true,
    build: () => si,
    run: async ({ page, interview, stage, protocol }) => {
      await expect(stage.getPrompt(CENSUS_PROMPT)).toBeVisible();

      // Dead config: label/interviewScript never reach the DOM.
      await expect(page.getByText('INTERNAL: Do Not Show This')).toHaveCount(0);
      await expect(
        page.getByText('Author-only note: walk the participant through'),
      ).toHaveCount(0);

      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.name', 'Linda');
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.setField('sperm-parent.name', 'Robert');
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      await fp.setPartnership('egg-parent', 'Robert', 'current');
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      // requireGrandparents:'off' — the boundary item never renders.
      await expect(fp.checklistItem('boundary-grandparents')).toHaveCount(0);

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        3,
      );
      expect(network.nodes.every((n) => n.type === nodeType.id)).toBe(true);
      expect(network.edges.every((e) => e.type === edgeType.id)).toBe(true);

      const linda = nodeByName(network, nameVar.id, 'Linda');
      const robert = nodeByName(network, nameVar.id, 'Robert');
      const ego = egoNode(network, isEgoVar.id);
      expect(
        network.nodes.filter((n) => n[ATTR][isEgoVar.id] === true),
      ).toHaveLength(1);
      expect(linda?.[ATTR][isEgoVar.id]).not.toBe(true);

      expect(linda?.[ATTR][bioSexVar.id]).toEqual(['female']);
      expect(robert?.[ATTR][bioSexVar.id]).toEqual(['male']);

      const eggEdge = edgeBetween(network, linda?.[PK], ego?.[PK]);
      expect(eggEdge?.[ATTR][gameteRoleVar.id]).toEqual(['egg']);
      expect(eggEdge?.[ATTR][isGestCarrierVar.id]).toBe(true);

      const spermEdge = edgeBetween(network, robert?.[PK], ego?.[PK]);
      expect(spermEdge?.[ATTR][gameteRoleVar.id]).toEqual(['sperm']);
    },
  };
}

function relationshipFormFieldsAndActivePartnerEdge(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const { nameVar, isEgoVar, relToEgoVar, relTypeVar, isActiveVar } = base;

  const diseaseVar = base.nodeType.addVariable({
    name: 'diagnosedConditionX',
    type: 'boolean',
    component: 'Boolean',
  });
  const notesVar = base.nodeType.addVariable({
    name: 'healthNotes',
    type: 'text',
    component: 'Text',
    validation: { minLength: 2 },
  });

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base, [
      {
        variable: diseaseVar.id,
        prompt: 'Has this person been diagnosed with condition X?',
        hint: 'Leave blank if unsure',
      },
      {
        variable: notesVar.id,
        prompt: 'Any additional health notes about this person?',
        showValidationHints: true,
      },
    ]),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'relationship-form-fields-and-active-partner-edge',
    covers: [
      'nodeConfig.relationshipVariable',
      'nodeConfig.form',
      'nodeConfig.form[].hint',
      'nodeConfig.form[].showValidationHints',
      'edgeConfig.isActiveVariable',
    ],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      // Egg-parent step: the disease field shows only its authored hint; the
      // notes field additionally surfaces its validation-requirement summary
      // (showValidationHints), which the disease field must NOT.
      const diseaseField = fp.dialog.locator(
        `[data-field-name="egg-parent.${diseaseVar.id}"]`,
      );
      const notesField = fp.dialog.locator(
        `[data-field-name="egg-parent.${notesVar.id}"]`,
      );
      await expect(
        diseaseField.getByText('Leave blank if unsure'),
      ).toBeVisible();
      await expect(
        notesField.getByText(/Enter at least 2 characters/i),
      ).toBeVisible();
      await expect(
        diseaseField.getByText(/Enter at least 2 characters/i),
      ).toHaveCount(0);

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.name', 'Linda');
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.setField(`egg-parent.${diseaseVar.id}`, true);
      // notes is left blank (minLength tolerates empty), proving the field
      // renders and validates without blocking the wizard.
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.setField('sperm-parent.name', 'Robert');
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      await fp.setPartnership('egg-parent', 'Robert', 'ex');
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        3,
      );
      const linda = nodeByName(network, nameVar.id, 'Linda');
      const robert = nodeByName(network, nameVar.id, 'Robert');
      const ego = egoNode(network, isEgoVar.id);

      expect(linda?.[ATTR][relToEgoVar.id]).toBe('Parent');
      expect(linda?.[ATTR][diseaseVar.id]).toBe(true);

      const partnerEdge = network.edges.find(
        (e) => firstValue(e[ATTR][relTypeVar.id]) === 'partner',
      );
      expect(partnerEdge?.[ATTR][isActiveVar.id]).toBe(false);

      const lindaToEgo = edgeBetween(network, linda?.[PK], ego?.[PK]);
      expect(lindaToEgo?.[ATTR][isActiveVar.id]).toBe(true);
      expect(robert?.[ATTR][relToEgoVar.id]).toBe('Parent');
    },
  };
}

function framingParticipantChoiceWithIntro(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: PARTICIPANT_CHOICE,
    boundaries: BOUNDARIES_OFF,
    introScreen: {
      items: [
        {
          id: 'intro-text',
          type: 'text',
          content:
            'This pedigree helps us understand your family health history.',
        },
      ],
    },
  });

  return {
    id: 'framing-participant-choice-with-intro',
    covers: [
      'framing=participantChoice',
      'introScreen',
      'introScreen.items[].type=text',
    ],
    build: () => si,
    run: async ({ page }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();

      // Intro screen precedes the framing-selection step (order assertion).
      await expect(fp.dialog.getByText(/family health history/i)).toBeVisible();
      await expect(fp.dialog.getByRole('option')).toHaveCount(0);

      await fp.clickWizardNext();
      // Framing-selection step now offers the framing options.
      await expect(fp.dialog.getByRole('option').first()).toBeVisible();
      await fp.selectFraming('gamete');
      await fp.clickWizardNext();

      await fp.selectEgoSex();
      // gamete framing → the egg-parent step speaks of an "egg parent".
      await expect(fp.dialog.getByText(/egg parent/i).first()).toBeVisible();
    },
  };
}

function framingFixedGendered(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GENDERED,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'framing-fixed-gendered',
    covers: ['framing=fixed(gendered)'],
    build: () => si,
    run: async ({ page }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();

      // Fixed framing skips the framing-selection step (no rich-select options).
      await expect(fp.dialog.getByRole('option')).toHaveCount(0);

      await fp.selectEgoSex();
      // gendered framing → the first parent step speaks of a "mother".
      await expect(fp.dialog.getByText(/mother/i).first()).toBeVisible();
    },
  };
}

function introScreenAssetImage(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addAsset({
    id: 'img-1',
    name: 'quadrant',
    type: 'image',
    source: 'quadrant.png',
  });

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
    introScreen: {
      items: [
        { id: 'intro-image', type: 'asset', content: 'img-1' },
        {
          id: 'intro-heading',
          type: 'text',
          content: '# Disallowed heading\n\nAn allowed paragraph.',
        },
      ],
    },
  });

  return {
    id: 'intro-screen-asset-image',
    covers: ['introScreen', 'introScreen.items[].type=asset'],
    visual: true,
    assets: [
      {
        assetId: 'img-1',
        name: 'quadrant',
        type: 'image',
        source: 'quadrant.png',
        localPath: path.join(DEV_PROTOCOL_ASSETS_DIR, 'quadrant.png'),
      },
    ],
    build: () => si,
    run: async ({ page }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();

      const img = fp.dialog.locator('img[src*="quadrant.png"]');
      await expect(img).toBeVisible();
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);

      // h1 is not in IntroStep's INTRO_ALLOWED_TAGS — the markdown heading must
      // not render as an <h1>, but the following paragraph must render.
      await expect(fp.dialog.locator('h1')).toHaveCount(0);
      await expect(fp.dialog.getByText('An allowed paragraph.')).toBeVisible();
    },
  };
}

function boundariesGrandparentsRequiredBlocked(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: {
      requireGrandparents: 'required',
      requireChildrenContributors: 'off',
    },
  });

  return {
    id: 'boundaries-grandparents-required-blocked',
    covers: ['boundaries.requireGrandparents=required'],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await walkMinimalTwoParents(fp);

      await expect(fp.checklist).toBeVisible();
      await expect(fp.checklistItem('boundary-grandparents')).toHaveAttribute(
        'data-required',
        'true',
      );
      // Required + unmet boundary means no finalize affordance.
      await expect(fp.finalizeChecklistButton).toHaveCount(0);

      await interview.nextButton.click();
      await expect(
        fp.dialog.getByText(/pedigree is incomplete/i),
      ).toBeVisible();
      await fp.clickDialogPrimary();

      // Nothing was committed to the interview network pre-finalize.
      const network = await protocol.getNetworkState(interview.interviewId);
      expect(network?.nodes ?? []).toHaveLength(0);
    },
  };
}

function boundariesGrandparentsRecommendedNudge(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: {
      requireGrandparents: 'recommended',
      requireChildrenContributors: 'off',
    },
  });

  return {
    id: 'boundaries-grandparents-recommended-nudge',
    covers: ['boundaries.requireGrandparents=recommended'],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await walkMinimalTwoParents(fp);

      // The grandparents boundary surfaces as a recommended (non-required)
      // checklist nudge.
      await expect(fp.checklistItem('boundary-grandparents')).toHaveAttribute(
        'data-required',
        'false',
      );

      // A recommended boundary never blocks finalize: advancing goes straight to
      // the finalize confirm, not the "pedigree is incomplete" acknowledge.
      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        3,
      );
      expect(network.nodes).toHaveLength(3);
    },
  };
}

function boundariesChildrenContributorsRequired(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'required',
    },
  });

  return {
    id: 'boundaries-children-contributors-required',
    covers: ['boundaries.requireChildrenContributors=required'],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      // Accept the partnership-matrix defaults.
      await fp.clickWizardNext();

      await fp.setField('hasPartner', true);
      await fp.setField('partner.name', 'Jennifer');
      await fp.setField('partner.biologicalSex', 'female');
      await fp.setField('childrenWithPartnerCount', 1);
      await fp.clickWizardNext();

      await fp.setField('childWithPartner[0].name', 'Daniel');
      await fp.setField('childWithPartner[0].biologicalSex', 'male');
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      // Jennifer's own parents are unrecorded, so the co-parent boundary is
      // required and unmet — and, unlike the recommended nudge, it genuinely
      // gates finalizing (validatePedigreeCompleteness ignores manual checklist
      // overrides for required boundaries).
      await expect(
        fp.checklistItem('boundary-children-contributors'),
      ).toHaveAttribute('data-required', 'true');

      await interview.nextButton.click();
      await expect(
        fp.dialog.getByText(/pedigree is incomplete/i),
      ).toBeVisible();
      await expect(
        fp.dialog.getByText(/other parents needs their own parents/i),
      ).toBeVisible();
      await fp.clickDialogPrimary();

      // The required boundary blocked finalize, so nothing reached the network.
      const network = await protocol.getNetworkState(interview.interviewId);
      expect(network?.nodes ?? []).toHaveLength(0);
    },
  };
}

function adoptiveRelationshipEdgeStyling(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const { nameVar, isEgoVar, relTypeVar } = base;

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'adoptive-relationship-edge-styling',
    covers: ['edgeConfig.relationshipTypeVariable=adoptive'],
    visual: true,
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      // Unnamed, absent biological parents.
      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', true);
      await fp.setField('otherParentCount', 2);
      await fp.clickWizardNext();

      await fp.setField('additional-parent[0].role', 'adoptive-parent');
      await fp.setField('additional-parent[0].name', 'James');
      await fp.setField('additional-parent[1].role', 'adoptive-parent');
      await fp.setField('additional-parent[1].name', 'Barbara');
      await fp.clickWizardNext();

      await fp.setPartnership('additional-parent-0', 'Barbara', 'current');
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        5,
      );
      const ego = egoNode(network, isEgoVar.id);
      const james = nodeByName(network, nameVar.id, 'James');
      const barbara = nodeByName(network, nameVar.id, 'Barbara');

      const jamesEdge = edgeBetween(network, james?.[PK], ego?.[PK]);
      const barbaraEdge = edgeBetween(network, barbara?.[PK], ego?.[PK]);
      expect(jamesEdge?.[ATTR][relTypeVar.id]).toEqual(['adoptive']);
      expect(barbaraEdge?.[ATTR][relTypeVar.id]).toEqual(['adoptive']);
    },
  };
}

function nominationPromptsSequentialToggle(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const diseaseVar = base.nodeType.addVariable({
    name: 'hasBreastCancer',
    type: 'boolean',
  });
  const diabetesVar = base.nodeType.addVariable({
    name: 'hasType2Diabetes',
    type: 'boolean',
  });

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
    nominationPrompts: [
      {
        id: '1',
        text: 'Please nominate any family members who have been diagnosed with breast cancer.',
        variable: diseaseVar.id,
      },
      {
        id: '2',
        text: 'Please nominate any family members who have been diagnosed with type 2 diabetes.',
        variable: diabetesVar.id,
      },
    ],
  });

  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });

  return {
    id: 'nomination-prompts-sequential-toggle',
    covers: [
      'nominationPrompts[].text',
      'nominationPrompts[].variable',
      'nominationPrompts[].id',
    ],
    build: () => si,
    run: async ({ page, interview, stage }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.name', 'Linda');
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.setField('sperm-parent.name', 'Robert');
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      await fp.setPartnership('egg-parent', 'Robert', 'current');
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      // First nomination prompt (breast cancer): nominate, un-nominate, then
      // re-nominate Linda — a round-trip toggle of the active attribute.
      await expect(
        stage.getPrompt(/diagnosed with breast cancer/i),
      ).toBeVisible();
      await fp.node('Linda').click();
      await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'true');
      await fp.node('Linda').click();
      await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'false');
      await fp.node('Linda').click();
      await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'true');

      // Advance to the second nomination prompt (diabetes): nominate Robert.
      await interview.nextButton.click();
      await expect(
        stage.getPrompt(/diagnosed with type 2 diabetes/i),
      ).toBeVisible();
      await fp.node('Robert').click();
      await expect(fp.node('Robert')).toHaveAttribute('aria-pressed', 'true');

      // The last prompt advances out of the stage entirely.
      await interview.nextButton.click();
      await expect(page.getByText('After the main stage.')).toBeVisible();
    },
  };
}

function surrogateTwoDonorsGestationalCarrier(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const { isEgoVar, bioSexVar, isGestCarrierVar, gameteRoleVar } = base;

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'surrogate-two-donors-gestational-carrier',
    covers: [
      'edgeConfig.isGestationalCarrierVariable=true-surrogate',
      'edgeConfig.gameteRoleVariable=donor-both',
    ],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      // Egg donor who did not carry — a separate carrier ("Mum") carried.
      await fp.setField('egg-parent.is-donor', true);
      await fp.setField('egg-parent.gestationalCarrier', false);
      await fp.clickWizardNext();

      // GestationalCarrierStep only renders when the egg parent did not carry.
      await fp.setField('gestational-carrier.name', 'Mum');
      await fp.clickWizardNext();

      // Sperm donor.
      await fp.setField('sperm-parent.is-donor', true);
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      // Accept the partnership-matrix defaults.
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        4,
      );
      const ego = egoNode(network, isEgoVar.id);

      const eggEdge = network.edges.find(
        (e) =>
          e.to === ego?.[PK] && firstValue(e[ATTR][gameteRoleVar.id]) === 'egg',
      );
      expect(eggEdge?.[ATTR][gameteRoleVar.id]).toEqual(['egg']);
      // A non-carrier donor edge carries no gestational-carrier flag at all.
      expect(eggEdge?.[ATTR][isGestCarrierVar.id]).toBeFalsy();

      const carrierEdge = network.edges.find(
        (e) => e.to === ego?.[PK] && e[ATTR][isGestCarrierVar.id] === true,
      );
      // The carrier is not a genetic parent, so it has no gamete role (the
      // committed session network stores the absent attribute as null).
      expect(carrierEdge).toBeDefined();
      expect(carrierEdge?.[ATTR][gameteRoleVar.id] ?? null).toBeNull();

      const spermEdge = network.edges.find(
        (e) =>
          e.to === ego?.[PK] &&
          firstValue(e[ATTR][gameteRoleVar.id]) === 'sperm',
      );
      expect(spermEdge?.[ATTR][gameteRoleVar.id]).toEqual(['sperm']);

      const eggParentNode = network.nodes.find((n) => n[PK] === eggEdge?.from);
      const carrierNode = network.nodes.find(
        (n) => n[PK] === carrierEdge?.from,
      );
      expect(eggParentNode?.[ATTR][bioSexVar.id]).toEqual(['female']);
      expect(carrierNode?.[ATTR][bioSexVar.id]).toEqual(['female']);
    },
  };
}

function blendedFamilyStepParentRelationshipType(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const { nameVar, isEgoVar, relTypeVar, isActiveVar } = base;

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'blended-family-step-parent-relationship-type',
    covers: ['edgeConfig.relationshipTypeVariable=social'],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.name', 'Susan');
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      await fp.setField('sperm-parent.is-donor', false);
      await fp.setField('sperm-parent.name', 'Robert');
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', true);
      await fp.setField('otherParentCount', 1);
      await fp.clickWizardNext();

      await fp.setField('additional-parent[0].role', 'step-parent');
      await fp.setField('additional-parent[0].name', 'Karen');
      await fp.clickWizardNext();

      await fp.setPartnership('egg-parent', 'Robert', 'ex');
      await fp.setPartnership('sperm-parent', 'Karen', 'current');
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        4,
      );
      const ego = egoNode(network, isEgoVar.id);
      const susan = nodeByName(network, nameVar.id, 'Susan');
      const robert = nodeByName(network, nameVar.id, 'Robert');
      const karen = nodeByName(network, nameVar.id, 'Karen');

      const karenEdge = edgeBetween(network, karen?.[PK], ego?.[PK]);
      expect(karenEdge?.[ATTR][relTypeVar.id]).toEqual(['social']);

      const susanRobert = network.edges.find(
        (e) =>
          e.from === susan?.[PK] &&
          e.to === robert?.[PK] &&
          firstValue(e[ATTR][relTypeVar.id]) === 'partner',
      );
      expect(susanRobert?.[ATTR][isActiveVar.id]).toBe(false);

      const robertKaren = network.edges.find(
        (e) =>
          e.from === robert?.[PK] &&
          e.to === karen?.[PK] &&
          firstValue(e[ATTR][relTypeVar.id]) === 'partner',
      );
      expect(robertKaren?.[ATTR][relTypeVar.id]).toEqual(['partner']);
      expect(robertKaren?.[ATTR][isActiveVar.id]).toBe(true);
    },
  };
}

function singleParentAbsentSecondParent(): ScenarioDefinition {
  const si = new SyntheticInterview();
  const base = buildBaseFamilyPedigree(si);
  const { nodeType, nameVar, isEgoVar, relToEgoVar } = base;

  si.addStage('FamilyPedigree', {
    ...commonConfig(base),
    nodeConfig: nodeConfigOf(base),
    framing: FIXED_GAMETE,
    boundaries: BOUNDARIES_OFF,
  });

  return {
    id: 'single-parent-absent-second-parent',
    covers: ['nodeConfig.nodeLabelVariable=unset-name-fallback'],
    build: () => si,
    run: async ({ page, interview, protocol }) => {
      const fp = new FamilyPedigreeFixture(page);
      await fp.clickGetStarted();
      await fp.selectEgoSex();

      await fp.setField('egg-parent.is-donor', false);
      await fp.setField('egg-parent.name', 'Linda');
      await fp.setField('egg-parent.gestationalCarrier', true);
      await fp.clickWizardNext();

      // Absent second parent: not a donor, no name.
      await fp.setField('sperm-parent.is-donor', false);
      await fp.clickWizardNext();

      await fp.setField('hasOtherParents', false);
      await fp.clickWizardNext();

      // Accept the partnership-matrix defaults.
      await fp.clickWizardNext();

      await fp.setField('hasPartner', false);
      await fp.clickWizardNext();
      await fp.dismissBuildHint();

      await interview.nextButton.click();
      await fp.confirmFinalize();

      const network = await pollCommittedNetwork(
        protocol,
        interview.interviewId,
        3,
      );
      const linda = nodeByName(network, nameVar.id, 'Linda');
      expect(linda?.[ATTR][nameVar.id]).toBe('Linda');

      // The absent parent is the non-ego node without Linda's name.
      const unnamedParent = network.nodes.find(
        (n) => n[ATTR][isEgoVar.id] !== true && n[ATTR][nameVar.id] !== 'Linda',
      );
      const unnamedLabel = unnamedParent?.[ATTR][nameVar.id];
      expect(unnamedLabel === undefined || unnamedLabel === '').toBe(true);

      // Both parents are still typed nodes with a computed relationship, named
      // or not.
      expect(unnamedParent?.type).toBe(nodeType.id);
      expect(linda?.type).toBe(nodeType.id);
      expect(unnamedParent?.[ATTR][relToEgoVar.id]).toBe('Parent');
      expect(linda?.[ATTR][relToEgoVar.id]).toBe('Parent');
    },
  };
}

/** Minimal quick-start walk producing ego plus two unnamed biological parents. */
async function walkMinimalTwoParents(fp: FamilyPedigreeFixture): Promise<void> {
  await fp.clickGetStarted();
  await fp.selectEgoSex();

  await fp.setField('egg-parent.is-donor', false);
  await fp.setField('egg-parent.gestationalCarrier', true);
  await fp.clickWizardNext();

  await fp.setField('sperm-parent.is-donor', false);
  await fp.clickWizardNext();

  await fp.setField('hasOtherParents', false);
  await fp.clickWizardNext();

  // Accept the partnership-matrix defaults.
  await fp.clickWizardNext();

  await fp.setField('hasPartner', false);
  await fp.clickWizardNext();
  await fp.dismissBuildHint();
}

export const familyPedigreeScenarios: InterfaceScenarios = {
  interfaceType: 'FamilyPedigree',
  scenarios: [
    smokeNuclearFamily(),
    relationshipFormFieldsAndActivePartnerEdge(),
    framingParticipantChoiceWithIntro(),
    framingFixedGendered(),
    introScreenAssetImage(),
    boundariesGrandparentsRequiredBlocked(),
    boundariesGrandparentsRecommendedNudge(),
    boundariesChildrenContributorsRequired(),
    adoptiveRelationshipEdgeStyling(),
    nominationPromptsSequentialToggle(),
    surrogateTwoDonorsGestationalCarrier(),
    blendedFamilyStepParentRelationshipType(),
    singleParentAbsentSecondParent(),
  ],
};
