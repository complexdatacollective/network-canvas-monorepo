import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT,
  type FramingSetting,
  type PedigreeCompletenessScope,
  type PedigreeGenderWords,
  type PedigreeRelationshipKind,
  type PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
  type NcEncryptionHeader,
} from '@codaco/shared-consts';

import type { SessionSnapshot, SyncHandler } from '../..';
import { choosePassphraseInPrompter } from '../../storybook-support/passphraseSteps';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';
import {
  createEncryptionHeader,
  type EncryptedBytes,
  encryptValue,
} from '../Anonymisation/encryptionFormat';

const PROMPT =
  'Add the members of your family. Select a person to add their relatives.';

/** The next stage's list of everyone in the family, by the name each was
 * given: the stage after the pedigree, when a story adds it. */
const PEOPLE_PROMPT = 'Everyone in your family, by their saved names.';

/** The question on the form after the pedigree, when a story adds it. */
const NAME_FORM_PROMPT = 'What is this person called?';

/** The researcher's own question, encrypted, when a story adds it. */
const NICKNAME_PROMPT = 'Nickname';

/**
 * What an earlier visit left in an interview protected with a passphrase:
 * the encryption header made when the passphrase was chosen, and names
 * stored encrypted with its key, by person id, each bound to that person.
 */
type EarlierProtection = {
  header: NcEncryptionHeader;
  names: Record<string, EncryptedBytes>;
};

type SeedPerson = {
  id: string;
  name?: string;
  /** The value of one of the gender identity attribute's options. */
  gender?: string;
  sex?: PedigreeSexAssignedAtBirth;
  ego?: boolean;
  /** The nomination prompts (by index) the person is already selected for. */
  nominatedFor?: number[];
  /** Answers already given that the person has no siblings or children, or
   * that the participant doesn't know (needs `completeness`). */
  notRecorded?: string[];
  /** A relationship to the participant already recorded (needs
   * `recordsRelationship`). */
  relationship?: string;
};

type SeedLink = {
  from: string;
  to: string;
  kind: PedigreeRelationshipKind;
  /** Partner links: false for a separated or ended partnership. */
  current?: boolean;
  /** Parent links: this parent carried the pregnancy. */
  carrier?: boolean;
};

export type Family = { people: SeedPerson[]; links: SeedLink[] };

type Completeness = {
  scope: PedigreeCompletenessScope;
  enforcement: 'required' | 'recommended';
};

/**
 * An interview whose pedigree stage opens on a seeded family, between two
 * information screens. With no family, only the participant is shown.
 */
type StoryOptions = {
  family?: Family;
  withFormFields?: boolean;
  completeness?: Completeness;
  framing?: FramingSetting;
  nominationPrompts?: NominationPrompt[];
  /** The person attribute the codebook maps each person's symbol to. */
  shapeBy?: 'genderIdentity' | 'sexAssignedAtBirth';
  /** The researcher's own gender identity options, in place of the six
   * defaults. An option with no `words` takes neutral words. */
  genderIdentities?: GenderIdentities;
  /** Whether the stage asks about gender identity. Defaults to true; when
   * false, the stage binds no gender identity attribute. */
  askGenderIdentity?: boolean;
  /** The codebook's validation of the name attribute. */
  nameValidation?: Record<string, unknown>;
  /** Follows the pedigree with a stage listing everyone in the family by
   * the name each was given. */
  followedByPeopleList?: boolean;
  /** Follows the pedigree with a form asking each person's name again. */
  followedByNameForm?: boolean;
  /** Encrypts the name attribute with the participant's passphrase. */
  encryptedNames?: boolean;
  /** Resumes an interview protected with a passphrase on an earlier visit
   * (needs `encryptedNames`), which has not been entered since. Without
   * it, no passphrase has been chosen yet. */
  protection?: EarlierProtection;
  /** Adds a text field, Nickname, encrypted with the participant's
   * passphrase (the name is not encrypted unless `encryptedNames`). */
  encryptedFormField?: boolean;
  /** Records each person's relationship to the participant. */
  recordsRelationship?: boolean;
};

/** What only the story's shell takes: how the interview is hosted. */
type ShellOptions = {
  /** Files one attribute under the id `__proto__`, which the codebook
   * admits: the name, or the Age field of `withFormFields`. Renamed once
   * the shell has parsed the payload, as SuperJSON refuses the key. */
  protoAttribute?: 'name' | 'age';
  /** Receives the session each time the interview writes it. */
  onSync?: SyncHandler;
};

type GenderIdentities = {
  value: string | number;
  label: string;
  words?: PedigreeGenderWords;
}[];

type NominationPrompt = {
  text: string;
  onlyForSexAssignedAtBirth?: 'female' | 'male';
};

export function buildInterview({
  family,
  withFormFields = false,
  completeness,
  framing,
  nominationPrompts,
  shapeBy = 'genderIdentity',
  genderIdentities,
  askGenderIdentity = true,
  nameValidation,
  followedByPeopleList = false,
  followedByNameForm = false,
  encryptedNames = false,
  protection,
  encryptedFormField = false,
  recordsRelationship = false,
}: StoryOptions) {
  const si = new SyntheticInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the pedigree.' });
  const people = si.addNodeType({ name: 'Person' });
  const stage = si.addStage('FamilyPedigree', {
    subject: { entity: 'node', type: people.id },
    prompt: PROMPT,
    completeness,
    framing,
    nominationPrompts,
    genderIdentities,
    askGenderIdentity,
    nameValidation,
    recordRelationshipToParticipant: recordsRelationship,
  });
  // The researcher's choice of symbol, made in the codebook: circles for
  // women (or female), squares for men (or male), diamonds for anyone else.
  people.setShape({
    default: 'diamond',
    dynamic:
      shapeBy === 'genderIdentity' && stage.genderIdentity !== undefined
        ? {
            variable: stage.genderIdentity,
            type: 'discrete',
            map: [
              { value: 'woman', shape: 'circle' },
              { value: 'man', shape: 'square' },
            ],
          }
        : {
            variable: stage.sexAssignedAtBirth,
            type: 'discrete',
            map: [
              { value: 'female', shape: 'circle' },
              { value: 'male', shape: 'square' },
            ],
          },
  });
  if (withFormFields) {
    stage.addFormField({ component: 'Number', prompt: 'Age' });
    stage.addFormField({
      component: 'Boolean',
      prompt: 'Is this person still living?',
      validation: { required: true },
    });
  }

  if (encryptedFormField) {
    stage.addFormField({ component: 'Text', prompt: NICKNAME_PROMPT });
  }

  for (const person of family?.people ?? []) {
    si.addManualNode(stage.id, stage.personType, person.id, {
      [stage.ego]: person.ego === true,
      ...(person.name ? { [stage.name]: person.name } : {}),
      ...(person.gender && stage.genderIdentity
        ? { [stage.genderIdentity]: [person.gender] }
        : {}),
      ...(person.sex ? { [stage.sexAssignedAtBirth]: [person.sex] } : {}),
      ...(person.notRecorded && stage.relativesNotRecorded
        ? { [stage.relativesNotRecorded]: person.notRecorded }
        : {}),
      ...(person.relationship && stage.relationshipToParticipant
        ? { [stage.relationshipToParticipant]: [person.relationship] }
        : {}),
      ...Object.fromEntries(
        (person.nominatedFor ?? []).flatMap((index) => {
          const attribute = stage.nominations[index];
          return attribute ? [[attribute, true]] : [];
        }),
      ),
    });
  }
  for (const link of family?.links ?? []) {
    si.addManualEdge(
      stage.edgeType,
      `${link.from}-${link.to}-${link.kind}`,
      link.from,
      link.to,
      {
        [stage.kind]: [link.kind],
        ...(link.kind === 'partner'
          ? { [stage.currentPartner]: link.current ?? true }
          : { [stage.gestationalCarrier]: link.carrier ?? false }),
      },
    );
  }

  if (followedByNameForm) {
    si.addStage('AlterForm', {
      subject: { entity: 'node', type: people.id },
    }).addFormField({
      component: 'Text',
      variable: stage.name,
      prompt: NAME_FORM_PROMPT,
    });
  }
  if (followedByPeopleList) {
    si.addStage('OrdinalBin', {
      subject: { entity: 'node', type: people.id },
    }).addPrompt({ text: PEOPLE_PROMPT });
  }
  si.addInformationStage({ title: 'Complete', text: 'After the pedigree.' });
  const payload = si.getInterviewPayload({ currentStep: 1 });
  if (followedByNameForm) {
    // The form draws its question with the name attribute's own input
    // control, which the builder leaves unset. Its codebook is built
    // loosely typed, as variables keyed by id.
    const personType = payload.protocol.codebook.node[people.id] as {
      variables: Record<string, { component?: string }>;
    };
    const name = personType.variables[stage.name];
    if (name) name.component = 'Text';
  }
  if (encryptedFormField) {
    const pedigree = payload.protocol.stages.find(
      (candidate) => candidate.type === 'FamilyPedigree',
    );
    const nickname =
      pedigree?.type === 'FamilyPedigree'
        ? pedigree.form?.fields.at(-1)?.variable
        : undefined;
    const personType = payload.protocol.codebook.node[people.id] as {
      variables: Record<string, { encrypted?: boolean }>;
    };
    const variable = nickname ? personType.variables[nickname] : undefined;
    if (variable) variable.encrypted = true;
  }
  if (encryptedNames) {
    const personType = payload.protocol.codebook.node[people.id] as {
      variables: Record<string, { encrypted?: boolean }>;
    };
    const name = personType.variables[stage.name];
    if (name) name.encrypted = true;
  }
  if (protection) {
    payload.network.encryption = protection.header;
    // Names saved encrypted on the earlier visit.
    for (const [personId, encrypted] of Object.entries(protection.names)) {
      const node = payload.network.nodes.find(
        (candidate) => candidate[entityPrimaryKeyProperty] === personId,
      );
      if (!node) continue;
      node[entityAttributesProperty][stage.name] = encrypted.data;
      node[entitySecureAttributesMeta] = {
        [stage.name]: { iv: encrypted.iv },
      };
    }
  }
  return payload;
}

/**
 * The interview `options` build, as an earlier visit protected with
 * `passphrase` left it: the header made when the passphrase was chosen, and
 * each of `names` (by person id) encrypted with its key as that person's
 * name.
 */
async function protectNames(
  options: StoryOptions,
  passphrase: string,
  names: Record<string, string>,
): Promise<EarlierProtection> {
  const pedigree = buildInterview(options).protocol.stages.find(
    (candidate) => candidate.type === 'FamilyPedigree',
  );
  if (pedigree?.type !== 'FamilyPedigree') {
    throw new Error('The interview has no pedigree stage');
  }
  const variableId = pedigree.nodeConfiguration.nameAttribute;
  const { header, key } = await createEncryptionHeader(passphrase);
  const encrypted = await Promise.all(
    Object.entries(names).map(
      async ([nodeId, name]): Promise<[string, EncryptedBytes]> => [
        nodeId,
        await encryptValue(key, name, { nodeId, variableId }),
      ],
    ),
  );
  return { header, names: Object.fromEntries(encrypted) };
}

const isEarlierProtection = (value: unknown): value is EarlierProtection =>
  typeof value === 'object' &&
  value !== null &&
  'header' in value &&
  'names' in value;

function PedigreeStory({
  family,
  withFormFields,
  completeness,
  framing,
  nominationPrompts,
  shapeBy,
  genderIdentities,
  askGenderIdentity,
  nameValidation,
  followedByPeopleList,
  followedByNameForm,
  encryptedNames,
  protection,
  encryptedFormField,
  recordsRelationship,
  protoAttribute,
  onSync,
}: StoryOptions & ShellOptions) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview({
          family,
          withFormFields,
          completeness,
          framing,
          nominationPrompts,
          shapeBy,
          genderIdentities,
          askGenderIdentity,
          nameValidation,
          followedByPeopleList,
          followedByNameForm,
          encryptedNames,
          protection,
          encryptedFormField,
          recordsRelationship,
        }),
      ),
    [
      family,
      withFormFields,
      completeness,
      framing,
      nominationPrompts,
      shapeBy,
      genderIdentities,
      askGenderIdentity,
      nameValidation,
      followedByPeopleList,
      followedByNameForm,
      encryptedNames,
      protection,
      encryptedFormField,
      recordsRelationship,
    ],
  );

  // The attribute filed under `__proto__`, found in the protocol the payload
  // holds, and renamed wherever its id is used.
  const preparePayload = useMemo(() => {
    if (!protoAttribute) return undefined;
    const { protocol } =
      SuperJSON.parse<ReturnType<typeof buildInterview>>(rawPayload);
    const pedigree = protocol.stages.find(
      (candidate) => candidate.type === 'FamilyPedigree',
    );
    if (pedigree?.type !== 'FamilyPedigree') return undefined;
    const id =
      protoAttribute === 'name'
        ? pedigree.nodeConfiguration.nameAttribute
        : pedigree.form?.fields[0]?.variable;
    if (id === undefined) return undefined;
    return <Payload,>(payload: Payload): Payload =>
      JSON.parse(
        JSON.stringify(payload).replaceAll(JSON.stringify(id), '"__proto__"'),
      ) as Payload;
  }, [protoAttribute, rawPayload]);

  return (
    <div className="flex h-dvh w-full">
      {/* Changing the story's settings builds a new interview, so the
          running one, with a network made against the old protocol, starts
          over rather than carrying on. */}
      <StoryInterviewShell
        key={rawPayload}
        rawPayload={rawPayload}
        onSync={onSync}
        preparePayload={preparePayload}
        // The passphrase is entered from the side of the screen.
        navigationOrientation={
          encryptedNames || encryptedFormField ? 'vertical' : undefined
        }
      />
    </div>
  );
}

