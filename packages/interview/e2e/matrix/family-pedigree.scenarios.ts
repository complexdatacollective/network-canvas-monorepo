import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type {
  FramingSetting,
  PedigreeCompletenessScope,
  PedigreeGenderWords,
  PedigreeRelationshipKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEdge,
  type NcNetwork,
  type NcNode,
} from '@codaco/shared-consts';

import { AnonymisationFixture } from '../fixtures/anonymisation-fixture.js';
import { expect } from '../fixtures/matrix-test.js';
import type {
  InterfaceScenarios,
  ScenarioContext,
  ScenarioDefinition,
} from './types.js';

const ATTR = entityAttributesProperty;
const PK = entityPrimaryKeyProperty;

const PROMPT = 'Add the members of your family.';
/** The researcher's own question, encrypted, when a scaffold adds it. */
const NICKNAME = 'Nickname';
const BEFORE_TITLE = 'Before your family';
const AFTER_TITLE = 'After your family';

type PedigreeOptions = {
  label?: string;
  interviewScript?: string;
  framing?: FramingSetting;
  askGenderIdentity?: boolean;
  genderIdentities?: {
    value: string;
    label: string;
    words?: PedigreeGenderWords;
  }[];
  completeness?: {
    scope: PedigreeCompletenessScope;
    enforcement: 'required' | 'recommended';
  };
  nominationPrompts?: {
    text: string;
    variableName?: string;
    onlyForSexAssignedAtBirth?: 'female' | 'male';
  }[];
  /** Encrypts the name attribute with the participant's passphrase. */
  encryptedNames?: boolean;
  /** Adds a text field, Nickname, encrypted with the participant's
   * passphrase (the name is encrypted only with `encryptedNames`). */
  encryptedFormField?: boolean;
  /** What comes before the pedigree. The pedigree is the first stage without
   * one; an Information stage, or an Information stage and then an
   * Anonymisation stage, otherwise. An Information stage always follows it. */
  before?: 'information' | 'anonymisation';
  /** Records each person's relationship to the participant. */
  recordRelationshipToParticipant?: boolean;
};

type Seed = {
  name?: string;
  sex?: PedigreeSexAssignedAtBirth;
  /** The value of one of the gender identity attribute's options. */
  gender?: string;
  isEgo?: boolean;
  relativesNotRecorded?: string[];
  /** A relationship to the participant already recorded (needs
   * `recordRelationshipToParticipant`). */
  relationship?: string;
};

/**
 * A Family Pedigree stage on a fresh SyntheticInterview, followed by an
 * Information stage so leaving it can be observed. The person type's symbol
 * follows sex assigned at birth (female circle, male square, anyone else a
 * diamond). `person` and `relate` seed a family the stage opens on, through
 * the stage's own attributes; a scenario seeding one sets `seedNetwork`.
 */
function scaffold(options: PedigreeOptions = {}) {
  const synth = new SyntheticInterview();
  if (options.before) {
    synth.addInformationStage({
      title: BEFORE_TITLE,
      text: 'Your family tree is next.',
    });
  }
  if (options.before === 'anonymisation') {
    synth.addStage('Anonymisation', {
      explanationText: {
        title: 'Protect your data',
        body: 'This study encrypts the names of your family.',
      },
    });
  }
  const people = synth.addNodeType({ name: 'Person' });
  if (options.encryptedNames) {
    people.addVariable({ name: 'name', type: 'text', encrypted: true });
  }
  const fp = synth.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: PROMPT,
    ...(options.label ? { label: options.label } : {}),
    ...(options.interviewScript
      ? { interviewScript: options.interviewScript }
      : {}),
    framing: options.framing,
    askGenderIdentity: options.askGenderIdentity,
    genderIdentities: options.genderIdentities,
    completeness: options.completeness,
    nominationPrompts: options.nominationPrompts,
    recordRelationshipToParticipant: options.recordRelationshipToParticipant,
  });
  const nickname = options.encryptedFormField
    ? people.addVariable({
        name: 'nickname',
        type: 'text',
        component: 'Text',
        encrypted: true,
      }).id
    : undefined;
  if (nickname) {
    fp.addFormField({
      component: 'Text',
      variable: nickname,
      prompt: NICKNAME,
    });
  }
  people.setShape({
    default: 'diamond',
    dynamic: {
      variable: fp.sexAssignedAtBirth,
      type: 'discrete',
      map: [
        { value: 'female', shape: 'circle' },
        { value: 'male', shape: 'square' },
      ],
    },
  });
  synth.addInformationStage({
    title: AFTER_TITLE,
    text: 'Your family tree is saved.',
  });

  const flags = [fp.ego, ...fp.nominations];
  const person = (uid: string, seed: Seed) =>
    synth.addManualNode(fp.id, people.id, uid, {
      ...Object.fromEntries(flags.map((id) => [id, false])),
      ...(seed.isEgo ? { [fp.ego]: true } : {}),
      ...(seed.name === undefined ? {} : { [fp.name]: seed.name }),
      ...(seed.sex === undefined
        ? {}
        : { [fp.sexAssignedAtBirth]: [seed.sex] }),
      ...(seed.gender === undefined || fp.genderIdentity === undefined
        ? {}
        : { [fp.genderIdentity]: [seed.gender] }),
      ...(seed.relativesNotRecorded === undefined ||
      fp.relativesNotRecorded === undefined
        ? {}
        : { [fp.relativesNotRecorded]: seed.relativesNotRecorded }),
      ...(seed.relationship === undefined ||
      fp.relationshipToParticipant === undefined
        ? {}
        : { [fp.relationshipToParticipant]: [seed.relationship] }),
    });
  const relate = (
    from: string,
    to: string,
    kind: PedigreeRelationshipKind,
    link?: { current?: boolean; carrier?: boolean },
  ) =>
    synth.addManualEdge(fp.edgeType, `${from}-${to}-${kind}`, from, to, {
      [fp.kind]: [kind],
      ...(kind === 'partner'
        ? { [fp.currentPartner]: link?.current ?? true }
        : { [fp.gestationalCarrier]: link?.carrier ?? false }),
    });
  /** Two partnered biological parents of `child`, the first carrying. */
  const parents = (first: string, second: string, child: string) => {
    relate(first, child, 'biological', { carrier: true });
    relate(second, child, 'biological');
  };

  /** The pedigree's step: its index among the stages. */
  const step = options.before === 'anonymisation' ? 2 : options.before ? 1 : 0;

  return { synth, fp, step, person, relate, parents, nickname };
}

/** A person on the canvas, by their accessible name. */
const member = (page: Page, name: string | RegExp): Locator =>
  page.getByTestId('pedigree-person').getByLabel(name, { exact: true });

const panel = (page: Page): Locator =>
  page.getByTestId('pedigree-person-panel');

/** Opens the add menu around a person with the mouse and picks a relation. */
async function addRelativeOf(
  page: Page,
  name: string,
  relation: 'parent' | 'sibling' | 'partner' | 'child',
) {
  await member(page, name).hover();
  await page.getByTestId(`pedigree-menu-${relation}`).click();
  await expect(panel(page)).toBeVisible();
}

/** Answers the panel's own questions about a person. */
async function describe(
  page: Page,
  details: { name?: string; gender?: string; sex: string },
) {
  const form = panel(page);
  if (details.name !== undefined) {
    await form.getByRole('textbox', { name: /^Name/ }).fill(details.name);
  }
  if (details.gender !== undefined) {
    await form
      .getByRole('radiogroup', { name: /^Gender identity/ })
      .getByRole('radio', { name: details.gender, exact: true })
      .click();
  }
  await form
    .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
    .getByRole('radio', { name: details.sex, exact: true })
    .click();
}

