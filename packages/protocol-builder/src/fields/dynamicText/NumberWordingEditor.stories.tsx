import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { useStageDynamicValues } from '../../localization/useDynamicValueSite.ts';
import {
  INFORMATION_STAGE,
  seedPageWithLogic,
} from '../../testing/dynamicTextStories.tsx';
import { FieldStoryHost } from '../../testing/FieldStoryHost.tsx';
import { WORDING_EDITORS } from './DynamicMessageEditor.tsx';
import { NumberWordingEditor } from './NumberWordingEditor.tsx';

const LABEL = 'Wording for singular or plural numbers';

/**
 * The wording of a dynamic attribute for singular or plural numbers, on a
 * stage, with the message it saves shown beneath it.
 */
function NumberWording() {
  const site = useStageDynamicValues();
  const [message, setMessage] = useState('');
  return (
    <div>
      <span id="number-wording-label">{LABEL}</span>
      <NumberWordingEditor
        id="number-wording"
        name="number-wording"
        message={message}
        onMessageChange={setMessage}
        locale="en-US"
        site={site}
        readOnly={false}
        ariaLabelledBy="number-wording-label"
        ariaDescribedBy=""
        ariaInvalid={false}
        editors={WORDING_EDITORS}
      />
      <output aria-label="Saved wording">{message}</output>
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Dynamic text/Number wording',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The wording of a dynamic attribute for singular or plural numbers: one version for each number form of the language, each of which can be bold or italic and can show values, the number among them. While every version is empty, the wording is saved as empty.',
      },
    },
  },
  args: {
    stageId: INFORMATION_STAGE,
    sectionTitle: 'Number wording',
    children: <NumberWording />,
    seedEdit: seedPageWithLogic,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * English has a version for 1 and one for every other number. Words typed in
 * one version are saved as a plural of the number, with the other versions
 * empty.
 */
export const AVersionForEachNumberForm: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const versions = await canvas.findAllByRole('textbox', {
      name: /^When it is/,
    });
    await expect(versions).toHaveLength(2);
    const [one] = versions;
    if (one === undefined) throw new Error('No version for 1');
    const saved = canvas.getByRole('status', { name: 'Saved wording' });
    await expect(saved).toHaveTextContent(/^$/);

    await userEvent.click(one);
    await userEvent.keyboard('year');
    await waitFor(async () => {
      await expect(saved).toHaveTextContent(
        '{count, plural, one {year} other {}}',
      );
    });
  },
};