type StoryArgs = {
  framing: FramingSetting;
  requirement: PedigreeCompletenessScope | 'none';
  enforcement: Completeness['enforcement'];
};

const meta: Meta<StoryArgs> = {
  title: 'Interfaces/FamilyPedigree',
  // The interview builder is shared with the capture story.
  excludeStories: ['buildInterview'],
  parameters: { layout: 'fullscreen' },
  // Protocol settings for the stage, each story starting from the ones that
  // suit its family.
  args: {
    framing: 'gendered',
    requirement: 'parents',
    enforcement: 'required',
  },
  argTypes: {
    framing: {
      control: 'inline-radio',
      options: ['gendered', 'gamete', 'participantPreference'],
      description:
        'The words unnamed family members are described by. gendered: mother, father, grandmother… · gamete: egg parent, sperm parent, grandparent… · participantPreference: the participant chooses between them when they first reach the stage',
    },
    requirement: {
      control: 'select',
      options: [
        'none',
        'parents',
        'firstDegree',
        'grandparents',
        'secondDegree',
        'thirdDegree',
      ],
      description:
        'How much of the family must be recorded before continuing. Each level includes the ones before: both biological parents; siblings and children; grandparents, aunts and uncles; nieces, nephews and grandchildren; first cousins.',
    },
    enforcement: {
      control: 'inline-radio',
      options: ['required', 'recommended'],
      description:
        'required: Next is held back until complete · recommended: pressing Next again with the list open continues',
      if: { arg: 'requirement', neq: 'none' },
    },
  },
};

/** The stage's protocol settings from the story's controls. */
const settings = ({ framing, requirement, enforcement }: StoryArgs) => ({
  framing,
  completeness:
    requirement === 'none' ? undefined : { scope: requirement, enforcement },
});

export default meta;
type Story = StoryObj<StoryArgs>;

const expectPeople = (count: number) =>
  async function play({ canvasElement }: { canvasElement: HTMLElement }) {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(count),
    );
  };

/** The first visit: only the participant, with the add menu around them. */
export const FirstVisit: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => <PedigreeStory {...settings(args)} withFormFields />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId('pedigree-menu-parent')).toBeVisible(),
    );
    for (const relation of ['sibling', 'partner', 'child']) {
      await expect(
        canvas.getByTestId(`pedigree-menu-${relation}`),
      ).toBeVisible();
    }
  },
};

const FRAMING_TITLE = 'How should we describe your family?';

/** Parents the participant has not named, so they are described by the
 * framing's words. */
const unnamedParents: Family = {
  people: [
    { id: 'ego', name: 'Ari', gender: 'nonBinary', ego: true },
    { id: 'mum', gender: 'woman', sex: 'female' },
    { id: 'dad', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
  ],
};

/** The unnamed parents, with everyone's details recorded, so the family
 * meets the stage's requirement and Next moves on. */
const describedFamily: Family = {
  ...unnamedParents,
  people: [
    { id: 'ego', name: 'Ari', gender: 'nonBinary', sex: 'intersex', ego: true },
    { id: 'mum', gender: 'woman', sex: 'female' },
    { id: 'dad', gender: 'man', sex: 'male' },
  ],
};

/** Where each person's centre is on screen, by their id. */
const positionsOf = (canvasElement: HTMLElement) =>
  new Map(
    within(canvasElement)
      .getAllByTestId('pedigree-person')
      .map((person) => {
        const shown = person.getBoundingClientRect();
        return [
          person.dataset.personId ?? '',
          {
            x: shown.left + shown.width / 2,
            y: shown.top + shown.height / 2,
          },
        ] as const;
      }),
  );

/**
 * Opening someone's details moves them beside the panel; closing it puts the
 * view back as it was.
 */
export const PanelCloseRestoresView: Story = {
  render: (args) => (
    <PedigreeStory {...settings(args)} family={unnamedParents} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const father = await canvas.findByRole('button', { name: /^Father/ });
    const panel = () =>
      canvasElement.ownerDocument.querySelector(
        '[data-testid="pedigree-person-panel"]',
      );
    const before = positionsOf(canvasElement);

    await userEvent.click(father);
    await waitFor(() => expect(panel()).not.toBeNull());
    await waitFor(
      () =>
        expect(
          Math.abs(
            (positionsOf(canvasElement).get('dad')?.x ?? 0) -
              (before.get('dad')?.x ?? 0),
          ),
        ).toBeGreaterThan(50),
      { timeout: 3000 },
    );

    await userEvent.keyboard('{Escape}');
    await waitFor(
      () => {
        for (const [id, now] of positionsOf(canvasElement)) {
          const then = before.get(id);
          expect(then).toBeDefined();
          expect(Math.abs(now.x - (then?.x ?? 0))).toBeLessThan(2);
          expect(Math.abs(now.y - (then?.y ?? 0))).toBeLessThan(2);
        }
      },
      { timeout: 3000 },
    );
    await waitFor(() => expect(panel()).toBeNull());
  },
};

const HEART_PROMPT = 'Who in your family has had heart disease?';
const OVARIAN_PROMPT = 'Who in your family has had ovarian cancer?';

/**
 * Once the family is drawn, each of the stage's nomination prompts asks who
 * in it something applies to. Next and Back step between them. Selecting a
 * person marks them for the prompt showing, and selecting them again
 * unmarks them; the family itself cannot be changed. A prompt limited to
 * one sex at birth leaves out people recorded as the other.
 */
export const NominatingConditions: Story = {
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={describedFamily}
      nominationPrompts={[
        { text: HEART_PROMPT },
        { text: OVARIAN_PROMPT, onlyForSexAssignedAtBirth: 'female' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const father = () => canvas.getByRole('button', { name: /^Father/ });
    const mother = () => canvas.getByRole('button', { name: /^Mother/ });
    await canvas.findByText(PROMPT);
    // Each new prompt brings back the whole family, wherever it was left.
    const viewport = canvas.getByTestId('pedigree-canvas');
    dragFamilyRight(viewport);
    await waitFor(() =>
      expect(
        canvas
          .getAllByTestId('pedigree-person')
          .some(
            (person) => !isInView(person, viewport.getBoundingClientRect()),
          ),
      ).toBe(true),
    );
    await userEvent.click(canvas.getByTestId('next-button'));

    await canvas.findByText(HEART_PROMPT);
    await waitFor(() => expectWholeFamilyInView(canvasElement));
    // Selecting is all there is: no tools, and no details panel.
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-tool-connect')).toBeNull(),
    );
    await expect(father()).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(father());
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'true'),
    );
    await expect(
      canvasElement.ownerDocument.querySelector(
        '[data-testid="pedigree-person-panel"]',
      ),
    ).toBeNull();
    await userEvent.click(father());
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'false'),
    );
    await userEvent.click(father());
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'true'),
    );

    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(OVARIAN_PROMPT);
    // Each prompt records its own answer, and this one is not for the
    // father.
    await waitFor(() => expect(father()).toBeDisabled());
    await expect(father()).toHaveAttribute('aria-pressed', 'false');
    // Intersex, the participant can still be chosen.
    await expect(canvas.getByRole('button', { name: /^You/ })).toBeEnabled();
    await userEvent.click(mother());
    await waitFor(() =>
      expect(mother()).toHaveAttribute('aria-pressed', 'true'),
    );

    await userEvent.click(canvas.getByTestId('previous-button'));
    await canvas.findByText(HEART_PROMPT);
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'true'),
    );
    await expect(mother()).toHaveAttribute('aria-pressed', 'false');

    // Back on the family's own prompt, the tools return.
    await userEvent.click(canvas.getByTestId('previous-button'));
    await expect(
      await canvas.findByTestId('pedigree-tool-connect'),
    ).toBeVisible();
  },
};

/** How many of a person's yes-or-no attributes are true in the session last
 * written: for the participant, their marker and each prompt they are
 * selected for. */
const trueAttributesInSession = (personId: string) =>
  (lastSynced?.network.nodes ?? [])
    .filter((node) => node[entityPrimaryKeyProperty] === personId)
    .flatMap((node) => Object.values(node[entityAttributesProperty]))
    .filter((value) => value === true).length;

/**
 * Someone selected for a prompt limited to one sex at birth, whose sex at
 * birth is then changed to the other, is no longer selected for it: their
 * answer is withdrawn when the change is saved, rather than left standing for
 * someone the prompt leaves out.
 */
export const ChangingSexAtBirthWithdrawsANomination: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={describedFamily}
      onSync={recordSession}
      nominationPrompts={[
        { text: OVARIAN_PROMPT, onlyForSexAssignedAtBirth: 'female' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const you = () => canvas.getByRole('button', { name: /^You/ });

    await canvas.findByText(PROMPT);
    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(OVARIAN_PROMPT);
    // Intersex, the participant can be chosen.
    await waitFor(() => expect(you()).toBeEnabled());
    await userEvent.click(you());
    await waitFor(() => expect(you()).toHaveAttribute('aria-pressed', 'true'));
    await waitFor(() => expect(trueAttributesInSession('ego')).toBe(2));

    // Back on the family's own prompt, the participant's sex at birth is
    // changed to one the prompt leaves out.
    await userEvent.click(canvas.getByTestId('previous-button'));
    await canvas.findByText(PROMPT);
    await userEvent.click(await canvas.findByRole('button', { name: /^You/ }));
    await waitFor(() => expect(panelOf(canvasElement)).not.toBeNull());
    await userEvent.click(await body.findByRole('radio', { name: 'Male' }));
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    // Only the participant marker is left true.
    await waitFor(() => expect(trueAttributesInSession('ego')).toBe(1));

    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(OVARIAN_PROMPT);
    await waitFor(() => expect(you()).toBeDisabled());
    await expect(you()).toHaveAttribute('aria-pressed', 'false');
  },
};

/**
 * Someone already selected for a prompt that no longer applies to them —
 * their sex at birth was changed somewhere else in the interview — can still
 * be deselected, and then cannot be selected again.
 */
export const AnIneligibleNominationCanBeWithdrawn: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        ...describedFamily,
        people: describedFamily.people.map((person) =>
          person.id === 'dad' ? { ...person, nominatedFor: [0] } : person,
        ),
      }}
      nominationPrompts={[
        { text: OVARIAN_PROMPT, onlyForSexAssignedAtBirth: 'female' },
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const father = () => canvas.getByRole('button', { name: /^Father/ });

    await canvas.findByText(PROMPT);
    await userEvent.click(canvas.getByTestId('next-button'));
    await canvas.findByText(OVARIAN_PROMPT);
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'true'),
    );
    await expect(father()).toBeEnabled();
    await userEvent.click(father());
    await waitFor(() =>
      expect(father()).toHaveAttribute('aria-pressed', 'false'),
    );
    await waitFor(() => expect(father()).toBeDisabled());
  },
};

/** The answers about siblings and children not recorded that a person holds
 * in the session last written. */
const notRecordedInSession = (personId: string) =>
  (lastSynced?.network.nodes ?? [])
    .filter((node) => node[entityPrimaryKeyProperty] === personId)
    .flatMap((node) => Object.values(node[entityAttributesProperty]))
    .flatMap((value) =>
      Array.isArray(value)
        ? value.filter(
            (answer) =>
              typeof answer === 'string' &&
              /^(noSiblings|siblingsUnknown|noChildren|childrenUnknown)$/.test(
                answer,
              ),
          )
        : [],
    );

/** The participant, who said they have no siblings, and their father Tom,
 * whose daughter Kim from an earlier partnership is in the family only
 * through her mother Pat. */
const fatherWithAnotherDaughter: Family = {
  people: [
    {
      id: 'ego',
      name: 'Ella',
      gender: 'woman',
      sex: 'female',
      ego: true,
      notRecorded: ['noSiblings'],
    },
    { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
    { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
    { id: 'pat', name: 'Pat', gender: 'woman', sex: 'female' },
    { id: 'kim', name: 'Kim', gender: 'woman', sex: 'female' },
  ],
  links: [
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'pat', to: 'dad', kind: 'partner', current: false },
    { from: 'pat', to: 'kim', kind: 'biological', carrier: true },
  ],
};

/**
 * Connecting Tom to Kim as her biological father makes Kim the participant's
 * half-sister, so the participant's answer that they have no siblings is
 * withdrawn — not only answers about Tom and Kim, between whom the
 * connection is made.
 */
export const ConnectingAChildWithdrawsHerNewSiblingsAnswers: Story = {
  args: { requirement: 'firstDegree', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={fatherWithAnotherDaughter}
      onSync={recordSession}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const person = (id: string) => {
      const element = canvasElement.querySelector<HTMLButtonElement>(
        `[data-person-id="${id}"] button`,
      );
      if (!element) throw new Error(`No person ${id}`);
      return element;
    };
    await waitFor(() => expect(person('kim')).toBeVisible());

    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(person('dad'));
    await userEvent.click(person('kim'));
    await userEvent.click(
      await page.findByRole('menuitem', { name: '“Tom” is a parent of “Kim”' }),
    );
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Biological parent' }),
    );
    await waitFor(() => expect(notRecordedInSession('ego')).toEqual([]));
  },
};