/** Submits the panel with the named button and waits for it to close. */
async function submitPanel(page: Page, button: 'Add to family' | 'Save') {
  await panel(page).getByRole('button', { name: button, exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
}

async function networkOf({
  protocol,
  interview,
}: ScenarioContext): Promise<NcNetwork> {
  const network = await protocol.getNetworkState(interview.interviewId);
  if (!network) throw new Error('No network in the interview session');
  return network;
}

const nodeNamed = (
  network: NcNetwork,
  nameAttribute: string,
  name: string,
): NcNode | undefined =>
  network.nodes.find((node) => node[ATTR][nameAttribute] === name);

/** The links between two people, in either direction. */
const linksBetween = (
  network: NcNetwork,
  a: string | undefined,
  b: string | undefined,
): NcEdge[] =>
  network.edges.filter(
    (edge) =>
      (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a),
  );

const StageMetadataSchema = z.record(z.string(), z.unknown());
const PedigreeMetadataSchema = z.looseObject({
  framing: z.enum(['gendered', 'gamete']).optional(),
  generatedLabels: z.record(z.string(), z.string()).optional(),
});

/** The pedigree's own stage metadata, which the session keys by step. */
async function pedigreeMetadata(page: Page, step: number) {
  const raw: unknown = await page.evaluate(
    'window.__interviewStore.getState().session.stageMetadata ?? {}',
  );
  const entry = StageMetadataSchema.parse(raw)[String(step)];
  return entry === undefined ? undefined : PedigreeMetadataSchema.parse(entry);
}

/** Leaves the pedigree with Next for the Information stage after it. */
async function leaveForward({ page, interview }: ScenarioContext) {
  await interview.next();
  await expect(
    page.getByRole('heading', { name: AFTER_TITLE, exact: true }),
  ).toBeVisible();
}

const trackerRing = (page: Page): Locator =>
  page.getByTestId('pedigree-completeness');

/** The list of what is still needed, open in the toolbar's popover. */
const trackerList = (page: Page): Locator =>
  page.getByRole('region', {
    name: 'Before you continue, please complete the following:',
  });

// --- Scenarios ---------------------------------------------------------------

/**
 * The participant, alone on the canvas, adds both parents with the mouse.
 * Every attribute the stage binds is written: names, gender identity, sex
 * assigned at birth, the participant marker, and on the family edges the
 * kind, the gestational carrier and whether the partnership is current.
 */
function smokeAddBothParents(): ScenarioDefinition {
  const { synth, fp, person } = scaffold({
    label: 'INTERNAL: Do Not Show This',
    interviewScript: 'Author-only note: start with the participant.',
  });
  person('ego', { isEgo: true, gender: 'nonBinary', sex: 'intersex' });

  return {
    id: 'smoke-add-both-parents',
    covers: [
      'label',
      'interviewScript',
      'subject',
      'prompt',
      'completeness=absent',
      'form=absent',
      'nominationPrompts=absent',
      'participantShownAsYou',
      'addRelative.parent',
      'nodeConfiguration.nameAttribute',
      'nodeConfiguration.genderIdentity.attribute',
      'nodeConfiguration.sexAssignedAtBirthAttribute',
      'nodeConfiguration.egoAttribute',
      'edgeConfiguration.type',
      'edgeConfiguration.kindAttribute=partner',
      'edgeConfiguration.kindAttribute=biological',
      'edgeConfiguration.gestationalCarrierAttribute',
      'edgeConfiguration.currentPartnerAttribute',
    ],
    smoke: true,
    visual: true,
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      await expect(page.getByText(PROMPT)).toBeVisible();
      // Dead config: neither the label nor the interview script is shown.
      await expect(page.getByText('INTERNAL: Do Not Show This')).toHaveCount(0);
      await expect(page.getByText('Author-only note')).toHaveCount(0);

      // The participant is "You", alone, with the add menu showing.
      await expect(page.getByTestId('pedigree-person')).toHaveCount(1);
      await expect(member(page, 'You')).toBeVisible();
      await expect(page.getByTestId('pedigree-menu-parent')).toBeVisible();

      await addRelativeOf(page, 'You', 'parent');
      await expect(
        panel(page).getByRole('heading', { name: 'Add your parent' }),
      ).toBeVisible();
      await describe(page, { name: 'Linda', gender: 'Woman', sex: 'Female' });
      await panel(page)
        .getByRole('radiogroup', {
          name: /^Did this parent carry the pregnancy\?/,
        })
        .getByRole('radio', { name: 'Yes', exact: true })
        .click();
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Linda')).toBeVisible();

      await addRelativeOf(page, 'You', 'parent');
      await describe(page, { name: 'Robert', gender: 'Man', sex: 'Male' });
      // Linda is offered as Robert's partner, and chosen already.
      await expect(
        panel(page)
          .getByRole('radiogroup', {
            name: /^Are they the partner of another parent\?/,
          })
          .getByRole('radio', { name: 'Linda', exact: true }),
      ).toBeChecked();
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Robert')).toBeVisible();
      await expect(page.getByTestId('pedigree-person')).toHaveCount(3);

      await expect
        .poll(async () => (await networkOf(ctx)).edges.length)
        .toBe(3);
      const network = await networkOf(ctx);
      expect(network.nodes.every((node) => node.type === fp.personType)).toBe(
        true,
      );
      expect(network.edges.every((edge) => edge.type === fp.edgeType)).toBe(
        true,
      );
      const ego = network.nodes.find((node) => node[ATTR][fp.ego] === true);
      const linda = nodeNamed(network, fp.name, 'Linda');
      const robert = nodeNamed(network, fp.name, 'Robert');
      expect(
        network.nodes.filter((node) => node[ATTR][fp.ego] === true),
      ).toHaveLength(1);
      expect(linda?.[ATTR][fp.sexAssignedAtBirth]).toEqual(['female']);
      expect(linda?.[ATTR][fp.genderIdentity ?? '']).toEqual(['woman']);
      expect(robert?.[ATTR][fp.sexAssignedAtBirth]).toEqual(['male']);
      expect(robert?.[ATTR][fp.genderIdentity ?? '']).toEqual(['man']);

      const [lindaToEgo] = linksBetween(network, linda?.[PK], ego?.[PK]);
      expect(lindaToEgo?.from).toBe(linda?.[PK]);
      expect(lindaToEgo?.[ATTR][fp.kind]).toEqual(['biological']);
      expect(lindaToEgo?.[ATTR][fp.gestationalCarrier]).toBe(true);
      const [robertToEgo] = linksBetween(network, robert?.[PK], ego?.[PK]);
      expect(robertToEgo?.from).toBe(robert?.[PK]);
      expect(robertToEgo?.[ATTR][fp.kind]).toEqual(['biological']);
      expect(robertToEgo?.[ATTR][fp.gestationalCarrier]).toBe(false);
      const [partnership] = linksBetween(network, linda?.[PK], robert?.[PK]);
      expect(partnership?.[ATTR][fp.kind]).toEqual(['partner']);
      expect(partnership?.[ATTR][fp.currentPartner]).toBe(true);
    },
  };
}

/** The person seed and link helpers a scaffold returns. */
type Seeders = Pick<
  ReturnType<typeof scaffold>,
  'person' | 'relate' | 'parents'
>;

/**
 * The participant described as intersex and non-binary, with partnered
 * biological parents Julie (who carried them) and Rob, both described.
 */
function seedDescribedParents(
  { person, relate, parents }: Seeders,
  ego: Seed = {},
) {
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
    ...ego,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Rob', gender: 'man', sex: 'male' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');
}

