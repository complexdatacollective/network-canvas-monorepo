import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import BooleanAnswersField from './BooleanAnswersField.tsx';

/** Where a form-fields row keeps the answers of the boolean it collects. */
const ANSWERS_FIELD = 'options';

function Answers({
  initialValue,
  readOnly = false,
}: Readonly<{
  initialValue?: Record<string, unknown>[];
  readOnly?: boolean;
}>) {
  return (
    <Field<typeof BooleanAnswersField>
      name={ANSWERS_FIELD}
      component={BooleanAnswersField}
      label="Answer labels"
      hint="The words on the two answers this question offers."
      readOnly={readOnly}
      {...(initialValue === undefined ? {} : { initialValue })}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Boolean answers',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The words on the two answers a yes-or-no question offers, edited where the question is asked. The value is the attribute’s whole options list, so the row carries one draft key whichever kind of answer it binds; the row’s own save puts it on the codebook attribute. Each answer says which of the two stored values it records, because that is the part the researcher cannot change and the part that decides what every stored answer means.',
      },
    },
  },
  args: {
    stageId: 'ego-form-1',
    sectionTitle: 'Answer labels',
    children: <Answers />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Nothing written yet: an attribute that names no answers is a Yes/No
 * question, and the placeholders show the words the interview will use.
 */
export const NoAnswersYet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the field is drawn a
    // turn after the story mounts.
    await awaitPassiveEffects();

    // A markdown box rather than an input — the interview renders an option
    // label as markdown wherever it shows one — so its placeholder is the one
    // a screen reader reads and the empty box draws.
    await expect(
      await canvas.findByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveAttribute('aria-placeholder', 'Yes');
    await expect(
      canvas.getByRole('textbox', { name: 'Label for “false”' }),
    ).toHaveAttribute('aria-placeholder', 'No');
  },
};

/** The words the attribute already carries. */
export const AnswersTheAttributeHolds: Story = {
  args: {
    children: (
      <Answers
        initialValue={[
          { label: 'Related', value: true },
          { label: 'Not related', value: false },
        ]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveTextContent('Related');
    await expect(
      canvas.getByRole('textbox', { name: 'Label for “false”' }),
    ).toHaveTextContent('Not related');
  },
};

/** Read-only: the answers are shown, and nothing about them can be typed. */
export const ReadOnly: Story = {
  args: {
    children: (
      <Answers
        readOnly
        initialValue={[
          { label: 'Related', value: true },
          { label: 'Not related', value: false },
        ]}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('textbox', { name: 'Label for “true”' }),
    ).toHaveAttribute('aria-readonly', 'true');
  },
};

/**
 * One answer named and the other left blank is a control with one button the
 * participant can read and one they cannot, which the schema accepts — so the
 * answer that is blank says so itself.
 */
export const OneAnswerLeftBlank: Story = {
  args: {
    children: <Answers initialValue={[{ label: '', value: true }]} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const named = await canvas.findByRole('textbox', {
      name: 'Label for “true”',
    });
    await userEvent.type(named, 'Related');

    await expect(
      canvas.getByRole('textbox', { name: 'Label for “false”' }),
    ).toHaveAccessibleDescription(
      /Write what this answer says, or clear both to offer Yes and No\./,
    );
  },
};
