import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { familyPedigreeMessages as messages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import DefaultChoiceField from './DefaultChoiceField.tsx';

/** Where a Family Pedigree keeps the words used for family members. */
const FRAMING_FIELD = 'framing';

/** The control as the pedigree's wording section mounts it. */
function Wording() {
  const intl = useAppIntl();
  return (
    <Field<typeof DefaultChoiceField>
      name={FRAMING_FIELD}
      component={DefaultChoiceField}
      label={intl.formatMessage(messages.framingLabel)}
      hint={intl.formatMessage(messages.framingHint)}
      defaultOption="gendered"
      options={[
        {
          value: 'gendered',
          label: intl.formatMessage(messages.framingGenderedLabel),
          description: intl.formatMessage(messages.framingGenderedDescription),
        },
        {
          value: 'gamete',
          label: intl.formatMessage(messages.framingGameteLabel),
          description: intl.formatMessage(messages.framingGameteDescription),
        },
      ]}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Default choice',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A choice between named options, one of which is what the protocol means by saying nothing. The default option is drawn as chosen while nothing is stored, and choosing it again removes the key rather than writing the default, so a stage never records a decision nobody made. Used for the words a Family Pedigree uses for family members, and for who a nomination prompt can be selected for.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Wording',
    children: <Wording />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A stage that stores nothing: the default option is the one drawn as chosen. */
export const NothingStoredIsTheDefault: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor is drawn a
    // turn after the story mounts: every play awaits its first query.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Everyday kinship words/ }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
      canvas.getByRole('option', { name: /^Egg parent and sperm parent/ }),
    ).toHaveAttribute('aria-selected', 'false');
  },
};

/** Choosing the other option stores it, and choosing the default stores nothing. */
export const ChoosingAndChoosingBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('option', {
        name: /^Egg parent and sperm parent/,
      }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await expect(
      await canvas.findByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('"framing":"gamete"');

    await userEvent.click(
      canvas.getByRole('option', { name: /^Everyday kinship words/ }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    // Saved a second time, with the key gone: waited for rather than read at
    // once, because the first save's status is still on screen until it lands.
    await waitFor(() =>
      expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).not.toHaveTextContent('"framing"'),
    );
  },
};

/** Held elsewhere: both options can be read, and neither can be chosen. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('option', { name: /^Everyday kinship words/ }),
    ).toBeDisabled();
  },
};
