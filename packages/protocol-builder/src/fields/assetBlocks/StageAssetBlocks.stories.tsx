import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { PageContentStoryHost } from '../../testing/PageContentStoryHost.tsx';

/**
 * A stage's text field whose text may hold files as blocks
 * (`StageAssetBlocks`): the editor's buttons for a picture, a recording and a
 * video open the resource browser for that kind of file, over the files of
 * the open edit, and what is chosen there goes into the text.
 */
const meta = {
  title: 'Protocol Builder/Fields/Asset blocks in a stage editor',
  component: PageContentStoryHost,
  args: { content: 'Welcome to the study.' },
  // A whole stage editor rather than a layout in the reading direction: the
  // blocks' own stories mirror the block itself.
  tags: ['!mirror'],
} satisfies Meta<typeof PageContentStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The text of the page, once the editor has drawn it. */
const pageText = async (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('textbox', { name: /^Rich Text/ });

/**
 * A picture put into the page: the browser offers the protocol's pictures,
 * and the one chosen is drawn in the text as a block.
 */
export const PuttingAPictureIntoThePage: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const text = await pageText(canvasElement);
    await userEvent.click(text);
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Insert image' }),
    );

    const browser = await body.findByRole('dialog', {
      name: 'Choose an image',
    });
    await userEvent.click(
      await within(browser).findByRole('button', {
        name: /Neighbourhood photo/,
      }),
    );

    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an image' }),
      ).toBeNull(),
    );
    const block = await waitFor(() => {
      const found = text.querySelector('[data-asset-block]');
      if (found === null) throw new Error('No block in the text yet');
      return found;
    });
    await waitFor(() =>
      expect(block.querySelector('img')?.naturalWidth).toBeGreaterThan(0),
    );
    await expect(body.queryByRole('alert')).toBeNull();
  },
};

/**
 * The browser for a recording, closed with nothing chosen: the page is as it
 * was, and nothing is refused.
 */
export const ClosedWithNothingChosen: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const text = await pageText(canvasElement);
    await userEvent.click(text);
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Insert audio' }),
    );

    await body.findByRole('dialog', { name: 'Choose an audio file' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        body.queryByRole('dialog', { name: 'Choose an audio file' }),
      ).toBeNull(),
    );

    await expect(text.querySelector('[data-asset-block]')).toBeNull();
    await expect(text).toHaveTextContent('Welcome to the study.');
    await expect(body.queryByRole('alert')).toBeNull();
  },
};