/**
 * Re-describing Tom as Kim's biological father, where he had adopted her,
 * makes Kim the participant's half-sister: the participant's answer that
 * they have no siblings is withdrawn.
 */
export const RedescribingAParentWithdrawsNewSiblingsAnswers: Story = {
  args: { requirement: 'firstDegree', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        ...fatherWithAnotherDaughter,
        links: [
          ...fatherWithAnotherDaughter.links,
          { from: 'dad', to: 'kim', kind: 'adoptive' },
        ],
      }}
      onSync={recordSession}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole('button', { name: /^Kim/ }));
    await waitFor(() => expect(panelOf(canvasElement)).not.toBeNull());
    const panel = within(panelOf(canvasElement) as HTMLElement);
    const tom = await panel.findByRole('radiogroup', {
      name: 'Tom is their…',
    });
    await userEvent.click(
      within(tom).getByRole('radio', { name: 'Biological parent' }),
    );
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() => expect(notRecordedInSession('ego')).toEqual([]));
  },
};

/** The id of the person the session last written names `name`. */
const idInSession = (name: string) =>
  nodesInSession().find((node) =>
    Object.values(node[entityAttributesProperty]).includes(name),
  )?.[entityPrimaryKeyProperty];

const edgesInSession = () => lastSynced?.network.edges ?? [];

/** Whether the session last written records `parentId` as having carried
 * `childId`'s pregnancy: the one yes/no answer on the link between them.
 * Undefined while there is no such link. */
const carriedInSession = (parentId: string, childId: string) => {
  const link = edgesInSession().find(
    (edge) => edge.from === parentId && edge.to === childId,
  );
  if (!link) return undefined;
  return Object.values(link[entityAttributesProperty]).includes(true);
};

/**
 * Adding a sibling asks who carried the pregnancy, as adding a child does:
 * each parent the sibling shares who could have carried it (not Tom, male at
 * birth), or someone else, with nothing chosen. Taking away the parent chosen
 * takes the answer away too, so the question is asked again. The parent
 * chosen is recorded as having carried the new sibling.
 */
export const AddingASiblingAsksWhoCarriedThePregnancy: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      onSync={recordSession}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Mia',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));

    const carrierQuestion = () =>
      body.queryByRole('radiogroup', { name: /^Who carried the pregnancy\?/ });
    await waitFor(() => expect(carrierQuestion()).not.toBeNull());
    const carrier = within(carrierQuestion() as HTMLElement);
    await expect(carrier.getAllByRole('radio')).toHaveLength(2);
    await expect(carrier.getByRole('radio', { name: 'Rachel' })).toBeVisible();
    await expect(
      carrier.getByRole('radio', { name: 'Someone else, or I don’t know' }),
    ).toBeVisible();
    for (const radio of carrier.getAllByRole('radio')) {
      await expect(radio).not.toBeChecked();
    }
    await userEvent.click(carrier.getByRole('radio', { name: 'Rachel' }));

    // Rachel is not shared after all: nobody shared could have carried the
    // pregnancy. Shared again, she is offered with nothing chosen.
    const shared = await body.findByRole('group', {
      name: /^Which parents do they share with you\?/,
    });
    await userEvent.click(
      within(shared).getByRole('checkbox', { name: 'Rachel' }),
    );
    await waitFor(() => expect(carrierQuestion()).toBeNull());
    await userEvent.click(
      within(shared).getByRole('checkbox', { name: 'Rachel' }),
    );
    await waitFor(() => expect(carrierQuestion()).not.toBeNull());
    const asked = within(carrierQuestion() as HTMLElement);
    await expect(
      asked.getByRole('radio', { name: 'Rachel' }),
    ).not.toBeChecked();
    await userEvent.click(asked.getByRole('radio', { name: 'Rachel' }));

    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() => expect(idInSession('Mia')).toBeDefined());
    const mia = idInSession('Mia') ?? '';
    await waitFor(() => expect(carriedInSession('mum', mia)).toBe(true));
    await expect(carriedInSession('dad', mia)).toBe(false);
  },
};

/**
 * With only her father shown, the participant's second parent, not shown
 * yet, is added for both her and a new sister, and can be chosen as having
 * carried the sister's pregnancy: the unnamed parent added is recorded as
 * having carried it.
 */
export const AParentNotYetShownCanHaveCarriedASibling: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      onSync={recordSession}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        ],
        links: [{ from: 'dad', to: 'ego', kind: 'biological' }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Mia',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    const carrier = within(
      await body.findByRole('radiogroup', {
        name: /^Who carried the pregnancy\?/,
      }),
    );
    await expect(carrier.getAllByRole('radio')).toHaveLength(2);
    await userEvent.click(
      carrier.getByRole('radio', { name: 'Your other parent, not shown yet' }),
    );
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() => expect(idInSession('Mia')).toBeDefined());
    const mia = idInSession('Mia') ?? '';
    const mother = nodesInSession().find(
      (node) => !['ego', 'dad', mia].includes(node[entityPrimaryKeyProperty]),
    )?.[entityPrimaryKeyProperty];
    await expect(mother).toBeDefined();
    await waitFor(() => expect(carriedInSession(mother ?? '', mia)).toBe(true));
    await expect(carriedInSession('dad', mia)).toBe(false);
    // Only the sister's pregnancy was asked about.
    await expect(carriedInSession(mother ?? '', 'ego')).toBe(false);
  },
};

/**
 * Jun was adopted by Clare, as was his sister Lucy. His birth mother, added
 * as a biological parent, is not assumed to be Clare's partner, nor Lucy's
 * mother: the partner question starts at No and Lucy is not chosen. Made an
 * adoptive parent instead, she is assumed to have raised them with Clare,
 * until the participant says she was not Clare's partner, which changing
 * the kind of parent again leaves alone. Nothing records a partnership.
 */
export const ABirthParentIsNotAssumedToBeAnAdoptiveParentsPartner: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      onSync={recordSession}
      family={{
        people: [
          { id: 'ego', name: 'Jun', gender: 'man', sex: 'male', ego: true },
          { id: 'clare', name: 'Clare', gender: 'woman', sex: 'female' },
          { id: 'lucy', name: 'Lucy', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'clare', to: 'ego', kind: 'adoptive' },
          { from: 'clare', to: 'lucy', kind: 'adoptive' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Mei',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    const kind = await body.findByRole('radiogroup', {
      name: /^What kind of parent are they\?/,
    });
    const partner = await body.findByRole('radiogroup', {
      name: /^Are they the partner of another parent\?/,
    });
    const alsoParentOf = await body.findByRole('group', {
      name: /^Are they also the parent of/,
    });
    const chooseKind = (name: string) =>
      userEvent.click(within(kind).getByRole('radio', { name }));
    // The partner chosen, by the option's name.
    const partnerAnswer = () =>
      ['Clare', 'No'].find(
        (name) =>
          within(partner)
            .getByRole('radio', { name })
            .getAttribute('aria-checked') === 'true',
      );
    const lucyChosen = () =>
      within(alsoParentOf).getByRole('checkbox', { name: 'Lucy' });

    // A biological parent, by default.
    await waitFor(() => expect(partnerAnswer()).toBe('No'));
    await expect(lucyChosen()).not.toBeChecked();

    await chooseKind('Adoptive parent');
    await waitFor(() => expect(partnerAnswer()).toBe('Clare'));
    await waitFor(() => expect(lucyChosen()).toBeChecked());

    await chooseKind('Biological parent');
    await waitFor(() => expect(partnerAnswer()).toBe('No'));
    await waitFor(() => expect(lucyChosen()).not.toBeChecked());

    // The participant's own answer is kept.
    await chooseKind('Adoptive parent');
    await waitFor(() => expect(partnerAnswer()).toBe('Clare'));
    await userEvent.click(within(partner).getByRole('radio', { name: 'No' }));
    await chooseKind('Biological parent');
    await chooseKind('Adoptive parent');
    await expect(partnerAnswer()).toBe('No');

    await chooseKind('Biological parent');
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() => expect(idInSession('Mei')).toBeDefined());
    const mei = idInSession('Mei') ?? '';
    // Her link to Jun, and no partnership.
    await expect(
      edgesInSession().filter((edge) => [edge.from, edge.to].includes(mei)),
    ).toHaveLength(1);
  },
};

/**
 * Ella's birth mother Rachel is recorded. Her father, added as a biological
 * parent, is assumed to be Rachel's partner, as is a stepfather: either
 * raised Ella with her.
 */
