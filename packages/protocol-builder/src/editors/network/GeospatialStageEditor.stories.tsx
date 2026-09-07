import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { StageEditorStoryHost } from '../../testing/StageEditorStoryHost.tsx';
import { GeospatialStageEditor } from './GeospatialStageEditor.tsx';

const meta = {
  title: 'Protocol Builder/Editors/Geospatial',
  component: StageEditorStoryHost,
  args: {
    stageId: 'geospatial-1',
    renderEditor: ({ controller, actions }) => (
      <GeospatialStageEditor
        controller={controller}
        stageType="Geospatial"
        actions={actions}
      />
    ),
  },
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The map a stage asks its questions over: the API key that lets one be drawn, the GeoJSON layer that says which areas can be chosen, how the map looks, and where it opens. The key and the layer are stored resources chosen through the package’s resource picker — the stage holds asset ids and nothing else, so a key never reaches the protocol document or this screen. The map SDK is replaced for every story in this Storybook, so no story builds a real map or bills a Mapbox account.',
      },
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof StageEditorStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the fixture protocol holds it, with the key and the GeoJSON
 * layer already in the manifest the host was opened over. The play draws
 * transit on the map and saves, which is what carries the draft into the
 * session and on to the host.
 */
export const Editing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      canvas.getByRole('switch', { name: 'Show public transport' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('Saved “Geospatial”.');
    });
    await expect(canvas.getByText(/"showTransit": true/)).toBeInTheDocument();
  },
};
