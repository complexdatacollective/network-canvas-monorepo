import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import { fixtureStageId } from '../testing/protocolFixture.ts';
import { DynamicTextPreview } from './DynamicTextPreview.tsx';

const STAGE_ID = fixtureStageId('anonymisation-1');

const preview = (value: unknown) => (
  <div data-testid="preview">
    <DynamicTextPreview value={value} />
  </div>
);

const meta = {
  title: 'Protocol Builder/Fields/Preview of text with values',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'How text a participant reads shows in a collapsed row of a stage editor: in the editing language, with markdown rendered as the participant will read it, and each value the interview fills in shown as the pill that the editor shows.',
      },
    },
  },
  args: {
    stageId: STAGE_ID,
    sectionTitle: 'A row’s preview',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Text without values is rendered as markdown, with no pills. */
export const PlainText: Story = {
  args: {
    children: preview({ en: 'Please answer **every** question.' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const shown = await canvas.findByTestId('preview');
    await expect(shown).toHaveTextContent('Please answer every question.');
    await expect(shown.querySelector('strong')).toHaveTextContent('every');
    await expect(
      shown.querySelector('data[data-variable-pill-size]'),
    ).toBeNull();
  },
};

/** A value the text shows is drawn as its pill, named for what it holds. */
export const ShowingAValue: Story = {
  args: {
    children: preview({ en: 'Welcome. Today is {now}.' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const shown = await canvas.findByTestId('preview');
    // The pill names the value; its first word is held beside its icon.
    await waitFor(async () => {
      await expect(
        shown.querySelector('data[value="Today’s date"]'),
      ).toBeInTheDocument();
    });
    await expect(shown).toHaveTextContent(/^Welcome\. Today is .+\.$/);
  },
};