export const AParentIsAssumedToBeTheirCoParentsPartner: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        ],
        links: [{ from: 'mum', to: 'ego', kind: 'biological', carrier: true }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await userEvent.click(await body.findByRole('radio', { name: 'Man' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Male' }));
    const partner = await body.findByRole('radiogroup', {
      name: /^Are they the partner of another parent\?/,
    });
    const rachel = within(partner).getByRole('radio', { name: 'Rachel' });
    await waitFor(() => expect(rachel).toBeChecked());
    await userEvent.click(
      within(
        await body.findByRole('radiogroup', {
          name: /^What kind of parent are they\?/,
        }),
      ).getByRole('radio', { name: 'Step or social parent' }),
    );
    await expect(rachel).toBeChecked();
  },
};

/** Drags the canvas 600 pixels to the right with the mouse. */
function dragFamilyRight(viewport: HTMLElement) {
  const box = viewport.getBoundingClientRect();
  const at = (step: number) => ({
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: box.left + 40 + step * 60,
    clientY: box.top + 300,
  });
  fireEvent.pointerDown(viewport, { ...at(0), buttons: 1 });
  for (let step = 1; step <= 10; step++) {
    fireEvent.pointerMove(viewport, { ...at(step), buttons: 1 });
  }
  fireEvent.pointerUp(viewport, at(10));
}

const isInView = (person: HTMLElement, box: DOMRect) => {
  const shown = person.getBoundingClientRect();
  return (
    shown.left >= box.left &&
    shown.right <= box.right &&
    shown.top >= box.top &&
    shown.bottom <= box.bottom
  );
};

function expectWholeFamilyInView(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const box = canvas.getByTestId('pedigree-canvas').getBoundingClientRect();
  for (const person of canvas.getAllByTestId('pedigree-person')) {
    expect(isInView(person, box)).toBe(true);
  }
}

/**
 * The family can be zoomed with the mouse wheel or a pinch, and dragged to
 * pan. A drag that starts on a person or a button pans rather than pressing
 * it.
 */
export const PanAndZoom: Story = {
  render: (args) => (
    <PedigreeStory {...settings(args)} family={unnamedParents} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const viewport = canvas.getByTestId('pedigree-canvas');
    const content = viewport.lastElementChild as HTMLElement;
    const you = await canvas.findByRole('button', { name: /^You/ });
    const transform = () => getComputedStyle(content).transform;

    // Three notches of a mouse wheel zoom out.
    const before = new DOMMatrix(transform());
    const box = viewport.getBoundingClientRect();
    for (let notch = 0; notch < 3; notch++) {
      fireEvent.wheel(viewport, {
        deltaY: 100,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
      });
    }
    await waitFor(() =>
      expect(new DOMMatrix(transform()).a).toBeLessThan(before.a),
    );

    // The toolbar zooms too, for anyone who cannot pinch or scroll.
    const zoomedOut = new DOMMatrix(transform()).a;
    await userEvent.click(canvas.getByRole('button', { name: 'Zoom in' }));
    await waitFor(() =>
      expect(new DOMMatrix(transform()).a).toBeGreaterThan(zoomedOut),
    );
    // Pushed off to one side, the family comes back whole.
    dragFamilyRight(viewport);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Show the whole family' }),
    );
    await waitFor(() => expectWholeFamilyInView(canvasElement));

    // A drag pans even when it starts on a button, and the click that ends
    // it does nothing. (A person ignores a click after a drag themselves;
    // the add menu's buttons rely on the canvas.)
    await userEvent.hover(you);
    const addSibling = await canvas.findByTestId('pedigree-menu-sibling');
    const start = addSibling.getBoundingClientRect();
    const from = {
      x: start.left + start.width / 2,
      y: start.top + start.height / 2,
    };
    const pointer = { pointerId: 1, pointerType: 'mouse', isPrimary: true };
    const panned = new DOMMatrix(transform());
    fireEvent.pointerDown(addSibling, {
      ...pointer,
      ...clientOf(from),
      buttons: 1,
    });
    for (let step = 1; step <= 10; step++) {
      fireEvent.pointerMove(addSibling, {
        ...pointer,
        ...clientOf({ x: from.x + step * 10, y: from.y + step * 4 }),
        buttons: 1,
      });
    }
    fireEvent.pointerUp(addSibling, {
      ...pointer,
      ...clientOf({ x: from.x + 100, y: from.y + 40 }),
    });
    fireEvent.click(addSibling);
    await waitFor(() =>
      expect(new DOMMatrix(transform()).e).toBeGreaterThan(panned.e + 50),
    );
    // Two frames, for anything the click opened to render; opening the add
    // panel would take the menu away.
    for (let frame = 0; frame < 2; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await expect(addSibling).toBeInTheDocument();
    // A click that is not the end of a drag still works.
    fireEvent.click(addSibling);
    await waitFor(() => expect(addSibling).not.toBeInTheDocument());
  },
};

const clientOf = ({ x, y }: { x: number; y: number }) => ({
  clientX: x,
  clientY: y,
});

/**
 * The stage leaves the framing to the participant. The choice opens from the
 * toolbar when the stage first loads, with neither answer chosen, and
 * nothing closes it until the participant chooses one.
 */
export const ParticipantChoosesFraming: Story = {
  args: { framing: 'participantPreference' },
  render: (args) => (
    <PedigreeStory {...settings(args)} family={unnamedParents} />
  ),
  play: async ({ canvasElement }) => {
    // The popover is portalled outside the story's root.
    const body = within(canvasElement.ownerDocument.body);
    // It opens a moment after the stage loads.
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    for (const option of body.getAllByRole('option')) {
      await expect(option).toHaveAttribute('aria-selected', 'false');
    }
    // Neither Escape nor a press elsewhere on the stage closes it.
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Wording',
    });
    await userEvent.keyboard('{Escape}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(within(canvasElement).getByTestId('pedigree-canvas'));
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  },
};

/**
 * The stage leaves the framing to the participant, and they press Next
 * before choosing. They stay on the stage, with the choice open, until they
 * have chosen; the labels saved on leaving are then in the words chosen,
 * never in the words used while no choice was made.
 */
export const TheFramingMustBeChosenBeforeLeaving: Story = {
  args: { framing: 'participantPreference', requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={unnamedParents}
      followedByPeopleList
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByTestId('pedigree-canvas');
    await userEvent.click(canvas.getByTestId('next-button'));
    // Still on the stage, asked how to describe the family.
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    await expect(canvas.queryByText(PEOPLE_PROMPT)).toBeNull();
    await expect(canvas.getByTestId('pedigree-canvas')).toBeInTheDocument();

    await userEvent.click(
      body.getByRole('option', { name: /Mother, father, sister, brother/ }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Mother')).toBeInTheDocument();
    await expect(canvas.queryByText('Egg parent')).toBeNull();
  },
};

/**
 * Once chosen, the words can be changed from the toolbar at any time.
 * Choosing applies at once and closes the popover.
 */
export const ParticipantChangesFraming: Story = {
  args: { framing: 'participantPreference' },
  render: (args) => (
    <PedigreeStory {...settings(args)} family={unnamedParents} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // It opens a moment after the stage loads.
    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    await userEvent.click(
      body.getByRole('option', { name: /Egg parent, sperm parent, sibling/ }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());
    // Unnamed parents are now described by the gamete they gave.
    await expect(
      await canvas.findByRole('button', { name: /^Egg parent/ }),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: 'Wording' }));
    await userEvent.click(
      await body.findByRole('option', {
        name: /Mother, father, sister, brother/,
      }),
    );
    await expect(
      await canvas.findByRole('button', { name: /^Mother/ }),
    ).toBeVisible();
  },
};

/**
 * A family under way: separated parents, a brother, and a daughter whose other
 * parent was added as someone not shown yet — so that partner has no details
 * and carries a warning.
 */
export const FamilyInProgress: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Sarietha',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'julie', name: 'Julie', gender: 'woman', sex: 'female' },
          { id: 'rob', name: 'Rob', gender: 'man', sex: 'male' },
          { id: 'joshua', name: 'Joshua', gender: 'man', sex: 'male' },
          { id: 'mia', name: 'Mia', gender: 'woman', sex: 'female' },
          { id: 'partner' },
        ],
        links: [
          { from: 'julie', to: 'rob', kind: 'partner', current: false },
          { from: 'julie', to: 'ego', kind: 'biological', carrier: true },
          { from: 'rob', to: 'ego', kind: 'biological' },
          { from: 'julie', to: 'joshua', kind: 'biological', carrier: true },
          { from: 'rob', to: 'joshua', kind: 'biological' },
          { from: 'ego', to: 'partner', kind: 'partner' },
          { from: 'ego', to: 'mia', kind: 'biological', carrier: true },
          { from: 'partner', to: 'mia', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(6)(context);
    await expect(
      within(context.canvasElement).getByRole('button', {
        name: /^Partner, some details missing/,
      }),
    ).toBeVisible();
  },
};

/**
 * From parents, siblings and children upwards, each of the participant's
 * biological children needs their other biological parent: the participant
 * has added both parents, said they have no siblings, and added a daughter on
 * their own. The list asks for her other parent, and the stage cannot be left
 * until she has one. A "Don't know" parent would do; that parent's own family
 * is never asked for.
 */
export const EachChildNeedsTheirOtherBiologicalParent: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Sarietha',
            gender: 'woman',
            sex: 'female',
            ego: true,
            notRecorded: ['noSiblings'],
          },
          { id: 'julie', name: 'Julie', gender: 'woman', sex: 'female' },
          { id: 'rob', name: 'Rob', gender: 'man', sex: 'male' },
          { id: 'mia', name: 'Mia', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'julie', to: 'rob', kind: 'partner' },
          { from: 'julie', to: 'ego', kind: 'biological', carrier: true },
          { from: 'rob', to: 'ego', kind: 'biological' },
          { from: 'ego', to: 'mia', kind: 'biological', carrier: true },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(4)(context);
    const canvas = within(context.canvasElement);
    const body = within(context.canvasElement.ownerDocument.body);

    // Required: Next does not leave the family, and pins open the list of
    // what is still needed.
    await userEvent.click(canvas.getByTestId('next-button'));
    await waitFor(
      () =>
        expect(
          body.getByRole('button', {
            name: 'Add another biological parent for “Mia”',
          }),
        ).toBeVisible(),
      { timeout: 5000 },
    );
    await expect(canvas.getByTestId('pedigree-canvas')).toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Scenarios from the standardized pedigree nomenclature papers: Bennett et al.
// (2008), "Standardized human pedigree nomenclature: update and assessment of
// the recommendations of the National Society of Genetic Counselors", and
// Bennett et al. (2022), "Inclusive pedigree nomenclature" (J Genet Couns).
// ---------------------------------------------------------------------------

/**
 * Egg donation with a gestational carrier (assisted reproduction). The
 * intended parents raise the child; the egg came from a donor, the sperm from
 * the intended father, and a surrogate carried the pregnancy. The donor and
 * surrogate hang from the child on auxiliary lines.
 */
export const EggDonorAndGestationalCarrier: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Maya',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mother', name: 'Ana', gender: 'woman', sex: 'female' },
          { id: 'father', name: 'Luis', gender: 'man', sex: 'male' },
          { id: 'donor', name: 'Egg donor', gender: 'woman', sex: 'female' },
          { id: 'carrier', name: 'Carrier', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mother', to: 'father', kind: 'partner' },
          { from: 'mother', to: 'ego', kind: 'social' },
          { from: 'father', to: 'ego', kind: 'biological' },
          { from: 'donor', to: 'ego', kind: 'donor' },
          { from: 'carrier', to: 'ego', kind: 'surrogate', carrier: true },
        ],
      }}
    />
  ),
  play: expectPeople(5),
};

/**
 * Sperm donation to a couple of two women. Each partner carried one child,
 * conceived with the same sperm donor, so the children are half siblings
 * through the donor and both mothers are parents to both.
 */
export const SpermDonorWithTwoMothers: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Iris',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'sibling', name: 'Theo', gender: 'man', sex: 'male' },
          { id: 'mumA', name: 'Hannah', gender: 'woman', sex: 'female' },
          { id: 'mumB', name: 'Kemi', gender: 'woman', sex: 'female' },
          { id: 'donor', name: 'Sperm donor', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mumA', to: 'mumB', kind: 'partner' },
          { from: 'mumA', to: 'ego', kind: 'biological', carrier: true },
          { from: 'mumB', to: 'ego', kind: 'social' },
          { from: 'mumB', to: 'sibling', kind: 'biological', carrier: true },
          { from: 'mumA', to: 'sibling', kind: 'social' },
          { from: 'donor', to: 'ego', kind: 'donor' },
          { from: 'donor', to: 'sibling', kind: 'donor' },
        ],
      }}
    />
  ),
  play: expectPeople(5),
};

/**
 * Gestational surrogacy with the intended parents' own egg and sperm: both
 * are biological parents, and neither carried the pregnancy.
 */
export const GestationalSurrogacy: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          { id: 'ego', name: 'Noah', gender: 'man', sex: 'male', ego: true },
          { id: 'mother', name: 'Priya', gender: 'woman', sex: 'female' },
          { id: 'father', name: 'Dev', gender: 'man', sex: 'male' },
          {
            id: 'surrogate',
            name: 'Surrogate',
            gender: 'woman',
            sex: 'female',
          },
        ],
        links: [
          { from: 'mother', to: 'father', kind: 'partner' },
          { from: 'mother', to: 'ego', kind: 'biological' },
          { from: 'father', to: 'ego', kind: 'biological' },
          { from: 'surrogate', to: 'ego', kind: 'surrogate', carrier: true },
        ],
      }}
    />
  ),
  play: expectPeople(4),
};

/**
 * Adopted in. The participant was adopted by a couple who also have a
 * biological child; their birth parents are shown too, joined to them by the
 * biological line of descent while they sit beneath their adoptive parents.
 */
export const Adoption: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          { id: 'ego', name: 'Jun', gender: 'man', sex: 'male', ego: true },
          { id: 'adoptiveMum', name: 'Clare', gender: 'woman', sex: 'female' },
          { id: 'adoptiveDad', name: 'Martin', gender: 'man', sex: 'male' },
          { id: 'sister', name: 'Lucy', gender: 'woman', sex: 'female' },
          {
            id: 'birthMum',
            name: 'Birth mother',
            gender: 'woman',
            sex: 'female',
          },
          { id: 'birthDad', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'adoptiveMum', to: 'adoptiveDad', kind: 'partner' },
          { from: 'adoptiveMum', to: 'ego', kind: 'adoptive' },
          { from: 'adoptiveDad', to: 'ego', kind: 'adoptive' },
          {
            from: 'adoptiveMum',
            to: 'sister',
            kind: 'biological',
            carrier: true,
          },
          { from: 'adoptiveDad', to: 'sister', kind: 'biological' },
          { from: 'birthMum', to: 'birthDad', kind: 'partner', current: false },
          { from: 'birthMum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'birthDad', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: expectPeople(6),
};

/**
 * A blended family. The participant's parents separated and each has a new
 * partner and a child with them — the participant's half siblings. The
 * stepfather is also a social parent to the participant.
 */
/**
 * Connecting people already shown. Tom is recorded only as Rachel's partner;
 * the connect tool makes him Ella's father as well. Until it does, the
 * partnership is all that connects him to Ella, so it cannot be removed: he
 * would leave the family tree.
 */
export const ConnectingExistingPeople: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'mum', to: 'dad', kind: 'partner' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const person = (id: string) => {
      const element = canvasElement.querySelector<HTMLButtonElement>(
        `[data-person-id="${id}"] button`,
      );
      if (!element) throw new Error(`No person ${id}`);
      return element;
    };
    await waitFor(() => expect(person('dad')).toBeVisible());

    // The partnership is Tom's only connection to Ella, so it is not removed
    // and nothing is asked.
    await userEvent.click(canvas.getByTestId('pedigree-tool-disconnect'));
    await userEvent.click(person('dad'));
    await userEvent.click(person('mum'));
    await expect(canvas.getByTestId('pedigree-connect-hint')).toHaveTextContent(
      'Removing this connection would leave “Tom” outside your family tree. Connect them to someone else in your family first.',
    );
    await expect(page.queryByRole('dialog')).toBeNull();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(person('dad'));
    await expect(canvas.getByTestId('pedigree-connect-hint')).toHaveTextContent(
      'Now select the person to connect to “Tom”.',
    );
    await userEvent.click(person('ego'));
    await userEvent.click(
      await page.findByRole('menuitem', { name: '“Tom” is your parent' }),
    );
    await userEvent.click(
      await page.findByRole('menuitem', { name: 'Biological parent' }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('“Tom” is your parent (Biological parent)'),
      ).toBeInTheDocument(),
    );

    // Already connected, so no second link: the menu does not open, and the
    // already-connected person does not join the linking state.
    await userEvent.click(person('mum'));
    await userEvent.hover(person('dad'));
    await expect(
      canvasElement.querySelector('[data-person-id="dad"] [data-node-linking]'),
    ).toBeNull();
    await userEvent.click(person('dad'));
    await expect(canvas.getByTestId('pedigree-connect-hint')).toHaveTextContent(
      '“Rachel” and “Tom” are already connected.',
    );
    await expect(page.queryByRole('menu')).toBeNull();
    await userEvent.keyboard('{Escape}');

    // The disconnect tool takes the partnership away, leaving both people, so
    // the pair can be connected again — this time as former partners.
    await userEvent.click(canvas.getByTestId('pedigree-tool-disconnect'));
    await userEvent.click(person('dad'));
    await expect(canvas.getByTestId('pedigree-connect-hint')).toHaveTextContent(
      'Now select the person to disconnect from “Tom”.',
    );
    await userEvent.click(person('mum'));
    const dialog = await page.findByRole('dialog', {
      name: 'Remove the connection between “Tom” and “Rachel”?',
    });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove connection' }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText(
          'The connection between “Tom” and “Rachel” was removed.',
        ),
      ).toBeInTheDocument(),
    );
    await expect(person('mum')).toBeInTheDocument();
    await expect(person('dad')).toBeInTheDocument();
    // No longer connected, so there is nothing to remove between them.
    await userEvent.click(person('dad'));
    await userEvent.click(person('mum'));
    await expect(canvas.getByTestId('pedigree-connect-hint')).toHaveTextContent(
      '“Tom” and “Rachel” are not connected.',
    );
    await expect(page.queryByRole('dialog')).toBeNull();
    await userEvent.keyboard('{Escape}');

    await userEvent.click(canvas.getByTestId('pedigree-tool-connect'));
    await userEvent.click(person('dad'));
    await userEvent.click(person('mum'));
    await userEvent.click(
      await page.findByRole('menuitem', {
        name: '“Tom” and “Rachel” were partners',
      }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('“Tom” and “Rachel” were partners'),
      ).toBeInTheDocument(),
    );
  },
};

