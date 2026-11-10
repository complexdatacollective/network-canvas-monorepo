import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import type { MessageArguments } from '@codaco/protocol-validation';

import { REQUIRED } from '../form/requiredField.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import LocalizedMessageField from './LocalizedMessageField.tsx';

/** A person, and a count: a select and a plural. */
const PARENTS_ARGUMENTS = {
  isYou: { kind: 'select', cases: ['true'] },
  name: { kind: 'text' },
  missing: { kind: 'plural' },
} as const satisfies MessageArguments;

const PARENTS_ITEM = {
  'en-US':
    '{isYou, select, true {{missing, plural, one {Add your other biological parent} other {Add your biological parents}}} other {{missing, plural, one {Add another biological parent for “{name}”} other {Add biological parents for “{name}”}}}}',
};

const parentsItem = (
  <Field<typeof LocalizedMessageField>
    name="completeness.itemText.parents.listItem"
    component={LocalizedMessageField}
    label="Missing parents item"
    hint="Asks for a person’s missing parents. It can show their name and how many parents are missing."
    arguments={PARENTS_ARGUMENTS}
    initialValue={PARENTS_ITEM}
    required={REQUIRED}
  />
);

const meta = {
  title: 'Protocol Builder/Fields/Text with versions',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Participant-facing text that reads differently depending on what it is about, edited as piped text is: one line, its placeholders (such as a person’s name) as pills, and a piece of text with a version for each case (about the participant, about someone else) or wording that fits a number only where the text has one, folded to a pill until it is opened. The insert menu (the syringe button, or typing `{`) offers what the setting declares; the names come from `useMessageArgumentLabels`.\n\n```tsx\n<Field\n  name="completeness.itemText.parents.listItem"\n  component={LocalizedMessageField}\n  label="Missing parents item"\n  arguments={PARENTS_ARGUMENTS}\n/>\n```',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Completeness checklist',
    children: parentsItem,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A message that is one choice, with a plural inside each of its versions:
 * each version that is nothing but another switch lists its own versions
 * beneath it, so every case's wording is on screen, and each inner
 * line is named by both cases it is for.
 */
export const SelectAndPlural: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const one = await canvas.findByRole('textbox', {
      name: 'About the participant, When it is 1',
    });
    await expect(one).toBeVisible();
    await expect(one).toHaveTextContent('Add your other biological parent');
    await expect(
      canvas.getByRole('textbox', {
        name: 'About the participant, When it is 0, 2, 3, …',
      }),
    ).toBeVisible();
    // The version about someone else is a number too, listed the same way.
    await expect(
      canvas.getByRole('textbox', {
        name: 'About someone else, When it is 1',
      }),
    ).toHaveTextContent('Add another biological parent for “Name”');
  },
};

const PARTNER_ARGUMENTS = {
  named: { kind: 'select', cases: ['true'] },
  personIsYou: { kind: 'select', cases: ['true'] },
  partnerIsYou: { kind: 'select', cases: ['true'] },
  partner: { kind: 'text' },
} as const satisfies MessageArguments;

/**
 * The deepest message Network Canvas supplies: a choice inside a choice
 * inside a choice, each the whole of the version above it. Every level is
 * listed, so all four lines of wording show; no case is hidden behind a pill.
 */
export const ThreeLevelsDeep: Story = {
  args: {
    children: (
      <Field<typeof LocalizedMessageField>
        name="relationship.stillTogether"
        component={LocalizedMessageField}
        label="Still together question"
        arguments={PARTNER_ARGUMENTS}
        initialValue={{
          'en-US':
            '{named, select, true {{personIsYou, select, true {Are you still together with {partner}?} other {{partnerIsYou, select, true {Are you still together?} other {Are they still together with {partner}?}}}}} other {Are they still together?}}',
        }}
        required={REQUIRED}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const deepest = await canvas.findByRole('textbox', {
      name: 'When the person has a name, When the person is someone else, When the partner is someone else',
    });
    await expect(deepest).toBeVisible();
    await expect(deepest).toHaveTextContent(
      'Are they still together with Partner’s name?',
    );
    await expect(
      canvasElement.querySelectorAll('[data-always-open]'),
    ).toHaveLength(3);
    await expect(
      canvasElement.querySelector('[data-versions-pill]'),
    ).toBeNull();

    // The arrow keys read down through every line, across the levels.
    const lines = canvasElement.querySelectorAll<HTMLElement>('[data-version]');
    const leaves = [...lines].filter(
      (line) => line.querySelector('[data-always-open]') === null,
    );
    await expect(leaves).toHaveLength(4);
    let current = leaves[0];
    current?.focus();
    for (const leaf of leaves.slice(1)) {
      // From the end of a line, Down goes to the next.
      const selection = current?.ownerDocument.getSelection();
      if (current && selection) {
        selection.selectAllChildren(current);
        selection.collapseToEnd();
      }
      await userEvent.keyboard('{ArrowDown}');
      await waitFor(() => expect(leaf).toHaveFocus());
      current = leaf;
    }
  },
};

const MINIMUM_ARGUMENTS = {
  count: { kind: 'plural' },
} as const satisfies MessageArguments;

const minimumField = (initialValue: Record<string, string>, label: string) => (
  <Field<typeof LocalizedMessageField>
    name="minimumNotReached"
    component={LocalizedMessageField}
    label={label}
    hint="Shown when a participant has not yet added enough."
    arguments={MINIMUM_ARGUMENTS}
    initialValue={initialValue}
    required={REQUIRED}
  />
);

/**
 * A message that is nothing but a plural, such as the one shown when a
 * participant has not added the minimum: both versions are always on screen,
 * labelled by the numbers they are for, and stay there when the field is left.
 */
export const WholeMessageIsAPlural: Story = {
  args: {
    children: minimumField(
      {
        'en-US':
          '{count, plural, one {You must create at least # item before you can continue.} other {You must create at least # items before you can continue.}}',
      },
      'Minimum not reached',
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const one = await canvas.findByRole('textbox', { name: 'When it is 1' });
    const other = canvas.getByRole('textbox', {
      name: 'When it is 0, 2, 3, …',
    });
    await expect(one).toBeVisible();
    await expect(one).toHaveTextContent(
      'You must create at least Number item before you can continue.',
    );
    await expect(other).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-versions-pill]'),
    ).toBeNull();

    // Leaving the field does not fold them.
    await userEvent.click(one);
    await userEvent.click(canvasElement.ownerDocument.body);
    await expect(one).toBeVisible();
    await expect(other).toBeVisible();
  },
};

/**
 * Words around a choice make it a part of a sentence, which folds to a pill
 * until it is opened.
 */
export const ChoiceInASentence: Story = {
  args: {
    children: (
      <Field<typeof LocalizedMessageField>
        name="completeness.itemText.parents.listItem"
        component={LocalizedMessageField}
        label="Missing parents item"
        arguments={PARENTS_ARGUMENTS}
        initialValue={{
          'en-US':
            'Parents of {name}: {isYou, select, true {yours} other {theirs}}',
        }}
        required={REQUIRED}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const line = await canvas.findByRole('textbox', {
      name: 'Missing parents item',
    });
    const pill = within(line).getByRole('button', {
      name: 'Participant or someone else',
    });
    await expect(pill).toHaveAttribute('aria-expanded', 'false');
    await expect(
      canvas.queryByRole('textbox', { name: 'About the participant' }),
    ).toBeNull();

    await userEvent.click(pill);
    await expect(
      await canvas.findByRole('textbox', { name: 'About the participant' }),
    ).toBeVisible();
  },
};
