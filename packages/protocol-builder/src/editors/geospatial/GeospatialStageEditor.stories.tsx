import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import StageEditor from '../../StageEditor.tsx';
import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { geospatialStageEditor } from './GeospatialStageEditor.ts';

const meta = {
  title: 'Protocol Builder/Stage editors/Geospatial',
  component: StageEditorStoryHost,
  args: {
    stageId: 'geospatial-1',
    // Through the dispatcher rather than by naming the component, so the story
    // also shows that this editor claims the interface its stage is of.
    renderEditor: ({ actions, ...editor }) => (
      <StageEditor
        {...editor}
        registry={geospatialStageEditor}
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The map a participant is asked to point at. Opened on the shared all-interfaces protocol: the stored Mapbox key, the GeoJSON layer whose areas can be chosen, and the property each answer is recorded as all come from that protocol, and saving hands the whole stage to the host. No map is drawn here — the Mapbox SDK is replaced for every story, and this host never hands a stored key back.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Renaming a stage and saving it: the whole editor, end to end. */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      canvas.getByRole('textbox', { name: 'Stage name' }),
      ' (revised)',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Geospatial (revised)”.');
    });
    await expect(
      canvas.getByRole('region', { name: 'What the host was asked to commit' }),
    ).toHaveTextContent('"label": "Geospatial (revised)"');
  },
};

/**
 * The property a selection is recorded as, read out of the layer itself.
 *
 * The one control on this stage that cannot be filled in from the stage
 * document alone: its choices are the feature properties of the GeoJSON the
 * researcher chose, so the story proves the host was asked for that file and
 * the answer reached the picker.
 */
export const ReadingTheMapLayer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const picker = await canvas.findByRole('combobox', {
      name: 'Recorded property',
    });
    await expect(
      within(picker).getByRole('option', { name: 'name' }),
    ).toBeInTheDocument();
  },
};

/** Someone else holds the stage: every control is inert. */
export const Spectating: Story = {
  args: { readOnly: true },
};