/**
 * Only the participant's family is drawn: the participant, and everyone
 * connected to them through family relationships. Other stages can add
 * people of the same type who are not family — Sam, a friend, and Leo and
 * Hannah, a couple the participant knows — and they are neither drawn nor
 * changed here.
 */
export const OnlyTheFamilyIsDrawn: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'friend', name: 'Sam', gender: 'man', sex: 'male' },
          { id: 'leo', name: 'Leo', gender: 'man', sex: 'male' },
          { id: 'hannah', name: 'Hannah', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'leo', to: 'hannah', kind: 'partner' },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(2)(context);
    const canvas = within(context.canvasElement);
    await expect(canvas.getByRole('button', { name: /^Rachel/ })).toBeVisible();
    for (const name of [/^Sam/, /^Leo/, /^Hannah/]) {
      await expect(canvas.queryByRole('button', { name })).toBeNull();
    }
  },
};

/**
 * Removing someone who is the only link between the participant and other
 * people removes those people too, as the confirmation says: they would
 * otherwise vanish from the tree. Margaret is connected to Ella only through
 * her daughter Rachel; Tom stays, connected to Ella as her father.
 */
export const RemovingSomeoneRemovesThoseConnectedOnlyThroughThem: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
          { id: 'grandma', name: 'Margaret', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'grandma', to: 'mum', kind: 'biological', carrier: true },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(4)(context);
    const canvas = within(context.canvasElement);
    const page = within(context.canvasElement.ownerDocument.body);

    await userEvent.click(canvas.getByRole('button', { name: /^Rachel/ }));
    await userEvent.click(
      await page.findByRole('button', { name: 'Remove from family' }),
    );
    const dialog = await page.findByRole('dialog', { name: 'Remove Rachel?' });
    await expect(dialog).toHaveTextContent(
      '“Margaret” is connected to you only through them, so will be removed too.',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove from family' }),
    );

    await expectPeople(2)(context);
    await expect(canvas.getByRole('button', { name: /^Tom/ })).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: /^Margaret/ }),
    ).toBeNull();
  },
};

export const BlendedFamily: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
          { id: 'stepdad', name: 'Sanjay', gender: 'man', sex: 'male' },
          { id: 'stepmum', name: 'Grace', gender: 'woman', sex: 'female' },
          { id: 'halfBrother', name: 'Arjun', gender: 'man', sex: 'male' },
          { id: 'halfSister', name: 'Poppy', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner', current: false },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'mum', to: 'stepdad', kind: 'partner' },
          { from: 'stepdad', to: 'ego', kind: 'social' },
          { from: 'mum', to: 'halfBrother', kind: 'biological', carrier: true },
          { from: 'stepdad', to: 'halfBrother', kind: 'biological' },
          { from: 'dad', to: 'stepmum', kind: 'partner' },
          {
            from: 'stepmum',
            to: 'halfSister',
            kind: 'biological',
            carrier: true,
          },
          { from: 'dad', to: 'halfSister', kind: 'biological' },
        ],
      }}
    />
  ),
  play: expectPeople(7),
};

/**
 * A consanguineous partnership: the participant's parents are first cousins,
 * descended from one set of grandparents, so their partnership is drawn with
 * the double line.
 */
export const ConsanguineousParents: Story = {
  args: { requirement: 'grandparents', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          { id: 'ego', name: 'Amir', gender: 'man', sex: 'male', ego: true },
          { id: 'gm', name: 'Fatima', gender: 'woman', sex: 'female' },
          { id: 'gf', name: 'Yusuf', gender: 'man', sex: 'male' },
          { id: 'aunt', name: 'Leila', gender: 'woman', sex: 'female' },
          { id: 'uncle', name: 'Omar', gender: 'man', sex: 'male' },
          { id: 'auntPartner', name: 'Karim', gender: 'man', sex: 'male' },
          {
            id: 'unclePartner',
            name: 'Samira',
            gender: 'woman',
            sex: 'female',
          },
          { id: 'mother', name: 'Nadia', gender: 'woman', sex: 'female' },
          { id: 'father', name: 'Hassan', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'gm', to: 'gf', kind: 'partner' },
          { from: 'gm', to: 'aunt', kind: 'biological', carrier: true },
          { from: 'gf', to: 'aunt', kind: 'biological' },
          { from: 'gm', to: 'uncle', kind: 'biological', carrier: true },
          { from: 'gf', to: 'uncle', kind: 'biological' },
          { from: 'aunt', to: 'auntPartner', kind: 'partner' },
          { from: 'uncle', to: 'unclePartner', kind: 'partner' },
          { from: 'aunt', to: 'mother', kind: 'biological', carrier: true },
          { from: 'auntPartner', to: 'mother', kind: 'biological' },
          {
            from: 'unclePartner',
            to: 'father',
            kind: 'biological',
            carrier: true,
          },
          { from: 'uncle', to: 'father', kind: 'biological' },
          { from: 'mother', to: 'father', kind: 'partner' },
          { from: 'mother', to: 'ego', kind: 'biological', carrier: true },
          { from: 'father', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: expectPeople(9),
};

const genderDiverseFamily: Family = {
  people: [
    { id: 'ego', name: 'Eli', gender: 'man', sex: 'female', ego: true },
    { id: 'partner', name: 'Robin', gender: 'nonBinary', sex: 'male' },
    { id: 'child', name: 'Wren', gender: 'unknown', sex: 'intersex' },
    { id: 'sibling', name: 'Mara', gender: 'woman', sex: 'male' },
    { id: 'mother', name: 'Ruth', gender: 'woman', sex: 'female' },
    { id: 'father', name: 'Paul', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'mother', to: 'father', kind: 'partner' },
    { from: 'mother', to: 'ego', kind: 'biological', carrier: true },
    { from: 'father', to: 'ego', kind: 'biological' },
    { from: 'mother', to: 'sibling', kind: 'biological', carrier: true },
    { from: 'father', to: 'sibling', kind: 'biological' },
    { from: 'ego', to: 'partner', kind: 'partner' },
    { from: 'ego', to: 'child', kind: 'biological', carrier: true },
    { from: 'partner', to: 'child', kind: 'biological' },
  ],
};

/** The symbol a person is drawn with, read from the node's classes: a circle
 * is fully rounded, and a diamond's background is turned 45 degrees. */
const shapeOf = (person: HTMLElement) => {
  const node = person.querySelector('button');
  if (!node) return undefined;
  if (node.querySelector('.rotate-45')) return 'diamond';
  return node.classList.contains('rounded-full') ? 'circle' : 'square';
};

const expectShapes = async (
  canvasElement: HTMLElement,
  expected: Record<string, 'circle' | 'square' | 'diamond'>,
) => {
  for (const [id, shape] of Object.entries(expected)) {
    const person = canvasElement.querySelector<HTMLElement>(
      `[data-person-id="${id}"]`,
    );
    await expect(person && shapeOf(person)).toBe(shape);
  }
};

/**
 * Gender-diverse relatives, after the inclusive nomenclature: symbols follow
 * gender identity, whatever the sex assigned at birth. The participant is a
 * trans man who carried his child with his non-binary partner; his sibling is
 * a trans woman.
 */
export const GenderDiverseFamily: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory {...settings(args)} family={genderDiverseFamily} />
  ),
  play: async ({ canvasElement }) => {
    await expectPeople(6)({ canvasElement });
    // The codebook maps the symbol to gender identity.
    await expectShapes(canvasElement, {
      ego: 'square',
      partner: 'diamond',
      child: 'diamond',
      sibling: 'circle',
      mother: 'circle',
      father: 'square',
    });
  },
};

/**
 * The same family, with the codebook mapping each person's symbol to their
 * sex assigned at birth instead: the researcher chooses which attribute the
 * symbol follows.
 */
export const ShapeFollowsSexAssignedAtBirth: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={genderDiverseFamily}
      shapeBy="sexAssignedAtBirth"
    />
  ),
  play: async ({ canvasElement }) => {
    await expectPeople(6)({ canvasElement });
    await expectShapes(canvasElement, {
      ego: 'circle',
      partner: 'square',
      child: 'diamond',
      sibling: 'square',
      mother: 'circle',
      father: 'square',
    });
  },
};

/** The six options a new attribute is seeded with, plus two the researcher
 * added: "Trans woman", mapped to feminine words, and "Agender", which they
 * left unmapped. */
const researcherGenderIdentities: GenderIdentities = [
  { value: 'woman', label: 'Woman', words: 'feminine' },
  { value: 'man', label: 'Man', words: 'masculine' },
  { value: 'nonBinary', label: 'Non-binary', words: 'neutral' },
  { value: 'unknown', label: 'Don’t know', words: 'unknown' },
  { value: 'transWoman', label: 'Trans woman', words: 'feminine' },
  { value: 'agender', label: 'Agender' },
];

const unnamedFamilyOfResearcherOptions: Family = {
  people: [
    { id: 'ego', name: 'Ari', gender: 'man', sex: 'female', ego: true },
    { id: 'mum', gender: 'transWoman', sex: 'male' },
    { id: 'dad', gender: 'man', sex: 'male' },
    { id: 'sister', gender: 'transWoman', sex: 'male' },
    { id: 'sibling', gender: 'agender', sex: 'female' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
    { from: 'mum', to: 'sister', kind: 'biological' },
    { from: 'dad', to: 'sister', kind: 'biological' },
    { from: 'mum', to: 'sibling', kind: 'biological' },
    { from: 'dad', to: 'sibling', kind: 'biological' },
  ],
};

/**
 * The researcher defines the gender identity options and says which words each
 * takes. A "Trans woman" option mapped to feminine words describes that person
 * as a mother or sister; "Agender", which is not mapped, takes neutral words.
 * The side panel asks the question with the researcher's own options.
 */
export const ResearcherDefinedGenderIdentities: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={unnamedFamilyOfResearcherOptions}
      genderIdentities={researcherGenderIdentities}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mother = await canvas.findByRole('button', { name: /^Mother/ });
    await expect(canvas.getByRole('button', { name: /^Sister/ })).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^Father/ })).toBeVisible();
    // Unmapped, so neutral: not "Brother" or "Sister".
    await expect(
      canvas.getByRole('button', { name: /^Sibling/ }),
    ).toBeVisible();

    await userEvent.click(mother);
    const page = within(canvasElement.ownerDocument.body);
    await expect(
      await page.findByRole('radio', { name: 'Trans woman' }),
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: 'Agender' }),
    ).not.toBeChecked();
    // The six defaults are gone: only the researcher's options are offered.
    await expect(
      page.queryByRole('radio', { name: 'A different identity' }),
    ).toBeNull();
  },
};

const familyWithoutGenderIdentity: Family = {
  people: [
    { id: 'ego', name: 'Ari', sex: 'intersex', ego: true },
    { id: 'mum', sex: 'female' },
    { id: 'dad', sex: 'male' },
    { id: 'sibling', sex: 'intersex' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
    { from: 'mum', to: 'sibling', kind: 'biological' },
    { from: 'dad', to: 'sibling', kind: 'biological' },
  ],
};

/**
 * A stage that does not ask about gender identity. The gendered framing's
 * words follow sex assigned at birth instead: a parent recorded as female is
 * a mother, one recorded as male a father, and anyone else a parent or
 * sibling. The side panel has no gender question.
 */
export const WithoutGenderIdentity: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={familyWithoutGenderIdentity}
      askGenderIdentity={false}
      shapeBy="sexAssignedAtBirth"
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const mother = await canvas.findByRole('button', { name: /^Mother/ });
    await expect(canvas.getByRole('button', { name: /^Father/ })).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /^Sibling/ }),
    ).toBeVisible();

    await userEvent.click(mother);
    const page = within(canvasElement.ownerDocument.body);
    // Sex assigned at birth is still asked; gender identity is not.
    await expect(
      await page.findByRole('radiogroup', { name: /sex assigned at birth/i }),
    ).toBeVisible();
    await expect(
      page.queryByRole('radiogroup', { name: /gender/i }),
    ).toBeNull();
    await expect(page.queryByRole('radio', { name: 'Woman' })).toBeNull();
  },
};

/**
 * More than one partner. The participant has a child with a former partner,
 * a child with their current partner, and a step-child — the current
 * partner's child from an earlier relationship.
 */
