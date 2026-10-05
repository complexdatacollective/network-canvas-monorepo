import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { familyPedigreeMessages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import SlotVariableField from './SlotVariableField.tsx';

const PEDIGREE_STAGE = sectionId({
  kind: 'stage',
  stageId: 'family-pedigree-1',
});
const FAMILY_MEMBER = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});
const PERSON: CodebookSubject = { entity: 'node', type: 'family_member' };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The participant marker: a boolean slot exclusive to the interface. */
function ParticipantSlot() {
  return (
    <SlotVariableField
      name="personAttributes.egoVariable"
      label={familyPedigreeMessages.egoLabel}
      hint={familyPedigreeMessages.egoHint}
      createLabel={familyPedigreeMessages.egoCreateLabel}
      subject={PERSON}
      variableType="boolean"
      writerClass="unvalidated"
      ownSlot={FAMILY_PEDIGREE_SLOTS.egoVariable}
    />
  );
}

/** Sex assigned at birth: a categorical slot whose values the interface owns. */
function SexAssignedAtBirthSlot() {
  return (
    <SlotVariableField
      name="personAttributes.sexAssignedAtBirthVariable"
      label={familyPedigreeMessages.sexAssignedAtBirthLabel}
      hint={familyPedigreeMessages.sexAssignedAtBirthHint}
      createLabel={familyPedigreeMessages.sexAssignedAtBirthCreateLabel}
      subject={PERSON}
      variableType="categorical"
      writerClass="unvalidated"
      ownedOptions="pedigreeSexAssignedAtBirth"
    />
  );
}

const personAttributesOf = (document: SectionDoc): Record<string, unknown> =>
  isRecord(document.personAttributes) ? document.personAttributes : {};

/** A pedigree whose person attribute slot at this key names this attribute. */
const holdingPersonAttribute =
  (key: string, variableId: string) => (host: InMemoryHost) => {
    const { document } = host.store.read(PEDIGREE_STAGE);
    host.store.applyAsCollaborator(PEDIGREE_STAGE, {
      ...document,
      personAttributes: { ...personAttributesOf(document), [key]: variableId },
    });
  };

const openTheWindow = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await awaitPassiveEffects();
  await userEvent.click(
    await canvas.findByRole('button', { name: /^(Select|Change) attribute$/u }),
  );
  return within(await within(document.body).findByRole('dialog'));
};

const meta = {
  title: 'Protocol Builder/Fields/Slot attribute',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'One attribute an interface binds to a slot of its own: chosen from the codebook, or created from the picker. Only attributes of the slot’s type are offered; an attribute another writer class or another exclusive slot already claims is withheld; and where the interface owns the value set, only an attribute carrying exactly that set can be bound, and one created here is seeded with it, locked.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Person attributes',
    children: <ParticipantSlot />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The slot as the protocol holds it, with creation offered in the window. */
export const AHeldSlot: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeEnabled();
    const held = canvasElement.querySelector('[data-attribute-type]');
    await expect(held).toHaveAttribute('data-attribute-type', 'boolean');
    await expect(held).toHaveTextContent('is_ego');

    const window = await openTheWindow(canvasElement);
    await userEvent.type(
      window.getByRole('searchbox', { name: 'Find or create an attribute' }),
      'is_participant',
    );
    await expect(
      await window.findByRole('option', {
        name: 'Create new attribute called “is_participant”.',
      }),
    ).toBeInTheDocument();
  },
};

/** Held elsewhere: the binding can be read and not changed. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const trigger = await canvas.findByRole('button', {
      name: 'Change attribute',
    });
    await expect(trigger).toBeDisabled();
  },
};

/** The attribute a slot names has been deleted from the codebook. */
export const AnAttributeTheCodebookHasLost: Story = {
  args: {
    seedEdit: holdingPersonAttribute('egoVariable', 'was_the_participant'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'was_the_participant — this attribute is not available here',
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText(
        'This attribute is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * A slot whose values the interface owns, holding an attribute whose values
 * somebody has since edited: kept as the held choice, named for what is wrong.
 */
export const AnAttributeWhoseValuesChanged: Story = {
  args: {
    children: <SexAssignedAtBirthSlot />,
    seedEdit: (host) => {
      const { document } = host.store.read(FAMILY_MEMBER);
      const variables = isRecord(document.variables) ? document.variables : {};
      host.store.applyAsCollaborator(FAMILY_MEMBER, {
        ...document,
        variables: {
          ...variables,
          sexAssignedAtBirth: {
            name: 'sexAssignedAtBirth',
            type: 'categorical',
            options: [
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ],
          },
        },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'sexAssignedAtBirth — no longer offers the values this control needs',
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        'This attribute no longer offers the exact values this control needs, because they were changed somewhere else. Choose another one.',
      ),
    ).toBeInTheDocument();
  },
};