/** Unnamed parents and an unnamed sister, each described. */
function seedUnnamedFamily({ person, relate, parents }: Seeders) {
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { gender: 'woman', sex: 'female' });
  person('dad', { gender: 'man', sex: 'male' });
  person('sister', { gender: 'woman', sex: 'female' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');
  parents('mum', 'dad', 'sister');
}

/**
 * A sibling, a partner and a child added with the mouse, none of them named,
 * on a stage that does not ask about gender identity: the gendered words
 * follow sex assigned at birth. Leaving the stage saves each unnamed
 * person's label as their name, and the stage's metadata records who holds
 * one; the participant's own name and a typed name are left alone.
 */
function siblingPartnerChildAndGeneratedLabels(): ScenarioDefinition {
  const { synth, fp, step, person, relate, parents } = scaffold({
    framing: 'gendered',
    askGenderIdentity: false,
  });
  person('ego', { name: 'Ari', sex: 'intersex', isEgo: true });
  person('mum', { sex: 'female' });
  person('dad', { name: 'Rob', sex: 'male' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');

  return {
    id: 'sibling-partner-child-generated-labels',
    covers: [
      'framing=gendered',
      'nodeConfiguration.genderIdentity=absent',
      'addRelative.sibling',
      'addRelative.partner',
      'addRelative.child',
      'nodeConfiguration.nameAttribute=generatedLabelOnLeave',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      // An unnamed parent is shown by the gendered word her sex at birth
      // gives her.
      await expect(member(page, 'Mother')).toBeVisible();

      await addRelativeOf(page, 'You', 'sibling');
      await expect(
        panel(page).getByRole('heading', { name: 'Add your sibling' }),
      ).toBeVisible();
      // No gender identity question on this stage.
      await expect(
        panel(page).getByRole('radiogroup', { name: /^Gender identity/ }),
      ).toHaveCount(0);
      await describe(page, { sex: 'Female' });
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Sister')).toBeVisible();

      await addRelativeOf(page, 'You', 'partner');
      await describe(page, { sex: 'Male' });
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Partner')).toBeVisible();

      await addRelativeOf(page, 'You', 'child');
      // The child's other parent is the partner just added.
      await expect(
        panel(page)
          .getByRole('radiogroup', {
            name: /^Who is the child’s other parent\?/,
          })
          .getByRole('radio', { name: 'Partner', exact: true }),
      ).toBeChecked();
      await describe(page, { sex: 'Male' });
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Son')).toBeVisible();
      await expect(page.getByTestId('pedigree-person')).toHaveCount(6);

      // Nothing is named until the participant leaves.
      const before = await networkOf(ctx);
      expect(
        before.nodes.filter((node) => {
          const name = node[ATTR][fp.name];
          return typeof name === 'string' && name !== '';
        }),
      ).toHaveLength(2);

      await leaveForward(ctx);
      const after = await networkOf(ctx);
      const named = (label: string) => nodeNamed(after, fp.name, label);
      for (const label of ['Mother', 'Sister', 'Partner', 'Son']) {
        expect(named(label), `${label} saved as a name`).toBeDefined();
      }
      expect(named('Rob')).toBeDefined();
      expect(named('Ari')?.[ATTR][fp.ego]).toBe(true);

      const kindBetween = (a: string | undefined, b: string | undefined) =>
        linksBetween(after, a, b)[0]?.[ATTR][fp.kind];
      const ego = named('Ari')?.[PK];
      const partner = named('Partner')?.[PK];
      const son = named('Son')?.[PK];
      const sister = named('Sister')?.[PK];
      expect(kindBetween(partner, ego)).toEqual(['partner']);
      expect(kindBetween(son, ego)).toEqual(['biological']);
      expect(kindBetween(son, partner)).toEqual(['biological']);
      expect(kindBetween('mum', sister)).toEqual(['biological']);
      expect(kindBetween('dad', sister)).toEqual(['biological']);

      // The stage records who holds a saved label, and only them.
      const metadata = await pedigreeMetadata(page, step);
      expect(Object.keys(metadata?.generatedLabels ?? {}).toSorted()).toEqual(
        ['Mother', 'Sister', 'Partner', 'Son']
          .map((label) => named(label)?.[PK] ?? label)
          .toSorted(),
      );
    },
  };
}

/**
 * The stage records each person's relationship to the participant as it is
 * left, worked out from the family drawn: a child added here is a child, the
 * parents are parents, and the participant has none. Someone who held a value
 * but is no longer connected to the participant has it cleared, so a later
 * filter never finds a stale relative.
 */
function relationshipToParticipantRecorded(): ScenarioDefinition {
  const { synth, fp, person, relate, parents } = scaffold({
    recordRelationshipToParticipant: true,
  });
  person('ego', {
    isEgo: true,
    name: 'Ari',
    sex: 'intersex',
    gender: 'nonBinary',
    relationship: 'child',
  });
  person('mum', { name: 'Julie', sex: 'female', gender: 'woman' });
  person('dad', { name: 'Rob', sex: 'male', gender: 'man' });
  person('former', { name: 'Kim', sex: 'female', relationship: 'sibling' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');

  return {
    id: 'relationship-to-participant-recorded',
    covers: ['nodeConfiguration.relationshipToParticipantAttribute'],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      const relationship = fp.relationshipToParticipant ?? '';

      await addRelativeOf(page, 'You', 'child');
      await describe(page, { name: 'Mia', gender: 'Woman', sex: 'Female' });
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Mia')).toBeVisible();

      await leaveForward(ctx);
      const network = await networkOf(ctx);
      const relationshipOf = (name: string) =>
        nodeNamed(network, fp.name, name)?.[ATTR][relationship];
      expect(relationshipOf('Julie')).toEqual(['parent']);
      expect(relationshipOf('Rob')).toEqual(['parent']);
      expect(relationshipOf('Mia')).toEqual(['child']);
      expect(relationshipOf('Ari')).toBeUndefined();
      expect(relationshipOf('Kim')).toBeUndefined();
    },
  };
}

/**
 * The participant reaches the stage for the first time and is created there,
 * then adds a parent and opens their own details with the keyboard alone: the
 * family is one tab stop, Tab enters a person's add menu, the arrow keys move
 * through it and between people, and Escape closes the side panel, returning
 * focus to the person it was opened from.
 */
function keyboardFirstVisit(): ScenarioDefinition {
  const { synth, fp } = scaffold({ before: 'information' });

  return {
    id: 'keyboard-first-visit',
    covers: [
      'keyboardOperation',
      'nodeConfiguration.egoAttribute=createdOnFirstVisit',
    ],
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      await interview.next();
      const you = member(page, 'You');
      await expect(you).toBeVisible();
      await expect(you).toHaveAccessibleDescription(
        'Some details are missing.',
      );
      // Created on arrival, marked as the participant and nothing else.
      await expect
        .poll(async () => (await networkOf(ctx)).nodes.length)
        .toBe(1);
      const [ego] = (await networkOf(ctx)).nodes;
      expect(ego?.[ATTR][fp.ego]).toBe(true);

      // Tab reaches the family; the person holding focus shows their menu.
      await expect(you).toHaveAttribute('tabindex', '0');
      for (let presses = 0; presses < 20; presses++) {
        const focused = await you.evaluate(
          (element) => element === document.activeElement,
        );
        if (focused) break;
        await page.keyboard.press('Tab');
      }
      await expect(you).toBeFocused();
      await expect(page.getByTestId('pedigree-menu-parent')).toBeVisible();

      // Tab moves into the menu; the arrow keys move along it.
      await page.keyboard.press('Tab');
      await expect(page.getByTestId('pedigree-menu-parent')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByTestId('pedigree-menu-sibling')).toBeFocused();
      await page.keyboard.press('ArrowLeft');
      await expect(page.getByTestId('pedigree-menu-parent')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        panel(page).getByRole('heading', { name: 'Add your parent' }),
      ).toBeVisible();

      await panel(page).getByRole('textbox', { name: /^Name/ }).focus();
      await page.keyboard.type('Linda');
      await panel(page)
        .getByRole('radio', { name: 'Woman', exact: true })
        .focus();
      await page.keyboard.press('Space');
      await panel(page)
        .getByRole('radio', { name: 'Female', exact: true })
        .focus();
      await page.keyboard.press('Space');
      await panel(page)
        .getByRole('button', { name: 'Add to family', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(panel(page)).toHaveCount(0);

      // Focus returns to the participant; the parent sits above them.
      await expect(you).toBeFocused();
      await page.keyboard.press('ArrowUp');
      await expect(member(page, 'Linda')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(you).toBeFocused();

      // Enter opens the participant's own details, which never ask their
      // name; Escape closes them.
      await page.keyboard.press('Enter');
      await expect(
        panel(page).getByRole('heading', { name: 'About you', level: 2 }),
      ).toBeVisible();
      await expect(
        panel(page).getByRole('textbox', { name: /^Name/ }),
      ).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0);
      await expect(you).toBeFocused();

      const network = await networkOf(ctx);
      const linda = nodeNamed(network, fp.name, 'Linda');
      expect(linda?.[ATTR][fp.genderIdentity ?? '']).toEqual(['woman']);
      expect(
        linksBetween(network, linda?.[PK], ego?.[PK])[0]?.[ATTR][fp.kind],
      ).toEqual(['biological']);
    },
  };
}

/**
 * The gamete framing describes unnamed relatives without reference to gender:
 * biological parents by the gamete they gave, everyone else by a neutral
 * word, whatever their gender identity. The same words are saved on leaving.
 */
function framingGamete(): ScenarioDefinition {
  const scaffolded = scaffold({ framing: 'gamete' });
  const { synth, fp } = scaffolded;
  seedUnnamedFamily(scaffolded);

  return {
    id: 'framing-gamete',
    covers: ['framing=gamete'],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      await expect(member(page, 'Egg parent')).toBeVisible();
      await expect(member(page, 'Sperm parent')).toBeVisible();
      await expect(member(page, 'Sibling')).toBeVisible();
      await expect(member(page, /^(Mother|Father|Sister)/)).toHaveCount(0);
      // No choice of words is offered when the stage makes it.
      await expect(page.getByTestId('pedigree-framing')).toHaveCount(0);

      await leaveForward(ctx);
      const network = await networkOf(ctx);
      for (const label of ['Egg parent', 'Sperm parent', 'Sibling']) {
        expect(nodeNamed(network, fp.name, label), label).toBeDefined();
      }
    },
  };
}

/**
 * The stage leaves the words to the participant. The choice opens a moment
 * after they arrive, with neither answer chosen, and Escape does not close
 * it; choosing applies at once and is kept in the stage's metadata, and the
 * words can be changed again from the toolbar.
 */
function framingParticipantPreference(): ScenarioDefinition {
  const scaffolded = scaffold({
    framing: 'participantPreference',
    before: 'information',
  });
  const { synth, step } = scaffolded;
  seedUnnamedFamily(scaffolded);

  return {
    id: 'framing-participant-preference',
    covers: ['framing=participantPreference'],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      await interview.next();
      const title = page.getByText('How should we describe your family?');
      await expect(title).toBeVisible();
      const gamete = page.getByRole('option', {
        name: /^Egg parent, sperm parent, sibling/,
      });
      const gendered = page.getByRole('option', {
        name: /^Mother, father, sister, brother/,
      });
      await expect(gamete).toHaveAttribute('aria-selected', 'false');
      await expect(gendered).toHaveAttribute('aria-selected', 'false');
      // Until a choice is made, nothing closes the popover.
      const wording = page.getByRole('button', { name: 'Wording' });
      await page.keyboard.press('Escape');
      await expect(title).toBeVisible();
      await expect(wording).toHaveAttribute('aria-expanded', 'true');

      await gamete.click();
      await expect(title).toHaveCount(0);
      await expect(member(page, 'Egg parent')).toBeVisible();
      await expect
        .poll(async () => (await pedigreeMetadata(page, step))?.framing)
        .toBe('gamete');

      await wording.click();
      await gendered.click();
      await expect(title).toHaveCount(0);
      await expect(member(page, 'Mother')).toBeVisible();
      await expect(member(page, 'Sister')).toBeVisible();
      await expect
        .poll(async () => (await pedigreeMetadata(page, step))?.framing)
        .toBe('gendered');
    },
  };
}

/**
 * The researcher's own gender identity options and the words each takes, in
 * the gendered framing. "Trans woman", mapped to feminine words, is a mother
 * whatever her sex at birth; "Agender", left unmapped, takes neutral words;
 * an option whose words are unknown names a biological parent from their sex
 * at birth. The side panel asks the question with the researcher's options.
 */
function genderIdentityTerms(): ScenarioDefinition {
  const { synth, person, relate } = scaffold({
    framing: 'gendered',
    genderIdentities: [
      { value: 'woman', label: 'Woman', words: 'feminine' },
      { value: 'man', label: 'Man', words: 'masculine' },
      { value: 'nonBinary', label: 'Non-binary', words: 'neutral' },
      { value: 'unknown', label: 'Don’t know', words: 'unknown' },
      { value: 'transWoman', label: 'Trans woman', words: 'feminine' },
      { value: 'agender', label: 'Agender' },
    ],
  });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { gender: 'transWoman', sex: 'male' });
  person('other', { gender: 'unknown', sex: 'female' });
  person('brother', { gender: 'man', sex: 'male' });
  person('agender', { gender: 'agender', sex: 'female' });
  person('nonBinary', { gender: 'nonBinary', sex: 'male' });
  relate('mum', 'other', 'partner');
  for (const child of ['ego', 'brother', 'agender', 'nonBinary']) {
    relate('other', child, 'biological', { carrier: true });
    relate('mum', child, 'biological');
  }

  return {
    id: 'gender-identity-terms',
    covers: [
      'nodeConfiguration.genderIdentity.terms[].words=feminine',
      'nodeConfiguration.genderIdentity.terms[].words=masculine',
      'nodeConfiguration.genderIdentity.terms[].words=neutral',
      'nodeConfiguration.genderIdentity.terms[].words=unknown',
      'nodeConfiguration.genderIdentity.terms=unmapped',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await expect(member(page, 'Mother')).toBeVisible();
      await expect(member(page, 'Biological mother')).toBeVisible();
      await expect(member(page, 'Brother')).toBeVisible();
      await expect(member(page, /^Sibling/)).toHaveCount(2);

      await member(page, 'Mother').click();
      await expect(
        panel(page).getByRole('radio', { name: 'Trans woman', exact: true }),
      ).toBeChecked();
      await expect(
        panel(page).getByRole('radio', { name: 'Agender', exact: true }),
      ).not.toBeChecked();
      // Only the researcher's options are offered.
      await expect(
        panel(page).getByRole('radio', { name: 'A different identity' }),
      ).toHaveCount(0);
      await panel(page)
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await expect(panel(page)).toHaveCount(0);
    },
  };
}

/**
 * Both biological parents are required. The participant starts alone and
 * undescribed: Next is held back, opening the list of what is still needed,
 * and pressing it again does not get through. Each item leads to where it is
 * resolved — adding a parent, describing the stand-in added for the other,
 * or the participant's own details — and once the list is empty the ring
 * says so and Next moves on.
 */
function completenessParentsRequired(): ScenarioDefinition {
  const { synth, fp, person } = scaffold({
    completeness: { scope: 'parents', enforcement: 'required' },
  });
  person('ego', { isEgo: true });

  return {
    id: 'completeness-parents-required',
    covers: [
      'completeness.scope=parents',
      'completeness.enforcement=required',
      'framing=absent',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      await expect(trackerRing(page)).toHaveAccessibleName(
        /^Family tree \d+% complete\. Show what’s still needed\.$/,
      );

      // Next is held back, and shows what is missing.
      await interview.nextButton.click();
      await expect(trackerList(page)).toBeVisible();
      const parentsItem = trackerList(page).getByRole('button', {
        name: 'Add your biological parents',
      });
      await expect(parentsItem).toBeVisible();
      await expect(
        trackerList(page).getByRole('button', {
          name: 'Some details are missing about you',
        }),
      ).toBeVisible();
      // Required: there is no way past it.
      await expect(
        page.getByText('You can also continue without these'),
      ).toHaveCount(0);
      await interview.nextButton.click();
      await expect(page).toHaveURL(/step=0/);
      await expect(trackerList(page)).toBeVisible();

      // The item adds the missing parent.
      await parentsItem.click();
      await expect(
        panel(page).getByRole('heading', { name: 'Add your parent' }),
      ).toBeVisible();
      await describe(page, { gender: 'Woman', sex: 'Female' });
      await submitPanel(page, 'Add to family');
      // Without a framing set, the gendered words describe her.
      await expect(member(page, 'Mother')).toBeVisible();

      // Her addition adds an unnamed stand-in for the other biological
      // parent (the stand-in rule), whose details the list then asks for.
      await trackerRing(page).click();
      await trackerList(page)
        .getByRole('button', {
          name: 'Some details are missing for “Biological father”',
        })
        .click();
      await describe(page, { gender: 'Man', sex: 'Male' });
      await submitPanel(page, 'Save');
      await expect(member(page, 'Father')).toBeVisible();

      // The last item opens the participant's own details.
      await trackerRing(page).click();
      await trackerList(page)
        .getByRole('button', { name: 'Some details are missing about you' })
        .click();
      await expect(
        panel(page).getByText(
          'Some details are missing: Gender identity and Sex assigned at birth.',
        ),
      ).toBeVisible();
      await describe(page, { gender: 'Non-binary', sex: 'Intersex' });
      await submitPanel(page, 'Save');

      await expect(trackerRing(page)).toHaveAccessibleName(
        'Your family tree has everything needed. Show what’s still needed.',
      );
      await leaveForward(ctx);
      const network = await networkOf(ctx);
      expect(network.nodes).toHaveLength(3);
      // Both parents, not partnered: a stand-in is never recorded as anyone's
      // partner.
      expect(
        network.edges
          .map((edge) => JSON.stringify(edge[ATTR][fp.kind]))
          .toSorted(),
      ).toEqual(['["biological"]', '["biological"]']);
    },
  };
}

/**
 * First-degree relatives are recommended. Next opens the list — siblings and
 * children, with the note that the participant may go on without them — and
 * answering from the list that they have no siblings records it on them.
 * Pressing Next again with the list shown goes on, children unanswered.
 */
function completenessFirstDegreeRecommended(): ScenarioDefinition {
  const scaffolded = scaffold({
    completeness: { scope: 'firstDegree', enforcement: 'recommended' },
  });
  const { synth, fp } = scaffolded;
  seedDescribedParents(scaffolded);

  return {
    id: 'completeness-first-degree-recommended',
    covers: [
      'completeness.scope=firstDegree',
      'completeness.enforcement=recommended',
      'completeness.relativesNotRecordedAttribute',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      await interview.nextButton.click();
      await expect(trackerList(page)).toBeVisible();
      await expect(
        trackerList(page).getByRole('button', {
          name: 'Add your biological brothers and sisters, or say you have none',
        }),
      ).toBeVisible();
      await expect(
        trackerList(page).getByRole('button', {
          name: 'Add your biological children, or say you have none',
        }),
      ).toBeVisible();
      await expect(
        trackerList(page).getByText(
          'You can also continue without these by pressing Next again.',
        ),
      ).toBeVisible();
      await expect(page).toHaveURL(/step=0/);

      await trackerList(page)
        .getByRole('button', { name: 'I have no biological siblings' })
        .click();
      await expect
        .poll(async () => {
          const network = await networkOf(ctx);
          return network.nodes.find((node) => node[ATTR][fp.ego] === true)?.[
            ATTR
          ][fp.relativesNotRecorded ?? ''];
        })
        .toEqual(['noSiblings']);
      await expect(
        trackerList(page).getByRole('button', {
          name: 'Add your biological brothers and sisters, or say you have none',
        }),
      ).toHaveCount(0);

      // Recommended: Next again, with the list shown, goes on.
      await leaveForward(ctx);
    },
  };
}

/**
 * Three generations are required. With the participant's own siblings and
 * children answered, the list asks for each parent's parents and siblings.
 * Answering in a parent's details that the participant doesn't know about
 * her siblings records it and resolves that item.
 */
function completenessGrandparentsRequired(): ScenarioDefinition {
  const scaffolded = scaffold({
    completeness: { scope: 'grandparents', enforcement: 'required' },
  });
  const { synth, fp } = scaffolded;
  seedDescribedParents(scaffolded, {
    relativesNotRecorded: ['noSiblings', 'noChildren'],
  });

  return {
    id: 'completeness-grandparents-required',
    covers: ['completeness.scope=grandparents'],
    visual: true,
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      await trackerRing(page).click();
      const items = trackerList(page).getByRole('listitem');
      for (const name of ['Julie', 'Rob']) {
        await expect(
          trackerList(page).getByRole('button', {
            name: `Add biological parents for “${name}”`,
          }),
        ).toBeVisible();
        await expect(
          trackerList(page).getByRole('button', {
            name: `Add biological brothers and sisters for “${name}”, or say they have none`,
          }),
        ).toBeVisible();
      }
      await expect(items).toHaveCount(4);

      await page.keyboard.press('Escape');
      await member(page, 'Julie').click();
      await panel(page)
        .getByRole('radiogroup', {
          name: /^Does Julie have any biological brothers or sisters/,
        })
        .getByRole('radio', { name: 'Don’t know', exact: true })
        .click();
      await submitPanel(page, 'Save');
      await expect
        .poll(
          async () =>
            nodeNamed(await networkOf(ctx), fp.name, 'Julie')?.[ATTR][
              fp.relativesNotRecorded ?? ''
            ],
        )
        .toEqual(['siblingsUnknown']);

      await interview.nextButton.click();
      await expect(trackerList(page)).toBeVisible();
      await expect(items).toHaveCount(3);
      await expect(page).toHaveURL(/step=0/);
    },
  };
}

/**
 * The participant with parents, maternal grandparents and an aunt, a sister
 * and a son with his other parent, every group the narrower scopes ask about
 * answered. Second
 * degree asks for the sister's and son's children; third degree also for the
 * aunt's (first cousins).
 */
function extendedScope(
  scope: 'secondDegree' | 'thirdDegree',
): ScenarioDefinition {
  const scaffolded = scaffold({
    completeness: { scope, enforcement: 'required' },
  });
  const { synth, person, relate, parents } = scaffolded;
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  // Rob has no siblings.
  person('dad', {
    name: 'Rob',
    gender: 'man',
    sex: 'male',
    relativesNotRecorded: ['noSiblings'],
  });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');
  person('gran', { name: 'Iris', gender: 'woman', sex: 'female' });
  person('grandad', { name: 'Frank', gender: 'man', sex: 'male' });
  person('aunt', { name: 'May', gender: 'woman', sex: 'female' });
  person('dadsMum', { name: 'Vera', gender: 'woman', sex: 'female' });
  person('dadsDad', { name: 'Ernest', gender: 'man', sex: 'male' });
  person('sister', { name: 'Bea', gender: 'woman', sex: 'female' });
  person('son', { name: 'Leo', gender: 'man', sex: 'male' });
  relate('gran', 'grandad', 'partner');
  parents('gran', 'grandad', 'mum');
  parents('gran', 'grandad', 'aunt');
  relate('dadsMum', 'dadsDad', 'partner');
  parents('dadsMum', 'dadsDad', 'dad');
  parents('mum', 'dad', 'sister');
  relate('ego', 'son', 'biological');
  // Leo's other biological parent, whose own family is never asked for.
  person('leosMum', { name: 'Sam', gender: 'woman', sex: 'female' });
  relate('leosMum', 'son', 'biological', { carrier: true });

  const cousinsItem =
    'Add biological children for “May”, or say they have none';
  return {
    id: `completeness-${scope === 'secondDegree' ? 'second' : 'third'}-degree-required`,
    covers: [`completeness.scope=${scope}`],
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await trackerRing(page).click();
      const list = trackerList(page);
      await expect(
        list.getByRole('button', {
          name: 'Add biological children for “Bea”, or say they have none',
        }),
      ).toBeVisible();
      await expect(
        list.getByRole('button', {
          name: 'Add biological children for “Leo”, or say they have none',
        }),
      ).toBeVisible();
      if (scope === 'thirdDegree') {
        await expect(
          list.getByRole('button', { name: cousinsItem }),
        ).toBeVisible();
        await expect(list.getByRole('listitem')).toHaveCount(3);
      } else {
        await expect(
          list.getByRole('button', { name: cousinsItem }),
        ).toHaveCount(0);
        await expect(list.getByRole('listitem')).toHaveCount(2);
      }
    },
  };
}