export const MultiplePartners: Story = {
  args: { requirement: 'firstDegree', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Dana',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'former', name: 'Chris', gender: 'man', sex: 'male' },
          { id: 'current', name: 'Alex', gender: 'nonBinary', sex: 'female' },
          { id: 'partnersFormer', gender: 'man', sex: 'male' },
          { id: 'firstChild', name: 'Ben', gender: 'man', sex: 'male' },
          { id: 'secondChild', name: 'Cleo', gender: 'woman', sex: 'female' },
          { id: 'stepChild', name: 'Sky', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'ego', to: 'former', kind: 'partner', current: false },
          { from: 'ego', to: 'firstChild', kind: 'biological', carrier: true },
          { from: 'former', to: 'firstChild', kind: 'biological' },
          { from: 'ego', to: 'current', kind: 'partner' },
          { from: 'ego', to: 'secondChild', kind: 'biological', carrier: true },
          { from: 'current', to: 'secondChild', kind: 'social' },
          {
            from: 'current',
            to: 'partnersFormer',
            kind: 'partner',
            current: false,
          },
          {
            from: 'current',
            to: 'stepChild',
            kind: 'biological',
            carrier: true,
          },
          { from: 'partnersFormer', to: 'stepChild', kind: 'biological' },
          { from: 'ego', to: 'stepChild', kind: 'social' },
        ],
      }}
    />
  ),
  play: expectPeople(7),
};

// ---------------------------------------------------------------------------
// Unnamed relatives and completeness requirements
// ---------------------------------------------------------------------------

/**
 * Only Rob's name is known, so everyone else is shown by their kinship to
 * the participant. Switch the framing control to compare the gendered words
 * (Maternal grandmother, Half-brother) with the gamete ones (Egg parent,
 * Grandparent).
 */
export const UnnamedRelatives: Story = {
  args: { requirement: 'thirdDegree', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          { id: 'ego', ego: true, gender: 'woman', sex: 'female' },
          { id: 'mum', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Rob', gender: 'man', sex: 'male' },
          { id: 'nan', gender: 'woman', sex: 'female' },
          { id: 'robsMum', gender: 'woman', sex: 'female' },
          { id: 'aunt', gender: 'woman', sex: 'female' },
          { id: 'cousin', gender: 'nonBinary', sex: 'unknown' },
          { id: 'half', gender: 'man', sex: 'male' },
          { id: 'stepmum', gender: 'woman', sex: 'female' },
          { id: 'kid1', gender: 'unknown', sex: 'unknown' },
          { id: 'kid2', gender: 'unknown', sex: 'unknown' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner', current: false },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'nan', to: 'mum', kind: 'biological', carrier: true },
          { from: 'nan', to: 'aunt', kind: 'biological', carrier: true },
          { from: 'aunt', to: 'cousin', kind: 'biological', carrier: true },
          { from: 'robsMum', to: 'dad', kind: 'biological', carrier: true },
          { from: 'dad', to: 'stepmum', kind: 'partner' },
          { from: 'dad', to: 'half', kind: 'biological' },
          { from: 'stepmum', to: 'half', kind: 'biological', carrier: true },
          { from: 'ego', to: 'kid1', kind: 'biological', carrier: true },
          { from: 'ego', to: 'kid2', kind: 'biological', carrier: true },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(11)(context);
    if (context.args.framing !== 'gendered') return;
    const canvas = within(context.canvasElement);
    for (const name of [
      'Mother',
      'Maternal grandmother',
      'Paternal grandmother',
      'Maternal aunt',
      'Cousin',
      'Half-brother',
      'Stepmother',
      'Child 1',
    ]) {
      await expect(
        canvas.getByRole('button', { name: new RegExp(`^${name}`) }),
      ).toBeVisible();
    }
  },
};

/**
 * The study requires both biological parents. The ring in the corner fills
 * as they are added; pressing Next before it is full opens the list of what
 * is still needed.
 */
export const RequiresBothParents: Story = {
  args: { requirement: 'parents', enforcement: 'required' },
  render: (args) => <PedigreeStory {...settings(args)} />,
  play: expectPeople(1),
};

/**
 * The study recommends three generations. The participant has added their
 * parents and a brother; the list asks about their children, and each
 * parent's parents and siblings. Pressing Next with the list open continues
 * anyway.
 */
export const RecommendsThreeGenerations: Story = {
  args: { requirement: 'grandparents', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Sarietha',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Julie', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Rob', gender: 'man', sex: 'male' },
          { id: 'bro', name: 'Joshua', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'mum', to: 'bro', kind: 'biological', carrier: true },
          { from: 'dad', to: 'bro', kind: 'biological' },
        ],
      }}
    />
  ),
  play: expectPeople(4),
};

/**
 * A recommendation lets the participant continue on pressing Next again, but
 * only past what they have been shown. Pressing Next lists what is still
 * recommended; removing their mother then adds something new, so the next
 * press shows the list again rather than continuing, and the press after it
 * continues.
 */
export const ARecommendationIsShownAgainWhenItGrows: Story = {
  args: { requirement: 'firstDegree', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      followedByPeopleList
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(3)(context);
    const { canvasElement } = context;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const recommendations = () =>
      body.queryByRole('region', { name: /^Before you continue/ });

    // The first press lists what is recommended, and stays.
    await userEvent.click(canvas.getByTestId('next-button'));
    await waitFor(() =>
      expect(recommendations(), 'listed on the first press').not.toBeNull(),
    );
    await expect(canvas.queryByText(PEOPLE_PROMPT)).toBeNull();

    // Removing her mother adds a parent to the list.
    await userEvent.click(canvas.getByRole('button', { name: /^Rachel/ }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Remove from family' }),
    );
    const dialog = await body.findByRole('dialog', { name: 'Remove Rachel?' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove from family' }),
    );
    await expectPeople(2)(context);
    await waitFor(() => expect(recommendations()).toBeNull());

    // So the next press shows the list again, and stays.
    await userEvent.click(canvas.getByTestId('next-button'));
    await waitFor(() =>
      expect(recommendations(), 'listed again').not.toBeNull(),
    );
    await expect(canvas.queryByText(PEOPLE_PROMPT)).toBeNull();

    // The press after it continues.
    await leaveForPeopleList(canvasElement);
  },
};

/** With one biological parent recorded, the first press recommends adding
 * the other; removing that parent leaves both to add, which is more than the
 * list showed, so the next press shows it again. */
export const RemovingTheOnlyParentShowsTheRecommendationAgain: Story = {
  args: { requirement: 'parents', enforcement: 'recommended' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      followedByPeopleList
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ella',
            gender: 'woman',
            sex: 'female',
            ego: true,
          },
          { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        ],
        links: [{ from: 'mum', to: 'ego', kind: 'biological', carrier: true }],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(2)(context);
    const { canvasElement } = context;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const recommendations = () =>
      body.queryByRole('region', { name: /^Before you continue/ });

    await userEvent.click(canvas.getByTestId('next-button'));
    await waitFor(() =>
      expect(recommendations(), 'listed on the first press').not.toBeNull(),
    );

    await userEvent.click(canvas.getByRole('button', { name: /^Rachel/ }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Remove from family' }),
    );
    const dialog = await body.findByRole('dialog', { name: 'Remove Rachel?' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Remove from family' }),
    );
    await expectPeople(1)(context);
    await waitFor(() => expect(recommendations()).toBeNull());

    await userEvent.click(canvas.getByTestId('next-button'));
    await waitFor(() =>
      expect(recommendations(), 'listed again').not.toBeNull(),
    );
    await expect(canvas.queryByText(PEOPLE_PROMPT)).toBeNull();

    await leaveForPeopleList(canvasElement);
  },
};

const panelOf = (canvasElement: HTMLElement) =>
  canvasElement.ownerDocument.querySelector(
    '[data-testid="pedigree-person-panel"]',
  );

/** Moves on to the list of people after the pedigree. */
async function leaveForPeopleList(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('next-button'));
  await canvas.findByText(PEOPLE_PROMPT);
}

/** Goes back from the list of people to the pedigree. */
async function returnToPedigree(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByTestId('previous-button'));
  await canvas.findByTestId('pedigree-canvas');
}

/** Two unnamed sisters, each with a named partner, and unnamed parents. */
const sistersWithPartners: Family = {
  people: [
    { id: 'ego', name: 'Ari', gender: 'nonBinary', sex: 'intersex', ego: true },
    { id: 'mum', gender: 'woman', sex: 'female' },
    { id: 'dad', gender: 'man', sex: 'male' },
    { id: 'sis1', gender: 'woman', sex: 'female' },
    { id: 'sis2', gender: 'woman', sex: 'female' },
    { id: 'tom', name: 'Tom', gender: 'man', sex: 'male' },
    { id: 'sam', name: 'Sam', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'mum', to: 'dad', kind: 'partner' },
    { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
    { from: 'dad', to: 'ego', kind: 'biological' },
    { from: 'mum', to: 'sis1', kind: 'biological', carrier: true },
    { from: 'dad', to: 'sis1', kind: 'biological' },
    { from: 'mum', to: 'sis2', kind: 'biological', carrier: true },
    { from: 'dad', to: 'sis2', kind: 'biological' },
    { from: 'sis1', to: 'tom', kind: 'partner' },
    { from: 'sis2', to: 'sam', kind: 'partner' },
  ],
};

/**
 * Leaving the stage saves a name for everyone the participant left unnamed:
 * their kinship word, told apart by a named relative where two would share
 * it, so the next stage can show who is who. The canvas shows the same
 * labels throughout. Coming back, they are unnamed again, with an empty name
 * question; a name typed for one of them is theirs from then on, and the
 * others' labels follow at once.
 */
export const UnnamedPeopleAreLabelledOnLeavingAndUnnamedOnReturn: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={sistersWithPartners}
      followedByPeopleList
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const labels = [
      'Sister (partner of Tom)',
      'Sister (partner of Sam)',
      'Mother',
      'Father',
    ];
    // The canvas shows the labels the next stage will.
    for (const label of labels) {
      await expect(
        await canvas.findByRole('button', { name: label }),
      ).toBeVisible();
    }
    await expect(
      canvas.queryByRole('button', { name: /^Sister \d/ }),
    ).toBeNull();

    await leaveForPeopleList(canvasElement);
    for (const name of [...labels, 'Tom', 'Sam']) {
      await expect(await canvas.findByText(name)).toBeInTheDocument();
    }

    // Back on the pedigree, the saved labels are not names: the canvas
    // shows the same labels, and the name question is empty.
    await returnToPedigree(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Sister (partner of Tom)' }),
    );
    const nameField = await body.findByRole('textbox', { name: /^Name/ });
    await expect(nameField).toHaveValue('');

    // A typed name is the participant's own.
    await userEvent.type(nameField, 'Bea');
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await canvas.findByRole('button', { name: /^Bea/ });

    // With only one unnamed sister left, she is simply "Sister", on the
    // canvas at once and on the next stage.
    await canvas.findByRole('button', { name: 'Sister' });
    await expect(
      canvas.queryByRole('button', { name: /partner of/ }),
    ).toBeNull();
    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Bea')).toBeInTheDocument();
    await expect(await canvas.findByText('Sister')).toBeInTheDocument();
    await expect(canvas.queryByText(/partner of/)).toBeNull();

    // And Bea's name stays hers on the next visit.
    await returnToPedigree(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: /^Bea/ }));
    await expect(
      await body.findByRole('textbox', { name: /^Name/ }),
    ).toHaveValue('Bea');
    await userEvent.click(await body.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    // Typing the very words of a saved label makes them a typed name too.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Sister/ }),
    );
    const sisterName = await body.findByRole('textbox', { name: /^Name/ });
    await expect(sisterName).toHaveValue('');
    await userEvent.type(sisterName, 'Sister');
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Sister/ }),
    );
    await expect(
      await body.findByRole('textbox', { name: /^Name/ }),
    ).toHaveValue('Sister');
  },
};

/**
 * A form after the pedigree renames someone the pedigree gave a label. The
 * pedigree's record identifies the value it wrote, not the label's words, so
 * coming back it reads the new name as theirs: it shows it, and leaving
 * again does not write a label over it.
 */
export const ANameGivenOnALaterStageIsKept: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      followedByNameForm
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
          },
          { id: 'partner', gender: 'man', sex: 'male' },
        ],
        links: [{ from: 'ego', to: 'partner', kind: 'partner' }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const next = () => userEvent.click(canvas.getByTestId('next-button'));
    const nameField = () =>
      canvas.findByRole('textbox', { name: NAME_FORM_PROMPT });

    /** From the pedigree, through the form's introduction and the
     * participant, to the form for their partner. */
    const toPartnersForm = async () => {
      await next();
      await canvas.findByText('Please continue.');
      await next();
      await waitFor(async () => expect(await nameField()).toHaveValue('Ari'));
      await next();
      await waitFor(async () =>
        expect(await nameField()).not.toHaveValue('Ari'),
      );
      return nameField();
    };

    await canvas.findByRole('button', { name: 'Partner' });
    const field = await toPartnersForm();
    await expect(field).toHaveValue('Partner');
    await userEvent.clear(field);
    await userEvent.type(field, 'Sam');
    await next();
    await canvas.findByText('After the pedigree.');

    // Back on the pedigree, Sam is named.
    await waitFor(
      async () => {
        if (!canvas.queryByTestId('pedigree-canvas')) {
          await userEvent.click(canvas.getByTestId('previous-button'));
        }
        await expect(canvas.getByTestId('pedigree-canvas')).toBeVisible();
      },
      { timeout: 10_000 },
    );
    await canvas.findByRole('button', { name: 'Sam' });
    await expect(canvas.queryByRole('button', { name: 'Partner' })).toBeNull();

    // Leaving again keeps the name.
    await expect(await toPartnersForm()).toHaveValue('Sam');
  },
};

