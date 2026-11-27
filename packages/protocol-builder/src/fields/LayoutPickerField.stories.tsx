import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { fixtureLayoutId, fixtureStageId } from '../testing/protocolFixture.ts';
import { testId } from '../testing/testId.ts';
import LayoutPickerField from './LayoutPickerField.tsx';

const FIELD_LABEL = 'Layout';

const meta = {
  title: 'Protocol Builder/Fields/Layout picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Chooses the layout of the codebook that a stage stores or shows node positions in. Every layout in the codebook is offered, because a layout belongs to the codebook rather than to a node type. Typing a name that no layout has offers to create one, and the name is checked against the other layouts and the node attributes of every type before it is created.',
      },
    },
  },
  args: {
    stageId: fixtureStageId('sociogram-1'),
    sectionTitle: 'Layout',
    children: (
      <Field<typeof LayoutPickerField>
        name="layout"
        component={LayoutPickerField}
        label={FIELD_LABEL}
        required={REQUIRED}
      />
    ),
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

const trigger = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('combobox', {
    name: new RegExp(`^${FIELD_LABEL}`, 'u'),
  });

const openAndType = async (canvasElement: HTMLElement, query: string) => {
  await userEvent.click(await trigger(canvasElement));
  const search = await screen.findByRole('combobox', {
    name: /^Find (or create )?a layout$/u,
  });
  await waitFor(() => expect(search).toHaveFocus());
  await userEvent.type(search, query);
  return search;
};

/** The stage's layout, shown by its name. */
export const Chosen: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await expect(await trigger(canvasElement)).toHaveTextContent('layout');
  },
};

/** Every layout of the codebook is offered, whatever the stage is about. */
export const EveryLayoutOffered: Story = {
  args: {
    seedEdit: (host) => {
      host.store.applyAsCollaborator(
        sectionId({ kind: 'codebookLayout', layoutId: testId('map') }),
        { name: 'map' },
      );
    },
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await userEvent.click(await trigger(canvasElement));
    await expect(
      await screen.findByRole('option', { name: 'map' }),
    ).toBeInTheDocument();
    await expect(
      screen.getByRole('option', { name: /^layout/u }),
    ).toBeInTheDocument();
  },
};

/** A new layout, created from the name typed in the search box. */
export const CreatingALayout: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await openAndType(canvasElement, 'seating');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Create “seating”' }),
    );
    await waitFor(async () =>
      expect(await trigger(canvasElement)).toHaveTextContent('seating'),
    );
  },
};

/**
 * A name that a node attribute already has: the person type has an attribute
 * called `name`, so the create row is switched off and says why.
 */
export const ARefusedName: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await openAndType(canvasElement, 'name');
    const row = await screen.findByRole('option', {
      name: 'A layout cannot be named “name”',
    });
    await expect(row).toHaveAttribute('aria-disabled', 'true');
  },
};

/** The stored layout is gone from the codebook, and the control says so. */
export const ALayoutThatWasDeleted: Story = {
  args: {
    seedEdit: (host) => {
      host.store.applyAsCollaborator(
        sectionId({
          kind: 'codebookLayout',
          layoutId: fixtureLayoutId('layout'),
        }),
        undefined,
      );
    },
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    await expect(
      await within(canvasElement).findByText(
        'This layout is not in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
  },
};
