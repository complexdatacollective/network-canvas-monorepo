import type { Locator, Page } from '@playwright/test';
import { z } from 'zod';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type {
  FramingSetting,
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

type PedigreeStageInput = NonNullable<
  Parameters<SyntheticInterview['addStage']>[1]
>;

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
  /** The requirement, and any of the tracker's wording the researcher
   * writes themselves. */
  completeness?: PedigreeStageInput['completeness'];
  /** The name question's wording, when the researcher writes it. */
  nameField?: PedigreeStageInput['nameField'];
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
  /** The stage's own words for the settings named, by dotted path. */
  wording?: PedigreeStageInput['wording'];
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
    nameField: options.nameField,
    nominationPrompts: options.nominationPrompts,
    recordRelationshipToParticipant: options.recordRelationshipToParticipant,
    ...(options.wording ? { wording: options.wording } : {}),
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
async function submitPanel(page: Page, button: 'Save') {
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
    name: /Show what’s still needed/,
  });

// --- The stage's own words ---------------------------------------------------

/**
 * A researcher's own wording for every setting a pedigree stage has, each
 * distinct from the text Network Canvas supplies and ending in the same tag,
 * so an assertion on one proves the stage's own setting is what the
 * participant sees. A setting with arguments is written as a message in the
 * default language, with the same choices the supplied text makes.
 */
const message = (text: string) => ({ 'en-US': text });

const OWN_WORDS = {
  alsoParentOfLabel: 'Also parent of these - matrix check',
  biologicalParentBoth: message(
    '{firstIsYou, select, true {You and {second} both - matrix check} other {{first} and {second} both - matrix check}}',
  ),
  biologicalParentHint: 'Genetic parents only - matrix check',
  biologicalParentLabel: 'Which one is genetic - matrix check',
  carriedSiblingsPregnancyLabel: message(
    '{single, select, true {{isYou, select, true {Did this parent carry you - matrix check} other {Did this parent carry {name} - matrix check}}} other {Did this parent carry {count} of them - matrix check}}',
  ),
  carrierLabel: 'Carrier of the pregnancy - matrix check',
  carrierUnknown: 'Another or unknown carrier - matrix check',
  changeWouldCutOff: message(
    '{count, plural, one {Change would strand # person: {names} - matrix check} other {Change would strand # people: {names} - matrix check}}',
  ),
  childKindAdoptive: 'Adopted kind - matrix check',
  childKindBiological: 'Biological kind - matrix check',
  childKindDonor: 'Donor kind - matrix check',
  childKindLabel: 'Kind of child - matrix check',
  childKindSocial: 'Social kind - matrix check',
  childKindSurrogate: 'Surrogacy kind - matrix check',
  connectHint: 'Pick two people to join - matrix check',
  connectParent: message(
    '{parentIsYou, select, true {You parent {child} - matrix check} other {{childIsYou, select, true {{parent} parents you - matrix check} other {{parent} parents {child} - matrix check}}}}',
  ),
  connectPartners: message(
    '{current, select, true {{firstIsYou, select, true {You and {second} together - matrix check} other {{first} and {second} together - matrix check}}} other {{firstIsYou, select, true {You and {second} apart - matrix check} other {{first} and {second} apart - matrix check}}}}',
  ),
  connectQuestion: message(
    '{firstIsYou, select, true {Join you with {second} how - matrix check} other {Join {first} with {second} how - matrix check}}',
  ),
  disconnectConfirmDescription: 'Only the line goes - matrix check',
  disconnectConfirmTitle: message(
    '{firstIsYou, select, true {Cut you off from {second} - matrix check} other {Cut {first} off from {second} - matrix check}}',
  ),
  disconnectHint: 'Pick two people to split - matrix check',
  disconnectWouldCutOff: message(
    '{count, plural, one {Splitting would strand # person: {names} - matrix check} other {Splitting would strand # people: {names} - matrix check}}',
  ),
  dontKnow: 'No idea - matrix check',
  framingChoiceDescription: 'Pick the words for relatives - matrix check',
  framingChoiceTitle: 'Words for your family - matrix check',
  genderIdentityLabel: 'Gender identity wording - matrix check',
  generatedLabelOf: message(
    '{relation, select, partner {{isYou, select, true {{term} partnered with you - matrix check} other {{term} partnered with {name} - matrix check}}} formerPartner {{isYou, select, true {{term} ex of you - matrix check} other {{term} ex of {name} - matrix check}}} parent {{isYou, select, true {{term} parenting you - matrix check} other {{term} parenting {name} - matrix check}}} sibling {{isYou, select, true {{term} sibling to you - matrix check} other {{term} sibling to {name} - matrix check}}} owner {{owner} owns {term} - matrix check} other {{isYou, select, true {{term} child of you - matrix check} other {{term} child of {name} - matrix check}}}}',
  ),
  missingDetailsList: message('Details to add ({details}) - matrix check'),
  otherParentLabel: 'The other parent is - matrix check',
  otherParentNone: 'Nobody else - matrix check',
  otherParentUnknown: 'Not in the tree yet - matrix check',
  panelTitle: message(
    '{relation, select, edit {{isYou, select, true {Edit you - matrix check} other {Edit {name} - matrix check}}} parent {{isYou, select, true {New parent for you - matrix check} other {New parent for {name} - matrix check}}} sibling {{isYou, select, true {New sibling for you - matrix check} other {New sibling for {name} - matrix check}}} partner {{isYou, select, true {New partner for you - matrix check} other {New partner for {name} - matrix check}}} other {{isYou, select, true {New child for you - matrix check} other {New child for {name} - matrix check}}}}',
  ),
  parentCarriedLabel: message(
    '{named, select, true {{parentIsYou, select, true {Did you carry them - matrix check} other {Did {parent} carry them - matrix check}}} other {Did the new parent carry them - matrix check}}',
  ),
  parentKindCarrier: message('{parentKind} who carried - matrix check'),
  parentKindLabel: 'Kind of new parent - matrix check',
  parentLinkKindLabel: message(
    '{parentIsYou, select, true {You are their kind - matrix check} other {{personIsYou, select, true {{parent} is your kind - matrix check} other {{parent} is their kind - matrix check}}}}',
  ),
  parentPartnerLabel: 'Partner of a parent - matrix check',
  placeholderParentsNote: message(
    '{framing, select, gamete {Gamete placeholders note - matrix check} other {Gendered placeholders note - matrix check}}',
  ),
  relativeTerm: message(
    '{term, select, mother {Mother term - matrix check} father {Father term - matrix check} sister {Sister term - matrix check} brother {Brother term - matrix check} son {Son term - matrix check} daughter {Daughter term - matrix check} grandmother {Grandmother term - matrix check} grandfather {Grandfather term - matrix check} greatGrandfather {Great-grandfather term - matrix check} halfSister {Half-sister term - matrix check} partner {Partner term - matrix check} formerPartner {Former partner term - matrix check} eggParent {Egg parent term - matrix check} spermParent {Sperm parent term - matrix check} sibling {Sibling term - matrix check} parent {Parent term - matrix check} other {Relative term - matrix check}}',
  ),
  removeConfirmDescription: message(
    '{hasOthers, select, true {Also takes {names}: {count, plural, one {# other person - matrix check} other {# other people - matrix check}}} other {Takes only them - matrix check}}',
  ),
  removeConfirmTitle: message('Delete {name} for good - matrix check'),
  sexAssignedAtBirthLabel: 'Sex at birth wording - matrix check',
  sharedDonorsLabel: message(
    '{isYou, select, true {Your donors in common - matrix check} other {Donors {name} has in common - matrix check}}',
  ),
  sharedParentCountBoth: 'Both of them - matrix check',
  sharedParentCountLabel: message(
    '{isYou, select, true {Parents shared with you - matrix check} other {Parents shared with {name} - matrix check}}',
  ),
  sharedParentEggOnly: message(
    '{parent, select, egg {{framing, select, gamete {Egg side only - matrix check} other {Mother side only - matrix check}}} other {{framing, select, gamete {Sperm side only - matrix check} other {Father side only - matrix check}}}}',
  ),
  siblingBiologicalParentLabel: 'Genetic parent of the sibling - matrix check',
  siblingKindLabel: 'Kind of sibling - matrix check',
  siblingTwinFraternal: 'Fraternal twin option - matrix check',
  siblingTwinHint: 'Triplets count as twins - matrix check',
  siblingTwinIdentical: 'Identical twin option - matrix check',
  siblingTwinLabel: message(
    '{isYou, select, true {Is this your twin - matrix check} other {Is this a twin of {name} - matrix check}}',
  ),
  siblingTwinNo: 'Not twins - matrix check',
  siblingTwinUnknown: 'Twins of unknown kind - matrix check',
  stillTogetherLabel: message(
    '{named, select, true {{personIsYou, select, true {Still with {partner}, you - matrix check} other {{partnerIsYou, select, true {Still with you - matrix check} other {Still with {partner} - matrix check}}}}} other {Still together - matrix check}}',
  ),
  twinsHint: 'Multiple births count - matrix check',
  twinsLabel: message(
    '{isYou, select, true {Your twins are - matrix check} other {Twins of {name} are - matrix check}}',
  ),
  twinZygosityLabel: message(
    '{who, select, personIsYou {You and {twin} identical - matrix check} twinIsYou {{name} and you identical - matrix check} other {{name} and {twin} identical - matrix check}}',
  ),
  unavailableAncestor: message(
    '{who, select, parentIsYou {You cannot parent {child} - matrix check} childIsYou {{parent} cannot parent you - matrix check} other {{parent} cannot parent {child} - matrix check}}',
  ),
  unavailableBothSameSex: message(
    '{firstIsYou, select, true {You and {second} both {sex} - matrix check} other {{first} and {second} both {sex} - matrix check}}',
  ),
  unavailableCannotCarry: message(
    '{who, select, you {You cannot carry as {sex} - matrix check} this {This person cannot carry as {sex} - matrix check} other {{name} cannot carry as {sex} - matrix check}}',
  ),
  unavailableCarried: message(
    '{who, select, personIsYou {You carried {child} so not {sex} - matrix check} childIsYou {Carried you so not {sex} - matrix check} other {Carried {child} so not {sex} - matrix check}}',
  ),
  unavailableCarrierChoice: message(
    '{who, select, carrierIsYou {You carried {child} already - matrix check} childIsYou {{carrier} carried you already - matrix check} other {{carrier} carried {child} already - matrix check}}',
  ),
  unavailableCarrierRecorded: message(
    '{who, select, carrierIsYou {You carried {child} on record - matrix check} childIsYou {{carrier} carried you on record - matrix check} other {{carrier} carried {child} on record - matrix check}}',
  ),
  unavailableGeneticParentsFull: message(
    '{who, select, childIsYou {You have {first} and {second} as genetic parents - matrix check} includesYou {{child} has you and {second} as genetic parents - matrix check} other {{child} has {first} and {second} as genetic parents - matrix check}}',
  ),
  unavailableIdenticalTwin: message(
    '{who, select, personIsYou {You and {twin} cannot be identical - matrix check} twinIsYou {{name} and you cannot be identical - matrix check} other {{name} and {twin} cannot be identical - matrix check}}',
  ),
  unavailableIdenticalTwinNew: message(
    '{isYou, select, true {New sibling cannot be identical to you - matrix check} other {New sibling cannot be identical to {name} - matrix check}}',
  ),
  unavailableSameSexGeneticParent: message(
    '{who, select, coParentIsYou {You and {child} share a sex {sex} - matrix check} childIsYou {{coParent} shares a sex {sex} with another parent of yours - matrix check} other {{coParent} shares a sex {sex} for {child} - matrix check}}',
  ),
  zygosityFraternal: 'Fraternal zygosity - matrix check',
  zygosityIdentical: 'Identical zygosity - matrix check',
  zygosityUnknown: 'Unknown zygosity - matrix check',
  you: 'Me myself - matrix check',
  save: 'Keep these details - matrix check',
  connectTool: 'Link tool - matrix check',
  disconnectTool: 'Unlink tool - matrix check',
  framingControlLabel: 'Relative words control - matrix check',
  pointerTool: 'Edit tool - matrix check',
} as const;