/**
 * The researcher's own questions follow the interface's in the side panel:
 * a required age, with a hint, and whether the person is still living. A
 * person whose required answer is missing is marked, on the canvas and in
 * their details, until it is given; a relative added through the panel is
 * asked the same questions.
 */
function formFieldsMissingDetails(): ScenarioDefinition {
  const scaffolded = scaffold();
  const { synth, fp } = scaffolded;
  seedDescribedParents(scaffolded);
  fp.addFormField({
    component: 'Number',
    prompt: 'How old are they?',
    hint: 'In whole years.',
    validation: { required: true },
  });
  fp.addFormField({
    component: 'Boolean',
    prompt: 'Is this person still living?',
  });

  return {
    id: 'form-fields-missing-details',
    covers: ['form', 'form.fields[].hint', 'form.fields[].validation.required'],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      for (const name of ['Julie', 'You']) {
        await expect(member(page, name)).toHaveAccessibleDescription(
          'Some details are missing.',
        );
      }

      await member(page, 'Julie').click();
      await expect(
        panel(page).getByText('Some details are missing: How old are they?.'),
      ).toBeVisible();
      await expect(
        panel(page).getByRole('heading', { name: 'More about this person' }),
      ).toBeVisible();
      await expect(panel(page).getByText('In whole years.')).toBeVisible();
      await panel(page)
        .getByRole('spinbutton', { name: /^How old are they\?/ })
        .fill('62');
      await panel(page)
        .getByRole('radiogroup', { name: /^Is this person still living\?/ })
        .getByRole('radio', { name: 'Yes', exact: true })
        .click();
      await submitPanel(page, 'Save');
      await expect(member(page, 'Julie')).not.toHaveAccessibleDescription(
        /Some details are missing/,
      );

      await addRelativeOf(page, 'You', 'sibling');
      await describe(page, { name: 'Bea', gender: 'Woman', sex: 'Female' });
      await panel(page)
        .getByRole('spinbutton', { name: /^How old are they\?/ })
        .fill('30');
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Bea')).toBeVisible();

      const network = await networkOf(ctx);
      const age = (name: string) => {
        const node = nodeNamed(network, fp.name, name);
        const variable = Object.keys(node?.[ATTR] ?? {}).find(
          (id) => typeof node?.[ATTR][id] === 'number',
        );
        return variable ? node?.[ATTR][variable] : undefined;
      };
      expect(age('Julie')).toBe(62);
      expect(age('Bea')).toBe(30);
    },
  };
}

