import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { FAMILY_PEDIGREE_SLOTS } from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { familyPedigreeMessages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import {
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../testing/protocolFixture.ts';
import { testId } from '../testing/testId.ts';
import SlotVariableField from './SlotVariableField.tsx';

const FAMILY_MEMBER = fixtureTypeId('node', 'family member');
const SEX_ASSIGNED_AT_BIRTH = fixtureVariableId(
  { entity: 'node', typeName: 'family member' },
  'sexAssignedAtBirth',
);

const PEDIGREE_STAGE = sectionId({
  kind: 'stage',
  stageId: fixtureStageId('family-pedigree-1'),
});
const FAMILY_MEMBER_SECTION = sectionId({
  kind: 'codebookNode',
  typeId: FAMILY_MEMBER,
});
const PERSON_SUBJECT: CodebookSubject = { entity: 'node', type: FAMILY_MEMBER };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The participant marker: a boolean slot exclusive to the interface. */
function ParticipantSlot() {
  return (
    <SlotVariableField
      name="nodeConfiguration.egoAttribute"
      label={familyPedigreeMessages.egoLabel}
      hint={familyPedigreeMessages.egoHint}
      createLabel={familyPedigreeMessages.egoCreateLabel}
      subject={PERSON_SUBJECT}
      variableType="boolean"
      writerClass="unvalidated"
      ownSlot={FAMILY_PEDIGREE_SLOTS.egoAttribute}
    />
  );
}

/** Sex assigned at birth: a categorical slot whose values the interface owns. */
function SexAssignedAtBirthSlot() {
  return (
    <SlotVariableField
      name="nodeConfiguration.sexAssignedAtBirthAttribute"
      label={familyPedigreeMessages.sexAssignedAtBirthLabel}
      hint={familyPedigreeMessages.sexAssignedAtBirthHint}
      createLabel={familyPedigreeMessages.sexAssignedAtBirthCreateLabel}
      subject={PERSON_SUBJECT}
      variableType="categorical"
      writerClass="unvalidated"
      ownedOptions="pedigreeSexAssignedAtBirth"
    />
  );
}

const nodeConfigurationOf = (document: SectionDoc): Record<string, unknown> =>
  isRecord(document.nodeConfiguration) ? document.nodeConfiguration : {};

/** A pedigree whose person attribute slot at this key names this attribute. */
const holdingPersonAttribute =
  (key: string, variableId: string) => (host: InMemoryHost) => {
    const { document } = host.store.read(PEDIGREE_STAGE);
    host.store.applyAsCollaborator(PEDIGREE_STAGE, {
      ...document,
      nodeConfiguration: {
        ...nodeConfigurationOf(document),
        [key]: variableId,
      },
    });
  };

/** The slot's select box: the one field these stories render. */
const findTrigger = (canvasElement: HTMLElement) =>
  waitFor(() => {
    const trigger = canvasElement.querySelector<HTMLElement>(
      '[data-field-focus-target]',
    );
    if (trigger === null) throw new Error('The select box is not rendered.');
    return trigger;
  });

const openTheWindow = async (canvasElement: HTMLElement) => {
  await awaitPassiveEffects();
  await userEvent.click(await findTrigger(canvasElement));
  return within(
    await waitFor(() => {
      const opened = document.body.querySelector<HTMLElement>(
        '[data-attribute-picker-popup][data-open]',
      );
      if (opened === null) throw new Error('The attribute list is closed.');
      return opened;
    }),
  );
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
    stageId: fixtureStageId('family-pedigree-1'),
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
    await awaitPassiveEffects();

    await expect(await findTrigger(canvasElement)).not.toHaveAttribute(
      'aria-disabled',
    );
    const held = canvasElement.querySelector('[data-attribute-type]');
    await expect(held).toHaveAttribute('data-attribute-type', 'boolean');
    await expect(held).toHaveTextContent('is_ego');

    const window = await openTheWindow(canvasElement);
    await userEvent.type(
      window.getByRole('combobox', { name: 'Find or create an attribute' }),
      'is_participant',
    );
    await expect(
      await window.findByRole('option', {
        name: 'Create “is_participant”',
      }),
    ).toBeInTheDocument();
  },
};

/** Held elsewhere: the binding can be read and not changed. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();

    const trigger = await findTrigger(canvasElement);
    // A form held elsewhere takes no answers: its fields are disabled.
    await expect(trigger).toHaveAttribute('aria-disabled', 'true');
    // It takes no pointer, and the keyboard does not open it either.
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(
      document.body.querySelector('[data-attribute-picker-popup][data-open]'),
    ).toBeNull();
  },
};

/** The attribute a slot names has been deleted from the codebook. */
export const AnAttributeTheCodebookHasLost: Story = {
  args: {
    seedEdit: holdingPersonAttribute('egoAttribute', 'was_the_participant'),
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
      const { document } = host.store.read(FAMILY_MEMBER_SECTION);
      const variables = isRecord(document.variables) ? document.variables : {};
      host.store.applyAsCollaborator(FAMILY_MEMBER_SECTION, {
        ...document,
        variables: {
          ...variables,
          [SEX_ASSIGNED_AT_BIRTH]: {
            name: 'sexAssignedAtBirth',
            type: 'categorical',
            options: [
              {
                id: testId('option/sexAssignedAtBirth/female'),
                value: 'female',
                label: { 'en-US': 'Female' },
              },
              {
                id: testId('option/sexAssignedAtBirth/male'),
                value: 'male',
                label: { 'en-US': 'Male' },
              },
            ],
          },
        },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The held attribute is shown as itself, with the reason under the field.
    const trigger = await findTrigger(canvasElement);
    await waitFor(async () => {
      await expect(trigger).toHaveAccessibleName(/sexAssignedAtBirth$/u);
    });
    await expect(
      canvas.getByText(
        'This field needs the options supplied by Network Canvas, and this attribute has different options.',
      ),
    ).toBeInTheDocument();
  },
};