type OwnWord = keyof typeof OWN_WORDS;

/** The stage's own words for the settings named, as a scenario's `wording`. */
const ownWords = (
  ...keys: readonly OwnWord[]
): Record<string, string | { 'en-US': string }> =>
  Object.fromEntries(keys.map((key) => [`wording.${key}`, OWN_WORDS[key]]));

/** The coverage keys a scenario claims for the words it proves. */
const coversWords = (...keys: readonly OwnWord[]): string[] =>
  keys.map((key) => `wording.${key}`);

/** The text of an own word that takes no arguments. */
const plainWord = (key: OwnWord): string => {
  const value = OWN_WORDS[key];
  if (typeof value !== 'string') {
    throw new TypeError(`${key} is a message, not plain text`);
  }
  return value;
};

/** What the participant is called on the canvas, in the stage's own words. */
const OWN_YOU = plainWord('you');

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
      await submitPanel(page, 'Save');
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
      await submitPanel(page, 'Save');
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
      await submitPanel(page, 'Save');
      await expect(member(page, 'Sister')).toBeVisible();

      await addRelativeOf(page, 'You', 'partner');
      await describe(page, { sex: 'Male' });
      await submitPanel(page, 'Save');
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
      await submitPanel(page, 'Save');
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
      await submitPanel(page, 'Save');
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
      const you = member(page, 'You, some details missing');
      await expect(you).toBeVisible();
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
        .getByRole('button', { name: 'Save', exact: true })
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
        name: /^Egg parent, Sperm parent, Sibling/,
      });
      const gendered = page.getByRole('option', {
        name: /^Mother, Father, Sister, Brother/,
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
      await submitPanel(page, 'Save');
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
 * The researcher writes the stage's wording: the name question, and what the
 * tracker says about each item. The participant reads it as written, with
 * the person filled in, and the stage's
 * own note under a recommended list.
 */
function researcherWording(): ScenarioDefinition {
  const { synth, person } = scaffold({
    nameField: {
      prompt: 'What do you call them?',
      hint: 'A nickname will do.',
    },
    completeness: {
      scope: 'firstDegree',
      enforcement: 'recommended',
      itemText: {
        parents: {
          listItem:
            '{isYou, select, true {Your parents to add} other {Parents of {name}}}',
        },
        siblings: {
          listItem:
            '{isYou, select, true {Your brothers and sisters} other {{name}’s brothers and sisters}}',
          noneButton:
            '{isYou, select, true {No brothers or sisters} other {None}}',
          question:
            '{isYou, select, true {Any brothers or sisters?} other {Does {name} have brothers or sisters?}}',
        },
        details: {
          listItem:
            '{isYou, select, true {Tell us about yourself} other {Tell us about {name}}}',
        },
      },
      recommendedNote: 'Press Next again to skip these.',
    },
  });
  person('ego', { isEgo: true });

  return {
    id: 'researcher-wording',
    covers: [
      'nodeConfiguration.nameField.prompt',
      'nodeConfiguration.nameField.hint',
      'completeness.itemText',
      'completeness.recommendedNote',
    ],
    seedNetwork: true,
    build: () => synth,
    run: async ({ page, interview }) => {
      await interview.nextButton.click();
      await expect(trackerList(page)).toBeVisible();
      for (const item of [
        'Your parents to add',
        'Your brothers and sisters',
        // The supplied wording fills what the researcher left out.
        'Add your biological children, or say you have none',
      ]) {
        await expect(
          trackerList(page).getByRole('button', { name: item, exact: true }),
        ).toBeVisible();
      }
      await expect(
        trackerList(page).getByRole('button', {
          name: 'No brothers or sisters',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        trackerList(page).getByText('Press Next again to skip these.'),
      ).toBeVisible();

      await trackerList(page)
        .getByRole('button', { name: 'Tell us about yourself', exact: true })
        .click();
      await expect(
        panel(page).getByRole('radiogroup', {
          name: /^Any brothers or sisters\?/,
        }),
      ).toBeVisible();
      await describe(page, { gender: 'Non-binary', sex: 'Intersex' });
      await submitPanel(page, 'Save');

      // The participant is not asked their own name; a relative is.
      await trackerRing(page).click();
      await trackerList(page)
        .getByRole('button', { name: 'Your parents to add', exact: true })
        .click();
      await expect(
        panel(page).getByRole('textbox', { name: 'What do you call them?' }),
      ).toBeVisible();
      await expect(panel(page).getByText('A nickname will do.')).toBeVisible();
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
      await expect(member(page, 'Julie, some details missing')).toBeVisible();
      await expect(member(page, 'You, some details missing')).toBeVisible();

      await member(page, 'Julie, some details missing').click();
      await expect(
        panel(page).getByText('Some details are missing: How old are they?.'),
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
      await expect(member(page, 'Julie')).toBeVisible();

      await addRelativeOf(page, 'You, some details missing', 'sibling');
      await describe(page, { name: 'Bea', gender: 'Woman', sex: 'Female' });
      await panel(page)
        .getByRole('spinbutton', { name: /^How old are they\?/ })
        .fill('30');
      await submitPanel(page, 'Save');
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
        'Removing this connection would leave Tom outside your family tree. Connect them to someone else in your family first.',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.keyboard.press('Escape');

      await page.getByTestId('pedigree-tool-connect').click();
      await tom.click();
      await expect(hint).toHaveText(
        'Select a person, then select another to connect them.',
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

      // Already connected: no second link, so Tom is unavailable.
      await rachel.click();
      await expect(tom).toBeDisabled();
      await expect(page.getByRole('menu')).toHaveCount(0);
      await page.keyboard.press('Escape');

      // Now the partnership can go, leaving both people.
      await page.getByTestId('pedigree-tool-disconnect').click();
      await tom.click();
      await rachel.click();
      const dialog = page.getByRole('dialog', {
        name: 'Remove the connection between “Tom” and “Rachel”?',
      });
      await dialog.getByRole('button', { name: 'Delete' }).click();
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
      await submitPanel(page, 'Save');
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
          'Some answers here are protected by your passphrase. Enter your passphrase to see and change them.',
          { exact: true },
        ),
      ).toBeVisible();
      await member(page, 'You').hover();
      await expect(page.getByTestId('pedigree-menu-sibling')).toHaveCount(0);

      await notice.getByRole('button', { name: 'Passphrase' }).click();
      // No passphrase has been chosen in this interview yet, so this one
      // becomes it.
      const overlay = page.getByRole('dialog', {
        name: 'Passphrase',
      });
      await overlay
        .getByRole('textbox', { name: 'Passphrase', exact: true })
        .fill('correct-horse-battery');
      await overlay
        .getByRole('textbox', { name: 'Confirm Passphrase' })
        .fill('correct-horse-battery');
      await overlay.getByRole('button', { name: 'Continue' }).click();
      await expect(notice).toHaveCount(0);

      await addRelativeOf(page, 'You', 'sibling');
      await describe(page, { name: 'Bea', gender: 'Woman', sex: 'Female' });
      await panel(page).getByRole('textbox', { name: NICKNAME }).fill('Bee');
      await submitPanel(page, 'Save');
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

// --- The stage's own words, scenario by scenario ------------------------------

/**
 * Connecting and disconnecting, in the stage's own words: the toolbar's
 * three tools, the hint under each, the refusal that would leave someone
 * outside the family, the menu that asks how two people are related, and the
 * confirmation that removes a connection. The family is the one
 * `connectAndDisconnect` draws.
 */
function wordingConnectAndDisconnect(): ScenarioDefinition {
  const words = [
    'pointerTool',
    'connectTool',
    'disconnectTool',
    'connectHint',
    'disconnectHint',
    'disconnectWouldCutOff',
    'connectQuestion',
    'connectParent',
    'connectPartners',
    'disconnectConfirmTitle',
    'disconnectConfirmDescription',
    'you',
  ] as const;
  const { synth, fp, person, relate } = scaffold({
    wording: ownWords(...words),
  });
  person('ego', { name: 'Ella', gender: 'woman', sex: 'female', isEgo: true });
  person('mum', { name: 'Rachel', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Tom', gender: 'man', sex: 'male' });
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('mum', 'dad', 'partner');

  return {
    id: 'wording-connect-and-disconnect',
    covers: coversWords(...words.filter((word) => word !== 'you')),
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      const hint = page.getByTestId('pedigree-connect-hint');
      const tom = member(page, 'Tom');
      const rachel = member(page, 'Rachel');

      // The three tools are named in the stage's own words.
      for (const [tool, word, supplied] of [
        ['pointer', 'pointerTool', 'Add and edit'],
        ['connect', 'connectTool', 'Connect'],
        ['disconnect', 'disconnectTool', 'Disconnect'],
      ] as const) {
        await expect(
          page.getByTestId(`pedigree-tool-${tool}`),
        ).toHaveAccessibleName(plainWord(word));
        await expect(
          page.getByRole('button', { name: supplied, exact: true }),
        ).toHaveCount(0);
      }

      // The partnership is Tom's only connection to Ella.
      await page.getByTestId('pedigree-tool-disconnect').click();
      await expect(hint).toHaveText(plainWord('disconnectHint'));
      await tom.click();
      await rachel.click();
      await expect(hint).toHaveText(
        'Splitting would strand 1 person: Tom - matrix check',
      );
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.keyboard.press('Escape');

      await page.getByTestId('pedigree-tool-connect').click();
      await tom.click();
      await expect(hint).toHaveText(plainWord('connectHint'));
      // The participant is shown by the stage's own word for them.
      await expect(member(page, 'You')).toHaveText(OWN_YOU);
      await expect(page.getByText('You', { exact: true })).toHaveCount(0);
      await member(page, 'You').click();
      const menu = page.getByRole('menu');
      await expect(
        menu.getByText('Join you with Tom how - matrix check'),
      ).toBeVisible();
      await expect(
        menu.getByRole('menuitem', {
          name: 'You and Tom together - matrix check',
        }),
      ).toBeVisible();
      await expect(
        menu.getByRole('menuitem', {
          name: 'You and Tom apart - matrix check',
        }),
      ).toBeVisible();
      await menu
        .getByRole('menuitem', { name: 'Tom parents you - matrix check' })
        .click();
      // The second step is headed by the same words.
      await expect(
        menu.getByText('Tom parents you - matrix check'),
      ).toBeVisible();
      await page.getByRole('menuitem', { name: 'Adoptive parent' }).click();
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect
        .poll(async () =>
          linksBetween(await networkOf(ctx), 'dad', 'ego').map(
            (edge) => edge[ATTR][fp.kind],
          ),
        )
        .toEqual([['adoptive']]);

      // Now the partnership can go, leaving both people.
      await page.getByTestId('pedigree-tool-disconnect').click();
      await tom.click();
      await rachel.click();
      const dialog = page.getByRole('dialog', {
        name: 'Cut Tom off from Rachel - matrix check',
      });
      await expect(
        dialog.getByText(plainWord('disconnectConfirmDescription')),
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Delete' }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => linksBetween(await networkOf(ctx), 'dad', 'mum'))
        .toHaveLength(0);

      // As former partners, they are connected again.
      await page.getByTestId('pedigree-tool-connect').click();
      await tom.click();
      await rachel.click();
      await page
        .getByRole('menuitem', { name: 'Tom and Rachel apart - matrix check' })
        .click();
      await expect
        .poll(async () =>
          linksBetween(await networkOf(ctx), 'dad', 'mum').map((edge) => [
            edge[ATTR][fp.kind],
            edge[ATTR][fp.currentPartner],
          ]),
        )
        .toEqual([[['partner'], false]]);

      // None of the words Network Canvas supplies is shown.
      for (const supplied of [
        'Select a person, then select another to connect them.',
        'Select a person, then select someone they are connected to, to remove that connection.',
      ]) {
        await expect(page.getByText(supplied, { exact: true })).toHaveCount(0);
      }
    },
  };
}

/**
 * The connect menu's reasons, in the stage's own words: a person's own
 * ancestor cannot become their child, and a child with someone recorded as
 * having carried them cannot be given a second carrier. The choices that
 * carry are named in the stage's own words too.
 */
function wordingConnectReasons(): ScenarioDefinition {
  const words = [
    'connectParent',
    'unavailableAncestor',
    'parentKindCarrier',
    'unavailableCarrierChoice',
    'you',
  ] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', { name: 'Ella', gender: 'woman', sex: 'female', isEgo: true });
  person('mum', { name: 'Rachel', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Tom', gender: 'man', sex: 'male' });
  person('gran', { name: 'Joan', gender: 'woman', sex: 'female' });
  person('pat', { name: 'Pat', gender: 'woman', sex: 'female' });
  relate('mum', 'dad', 'partner');
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('dad', 'ego', 'biological');
  relate('gran', 'mum', 'biological', { carrier: true });
  relate('mum', 'pat', 'partner');

  return {
    id: 'wording-connect-reasons',
    covers: coversWords(...words.filter((word) => word !== 'you')),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await page.getByTestId('pedigree-tool-connect').click();

      // Joan is Ella's grandmother: she can be her parent, but Ella cannot be
      // hers, and the menu says why.
      await member(page, 'Joan').click();
      await member(page, 'You').click();
      const menu = page.getByRole('menu');
      await expect(
        menu.getByRole('menuitem', { name: 'Joan parents you - matrix check' }),
      ).toBeEnabled();
      const descendant = menu.getByRole('menuitem', {
        name: 'You parent Joan - matrix check',
      });
      await expect(descendant).toBeDisabled();
      await expect(
        menu.getByText('You cannot parent Joan - matrix check'),
      ).toBeVisible();
      await expect(descendant).toHaveAccessibleDescription(
        'You cannot parent Joan - matrix check',
      );
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);

      // Pat could be a parent of Ella, but Rachel is recorded as having
      // carried her, so each choice that carries is unavailable, naming
      // Rachel once.
      await page.getByTestId('pedigree-tool-connect').click();
      await member(page, 'Pat').click();
      await member(page, 'You').click();
      await menu
        .getByRole('menuitem', { name: 'Pat parents you - matrix check' })
        .click();
      const carrying = menu.getByRole('menuitem', {
        name: /who carried - matrix check$/,
      });
      await expect(carrying).toHaveCount(2);
      // A surrogate always carries, so is unavailable for the same reason.
      const surrogate = menu.getByRole('menuitem', { name: 'Surrogate' });
      for (const choice of [...(await carrying.all()), surrogate]) {
        await expect(choice).toBeDisabled();
        await expect(choice).toHaveAccessibleDescription(
          'Rachel carried you already - matrix check',
        );
      }
      await expect(
        menu.getByRole('menuitem', {
          name: 'Adoptive parent who carried - matrix check',
        }),
      ).toBeVisible();
      await expect(
        menu.getByText('Rachel carried you already - matrix check'),
      ).toHaveCount(1);
      await expectAbsent(
        page,
        'Adoptive parent (carried the pregnancy)',
        '“Rachel” is recorded as having carried you, and only one person carries a pregnancy.',
      );
    },
  };
}

async function expectAbsent(page: Page, ...supplied: readonly string[]) {
  for (const text of supplied) {
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
}

/**
 * How the stage's own words name the family and head the side panel. The
 * kinship words name the unnamed relatives (and are what is saved for them on
 * leaving), the participant is called by the stage's word for them, each
 * kind of panel is headed by the title written for it, and the panel asks its
 * own questions in the stage's words: gender identity, sex assigned at
 * birth, what is still missing, and a don't know answer about relatives.
 */
function wordingPeopleAndPanel(): ScenarioDefinition {
  const words = [
    'you',
    'relativeTerm',
    'panelTitle',
    'save',
    'genderIdentityLabel',
    'sexAssignedAtBirthLabel',
    'missingDetailsList',
    'dontKnow',
  ] as const;
  const { synth, fp, person, relate, parents } = scaffold({
    framing: 'gendered',
    completeness: { scope: 'firstDegree', enforcement: 'recommended' },
    wording: ownWords(...words),
  });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { gender: 'woman', sex: 'female' });
  person('dad', {});
  person('sister', { gender: 'woman', sex: 'female' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');
  parents('mum', 'dad', 'sister');

  return {
    id: 'wording-people-and-panel',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      // The unnamed relatives are named by the stage's own kinship words, the
      // participant by the stage's word for them.
      const mother = 'Mother term - matrix check';
      await expect(member(page, mother)).toBeVisible();
      await expect(member(page, 'Sister term - matrix check')).toBeVisible();
      await expect(member(page, 'You')).toHaveText(OWN_YOU);
      await expectAbsent(page, 'Mother', 'Sister', 'You');

      // Each panel is headed by the title written for it.
      const title = (text: string) =>
        panel(page).getByRole('heading', { name: text, exact: true });
      const cancel = async () => {
        await panel(page)
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await expect(panel(page)).toHaveCount(0);
      };
      await addRelativeOf(page, 'You', 'parent');
      await expect(title('New parent for you - matrix check')).toBeVisible();
      await cancel();
      await addRelativeOf(page, 'You', 'sibling');
      await expect(title('New sibling for you - matrix check')).toBeVisible();
      await cancel();
      await addRelativeOf(page, 'You', 'partner');
      await expect(title('New partner for you - matrix check')).toBeVisible();
      await cancel();
      await addRelativeOf(page, 'You', 'child');
      await expect(title('New child for you - matrix check')).toBeVisible();
      await cancel();
      await addRelativeOf(page, mother, 'parent');
      await expect(
        title('New parent for Mother term - matrix check - matrix check'),
      ).toBeVisible();
      await cancel();
      await addRelativeOf(page, mother, 'sibling');
      await expect(
        title('New sibling for Mother term - matrix check - matrix check'),
      ).toBeVisible();
      await cancel();
      await addRelativeOf(page, mother, 'partner');
      await expect(
        title('New partner for Mother term - matrix check - matrix check'),
      ).toBeVisible();
      await cancel();
      await addRelativeOf(page, mother, 'child');
      await expect(
        title('New child for Mother term - matrix check - matrix check'),
      ).toBeVisible();
      await cancel();

      // The participant's own details, and the questions about their
      // relatives, are in the stage's words; the button that saves them is
      // too.
      await member(page, 'You').click();
      await expect(title('Edit you - matrix check')).toBeVisible();
      await expect(
        panel(page).getByRole('radiogroup', {
          name: /^Gender identity wording - matrix check/,
        }),
      ).toBeVisible();
      await expect(
        panel(page).getByRole('radiogroup', {
          name: /^Sex at birth wording - matrix check/,
        }),
      ).toBeVisible();
      await expect(
        panel(page).getByRole('button', {
          name: plainWord('save'),
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        panel(page).getByRole('button', { name: 'Save', exact: true }),
      ).toHaveCount(0);
      // The participant has no children recorded, so is asked about them.
      await expect(
        panel(page).getByRole('radio', {
          name: plainWord('dontKnow'),
          exact: true,
        }),
      ).toBeVisible();
      await cancel();

      await member(page, mother).click();
      await expect(
        title('Edit Mother term - matrix check - matrix check'),
      ).toBeVisible();
      await cancel();

      // What is still missing is listed with the stage's own names for the
      // questions.
      await member(
        page,
        'Relative term - matrix check, some details missing',
      ).click();
      await expect(panel(page).getByRole('status')).toContainText(
        'Details to add (Gender identity wording - matrix check and Sex at birth wording - matrix check) - matrix check',
      );
      await cancel();

      // Leaving saves the stage's own kinship words for the unnamed.
      await interviewLeave(ctx);
      const network = await networkOf(ctx);
      expect(nodeNamed(network, fp.name, mother)).toBeDefined();
      expect(
        nodeNamed(network, fp.name, 'Sister term - matrix check'),
      ).toBeDefined();
      expect(nodeNamed(network, fp.name, OWN_YOU)).toBeUndefined();
    },
  };
}

/** Leaves the pedigree, going past the tracker's list when it opens one. */
async function interviewLeave({ page, interview }: ScenarioContext) {
  await interview.nextButton.click();
  await expect(
    page
      .getByRole('heading', { name: AFTER_TITLE, exact: true })
      .or(trackerList(page)),
  ).toBeVisible();
  if (await trackerList(page).isVisible()) await interview.nextButton.click();
  await expect(
    page.getByRole('heading', { name: AFTER_TITLE, exact: true }),
  ).toBeVisible();
}

/**
 * Two sisters told apart by their partners, one of them a former partner:
 * each is named through the setting for a partner, in the stage's words.
 */
function wordingGeneratedLabelsPartners(): ScenarioDefinition {
  const words = ['relativeTerm', 'generatedLabelOf'] as const;
  const { synth, fp, person, relate, parents } = scaffold({
    framing: 'gendered',
    wording: ownWords(...words),
  });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { gender: 'woman', sex: 'female' });
  person('dad', { gender: 'man', sex: 'male' });
  person('sis1', { gender: 'woman', sex: 'female' });
  person('sis2', { gender: 'woman', sex: 'female' });
  person('tom', { name: 'Tom', gender: 'man', sex: 'male' });
  person('sam', { name: 'Sam', gender: 'man', sex: 'male' });
  relate('mum', 'dad', 'partner');
  parents('mum', 'dad', 'ego');
  parents('mum', 'dad', 'sis1');
  parents('mum', 'dad', 'sis2');
  relate('sis1', 'tom', 'partner', { current: false });
  relate('sis2', 'sam', 'partner');

  return {
    id: 'wording-generated-labels-partners',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async (ctx) => {
      const { page } = ctx;
      const former = 'Sister term - matrix check ex of Tom - matrix check';
      const current =
        'Sister term - matrix check partnered with Sam - matrix check';
      await expect(member(page, former)).toBeVisible();
      await expect(member(page, current)).toBeVisible();
      await expectAbsent(
        page,
        'Sister (former partner of Tom)',
        'Sister (partner of Sam)',
      );

      // The same labels are saved when the participant leaves.
      await leaveForward(ctx);
      const network = await networkOf(ctx);
      expect(nodeNamed(network, fp.name, former)).toBeDefined();
      expect(nodeNamed(network, fp.name, current)).toBeDefined();
    },
  };
}

/**
 * A great-grandfather told apart from another through the grandparent whose
 * parent he is, and a grandfather past the kinship words described through
 * the grandparent he is the parent of.
 */
function wordingGeneratedLabelsAncestors(): ScenarioDefinition {
  const words = ['relativeTerm', 'generatedLabelOf'] as const;
  const { synth, person, relate } = scaffold({
    framing: 'gendered',
    wording: ownWords(...words),
  });
  person('ego', { gender: 'woman', sex: 'female', isEgo: true });
  person('ruth', { name: 'Ruth', gender: 'woman', sex: 'female' });
  person('miriam', { name: 'Miriam', gender: 'woman', sex: 'female' });
  person('isaac', { name: 'Isaac', gender: 'man', sex: 'male' });
  person('miriamsDad', { gender: 'man', sex: 'male' });
  person('isaacsDad', { gender: 'man', sex: 'male' });
  person('isaacsGrandad', { gender: 'man', sex: 'male' });
  relate('ruth', 'ego', 'biological', { carrier: true });
  relate('miriam', 'ruth', 'biological', { carrier: true });
  relate('isaac', 'ruth', 'biological');
  relate('miriamsDad', 'miriam', 'biological');
  relate('isaacsDad', 'isaac', 'biological');
  relate('isaacsGrandad', 'isaacsDad', 'biological');

  return {
    id: 'wording-generated-labels-ancestors',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await expect(
        member(
          page,
          'Great-grandfather term - matrix check parenting Miriam - matrix check',
        ),
      ).toBeVisible();
      await expect(
        member(
          page,
          'Great-grandfather term - matrix check parenting Isaac - matrix check',
        ),
      ).toBeVisible();
      await expect(
        member(
          page,
          'Isaac owns Grandfather term - matrix check - matrix check',
        ),
      ).toBeVisible();
    },
  };
}

/**
 * Half-sisters told apart by the parent each does not share with the
 * participant, each named as that parent's child.
 */
function wordingGeneratedLabelsChildren(): ScenarioDefinition {
  const words = ['relativeTerm', 'generatedLabelOf'] as const;
  const { synth, person, relate } = scaffold({
    framing: 'gendered',
    wording: ownWords(...words),
  });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { gender: 'woman', sex: 'female' });
  person('dad', { gender: 'man', sex: 'male' });
  person('ana', { name: 'Ana', gender: 'woman', sex: 'female' });
  person('bea', { name: 'Bea', gender: 'woman', sex: 'female' });
  person('half1', { gender: 'woman', sex: 'female' });
  person('half2', { gender: 'woman', sex: 'female' });
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('dad', 'ego', 'biological');
  relate('ana', 'half1', 'biological', { carrier: true });
  relate('dad', 'half1', 'biological');
  relate('bea', 'half2', 'biological', { carrier: true });
  relate('dad', 'half2', 'biological');

  return {
    id: 'wording-generated-labels-children',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await expect(
        member(
          page,
          'Half-sister term - matrix check child of Ana - matrix check',
        ),
      ).toBeVisible();
      await expect(
        member(
          page,
          'Half-sister term - matrix check child of Bea - matrix check',
        ),
      ).toBeVisible();
    },
  };
}

/**
 * The choice of words the stage leaves to the participant, in the stage's own
 * words: the title and description of the choice, the name of the control
 * that opens it, and the kinship words each option lists. What a sibling
 * with no recorded parents shares is told in the words of the framing chosen.
 */
function wordingFramingChoice(): ScenarioDefinition {
  const words = [
    'framingChoiceTitle',
    'framingChoiceDescription',
    'framingControlLabel',
    'relativeTerm',
    'placeholderParentsNote',
    'sharedParentCountLabel',
    'sharedParentCountBoth',
    'sharedParentEggOnly',
  ] as const;
  const { synth, person } = scaffold({
    framing: 'participantPreference',
    before: 'information',
    wording: ownWords(...words),
  });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });

  return {
    id: 'wording-framing-choice',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page, interview }) => {
      await interview.next();
      const title = page.getByText(plainWord('framingChoiceTitle'), {
        exact: true,
      });
      await expect(title).toBeVisible();
      await expect(
        page.getByText(plainWord('framingChoiceDescription'), { exact: true }),
      ).toBeVisible();
      await expectAbsent(
        page,
        'How should we describe your family?',
        'Choose the words you would like us to use for the people in your family. You can change this at any time.',
      );
      const control = page.getByTestId('pedigree-framing');
      await expect(control).toHaveAccessibleName(
        plainWord('framingControlLabel'),
      );
      await expect(
        page.getByRole('button', { name: 'Wording', exact: true }),
      ).toHaveCount(0);

      // Each option lists the kinship words in the stage's own words.
      const gendered = page.getByRole('option', {
        name: 'Mother term - matrix check, Father term - matrix check, Sister term - matrix check, Brother term - matrix check',
      });
      const gamete = page.getByRole('option', {
        name: 'Egg parent term - matrix check, Sperm parent term - matrix check, Sibling term - matrix check',
      });
      await expect(gendered).toBeVisible();
      await expect(gamete).toBeVisible();

      // A sibling of someone with no recorded parents shares both of two
      // unnamed parents or only one, told in the words of the framing.
      const sharedParents = panel(page).getByRole('radiogroup', {
        name: /^Parents shared with you - matrix check/,
      });
      await gamete.click();
      await expect(title).toHaveCount(0);
      await addRelativeOf(page, 'You', 'sibling');
      await expect(sharedParents).toBeVisible();
      await expect(
        panel(page).getByText('Gamete placeholders note - matrix check'),
      ).toBeVisible();
      await expect(
        sharedParents.getByRole('radio', {
          name: plainWord('sharedParentCountBoth'),
          exact: true,
        }),
      ).toBeChecked();
      await expect(
        sharedParents.getByRole('radio', {
          name: 'Egg side only - matrix check',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        sharedParents.getByRole('radio', {
          name: 'Sperm side only - matrix check',
          exact: true,
        }),
      ).toBeVisible();
      await panel(page)
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      await expect(panel(page)).toHaveCount(0);

      await control.click();
      await gendered.click();
      await addRelativeOf(page, 'You', 'sibling');
      await expect(
        panel(page).getByText('Gendered placeholders note - matrix check'),
      ).toBeVisible();
      await expect(
        sharedParents.getByRole('radio', {
          name: 'Mother side only - matrix check',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        sharedParents.getByRole('radio', {
          name: 'Father side only - matrix check',
          exact: true,
        }),
      ).toBeVisible();
      await expectAbsent(
        page,
        'Both parents',
        'Only the biological mother',
        'Only the egg parent',
      );
    },
  };
}

/**
 * A third parent added to someone whose genetic parents are recorded and one
 * of whom carried them, in the stage's own words: the kind of parent, whose
 * partner they are, which siblings they also parent, and the reasons the
 * choices that are unavailable are. The question of who carried the
 * pregnancy is told for the one sibling it is about, and for several.
 */
function wordingAddParent(): ScenarioDefinition {
  const words = [
    'parentKindLabel',
    'parentPartnerLabel',
    'alsoParentOfLabel',
    'parentCarriedLabel',
    'carriedSiblingsPregnancyLabel',
    'unavailableGeneticParentsFull',
    'unavailableCarrierRecorded',
    'unavailableCannotCarry',
  ] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Rob', gender: 'man', sex: 'male' });
  person('bea', { name: 'Bea', gender: 'woman', sex: 'female' });
  person('bo', { name: 'Bo', gender: 'man', sex: 'male' });
  relate('mum', 'dad', 'partner');
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('dad', 'ego', 'biological');
  for (const sibling of ['bea', 'bo']) {
    relate('mum', sibling, 'biological');
    relate('dad', sibling, 'biological');
  }

  return {
    id: 'wording-add-parent',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await addRelativeOf(page, 'You', 'parent');
      const form = panel(page);
      const kind = form.getByRole('radiogroup', {
        name: /^Kind of new parent - matrix check/,
      });
      await expect(kind).toBeVisible();
      await expect(
        form.getByRole('radiogroup', {
          name: /^Partner of a parent - matrix check/,
        }),
      ).toBeVisible();
      await expect(
        form.getByRole('group', {
          name: /^Also parent of these - matrix check/,
        }),
      ).toBeVisible();

      // Julie and Rob are recorded as Ari's genetic parents, and Julie as
      // having carried them, so the choices that need otherwise say why.
      await expect(
        form.getByText(
          /^You have (Julie and Rob|Rob and Julie) as genetic parents - matrix check/,
        ),
      ).toBeVisible();
      await expect(
        form.getByText('Julie carried you on record - matrix check').first(),
      ).toBeVisible();

      // A new parent recorded as male at birth could not have carried them.
      await form
        .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
        .getByRole('radio', { name: 'Male', exact: true })
        .click();
      await expect(
        form.getByText('This person cannot carry as Male - matrix check'),
      ).toBeVisible();

      // One who could have is asked, but Julie is recorded as having, so the
      // question is unavailable.
      await form
        .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
        .getByRole('radio', { name: 'Female', exact: true })
        .click();
      const unavailable = form.getByRole('radiogroup', {
        name: /^Did the new parent carry them - matrix check/,
      });
      await expect(unavailable).toBeVisible();
      await expect(
        unavailable.getByRole('radio', { name: 'Yes', exact: true }),
      ).toBeDisabled();

      // A step or social parent of Ari and both siblings may have carried the
      // siblings, who have nobody recorded as having carried them.
      await kind
        .getByRole('radio', { name: 'Step or social parent', exact: true })
        .click();
      await expect(unavailable).toHaveCount(0);
      await expect(
        form.getByRole('radiogroup', {
          name: /^Did this parent carry 2 of them - matrix check/,
        }),
      ).toBeVisible();
      await form.getByRole('checkbox', { name: 'Bo', exact: true }).uncheck();
      await expect(
        form.getByRole('radiogroup', {
          name: /^Did this parent carry Bea - matrix check/,
        }),
      ).toBeVisible();
      await expectAbsent(
        page,
        'What kind of parent are they?',
        'Are they the partner of another parent?',
        'Are they also the parent of…',
      );
    },
  };
}

/**
 * A child added to someone with a partner of the same sex, in the stage's
 * own words: who the other parent is, what kind of child they are, which of
 * the two is the genetic parent and why both cannot be, and who carried the
 * pregnancy. A parent added to someone whose one genetic parent is of the
 * same sex says why the new parent cannot be genetic.
 */
function wordingAddChild(): ScenarioDefinition {
  const words = [
    'unavailableSameSexGeneticParent',
    'unavailableBothSameSex',
    'otherParentLabel',
    'otherParentNone',
    'otherParentUnknown',
    'childKindLabel',
    'childKindAdoptive',
    'childKindBiological',
    'childKindDonor',
    'childKindSocial',
    'childKindSurrogate',
    'biologicalParentLabel',
    'biologicalParentHint',
    'biologicalParentBoth',
    'carrierLabel',
    'carrierUnknown',
  ] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', { name: 'Ari', gender: 'woman', sex: 'female', isEgo: true });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  person('pam', { name: 'Pam', gender: 'woman', sex: 'female' });
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('ego', 'pam', 'partner');

  return {
    id: 'wording-add-child',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      const cancel = async () => {
        await panel(page)
          .getByRole('button', { name: 'Cancel', exact: true })
          .click();
        await expect(panel(page)).toHaveCount(0);
      };

      // Julie is Ari's one genetic parent so far; another of her sex cannot
      // be a second.
      await addRelativeOf(page, 'You', 'parent');
      await panel(page)
        .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
        .getByRole('radio', { name: 'Female', exact: true })
        .click();
      await expect(
        panel(page).getByText(
          'Julie shares a sex Female with another parent of yours - matrix check',
        ),
      ).toBeVisible();
      await cancel();

      await addRelativeOf(page, 'You', 'child');
      const form = panel(page);
      const otherParent = form.getByRole('radiogroup', {
        name: /^The other parent is - matrix check/,
      });
      await expect(otherParent).toBeVisible();
      await expect(
        otherParent.getByRole('radio', { name: 'Pam', exact: true }),
      ).toBeChecked();
      for (const word of ['otherParentUnknown', 'otherParentNone'] as const) {
        await expect(
          otherParent.getByRole('radio', {
            name: plainWord(word),
            exact: true,
          }),
        ).toBeVisible();
      }
      const kind = form.getByRole('radiogroup', {
        name: /^Kind of child - matrix check/,
      });
      await expect(kind).toBeVisible();
      for (const word of [
        'childKindBiological',
        'childKindAdoptive',
        'childKindSocial',
        'childKindDonor',
        'childKindSurrogate',
      ] as const) {
        await expect(
          kind.getByRole('radio', { name: plainWord(word), exact: true }),
        ).toBeVisible();
      }

      // Both of them cannot be the genetic parents, and the form says why.
      const genetic = form.getByRole('radiogroup', {
        name: /^Which one is genetic - matrix check/,
      });
      await expect(genetic).toBeVisible();
      await expect(
        form.getByText('Genetic parents only - matrix check'),
      ).toBeVisible();
      await expect(
        form.getByText('You and Pam both Female - matrix check'),
      ).toBeVisible();
      await expect(
        genetic.getByRole('radio', {
          name: 'You and Pam both - matrix check',
          exact: true,
        }),
      ).toBeDisabled();

      const carrier = form.getByRole('radiogroup', {
        name: /^Carrier of the pregnancy - matrix check/,
      });
      await expect(carrier).toBeVisible();
      await expect(
        carrier.getByRole('radio', {
          name: plainWord('carrierUnknown'),
          exact: true,
        }),
      ).toBeVisible();
      await expectAbsent(
        page,
        'Who is the child’s other parent?',
        'Is this child…',
        'Who is the child’s biological parent?',
        'Who carried the pregnancy?',
      );
    },
  };
}

/**
 * Editing someone already in the family, in the stage's own words: how each
 * of their parents is related to them and who carried them, whether a
 * partnership is current, their twins and whether each pair is identical, and
 * the reasons a sex at birth, or a kind of parent, is unavailable.
 */
function wordingEditPerson(): ScenarioDefinition {
  const words = [
    'parentLinkKindLabel',
    'parentCarriedLabel',
    'stillTogetherLabel',
    'twinsLabel',
    'twinsHint',
    'twinZygosityLabel',
    'zygosityFraternal',
    'zygosityIdentical',
    'zygosityUnknown',
    'unavailableIdenticalTwin',
    'unavailableCarried',
    'unavailableSameSexGeneticParent',
    'unavailableGeneticParentsFull',
    'unavailableCarrierRecorded',
  ] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Rob', gender: 'man', sex: 'male' });
  person('pam', { name: 'Pam', gender: 'woman', sex: 'female' });
  person('lee', { name: 'Lee', gender: 'man', sex: 'male' });
  person('bea', { name: 'Bea', gender: 'woman', sex: 'female' });
  person('cal', { name: 'Cal', gender: 'man', sex: 'male' });
  person('dan', { name: 'Dan', gender: 'man', sex: 'male' });
  relate('mum', 'dad', 'partner');
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('dad', 'ego', 'biological');
  relate('pam', 'ego', 'social');
  relate('ego', 'lee', 'partner');
  relate('mum', 'bea', 'biological', { carrier: true });
  relate('dad', 'bea', 'biological');
  relate('mum', 'cal', 'biological', { carrier: true });
  relate('dan', 'cal', 'biological');

  return {
    id: 'wording-edit-person',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      const form = panel(page);
      const cancel = async () => {
        await form.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(form).toHaveCount(0);
      };

      await member(page, 'You').click();
      // How each parent is related to Ari, and who of them carried Ari.
      for (const parent of ['Julie', 'Rob', 'Pam']) {
        await expect(
          form.getByRole('radiogroup', {
            name: new RegExp(`^${parent} is your kind - matrix check`),
          }),
        ).toBeVisible();
      }
      await expect(
        form.getByRole('radiogroup', {
          name: /^Did Julie carry them - matrix check/,
        }),
      ).toBeVisible();
      // Julie carried Ari, so Pam cannot have, and the form says so, and that
      // Ari has two genetic parents already.
      const pamCarried = form.getByRole('radiogroup', {
        name: /^Did Pam carry them - matrix check/,
      });
      await expect(pamCarried).toBeVisible();
      await expect(
        pamCarried.getByRole('radio', { name: 'Yes', exact: true }),
      ).toBeDisabled();
      await expect(
        form.getByText('Julie carried you on record - matrix check').first(),
      ).toBeVisible();
      await expect(
        form
          .getByText(
            /^You have (Julie and Rob|Rob and Julie) as genetic parents - matrix check/,
          )
          .first(),
      ).toBeVisible();
      await expect(
        form.getByRole('radiogroup', {
          name: /^Still with Lee, you - matrix check/,
        }),
      ).toBeVisible();

      // Bea shares Ari's parents, so may be an identical twin; Cal shares
      // only Julie, so may not.
      await expect(
        form.getByText('Multiple births count - matrix check'),
      ).toBeVisible();
      const twins = form.getByRole('group', {
        name: /^Your twins are - matrix check/,
      });
      await twins.getByRole('checkbox', { name: 'Bea', exact: true }).check();
      await twins.getByRole('checkbox', { name: 'Cal', exact: true }).check();
      const withBea = form.getByRole('radiogroup', {
        name: /^You and Bea identical - matrix check/,
      });
      for (const word of [
        'zygosityIdentical',
        'zygosityFraternal',
        'zygosityUnknown',
      ] as const) {
        await expect(
          withBea.getByRole('radio', { name: plainWord(word), exact: true }),
        ).toBeEnabled();
      }
      const withCal = form.getByRole('radiogroup', {
        name: /^You and Cal identical - matrix check/,
      });
      await expect(
        withCal.getByRole('radio', {
          name: plainWord('zygosityIdentical'),
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        form.getByText('You and Cal cannot be identical - matrix check'),
      ).toBeVisible();
      await cancel();

      // A partnership's question is told for the person it is asked of.
      await member(page, 'Julie').click();
      await expect(
        form.getByRole('radiogroup', {
          name: /^Still with Rob - matrix check/,
        }),
      ).toBeVisible();
      // Julie carried Ari, so she cannot be recorded as male at birth, and
      // would not be of a different sex to Rob.
      await expect(
        form.getByText('Carried you so not Male - matrix check'),
      ).toBeVisible();
      await expect(
        form.getByText(
          'Rob shares a sex Male with another parent of yours - matrix check',
        ),
      ).toBeVisible();
      await cancel();

      await member(page, 'Rob').click();
      await expect(
        form.getByText(
          'Julie shares a sex Female with another parent of yours - matrix check',
        ),
      ).toBeVisible();
      await cancel();

      await member(page, 'Lee').click();
      await expect(
        form.getByRole('radiogroup', {
          name: /^Still with you - matrix check/,
        }),
      ).toBeVisible();
      await cancel();
    },
  };
}

/**
 * A sibling added to someone with two recorded parents, in the stage's own
 * words: which parents they share, what kind of sibling they are, who carried
 * the pregnancy, and whether they are a twin — with the answer that identical
 * twins are unavailable, and why, once the sibling would not share all of the
 * participant's genetic parents.
 */
function wordingAddSibling(): ScenarioDefinition {
  const words = [
    'sharedParentCountLabel',
    'siblingKindLabel',
    'childKindAdoptive',
    'childKindBiological',
    'childKindSocial',
    'carrierLabel',
    'carrierUnknown',
    'siblingTwinLabel',
    'siblingTwinHint',
    'siblingTwinNo',
    'siblingTwinIdentical',
    'siblingTwinFraternal',
    'siblingTwinUnknown',
    'unavailableIdenticalTwinNew',
  ] as const;
  const scaffolded = scaffold({ wording: ownWords(...words) });
  const { synth } = scaffolded;
  seedDescribedParents(scaffolded);

  return {
    id: 'wording-add-sibling',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await addRelativeOf(page, 'You', 'sibling');
      const form = panel(page);
      const shared = form.getByRole('group', {
        name: /^Parents shared with you - matrix check/,
      });
      await expect(shared).toBeVisible();
      await expect(
        shared.getByRole('checkbox', { name: 'Rob', exact: true }),
      ).toBeChecked();

      const kind = form.getByRole('radiogroup', {
        name: /^Kind of sibling - matrix check/,
      });
      await expect(kind).toBeVisible();
      for (const word of [
        'childKindBiological',
        'childKindAdoptive',
        'childKindSocial',
      ] as const) {
        await expect(
          kind.getByRole('radio', { name: plainWord(word), exact: true }),
        ).toBeVisible();
      }

      const carrier = form.getByRole('radiogroup', {
        name: /^Carrier of the pregnancy - matrix check/,
      });
      await expect(carrier).toBeVisible();
      await expect(
        carrier.getByRole('radio', {
          name: plainWord('carrierUnknown'),
          exact: true,
        }),
      ).toBeVisible();

      // Twins: asked in the stage's words, with each answer worded as written.
      const twin = form.getByRole('radiogroup', {
        name: /^Is this your twin - matrix check/,
      });
      await expect(twin).toBeVisible();
      await expect(
        form.getByText('Triplets count as twins - matrix check'),
      ).toBeVisible();
      for (const word of [
        'siblingTwinNo',
        'siblingTwinIdentical',
        'siblingTwinFraternal',
        'siblingTwinUnknown',
      ] as const) {
        await expect(
          twin.getByRole('radio', { name: plainWord(word), exact: true }),
        ).toBeVisible();
      }
      // Sharing both parents, the sibling may be an identical twin.
      const identical = twin.getByRole('radio', {
        name: plainWord('siblingTwinIdentical'),
        exact: true,
      });
      await expect(identical).toBeEnabled();
      await expect(
        form.getByText('New sibling cannot be identical to you - matrix check'),
      ).toHaveCount(0);

      // Sharing one, they may not, and the form says why.
      await shared
        .getByRole('checkbox', { name: 'Rob', exact: true })
        .uncheck();
      await expect(identical).toBeDisabled();
      await expect(
        form.getByText('New sibling cannot be identical to you - matrix check'),
      ).toBeVisible();
      await expectAbsent(
        page,
        'Which parents do they share with you?',
        'To the parents they share, are they…',
        'Are they your twin?',
        'Answer yes for triplets and other multiple births too.',
      );
    },
  };
}

/**
 * Two mothers of the participant, one a biological mother and one a step or
 * social parent. A sibling they share is asked which of them is the
 * sibling's biological parent, in the stage's own words.
 */
function wordingSiblingBiologicalParent(): ScenarioDefinition {
  const words = ['siblingBiologicalParentLabel'] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  person('pam', { name: 'Pam', gender: 'woman', sex: 'female' });
  relate('mum', 'pam', 'partner');
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('pam', 'ego', 'social');

  return {
    id: 'wording-sibling-biological-parent',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await addRelativeOf(page, 'You', 'sibling');
      const which = panel(page).getByRole('radiogroup', {
        name: /^Genetic parent of the sibling - matrix check/,
      });
      await expect(which).toBeVisible();
      await expect(
        which.getByRole('radio', { name: 'Julie', exact: true }),
      ).toBeVisible();
      await expect(
        which.getByRole('radio', { name: 'Pam', exact: true }),
      ).toBeVisible();
      await expectAbsent(
        page,
        'Which of them is the sibling’s biological parent?',
      );
    },
  };
}

/**
 * Someone recorded only through the donors who gave an egg and sperm. A
 * sibling who may share either is asked, in the stage's own words, which
 * donors they share.
 */
function wordingSiblingDonors(): ScenarioDefinition {
  const words = ['sharedDonorsLabel'] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('eggDonor', { name: 'Dee', gender: 'woman', sex: 'female' });
  person('spermDonor', { name: 'Don', gender: 'man', sex: 'male' });
  relate('eggDonor', 'ego', 'donor');
  relate('spermDonor', 'ego', 'donor');

  return {
    id: 'wording-sibling-donors',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await addRelativeOf(page, 'You', 'sibling');
      const shared = panel(page).getByRole('group', {
        name: /^Your donors in common - matrix check/,
      });
      await expect(shared).toBeVisible();
      await expect(
        shared.getByRole('checkbox', { name: 'Dee', exact: true }),
      ).toBeVisible();
      await expectAbsent(page, 'Do they share any of your donors?');
    },
  };
}

/**
 * Removing a relative, in the stage's own words: the confirmation names the
 * person, and when others are connected to the participant only through them
 * it names those who go too.
 */
function wordingRemovePerson(): ScenarioDefinition {
  const words = ['removeConfirmTitle', 'removeConfirmDescription'] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', { name: 'Ella', gender: 'woman', sex: 'female', isEgo: true });
  person('mum', { name: 'Rachel', gender: 'woman', sex: 'female' });
  person('dad', { name: 'Tom', gender: 'man', sex: 'male' });
  person('bea', { name: 'Bea', gender: 'woman', sex: 'female' });
  relate('mum', 'ego', 'biological', { carrier: true });
  relate('mum', 'dad', 'partner');
  relate('mum', 'bea', 'biological', { carrier: true });

  return {
    id: 'wording-remove-person',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      // Bea is connected to nobody else, so only she goes.
      await member(page, 'Bea').click();
      await panel(page).getByRole('button', { name: 'Delete' }).click();
      const alone = page.getByRole('dialog', {
        name: 'Delete Bea for good - matrix check',
      });
      await expect(
        alone.getByText('Takes only them - matrix check'),
      ).toBeVisible();
      await alone.getByRole('button', { name: 'Cancel' }).click();
      await expect(alone).toHaveCount(0);

      // Tom is connected to Ella only through Rachel.
      await member(page, 'Rachel').click();
      await panel(page).getByRole('button', { name: 'Delete' }).click();
      const withOthers = page.getByRole('dialog', {
        name: 'Delete Rachel for good - matrix check',
      });
      await expect(
        withOthers.getByText(/^Also takes Tom: 1 other person - matrix check$/),
      ).toBeVisible();
      await withOthers.getByRole('button', { name: 'Cancel' }).click();
      await expect(withOthers).toHaveCount(0);
      await expectAbsent(page, 'Remove Rachel?');
    },
  };
}

/**
 * A half-brother who shares the participant's unknown father and has an
 * unknown mother of his own. Recording a father for him alone would make the
 * shared unknown father give way, leaving him and his mother outside the
 * participant's family, so the change is refused in the stage's own words.
 */
function wordingChangeWouldCutOff(): ScenarioDefinition {
  const words = ['changeWouldCutOff'] as const;
  const { synth, person, relate } = scaffold({ wording: ownWords(...words) });
  person('ego', {
    name: 'Ari',
    gender: 'nonBinary',
    sex: 'intersex',
    isEgo: true,
  });
  person('mum', { name: 'Julie', gender: 'woman', sex: 'female' });
  relate('mum', 'ego', 'biological', { carrier: true });

  return {
    id: 'wording-change-would-cut-off',
    covers: coversWords(...words),
    seedNetwork: true,
    build: () => synth,
    run: async ({ page }) => {
      await addRelativeOf(page, 'You', 'sibling');
      const shared = panel(page).getByRole('group', {
        name: /^Which parents do they share with you/,
      });
      await expect(shared).toBeVisible();
      await shared
        .getByRole('checkbox', { name: 'Julie', exact: true })
        .uncheck();
      await describe(page, { name: 'Hal', gender: 'Man', sex: 'Male' });
      await submitPanel(page, 'Save');
      await expect(member(page, 'Hal')).toBeVisible();
      // Hal shares Ari's unknown father and has an unknown mother of his own.
      await expect(
        member(page, 'Biological father, some details missing'),
      ).toBeVisible();

      // A father recorded for Hal alone would make the unknown father give
      // way, leaving Hal and his mother outside Ari's family.
      await addRelativeOf(page, 'Hal', 'parent');
      await describe(page, { name: 'Al', gender: 'Man', sex: 'Male' });
      await panel(page)
        .getByRole('button', { name: 'Save', exact: true })
        .click();
      await expect(panel(page).getByRole('alert')).toContainText(
        /Change would strand 2 people: .+ - matrix check$/,
      );
      await expect(panel(page)).toBeVisible();
      await expect(member(page, 'Al')).toHaveCount(0);
      await expectAbsent(
        page,
        'This would leave Relative and Relative outside your family tree, because it removes their only connection to you. Connect them to someone else in your family first.',
      );
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
    researcherWording(),
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
    wordingConnectAndDisconnect(),
    wordingConnectReasons(),
    wordingPeopleAndPanel(),
    wordingGeneratedLabelsPartners(),
    wordingGeneratedLabelsAncestors(),
    wordingGeneratedLabelsChildren(),
    wordingFramingChoice(),
    wordingAddParent(),
    wordingAddChild(),
    wordingEditPerson(),
    wordingAddSibling(),
    wordingSiblingBiologicalParent(),
    wordingSiblingDonors(),
    wordingRemovePerson(),
    wordingChangeWouldCutOff(),
  ],
};
