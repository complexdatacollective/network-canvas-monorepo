import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

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
} from '@codaco/shared-consts';

import type { SessionSnapshot, SyncHandler } from '../..';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';
import { generateSecureAttributes } from '../Anonymisation/utils';

const PROMPT =
  'Add the members of your family. Select a person to add their relatives.';

/** The next stage's list of everyone in the family, by the name each was
 * given: the stage after the pedigree, when a story adds it. */
const PEOPLE_PROMPT = 'Everyone in your family, by their saved names.';

/** The question on the form after the pedigree, when a story adds it. */
const NAME_FORM_PROMPT = 'What is this person called?';

/** A name as the interview stores it encrypted: ciphertext, with the salt
 * and initialisation vector it was made with. */
type EncryptedSeedName = {
  data: number[];
  secure: { iv: number[]; salt: number[] };
};

type SeedPerson = {
  id: string;
  name?: string;
  /** A name stored encrypted, on a stage with encrypted names. */
  encryptedName?: EncryptedSeedName;
  /** The value of one of the gender identity attribute's options. */
  gender?: string;
  sex?: PedigreeSexAssignedAtBirth;
  ego?: boolean;
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

type Family = { people: SeedPerson[]; links: SeedLink[] };

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
};

/** What only the story's shell takes: how the interview is hosted. */
type ShellOptions = {
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

function buildInterview({
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
}: StoryOptions) {
  const si = new SyntheticInterview(1);
  if (encryptedNames) si.setExperiments({ encryptedVariables: true });
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

  for (const person of family?.people ?? []) {
    si.addManualNode(stage.id, stage.personType, person.id, {
      [stage.ego]: person.ego === true,
      ...(person.name ? { [stage.name]: person.name } : {}),
      ...(person.gender && stage.genderIdentity
        ? { [stage.genderIdentity]: [person.gender] }
        : {}),
      ...(person.sex ? { [stage.sexAssignedAtBirth]: [person.sex] } : {}),
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
  if (encryptedNames) {
    const personType = payload.protocol.codebook.node[people.id] as {
      variables: Record<string, { encrypted?: boolean }>;
    };
    const name = personType.variables[stage.name];
    if (name) name.encrypted = true;
    // Names saved encrypted on an earlier visit.
    for (const person of family?.people ?? []) {
      const encrypted = person.encryptedName;
      const node = payload.network.nodes.find(
        (candidate) => candidate[entityPrimaryKeyProperty] === person.id,
      );
      if (!encrypted || !node) continue;
      node[entityAttributesProperty][stage.name] = encrypted.data;
      node[entitySecureAttributesMeta] = { [stage.name]: encrypted.secure };
    }
  }
  return payload;
}

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
    ],
  );

  return (
    <div className="flex h-dvh w-full">
      {/* Changing the story's settings builds a new interview, so the
          running one, with a network made against the old protocol, starts
          over rather than carrying on. */}
      <StoryInterviewShell
        key={rawPayload}
        rawPayload={rawPayload}
        onSync={onSync}
        // The passphrase is entered from the side of the screen.
        navigationOrientation={encryptedNames ? 'vertical' : undefined}
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
 * A relative added on their own, not yet connected to anyone: the connect
 * tool joins them to people already shown. Here Tom becomes Ella's father and
 * Rachel's partner.
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
        links: [{ from: 'mum', to: 'ego', kind: 'biological', carrier: true }],
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

    await userEvent.click(person('dad'));
    await userEvent.click(person('mum'));
    await userEvent.click(
      await page.findByRole('menuitem', {
        name: '“Tom” and “Rachel” are partners',
      }),
    );
    await waitFor(() =>
      expect(
        canvas.getByText('“Tom” and “Rachel” are partners'),
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
 * The study encrypts names. Until the participant enters their passphrase,
 * the family cannot be changed, and a notice says why. Once it is entered, a
 * name typed for a new relative is stored encrypted and shown on the canvas
 * decrypted. Leaving, the unnamed parents are given labels, stored encrypted
 * too; coming back, those labels are read as unnamed again, while the typed
 * name is decrypted into the name question.
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
      'Enter your passphrase to see the names in your family',
    );
    await expect(canvas.getByTestId('pedigree-tool-connect')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // Entered through the interview's passphrase prompter.
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Enter your Passphrase' }),
    );
    await userEvent.type(
      await body.findByRole('textbox', { name: /Passphrase/ }),
      PASSPHRASE,
    );
    await userEvent.click(
      await body.findByRole('button', { name: 'Submit passphrase' }),
    );
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

const WRONG_PASSPHRASE = 'grey whale lighthouse';

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number');

/** "Julie", encrypted with PASSPHRASE as the interview encrypts a name. */
async function encryptJulie(): Promise<EncryptedSeedName> {
  const { encryptedAttributes, secureAttributes } =
    await generateSecureAttributes(
      { name: 'Julie' },
      {
        name: {
          type: 'text',
          component: 'Text',
          name: 'name',
          label: 'name',
          encrypted: true,
        },
      },
      PASSPHRASE,
    );
  const data = encryptedAttributes.name;
  const secure = secureAttributes?.name;
  if (!isNumberArray(data) || !secure) throw new Error('Encryption failed');
  return { data, secure };
}

const isEncryptedSeedName = (value: unknown): value is EncryptedSeedName =>
  typeof value === 'object' &&
  value !== null &&
  'data' in value &&
  isNumberArray(value.data) &&
  'secure' in value;

/** Enters a passphrase through the notice under the family tree. */
async function enterPassphraseFromNotice(
  canvasElement: HTMLElement,
  passphrase: string,
) {
  const canvas = within(canvasElement);
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Enter passphrase' }),
  );
  await userEvent.type(
    await body.findByRole('textbox', { name: /Passphrase/ }),
    passphrase,
  );
  await userEvent.click(
    await body.findByRole('button', { name: 'Submit passphrase' }),
  );
  await waitFor(() =>
    expect(body.queryByRole('textbox', { name: /Passphrase/ })).toBeNull(),
  );
}

/**
 * The mother's name was saved encrypted on an earlier visit. Returning, the
 * participant enters a passphrase that does not decrypt it: the notice says
 * so, the family cannot be changed, people are shown by how they are
 * related, and the stage writes nothing, not even the labels it would save
 * on leaving. The right passphrase shows her name again.
 */
export const WrongPassphrase: Story = {
  args: { requirement: 'none' },
  loaders: [async () => ({ julie: await encryptJulie() })],
  render: (args, { loaded }) => {
    const julie: unknown = loaded.julie;
    return (
      <PedigreeStory
        {...settings(args)}
        encryptedNames
        followedByPeopleList
        onSync={recordSession}
        family={{
          people: [
            { id: 'ego', gender: 'nonBinary', sex: 'intersex', ego: true },
            {
              id: 'mum',
              gender: 'woman',
              sex: 'female',
              ...(isEncryptedSeedName(julie) ? { encryptedName: julie } : {}),
            },
            { id: 'dad', gender: 'man', sex: 'male' },
          ],
          links: [
            { from: 'mum', to: 'dad', kind: 'partner' },
            { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
            { from: 'dad', to: 'ego', kind: 'biological' },
          ],
        }}
      />
    );
  },
  play: async ({ canvasElement }) => {
    lastSynced = undefined;
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const notice = () => canvas.findByTestId('pedigree-passphrase-notice');

    await expect(await notice()).toHaveTextContent(
      'Enter your passphrase to see the names in your family',
    );
    await enterPassphraseFromNotice(canvasElement, WRONG_PASSPHRASE);

    // The passphrase did not unlock her name, and the notice says so.
    await waitFor(async () =>
      expect(await notice()).toHaveTextContent(
        'Your passphrase did not unlock the names in your family',
      ),
    );
    // The family cannot be changed.
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
    await body.findByRole('textbox', { name: /Passphrase/ });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(body.queryByRole('textbox', { name: /Passphrase/ })).toBeNull(),
    );
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
