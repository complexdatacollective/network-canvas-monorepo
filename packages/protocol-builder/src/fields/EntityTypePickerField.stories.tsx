import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import EntityTypePickerField, {
  EntitySubjectPickerField,
} from './EntityTypePickerField.tsx';

const meta = {
  title: 'Protocol Builder/Fields/Entity type picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Picks the node or edge type a stage works on. The chips are the protocol’s own codebook types, drawn the way a participant will see them, and they arrive through the package’s subscription rather than through a prop — so a type added, renamed or deleted elsewhere in the protocol changes what is offered without the section doing anything. A stored type the codebook no longer defines is kept and named, so the researcher can see the reference they have to replace.',
      },
    },
  },
  args: {
    stageId: 'name-generator-1',
    sectionTitle: 'What this stage is about',
    children: (
      <Field<typeof EntitySubjectPickerField>
        name="subject"
        component={EntitySubjectPickerField}
        entityType="node"
        label="Type of person or thing"
        hint="Every person this stage collects is recorded as this type."
        required={REQUIRED}
      />
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it: one type chosen out of the two it has. */
export const Chosen: Story = {};

/** Held elsewhere: every chip is there to read, and none of them can be picked. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'person' }),
    ).toBeDisabled();
  },
};

/**
 * Choosing the other type. This stage carries nothing a change would cost, so
 * nothing is asked before it: what a change costs is the section's to judge,
 * and it says so by passing a question or not passing one.
 */
export const ChoosingAnotherType: Story = {
  args: { stageId: 'anonymisation-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('radio', { name: 'family member' }),
    );

    await expect(
      canvas.getByRole('radio', { name: 'family member' }),
    ).toBeChecked();
  },
};

/**
 * A type this editor never asked for, offered because it is in the codebook.
 * Nothing here was told about it: the picker subscribes for the types itself.
 */
export const ATypeAddedElsewhere: Story = {
  args: {
    seedEdit: (host) => {
      host.store.applyAsCollaborator(
        sectionId({ kind: 'codebookNode', typeId: 'organisation' }),
        {
          name: 'organisation',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        },
      );
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'organisation' }),
    ).toBeInTheDocument();
  },
};

/**
 * The type this stage names has been deleted. The choice is shown rather than
 * blanked — a group of chips with none of them selected reads as a question
 * nobody has answered, while the stage underneath is still pointed at the type
 * that is gone — and it cannot be chosen again once it has been replaced.
 */
export const ATypeThatWasDeleted: Story = {
  args: {
    seedEdit: (host) => {
      host.store.applyAsCollaborator(
        sectionId({ kind: 'codebookNode', typeId: 'person' }),
        undefined,
      );
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This type is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    // Said by the control itself. Nothing was interrupted: the researcher has
    // not asked for anything yet, so there is nothing to refuse in a dialog.
    await expect(screen.queryByRole('dialog')).toBeNull();
  },
};

/**
 * Making the type a stage needs, without leaving the stage.
 *
 * Inside the field itself, which is what Architect has always done
 * (`EntitySelectField`: its create button and the dialog it opens are part of
 * the control). The type is written to the codebook on its own, and the stage
 * is then pointed at it — two acts, because a stage just given a brand-new
 * type has no prompts, no form and no panels for it, and a host keeping the
 * stored protocol valid would be right to refuse the pair as one edit.
 */
export const MakingAType: Story = {
  args: { stageId: 'anonymisation-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Create new node type' }),
    );
    const editor = within(
      await screen.findByRole('dialog', { name: 'Create new node type' }),
    );
    await userEvent.type(
      await editor.findByRole('textbox', { name: 'Node type name' }),
      'organisation',
    );
    await userEvent.click(editor.getByRole('button', { name: 'Save entity' }));

    // Chosen on the stage as it is created: finding it in a list that has just
    // grown is not what the researcher asked for.
    await expect(
      await canvas.findByRole('radio', { name: 'organisation' }),
    ).toBeChecked();
  },
};

/**
 * Changing the type the stage already holds — its name, its colour, the shape
 * a participant sees it drawn as — from the control that names it.
 */
export const EditingTheHeldType: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Edit this node type' }),
    );

    // Open on the type the stage holds, not on an empty draft.
    await expect(
      await within(
        await screen.findByRole('dialog', { name: 'Edit this node type' }),
      ).findByRole('textbox', { name: 'Node type name' }),
    ).toHaveValue('person');
  },
};

/** The same control for a kind of relationship rather than a kind of member. */
export const ChoosingAnEdgeType: Story = {
  args: {
    stageId: 'dyad-census-1',
    sectionTitle: 'What this stage records',
    children: (
      <Field<typeof EntityTypePickerField>
        name="edgeType"
        component={EntityTypePickerField}
        entityType="edge"
        label="Type of connection"
        hint="Answering this stage records a connection of this kind."
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('button', { name: 'Create new edge type' }),
    ).toBeInTheDocument();
  },
};

/**
 * A caller that must not offer either. Architect's one such caller is the rule
 * builder, whose picker sits inside a dialog inside a dialog and where
 * inventing a type to write a rule about is a study nobody described.
 */
export const WithoutCodebookEditing: Story = {
  args: {
    children: (
      <Field<typeof EntityTypePickerField>
        name="entityTypeId"
        component={EntityTypePickerField}
        entityType="node"
        allowCodebookEditing={false}
        label="Type of person or thing"
        hint="The rule is about what this type already records."
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('radio', { name: 'person' }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('button', { name: 'Create new node type' }),
    ).toBeNull();
    await expect(
      canvas.queryByRole('button', { name: 'Edit this node type' }),
    ).toBeNull();
  },
};

/**
 * A protocol with no node types at all — a fresh one, which is where a
 * researcher meets this control first.
 *
 * The empty state is not a dead end: the way out of "no types" is to make one,
 * and that is offered here rather than on a screen the researcher has to find.
 */
export const OnAProtocolWithNoTypes: Story = {
  args: {
    // A control holding nothing, because the shared fixture's stages all name
    // a type: the dangling reference a deleted one leaves is kept and shown,
    // which is a different state from having none to offer.
    children: (
      <Field<typeof EntityTypePickerField>
        name="entityTypeId"
        component={EntityTypePickerField}
        entityType="node"
        label="Type of person or thing"
        hint="Every person this stage collects is recorded as this type."
      />
    ),
    seedEdit: (host) => {
      for (const typeId of ['person', 'family_member']) {
        host.store.applyAsCollaborator(
          sectionId({ kind: 'codebookNode', typeId }),
          undefined,
        );
      }
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('No node types currently defined'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Create new node type' }),
    ).toBeInTheDocument();
  },
};
