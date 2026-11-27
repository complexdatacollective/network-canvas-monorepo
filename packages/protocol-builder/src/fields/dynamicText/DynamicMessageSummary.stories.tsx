import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { useStageDynamicValues } from '../../localization/useDynamicValueSite.ts';
import {
  INFORMATION_STAGE,
  pageText,
  seedPageWithLogic,
  SHOWN_WHEN_MET,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import { DynamicMessageSummary } from './DynamicMessageSummary.tsx';

/** The page of the stage, summarised as a protocol summary shows it. */
function PageSummary() {
  const site = useStageDynamicValues();
  return (
    <div data-testid="summary">
      <DynamicMessageSummary
        message={pageText}
        markdown
        multiline
        locale="en-US"
        site={site}
      />
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Summary',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Text that a participant reads, drawn where it cannot be edited, such as a row’s preview or the protocol summary: markdown as the participant will read it, each value as the pill that the editor shows, and each logic block with the content of each case under its label.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Summary',
    children: <PageSummary />,
    seedEdit: seedPageWithLogic,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page's values as pills, and its logic block with each case labelled. */
export const APageWithLogic: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const summary = await canvas.findByTestId('summary');
    await waitFor(async () => {
      await expect(summary.querySelector('h1')).toHaveTextContent('Welcome');
    });
    await expect(
      summary.querySelector('data[value="Today’s date"]'),
    ).not.toBeNull();
    await expect(
      summary.querySelector('data[data-attribute-type="dynamic"]'),
    ).not.toBeNull();
    const block = summary.querySelector('[data-logic-summary]');
    await expect(block).toHaveTextContent(SHOWN_WHEN_MET);
    await expect(block).toHaveTextContent('Otherwise');
  },
};
