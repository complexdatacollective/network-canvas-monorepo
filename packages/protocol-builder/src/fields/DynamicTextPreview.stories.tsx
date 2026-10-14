import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import { DynamicTextPreview } from './DynamicTextPreview.tsx';

const STAGE_ID = 'anonymisation-1';
const STAGE = sectionId({ kind: 'stage', stageId: STAGE_ID });

/** The stage binds today's date under `today`, as inserting it would. */
const bindsToday = (host: InMemoryHost): void => {
  const { document } = host.store.read(STAGE);
  host.store.applyAsCollaborator(STAGE, {
    ...document,
    dynamicValues: { today: { path: 'now' } },
  });
};

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
          'How text a participant reads shows in a collapsed row of a stage editor: in the editing language, with markdown rendered as the participant will read it, each value the interview fills in shown as the pill the editor shows, and each set of versions as a list of what it says when.',
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
    await expect(shown.querySelector('[data-token]')).toBeNull();
  },
};

/** A value bound to the stage shows as its pill, named for what it holds. */
export const ShowingAValue: Story = {
  args: {
    seedEdit: bindsToday,
    children: preview({ en: 'Welcome. Today is {today}.' }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const shown = await canvas.findByTestId('preview');
    await expect(
      await within(shown).findByText('Today’s date'),
    ).toBeInTheDocument();
    await expect(shown.querySelector('[data-token="today"]')).not.toBeNull();
    await expect(shown).toHaveTextContent(/^Welcome\. Today is .+\.$/);
  },
};