const HEART = 'Who in your family has had heart disease?';
const OVARIAN = 'Who in your family has had ovarian cancer?';
const PROSTATE = 'Who in your family has had prostate cancer?';

/**
 * Once the family is drawn, each nomination prompt asks who it applies to.
 * Selecting a person sets the prompt's attribute on them, and selecting them
 * again clears it. A prompt limited to one sex at birth leaves out people
 * recorded as the other, but not someone intersex. The family cannot be
 * changed while a nomination prompt is showing.
 */
function nominationPrompts(): ScenarioDefinition {
  const scaffolded = scaffold({
    nominationPrompts: [
      { text: HEART, variableName: 'heartDisease' },
      {
        text: OVARIAN,
        variableName: 'ovarianCancer',
        onlyForSexAssignedAtBirth: 'female',
      },
      {
        text: PROSTATE,
        variableName: 'prostateCancer',
        onlyForSexAssignedAtBirth: 'male',
      },
    ],
  });
  const { synth, fp } = scaffolded;
  seedDescribedParents(scaffolded);
  const [heart, ovarian, prostate] = fp.nominations;

  return {
    id: 'nomination-prompts',
    covers: [
      'nominationPrompts[].id',
      'nominationPrompts[].text',
      'nominationPrompts[].attribute',
      'nominationPrompts[].onlyForSexAssignedAtBirth=female',
      'nominationPrompts[].onlyForSexAssignedAtBirth=male',
    ],
    visual: true,
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      const flag = async (name: string, attribute: string | undefined) =>
        nodeNamed(await networkOf(ctx), fp.name, name)?.[ATTR][attribute ?? ''];

      await interview.nextButton.click();
      await expect(page.getByRole('heading', { name: HEART })).toBeVisible();
      // Selecting is all there is: no tools, and no add menu.
      await expect(page.getByTestId('pedigree-tool-connect')).toHaveCount(0);
      const rob = member(page, 'Rob');
      const julie = member(page, 'Julie');
      const you = member(page, 'You');
      await expect(rob).toHaveAttribute('aria-pressed', 'false');
      await rob.click();
      await expect(rob).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => flag('Rob', heart)).toBe(true);
      await expect(panel(page)).toHaveCount(0);
      await expect(page.getByTestId('pedigree-menu-parent')).toHaveCount(0);
      await rob.click();
      await expect(rob).toHaveAttribute('aria-pressed', 'false');
      await expect.poll(() => flag('Rob', heart)).toBe(false);
      await rob.click();
      await expect.poll(() => flag('Rob', heart)).toBe(true);

      await interview.nextButton.click();
      await expect(page.getByRole('heading', { name: OVARIAN })).toBeVisible();
      await expect(rob).toBeDisabled();
      await expect(rob).toHaveAttribute('aria-pressed', 'false');
      await expect(you).toBeEnabled();
      await julie.click();
      await expect(julie).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => flag('Julie', ovarian)).toBe(true);

      await interview.nextButton.click();
      await expect(page.getByRole('heading', { name: PROSTATE })).toBeVisible();
      await expect(julie).toBeDisabled();
      await expect(rob).toBeEnabled();
      await expect(you).toBeEnabled();
      await you.click();
      await expect(you).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(() => flag('Ari', prostate)).toBe(true);

      // Each prompt keeps its own answers.
      await page.getByTestId('previous-button').click();
      await expect(page.getByRole('heading', { name: OVARIAN })).toBeVisible();
      await expect(julie).toHaveAttribute('aria-pressed', 'true');
      await expect(you).toHaveAttribute('aria-pressed', 'false');
      expect(await flag('Julie', heart)).not.toBe(true);
    },
  };
}

