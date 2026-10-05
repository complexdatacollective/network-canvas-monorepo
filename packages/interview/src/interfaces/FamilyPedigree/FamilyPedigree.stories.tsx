import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type {
  FramingId,
  PedigreeCompletenessScope,
  PedigreeGenderIdentity,
  PedigreeRelationshipKind,
  PedigreeSexAssignedAtBirth,
} from '@codaco/protocol-validation';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const PROMPT =
  'Add the members of your family. Select a person to add their relatives.';

type SeedPerson = {
  id: string;
  name?: string;
  gender?: PedigreeGenderIdentity;
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
  framing?: FramingId;
};

function buildInterview({
  family,
  withFormFields = false,
  completeness,
  framing,
}: StoryOptions) {
  const si = new SyntheticInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the pedigree.' });
  const stage = si.addStage('FamilyPedigree', {
    prompt: PROMPT,
    completeness,
    framing,
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
      ...(person.gender ? { [stage.genderIdentity]: [person.gender] } : {}),
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

  si.addInformationStage({ title: 'Complete', text: 'After the pedigree.' });
  return si;
}

function PedigreeStory({
  family,
  withFormFields,
  completeness,
  framing,
}: StoryOptions) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview({
          family,
          withFormFields,
          completeness,
          framing,
        }).getInterviewPayload({ currentStep: 1 }),
      ),
    [family, withFormFields, completeness, framing],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

type StoryArgs = {
  framing: FramingId;
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
      options: ['gendered', 'gamete'],
      description:
        'The words unnamed family members are described by. gendered: mother, father, grandmother… · gamete: egg parent, sperm parent, grandparent…',
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

/**
 * Gender-diverse relatives, after the inclusive nomenclature: symbols follow
 * gender identity, whatever the sex assigned at birth. The participant is a
 * trans man who carried his child with his non-binary partner; his sibling is
 * a trans woman.
 */
export const GenderDiverseFamily: Story = {
  args: { requirement: 'firstDegree', enforcement: 'required' },
  render: (args) => (
    <PedigreeStory
      {...settings(args)}
      family={{
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
      }}
    />
  ),
  play: expectPeople(6),
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
