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
          'How text a participant reads shows in a collapsed row of a stage editor: in the editing language, with markdown rendered as the participant will read it, each value the interview fills in shown as the pill the editor shows, and each set of versions as the pill of the value it is on, as the editor shows it folded.',
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

/**
 * Text with a version for each case of a value shows only the value's pill:
 * what it says in each case is written, and read, in the editor.
 */
export const VersionsShowAsTheirPill: Story = {
  args: {
    children: preview({
      en: 'Welcome.{now, select, missing {} other { Today is {now}.}}',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const shown = await canvas.findByTestId('preview');
    // The pill names the value; its first word is held beside its icon.
    await waitFor(async () => {
      await expect(shown.querySelector('[data-token="now"]')).toHaveTextContent(
        'Today’s date',
      );
    });
    await expect(shown.querySelectorAll('[data-token]')).toHaveLength(1);
    await expect(shown).not.toHaveTextContent('Today is');
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
      await expect(shown.querySelector('[data-token="now"]')).toHaveTextContent(
        'Today’s date',
      );
    });
    await expect(shown).toHaveTextContent(/^Welcome\. Today is .+\.$/);
  },
};