/**
 * The participant is never asked their name: they are shown as "You", their
 * panel asks only what the family tree needs (their gender identity, their
 * sex assigned at birth and the researcher's own questions), and saving it
 * leaves alone a name they were given elsewhere in the interview.
 */
export const TheParticipantIsNotAskedTheirName: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={sistersWithPartners}
      withFormFields
      followedByPeopleList
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole('button', { name: 'You' }));
    await waitFor(() => expect(panelOf(canvasElement)).not.toBeNull());
    const panel = within(panelOf(canvasElement) as HTMLElement);
    // Their panel's sections address them.
    await expect(
      await panel.findByRole('heading', { name: 'About you', level: 3 }),
    ).toBeInTheDocument();
    await expect(
      panel.getByRole('heading', { name: 'More about you', level: 3 }),
    ).toBeInTheDocument();
    await expect(panel.queryByText('About this person')).toBeNull();
    await expect(panel.queryByText('More about this person')).toBeNull();
    await expect(panel.queryByRole('textbox', { name: /name/i })).toBeNull();
    await expect(panel.queryByText(/name/i)).toBeNull();
    // What the family tree needs, and the researcher's questions, remain.
    await expect(
      await body.findByRole('radiogroup', { name: /gender identity/i }),
    ).toBeInTheDocument();
    await expect(
      await body.findByRole('radiogroup', { name: /sex assigned at birth/i }),
    ).toBeInTheDocument();
    await expect(
      await body.findByRole('spinbutton', { name: /Age/ }),
    ).toBeInTheDocument();
    const [living] = await panel.findAllByRole('radio', { name: 'Yes' });
    await userEvent.click(living!);
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await canvas.findByRole('button', { name: 'You' });

    // A relative's panel is about them.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Sister \(partner of Tom\)/ }),
    );
    await body.findByRole('heading', { name: 'About this person', level: 3 });
    await body.findByRole('heading', {
      name: 'More about this person',
      level: 3,
    });
    await userEvent.click(await body.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    // The name the participant's person already held is untouched, and
    // nobody is given a label in its place.
    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Ari')).toBeInTheDocument();
    await expect(canvas.queryByText('You')).toBeNull();
  },
};

/**
 * A relative added on a return visit changes who shares a kinship word, and
 * the labels follow, on the canvas and when saved on leaving again: the
 * sister first saved as "Sister" is numbered with the new one, since no
 * relative tells them apart.
 */
export const LabelsAreGivenAfreshAfterAddingARelative: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      followedByPeopleList
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
          },
          { id: 'mum', name: 'Julie', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Rob', gender: 'man', sex: 'male' },
          { id: 'sis', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'mum', to: 'sis', kind: 'biological', carrier: true },
          { from: 'dad', to: 'sis', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^Sister/ });

    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Sister')).toBeInTheDocument();

    // Add another sister, unnamed.
    await returnToPedigree(canvasElement);
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(5),
    );
    await canvas.findByRole('button', { name: 'Sister 1' });
    await canvas.findByRole('button', { name: 'Sister 2' });

    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Sister 1')).toBeInTheDocument();
    await expect(await canvas.findByText('Sister 2')).toBeInTheDocument();
    await expect(canvas.queryByText('Sister')).toBeNull();
  },
};

/** A person's relationship to the participant in the session last written,
 * or undefined when they hold none. */
const nodesInSession = () => lastSynced?.network.nodes ?? [];

const relationshipInSession = (personId: string) => {
  const node = nodesInSession().find(
    (candidate) => candidate[entityPrimaryKeyProperty] === personId,
  );
  const values = Object.values(node?.[entityAttributesProperty] ?? {});
  const held = values.find(
    (value): value is [string] =>
      Array.isArray(value) &&
      typeof value[0] === 'string' &&
      (PEDIGREE_RELATIONSHIPS_TO_PARTICIPANT as readonly string[]).includes(
        value[0],
      ),
  );
  return held?.[0];
};

/**
 * The stage records each person's relationship to the participant. Leaving
 * it writes the relationship of everyone connected to the participant, named
 * or not, already in the family or just added; clears one the participant
 * holds; and clears one held by someone no longer connected to them, whose
 * relationship it can no longer say.
 */
export const RelationshipsAreRecordedOnLeaving: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      recordsRelationship
      followedByPeopleList
      onSync={recordSession}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
            relationship: 'child',
          },
          { id: 'mum', gender: 'woman', sex: 'female' },
          { id: 'dad', name: 'Rob', gender: 'man', sex: 'male' },
          // Recorded as a sibling on an earlier visit, but no longer
          // connected to the participant.
          {
            id: 'former',
            name: 'Kim',
            gender: 'woman',
            sex: 'female',
            relationship: 'sibling',
          },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await canvas.findByRole('button', { name: /^Mother/ });

    // Add a sister, unnamed.
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await canvas.findByRole('button', { name: /^Sister/ });

    await leaveForPeopleList(canvasElement);
    await waitFor(() => expect(relationshipInSession('mum')).toBe('parent'));
    await expect(relationshipInSession('dad')).toBe('parent');
    await expect(relationshipInSession('ego')).toBeUndefined();
    await expect(relationshipInSession('former')).toBeUndefined();
    const sister = nodesInSession().find(
      (node) =>
        !['ego', 'mum', 'dad', 'former'].includes(
          node[entityPrimaryKeyProperty],
        ),
    );
    await expect(
      relationshipInSession(sister?.[entityPrimaryKeyProperty] ?? ''),
    ).toBe('sibling');
  },
};

/**
 * The codebook requires every name to be given, and to be unique. A name may
 * still be left blank — anyone unnamed is given a label on leaving — so the
 * question reads "Name (optional)", and an unnamed person is not missing a
 * detail. A typed name must not repeat another typed name, but may repeat a
 * label saved for someone else, who is then given a different one.
 */
export const RequiredNamesMayBeLeftBlankButMustBeUnique: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      nameValidation={{ required: true, unique: true }}
      followedByPeopleList
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
          },
          { id: 'mum', name: 'Julie', gender: 'woman', sex: 'female' },
          { id: 'dad', gender: 'man', sex: 'male' },
          { id: 'sis', gender: 'woman', sex: 'female' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
          { from: 'mum', to: 'sis', kind: 'biological', carrier: true },
          { from: 'dad', to: 'sis', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const nameField = () => body.findByRole('textbox', { name: /^Name/ });
    const save = async () =>
      userEvent.click(await body.findByRole('button', { name: 'Save' }));

    // The unnamed father is missing nothing, and can be saved unnamed.
    const father = await canvas.findByRole('button', { name: /^Father$/ });
    await userEvent.click(father);
    await body.findByText('Name (optional)');
    await save();
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    // Julie is saved again with her own name, which is not a duplicate.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Julie/ }),
    );
    await expect(await nameField()).toHaveValue('Julie');
    await save();
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Father')).toBeInTheDocument();
    await returnToPedigree(canvasElement);

    // Another person's typed name is refused.
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Sister/ }),
    );
    await userEvent.type(await nameField(), 'Julie');
    await save();
    await body.findByText('This value is used elsewhere. It must be unique.');
    await expect(panelOf(canvasElement)).not.toBeNull();

    // The label saved for the father is not: he is given another.
    await userEvent.clear(await nameField());
    await userEvent.type(await nameField(), 'Father');
    await save();
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await leaveForPeopleList(canvasElement);
    await expect(
      await canvas.findByText('Father (partner of Julie)'),
    ).toBeInTheDocument();
    await expect(await canvas.findByText('Father')).toBeInTheDocument();
  },
};

/**
 * Without a rule on the name attribute in the codebook, the name question is
 * labelled optional and a person can be saved without a name.
 */
export const NameIsOptionalByDefault: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
          },
          { id: 'dad', gender: 'man', sex: 'male' },
        ],
        links: [{ from: 'dad', to: 'ego', kind: 'biological' }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Father/ }),
    );
    // A relative's first section is about them.
    await body.findByRole('heading', { name: 'About this person', level: 3 });
    await body.findByText('Name (optional)');
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
  },
};

/** The session as the interview last wrote it, for the story recording it. */
let lastSynced: SessionSnapshot | undefined;
const recordSession: SyncHandler = (_interviewId, session) => {
  lastSynced = session;
  return Promise.resolve();
};

/** How many people and relationships each session written held, in the
 * order written. */
const sessionSizes: string[] = [];
const recordSessionSizes: SyncHandler = (_interviewId, session) => {
  sessionSizes.push(
    `people: ${session.network.nodes.length}, relationships: ${session.network.edges.length}`,
  );
  return Promise.resolve();
};

/**
 * Adding someone saves everyone the addition draws, and how they are
 * related, as one change. A sister added to a participant with no parents
 * yet brings an unnamed couple as their parents, and no session written along
 * the way holds some of the three without the rest, or people without their
 * relationships.
 */
export const AddingARelativeIsOneChange: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
        ],
        links: [],
      }}
      onSync={recordSessionSizes}
    />
  ),
  play: async ({ canvasElement }) => {
    sessionSizes.length = 0;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(4),
    );

    await waitFor(() =>
      expect(sessionSizes.at(-1)).toMatch(
        /^people: 4, relationships: [1-9]\d*$/,
      ),
    );
    const added = sessionSizes.at(-1);
    for (const size of sessionSizes) {
      await expect(['people: 1, relationships: 0', added]).toContain(size);
    }
  },
};

/** Every value written encrypted in the session last written. */
const encryptedValues = () =>
  (lastSynced?.network.nodes ?? []).flatMap((node) =>
    Object.keys(node[entitySecureAttributesMeta] ?? {}).map(
      (variable) => node[entityAttributesProperty][variable],
    ),
  );

/** Whether the text is stored as it is anywhere in the session last written. */
const storedAsText = (text: string) =>
  (lastSynced?.network.nodes ?? []).some((node) =>
    Object.values(node[entityAttributesProperty]).includes(text),
  );

const PASSPHRASE = 'blue whale lighthouse';

/**
 * The study encrypts names, and no passphrase has been chosen yet in this
 * interview. Until the participant chooses one (typing it twice, through the
 * interview's passphrase prompter), the family cannot be changed, and a
 * notice says why. Once it is chosen, a name typed for a new relative is
 * stored encrypted and shown on the canvas decrypted. Leaving, the unnamed
 * parents are given labels, stored encrypted too; coming back, those labels
 * are read as unnamed again, while the typed name is decrypted into the name
 * question.
 */
