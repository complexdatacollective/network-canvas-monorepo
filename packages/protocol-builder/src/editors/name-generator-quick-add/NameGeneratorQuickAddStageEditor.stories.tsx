import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { nameGeneratorQuickAddStageEditor } from './NameGeneratorQuickAddStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Name Generator (quick add)',
  component: StageEditorStoryHost,
  args: {
    stageId: 'name-generator-quick-add-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={nameGeneratorQuickAddStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The name generator a participant names people with in a single box. The attribute that box fills in is chosen from the node type’s own codebook, and the stage is qualified by the side panels beside its question.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The locale control in the toolbar is global, so a play asserting on an
 * English sentence would fail for anyone who had left it on Español. Pinning
 * the story's own locale leaves the control free to do its job elsewhere.
 */
const inEnglish = { globals: { appLocale: 'en' } };

/** Choosing what the single box fills in, and saving the stage. */
export const ChoosingTheAttribute: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: /Attribute filled in/ }),
      'relationship_to_ego',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Quick Add”.');
    });
    // The choice itself, in the document the host was handed: a save that
    // reported success while committing the attribute it opened on would look
    // identical above.
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"quickAdd": "relationship_to_ego"');
  },
};

/**
 * The attribute's own rules, edited where the attribute is chosen.
 *
 * The rules belong to the codebook rather than to the stage, so they commit as
 * they are made and the stage document the host is handed never carries one —
 * which is what the recorded request below shows.
 */
export const RulesForTheAttribute: Story = {
  ...inEnglish,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // The fixture's `name` already carries a rule, so the section is open.
    await expect(
      canvas.getByRole('switch', { name: 'Validation' }),
    ).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(
      await canvas.findByRole('checkbox', { name: 'Minimum length' }),
    );
    // Each rule's number carries steppers named for that rule, so a screen
    // holding several of them does not offer three buttons all called
    // "Increase value".
    await expect(
      await canvas.findByRole('button', { name: 'Increase Minimum length' }),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Name Generator Quick Add”.');
    });
    const committed = canvas.getByRole('region', {
      name: 'What the host was asked to commit',
    });
    await expect(committed).toHaveTextContent('"quickAdd": "name"');
    await expect(committed).not.toHaveTextContent('validation');
  },
};

/** The same section, read by someone working in Spanish. */
export const RulesInSpanish: Story = {
  globals: { appLocale: 'es' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('switch', { name: 'Validación' }),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
