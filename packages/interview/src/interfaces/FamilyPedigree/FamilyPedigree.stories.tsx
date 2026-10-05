import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import type {
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

/**
 * An interview whose pedigree stage opens on a seeded family, between two
 * information screens. With no family, only the participant is shown.
 */
function buildInterview(family?: Family, withFormFields = false) {
  const si = new SyntheticInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the pedigree.' });
  const stage = si.addStage('FamilyPedigree', { prompt: PROMPT });
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
}: {
  family?: Family;
  withFormFields?: boolean;
}) {
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(
        buildInterview(family, withFormFields).getInterviewPayload({
          currentStep: 1,
        }),
      ),
    [family, withFormFields],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/FamilyPedigree',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

const expectPeople = (count: number) =>
  async function play({ canvasElement }: { canvasElement: HTMLElement }) {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(count),
    );
  };

/** The first visit: only the participant, with the add menu around them. */
export const FirstVisit: Story = {
  render: () => <PedigreeStory withFormFields />,
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
 * A family under way: separated parents, a brother, and a partner whose name
 * and sex assigned at birth are still missing, so they carry a warning.
 */
export const FamilyInProgress: Story = {
  render: () => (
    <PedigreeStory
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
          { id: 'partner', gender: 'nonBinary' },
        ],
        links: [
          { from: 'julie', to: 'rob', kind: 'partner', current: false },
          { from: 'julie', to: 'ego', kind: 'biological', carrier: true },
          { from: 'rob', to: 'ego', kind: 'biological' },
          { from: 'julie', to: 'joshua', kind: 'biological', carrier: true },
          { from: 'rob', to: 'joshua', kind: 'biological' },
          { from: 'ego', to: 'partner', kind: 'partner' },
        ],
      }}
    />
  ),
  play: async (context) => {
    await expectPeople(5)(context);
    await expect(
      within(context.canvasElement).getByRole('button', {
        name: /Unnamed, some details missing/,
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
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
export const BlendedFamily: Story = {
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
  render: () => (
    <PedigreeStory
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