export const EncryptedNames: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      encryptedNames
      followedByPeopleList
      onSync={recordSession}
      family={{
        people: [
          { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
          { id: 'mum', gender: 'woman', sex: 'female' },
          { id: 'dad', gender: 'man', sex: 'male' },
        ],
        links: [
          { from: 'mum', to: 'dad', kind: 'partner' },
          { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
          { from: 'dad', to: 'ego', kind: 'biological' },
        ],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    // Without the passphrase, the family waits for it, and says so.
    const notice = await canvas.findByTestId('pedigree-passphrase-notice');
    await expect(notice).toHaveTextContent(
      'Enter your passphrase to see the names in your family and to add or change people.',
    );
    await expect(canvas.getByTestId('pedigree-tool-connect')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Chosen through the interview's passphrase prompter, as the first
    // passphrase of the interview.
    await choosePassphraseInPrompter(PASSPHRASE);
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-passphrase-notice')).toBeNull(),
    );

    // A sister, named.
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Bea',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    // Shown by name, and stored encrypted.
    await canvas.findByRole('button', { name: /^Bea/ });
    await waitFor(() => {
      expect(storedAsText('Bea')).toBe(false);
      expect(encryptedValues()).toHaveLength(1);
    });

    // Leaving gives the parents labels, encrypted as well, which the next
    // stage decrypts.
    await leaveForPeopleList(canvasElement);
    for (const name of ['Bea', 'Mother', 'Father']) {
      await expect(await canvas.findByText(name)).toBeInTheDocument();
    }
    await waitFor(() => {
      expect(encryptedValues()).toHaveLength(3);
      for (const label of ['Mother', 'Father']) {
        expect(storedAsText(label)).toBe(false);
      }
    });

    // Back on the pedigree, the labels are not names, and the typed name is.
    await returnToPedigree(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Mother/ }),
    );
    await expect(
      await body.findByRole('textbox', { name: /^Name/ }),
    ).toHaveValue('');
    await userEvent.click(await body.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await userEvent.click(await canvas.findByRole('button', { name: /^Bea/ }));
    await expect(
      await body.findByRole('textbox', { name: /^Name/ }),
    ).toHaveValue('Bea');
  },
};

/** The value each person holds under the attribute id `__proto__`, in the
 * session last written: their own property, never the prototype's. */
const protoValues = () =>
  (lastSynced?.network.nodes ?? []).flatMap((node) => {
    const attributes = node[entityAttributesProperty];
    return Object.hasOwn(attributes, '__proto__')
      ? [Object.getOwnPropertyDescriptor(attributes, '__proto__')?.value]
      : [];
  });

/**
 * The codebook admits `__proto__` as an attribute id. Bound to the name, a
 * name typed for a new relative is recorded and shown, and opens in the
 * name question again.
 */
export const NameAttributeNamedProto: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      protoAttribute="name"
      onSync={recordSession}
      family={{
        people: [
          { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
        ],
        links: [],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Julie',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await waitFor(() => expect(protoValues()).toContain('Julie'));
    await userEvent.click(
      await canvas.findByRole('button', { name: /^Julie/ }),
    );
    await expect(
      await body.findByRole('textbox', { name: /^Name/ }),
    ).toHaveValue('Julie');
  },
};

/**
 * The same, for one of the researcher's own fields: an age given for a
 * relative is recorded, and opens in the question again.
 */
export const FormFieldNamedProto: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      withFormFields
      protoAttribute="age"
      onSync={recordSession}
      family={{
        people: [
          { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
          { id: 'dad', name: 'Rob', gender: 'man', sex: 'male' },
        ],
        links: [{ from: 'dad', to: 'ego', kind: 'biological' }],
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    await userEvent.click(await canvas.findByRole('button', { name: /^Rob/ }));
    await waitFor(() => expect(panelOf(canvasElement)).not.toBeNull());
    const panel = within(panelOf(canvasElement) as HTMLElement);
    await userEvent.type(
      await panel.findByRole('spinbutton', { name: /Age/ }),
      '61',
    );
    const [living] = await panel.findAllByRole('radio', { name: 'Yes' });
    await userEvent.click(living!);
    await userEvent.click(await body.findByRole('button', { name: 'Save' }));
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await waitFor(() => expect(protoValues()).toEqual([61]));
    await userEvent.click(await canvas.findByRole('button', { name: /^Rob/ }));
    await expect(
      await body.findByRole('spinbutton', { name: /Age/ }),
    ).toHaveValue(61);
  },
};

/**
 * The study encrypts one of its own questions, but not names, and no
 * passphrase has been chosen yet in this interview. Until the participant
 * chooses one, nobody can be added or changed, and a notice says why. Once
 * it is chosen, an answer to that question is stored encrypted, while the
 * name is stored as typed, and the answer opens decrypted in the question
 * again.
 */
export const EncryptedFormField: Story = {
  args: { requirement: 'none' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      encryptedFormField
      onSync={recordSession}
      family={describedFamily}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);

    const notice = await canvas.findByTestId('pedigree-passphrase-notice');
    await expect(notice).toHaveTextContent(
      'Enter your passphrase to add or change people in your family.',
    );
    await choosePassphraseInPrompter(PASSPHRASE);
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-passphrase-notice')).toBeNull(),
    );

    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-sibling'));
    await userEvent.type(
      await body.findByRole('textbox', { name: /^Name/ }),
      'Bea',
    );
    await userEvent.click(await body.findByRole('radio', { name: 'Woman' }));
    await userEvent.click(await body.findByRole('radio', { name: 'Female' }));
    await userEvent.type(
      await body.findByRole('textbox', { name: NICKNAME_PROMPT }),
      'Bee',
    );
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());

    await waitFor(() => {
      expect(storedAsText('Bea')).toBe(true);
      expect(storedAsText('Bee')).toBe(false);
      expect(encryptedValues()).toHaveLength(1);
    });

    await userEvent.click(await canvas.findByRole('button', { name: /^Bea/ }));
    await expect(
      await body.findByRole('textbox', { name: NICKNAME_PROMPT }),
    ).toHaveValue('Bee');
  },
};

const WRONG_PASSPHRASE = 'grey whale lighthouse';

// Deriving the key takes a moment, and longer under a loaded test run.
const CHECK_TIMEOUT = 10_000;

/** Opens the passphrase dialog from the notice under the family tree, in an
 * interview whose passphrase was chosen earlier. */
async function openPassphraseFromNotice(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Enter passphrase' }),
  );
  return within(
    await body.findByRole('dialog', { name: 'Enter your Passphrase' }),
  );
}

// The label also carries a visual required marker.
const passphraseField = (dialog: ReturnType<typeof within>) =>
  dialog.getByLabelText(/^Passphrase/, { selector: 'input' });

/** Enters the passphrase chosen earlier through the notice under the family
 * tree, and waits for it to be accepted. */
async function enterPassphraseFromNotice(
  canvasElement: HTMLElement,
  passphrase: string,
) {
  const body = within(canvasElement.ownerDocument.body);
  const dialog = await openPassphraseFromNotice(canvasElement);
  await userEvent.type(passphraseField(dialog), passphrase);
  await userEvent.click(
    dialog.getByRole('button', { name: 'Submit passphrase' }),
  );
  await waitFor(() => expect(body.queryByRole('dialog')).toBeNull(), {
    timeout: CHECK_TIMEOUT,
  });
}

/** A returning participant's family: the mother was named on an earlier
 * visit, and the father was left unnamed. */
const returningFamily = (args: StoryArgs): StoryOptions => ({
  ...settings(args),
  encryptedNames: true,
  followedByPeopleList: true,
  family: {
    people: [
      { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
      { id: 'mum', gender: 'woman', sex: 'female' },
      { id: 'dad', gender: 'man', sex: 'male' },
    ],
    links: [
      { from: 'mum', to: 'dad', kind: 'partner' },
      { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
      { from: 'dad', to: 'ego', kind: 'biological' },
    ],
  },
});

/**
 * The mother's name, Julie, was saved encrypted on an earlier visit, under
 * the passphrase chosen then. Returning, the participant enters another
 * passphrase: the dialog turns it away, saying it does not match the one
 * used earlier, and nothing is unlocked. The family stays as it was: it
 * cannot be changed, people are shown by how they are related, and the stage
 * writes nothing, not even the labels it would save on leaving. The right
 * passphrase shows her name, and lets the family be changed.
 */
export const WrongPassphrase: Story = {
  args: { requirement: 'none' },
  loaders: [
    async ({ args }) => ({
      protection: await protectNames(returningFamily(args), PASSPHRASE, {
        mum: 'Julie',
      }),
    }),
  ],
  render: (args, { loaded }) => {
    const protection: unknown = loaded.protection;
    return (
      <PedigreeStory
        {...returningFamily(args)}
        {...(isEarlierProtection(protection) ? { protection } : {})}
        onSync={recordSession}
      />
    );
  },
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const notice = () => canvas.findByTestId('pedigree-passphrase-notice');
    const lockedNotice =
      'Enter your passphrase to see the names in your family and to add or change people.';

    await expect(await notice()).toHaveTextContent(lockedNotice);

    // The passphrase was chosen earlier, so it is asked for once, without
    // confirmation, and a different one is turned away in the dialog.
    const dialog = await openPassphraseFromNotice(canvasElement);
    await expect(
      dialog.queryByLabelText(/^Confirm Passphrase/, { selector: 'input' }),
    ).toBeNull();
    const field = passphraseField(dialog);
    await userEvent.type(field, WRONG_PASSPHRASE);
    await userEvent.click(
      dialog.getByRole('button', { name: 'Submit passphrase' }),
    );
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'), {
      timeout: CHECK_TIMEOUT,
    });
    await expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());

    // Nothing was unlocked: the family still waits for the passphrase, and
    // cannot be changed.
    await expect(await notice()).toHaveTextContent(lockedNotice);
    await expect(canvas.getByTestId('pedigree-tool-connect')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await expect(canvas.queryByTestId('pedigree-menu-sibling')).toBeNull();
    // She is shown by how she is related.
    await canvas.findByRole('button', { name: /^Mother/ });
    await expect(canvas.queryByRole('button', { name: /^Julie/ })).toBeNull();

    // Going on waits for the passphrase, and nothing is written: her name
    // keeps its ciphertext, and the father is given no label.
    await userEvent.click(canvas.getByTestId('next-button'));
    await body.findByRole('dialog', { name: 'Enter your Passphrase' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
    await expect(canvas.getByTestId('pedigree-canvas')).toBeVisible();
    await expect(canvas.queryByText(PEOPLE_PROMPT)).toBeNull();
    await expect(storedAsText('Father')).toBe(false);
    await expect(encryptedValues().length).toBeLessThanOrEqual(1);

    // The right passphrase shows her name, and the family can be changed.
    await enterPassphraseFromNotice(canvasElement, PASSPHRASE);
    await canvas.findByRole('button', { name: /^Julie/ });
    await waitFor(() =>
      expect(canvas.queryByTestId('pedigree-passphrase-notice')).toBeNull(),
    );
    await expect(
      canvas.getByTestId('pedigree-tool-connect'),
    ).not.toHaveAttribute('aria-disabled', 'true');

    // Now leaving saves the father's label, encrypted with it.
    await leaveForPeopleList(canvasElement);
    for (const name of ['Julie', 'Father']) {
      await expect(await canvas.findByText(name)).toBeInTheDocument();
    }
    await waitFor(() => {
      expect(encryptedValues()).toHaveLength(2);
      expect(storedAsText('Father')).toBe(false);
    });
  },
};

/**
 * Recording an answer never stands in for the family. The schema 8 pedigree
 * lost a whole family when "no children" was ticked before it was finalized:
 * the answer marked the pedigree as finalized, so the family was never
 * written. Here a parent is added, the participant chooses their wording and
 * says they have no siblings and no children, and leaves and returns: the
 * parent and the relationship are in the session from the moment they are
 * added, the answers sit on the participant beside them, and the stage's
 * record holds only the wording and the labels it saved.
 */
export const RecordingAnswersKeepsTheFamily: Story = {
  args: {
    framing: 'participantPreference',
    requirement: 'firstDegree',
    enforcement: 'recommended',
  },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
        people: [
          {
            id: 'ego',
            name: 'Ari',
            gender: 'nonBinary',
            sex: 'intersex',
            ego: true,
          },
        ],
        links: [],
      }}
      followedByPeopleList
      onSync={recordSession}
    />
  ),
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // The participant is seeded as `ego`; the only other person is the
    // parent this adds.
    const parentId = () =>
      lastSynced?.network.nodes.find(
        (node) => node[entityPrimaryKeyProperty] !== 'ego',
      )?.[entityPrimaryKeyProperty];
    const expectFamilyInSession = async () => {
      await waitFor(() => expect(parentId()).toBeDefined());
      const parent = parentId();
      await expect(
        lastSynced?.network.edges.some(
          (edge) =>
            (edge.from === parent && edge.to === 'ego') ||
            (edge.from === 'ego' && edge.to === parent),
        ),
      ).toBe(true);
      await expect(notRecordedInSession('ego')).toEqual([
        'noSiblings',
        'noChildren',
      ]);
      const records = Object.values(lastSynced?.stageMetadata ?? {});
      await expect(records).toContainEqual(
        expect.objectContaining({ framing: 'gamete' }),
      );
      for (const record of records) {
        await expect(
          Object.keys(record as Record<string, unknown>).every((key) =>
            ['framing', 'generatedLabels'].includes(key),
          ),
        ).toBe(true);
      }
    };

    await body.findByText(FRAMING_TITLE, {}, { timeout: 5000 });
    await userEvent.click(
      body.getByRole('option', { name: /Egg parent, sperm parent, sibling/ }),
    );
    await waitFor(() => expect(body.queryByText(FRAMING_TITLE)).toBeNull());

    // A parent, left unnamed, written as soon as they are added.
    await userEvent.hover(await canvas.findByRole('button', { name: /^You/ }));
    await userEvent.click(await canvas.findByTestId('pedigree-menu-parent'));
    await waitFor(() => expect(panelOf(canvasElement)).not.toBeNull());
    const panel = within(panelOf(canvasElement) as HTMLElement);
    await userEvent.click(
      within(
        await panel.findByRole('radiogroup', { name: /^Gender identity/ }),
      ).getByRole('radio', { name: 'Woman' }),
    );
    await userEvent.click(
      within(
        await panel.findByRole('radiogroup', {
          name: /^Sex assigned at birth/,
        }),
      ).getByRole('radio', { name: 'Female' }),
    );
    await userEvent.click(
      within(
        await panel.findByRole('radiogroup', {
          name: /^Did this parent carry the pregnancy\?/,
        }),
      ).getByRole('radio', { name: 'Yes' }),
    );
    await userEvent.click(
      await body.findByRole('button', { name: 'Add to family' }),
    );
    await waitFor(() => expect(panelOf(canvasElement)).toBeNull());
    await waitFor(() => expect(parentId()).toBeDefined());

    // "No siblings" and "no children", answered from the checklist.
    await userEvent.click(canvas.getByTestId('pedigree-completeness'));
    await userEvent.click(
      await body.findByRole('button', {
        name: 'I have no biological siblings',
      }),
    );
    await userEvent.click(
      await body.findByRole('button', {
        name: 'I have no biological children',
      }),
    );
    await expectFamilyInSession();

    // Leaving (Next again past the recommended list) and coming back changes
    // none of it, and the parent is still drawn.
    await userEvent.click(canvas.getByTestId('next-button'));
    await leaveForPeopleList(canvasElement);
    await expect(await canvas.findByText('Egg parent')).toBeInTheDocument();
    await expectFamilyInSession();
    await returnToPedigree(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(2),
    );
    await expectFamilyInSession();
  },
};