/**
 * A change of sex at birth withdraws the nominations it rules out. The
 * participant, intersex, is selected for a prompt limited to people assigned
 * female at birth; back on the family, their sex at birth is changed to
 * male, which sets that prompt's attribute to false, and the prompt then
 * leaves them out.
 */
function sexChangeWithdrawsNomination(): ScenarioDefinition {
  const scaffolded = scaffold({
    nominationPrompts: [
      {
        text: OVARIAN,
        variableName: 'ovarianCancer',
        onlyForSexAssignedAtBirth: 'female',
      },
    ],
  });
  const { synth, fp } = scaffolded;
  seedDescribedParents(scaffolded);
  const [ovarian] = fp.nominations;

  return {
    id: 'sex-change-withdraws-nomination',
    covers: ['nominationPrompts[].onlyForSexAssignedAtBirth=withdrawnOnChange'],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      const ariFlag = async () =>
        nodeNamed(await networkOf(ctx), fp.name, 'Ari')?.[ATTR][ovarian ?? ''];
      const you = member(page, 'You');

      await interview.nextButton.click();
      await expect(page.getByRole('heading', { name: OVARIAN })).toBeVisible();
      await expect(you).toBeEnabled();
      await you.click();
      await expect(you).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(ariFlag).toBe(true);

      await page.getByTestId('previous-button').click();
      await expect(page.getByRole('heading', { name: PROMPT })).toBeVisible();
      await you.click();
      await expect(panel(page)).toBeVisible();
      await panel(page)
        .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
        .getByRole('radio', { name: 'Male', exact: true })
        .click();
      await submitPanel(page, 'Save');
      await expect.poll(ariFlag).toBe(false);

      await interview.nextButton.click();
      await expect(page.getByRole('heading', { name: OVARIAN })).toBeVisible();
      await expect(you).toBeDisabled();
      await expect(you).toHaveAttribute('aria-pressed', 'false');
    },
  };
}

/**
 * Connecting and disconnecting people already shown. Tom is recorded only as
 * Rachel's partner, so that partnership cannot be removed: he would leave the
 * family tree. The connect tool makes him the participant's adoptive parent,
 * after which the partnership can be removed, and the pair connected again as
 * former partners.
 */
function connectAndDisconnect(): ScenarioDefinition {
  const { synth, fp, person, relate } = scaffold();
  person('ego', { name: 'Ella', gender: 'woman', sex: 'female', isEgo: true });
  person('mum', { name: 'Rachel', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Tom', gender: 'man', sex: 'male' });
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('mum', 'dad', 'partner');

  return {
    id: 'connect-and-disconnect',
    covers: [
      'connect',
      'disconnect',
      'edgeConfiguration.kindAttribute=adoptive',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      const hint = page.getByTestId('pedigree-connect-hint');
      const tom = member(page, 'Tom');
      const rachel = member(page, 'Rachel');

      // The partnership is Tom's only connection to Ella.
      await page.getByTestId('pedigree-tool-disconnect').click();
      await expect(hint).toHaveText(
        'Select a person, then select someone they are connected to, to remove that connection.',
      );
      await tom.click();
      await rachel.click();
      await expect(hint).toHaveText(
        'Removing this connection would leave “Tom” outside your family tree. Connect them to someone else in your family first.',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.keyboard.press('Escape');

      await page.getByTestId('pedigree-tool-connect').click();
      await tom.click();
      await expect(hint).toHaveText(
        'Now select the person to connect to “Tom”.',
      );
      await member(page, 'You').click();
      await page
        .getByRole('menuitem', { name: '“Tom” is your parent' })
        .click();
      await page.getByRole('menuitem', { name: 'Adoptive parent' }).click();
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect
        .poll(async () =>
          linksBetween(await networkOf(ctx), 'dad', 'ego').map(
            (edge) => edge[ATTR][fp.kind],
          ),
        )
        .toEqual([['adoptive']]);
      const [adoption] = linksBetween(await networkOf(ctx), 'dad', 'ego');
      expect(adoption?.from).toBe('dad');

      // Already connected: no second link.
      await rachel.click();
      await tom.click();
      await expect(hint).toHaveText(
        '“Rachel” and “Tom” are already connected.',
      );
      await expect(page.getByRole('menu')).toHaveCount(0);
      await page.keyboard.press('Escape');

      // Now the partnership can go, leaving both people.
      await page.getByTestId('pedigree-tool-disconnect').click();
      await tom.click();
      await rachel.click();
      const dialog = page.getByRole('dialog', {
        name: 'Remove the connection between “Tom” and “Rachel”?',
      });
      await dialog.getByRole('button', { name: 'Remove connection' }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => linksBetween(await networkOf(ctx), 'dad', 'mum'))
        .toHaveLength(0);
      await expect(tom).toBeVisible();
      await expect(rachel).toBeVisible();

      await page.getByTestId('pedigree-tool-connect').click();
      await tom.click();
      await rachel.click();
      await page
        .getByRole('menuitem', { name: '“Tom” and “Rachel” were partners' })
        .click();
      await expect
        .poll(async () =>
          linksBetween(await networkOf(ctx), 'dad', 'mum').map((edge) => [
            edge[ATTR][fp.kind],
            edge[ATTR][fp.currentPartner],
          ]),
        )
        .toEqual([[['partner'], false]]);
      await page.getByTestId('pedigree-tool-pointer').click();
    },
  };
}

/**
 * A family made through assisted reproduction and a new partnership: an egg
 * donor, a surrogate who carried the participant, a social mother, and the
 * father's former partner. Every kind of relationship the stage records is
 * drawn, from the seeded network alone.
 */
function relationshipKindsDrawn(): ScenarioDefinition {
  const { synth, person, relate } = scaffold({
    completeness: { scope: 'parents', enforcement: 'required' },
  });
  person('ego', { name: 'Maya', gender: 'woman', sex: 'female', isEgo: true });
  person('mother', { name: 'Ana', gender: 'woman', sex: 'female' });
  person('father', { name: 'Luis', gender: 'man', sex: 'male' });
  person('donor', { gender: 'woman', sex: 'female' });
  person('carrier', { gender: 'woman', sex: 'female' });
  person('former', { name: 'Sofia', gender: 'woman', sex: 'female' });
  relate('mother', 'father', 'partner');
  relate('father', 'former', 'partner', { current: false });
  relate('mother', 'ego', 'social');
  relate('father', 'ego', 'biological');
  relate('donor', 'ego', 'donor');
  relate('carrier', 'ego', 'surrogate', { carrier: true });

  return {
    id: 'relationship-kinds-drawn',
    covers: [
      'edgeConfiguration.kindAttribute=social',
      'edgeConfiguration.kindAttribute=donor',
      'edgeConfiguration.kindAttribute=surrogate',
    ],
    visual: true,
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await expect(page.getByTestId('pedigree-person')).toHaveCount(6);
      // The unnamed donor and surrogate are shown by their part.
      for (const name of [
        'Ana',
        'Luis',
        'Sofia',
        'You',
        'Egg donor',
        'Surrogate',
      ]) {
        await expect(member(page, name)).toBeVisible();
      }
      // The donor counts as a biological parent; the surrogate does not.
      await expect(trackerRing(page)).toHaveAccessibleName(
        'Your family tree has everything needed. Show what’s still needed.',
      );

      // The participant's details say how each parent is related to them.
      await member(page, 'You').click();
      await expect(
        panel(page)
          .getByRole('radiogroup', { name: /^Ana is your…/ })
          .getByRole('radio', { name: 'Step or social parent', exact: true }),
      ).toBeChecked();
      await expect(
        panel(page)
          .getByRole('radiogroup', { name: /^Luis is your…/ })
          .getByRole('radio', { name: 'Biological parent', exact: true }),
      ).toBeChecked();
      await panel(page)
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await expect(panel(page)).toHaveCount(0);
    },
  };
}

/**
 * The study encrypts names. Once the participant has set their passphrase, a
 * name typed for a new relative is stored encrypted and shown decrypted, and
 * the labels saved on leaving for the unnamed parents are stored encrypted
 * too.
 */
function encryptedNames(): ScenarioDefinition {
  const scaffolded = scaffold({
    encryptedNames: true,
    before: 'anonymisation',
    framing: 'gendered',
  });
  const { synth, fp, person, relate, parents } = scaffolded;
  person('ego', { gender: 'nonBinary', sex: 'intersex', isEgo: true });
  person('mum', { gender: 'woman', sex: 'female' });
  person('dad', { gender: 'man', sex: 'male' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');

  const SecureNodeSchema = z.object({
    [entitySecureAttributesMeta]: z.record(
      z.string(),
      z.strictObject({ iv: z.array(z.number()) }),
    ),
  });

  return {
    id: 'encrypted-names',
    covers: ['nodeConfiguration.nameAttribute=encrypted'],
    slow: true,
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page, interview } = ctx;
      const anonymisation = new AnonymisationFixture(page);
      await interview.next();
      await anonymisation.fillPassphrase('correct-horse-battery');
      await anonymisation.submit();
      await expect(anonymisation.successAlert()).toBeVisible();
      await interview.next();

      await expect(page.getByTestId('pedigree-passphrase-notice')).toHaveCount(
        0,
      );
      await addRelativeOf(page, 'You', 'sibling');
      await describe(page, { name: 'Bea', gender: 'Woman', sex: 'Female' });
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Bea')).toBeVisible();

      const isCiphertext = (value: unknown) =>
        Array.isArray(value) && value.every((item) => typeof item === 'number');
      await expect
        .poll(
          async () =>
            (await networkOf(ctx)).nodes.filter((node) =>
              isCiphertext(node[ATTR][fp.name]),
            ).length,
        )
        .toBe(1);
      const stored = await networkOf(ctx);
      expect(nodeNamed(stored, fp.name, 'Bea')).toBeUndefined();

      await leaveForward(ctx);
      const network = await networkOf(ctx);
      const encrypted = network.nodes.filter((node) =>
        isCiphertext(node[ATTR][fp.name]),
      );
      // Bea, and the labels saved for both parents.
      expect(encrypted.map((node) => node[PK]).toSorted()).toEqual(
        expect.arrayContaining(['dad', 'mum']),
      );
      expect(encrypted).toHaveLength(3);
      for (const node of encrypted) {
        expect(
          SecureNodeSchema.parse(node)[entitySecureAttributesMeta][fp.name],
        ).toBeDefined();
      }
      for (const label of ['Mother', 'Father']) {
        expect(nodeNamed(network, fp.name, label)).toBeUndefined();
      }
    },
  };
}

/**
 * The study encrypts one of its own questions, but not names. Until the
 * participant chooses their passphrase nobody can be added or changed: the
 * add menu does not open, and a notice under the family says why and asks
 * for it. Once it is chosen, an answer to that question is stored
 * encrypted while the name is stored as typed, and the answer opens
 * decrypted in the question again.
 */
function encryptedFormField(): ScenarioDefinition {
  const scaffolded = scaffold({ encryptedFormField: true });
  const { synth, fp, nickname } = scaffolded;
  seedDescribedParents(scaffolded);

  return {
    id: 'encrypted-form-field',
    covers: ['form.fields[].variable=encrypted'],
    slow: true,
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      const notice = page.getByTestId('pedigree-passphrase-notice');
      await expect(
        notice.getByText(
          'Enter your passphrase to add or change people in your family.',
          { exact: true },
        ),
      ).toBeVisible();
      await member(page, 'You').hover();
      await expect(page.getByTestId('pedigree-menu-sibling')).toHaveCount(0);

      await notice
        .getByRole('button', { name: 'Enter your passphrase' })
        .click();
      // No passphrase has been chosen in this interview yet, so this one
      // becomes it.
      const overlay = page.getByRole('dialog', {
        name: 'Choose a passphrase',
      });
      await overlay
        .getByRole('textbox', { name: 'Passphrase', exact: true })
        .fill('correct-horse-battery');
      await overlay
        .getByRole('textbox', { name: 'Confirm Passphrase' })
        .fill('correct-horse-battery');
      await overlay.getByRole('button', { name: 'Submit passphrase' }).click();
      await expect(notice).toHaveCount(0);

      await addRelativeOf(page, 'You', 'sibling');
      await describe(page, { name: 'Bea', gender: 'Woman', sex: 'Female' });
      await panel(page).getByRole('textbox', { name: NICKNAME }).fill('Bee');
      await submitPanel(page, 'Add to family');
      await expect(member(page, 'Bea')).toBeVisible();

      const isCiphertext = (value: unknown) =>
        Array.isArray(value) && value.every((item) => typeof item === 'number');
      await expect
        .poll(async () => {
          const bea = nodeNamed(await networkOf(ctx), fp.name, 'Bea');
          return isCiphertext(bea?.[ATTR][nickname ?? '']);
        })
        .toBe(true);
      const network = await networkOf(ctx);
      expect(
        network.nodes.some((node) => node[ATTR][nickname ?? ''] === 'Bee'),
      ).toBe(false);

      await member(page, 'Bea').click();
      await expect(
        panel(page).getByRole('textbox', { name: NICKNAME }),
      ).toHaveValue('Bee');
    },
  };
}

export const familyPedigreeScenarios: InterfaceScenarios = {
  interfaceType: 'FamilyPedigree',
  scenarios: [
    smokeAddBothParents(),
    siblingPartnerChildAndGeneratedLabels(),
    keyboardFirstVisit(),
    framingGamete(),
    framingParticipantPreference(),
    genderIdentityTerms(),
    completenessParentsRequired(),
    completenessFirstDegreeRecommended(),
    completenessGrandparentsRequired(),
    extendedScope('secondDegree'),
    extendedScope('thirdDegree'),
    formFieldsMissingDetails(),
    nominationPrompts(),
    sexChangeWithdrawsNomination(),
    connectAndDisconnect(),
    relationshipKindsDrawn(),
    encryptedNames(),
    encryptedFormField(),
    relationshipToParticipantRecorded(),
  ],
};
