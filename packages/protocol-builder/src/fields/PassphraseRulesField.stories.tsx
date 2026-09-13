import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import PassphraseRulesField, {
  passphraseRulesIssue,
} from './PassphraseRulesField.tsx';

/** The schema keeps the passphrase rules under one optional key. */
const VALIDATION_FIELD = 'validation';

const ANONYMISATION_STAGE = sectionId({
  kind: 'stage',
  stageId: 'anonymisation-1',
});

/**
 * The rules as `PassphraseRulesSection` mounts them.
 *
 * The label, the guidance and the verdict are the SECTION's: what a passphrase
 * has to look like is this stage's question, and the control that holds the
 * answer cannot know that a maximum of zero would make the interview
 * unfinishable. A story that left the `custom` validation out would show a
 * control that refuses nothing.
 */
function PassphraseRules() {
  return (
    <Field<typeof PassphraseRulesField>
      name={VALIDATION_FIELD}
      component={PassphraseRulesField}
      label="Passphrase rules"
      hint="A longer passphrase is harder to guess and harder to remember. A participant who forgets it cannot recover the answers it protects."
      custom={messageRuleValidation([passphraseRulesIssue])}
    />
  );
}

/** The rules the stage holds, written as the protocol would hold them. */
const holdingLengths =
  (lengths: Readonly<Record<string, number>> | undefined) =>
  (host: InMemoryHost) => {
    const next = { ...host.store.read(ANONYMISATION_STAGE).document };
    if (lengths === undefined) delete next[VALIDATION_FIELD];
    else next[VALIDATION_FIELD] = { ...lengths };
    host.store.applyAsCollaborator(ANONYMISATION_STAGE, next);
  };

/** Absence is how the schema spells "a participant may choose anything". */
const noRules = holdingLengths(undefined);

const meta = {
  title: 'Protocol Builder/Fields/Passphrase rules',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Holds what a participant’s passphrase has to look like: a shortest allowed length, a longest, or neither. It is the package’s own validation-rule editor pointed at the passphrase rule catalogue, so a rule is switched on with a checkbox and given its number beside it, and a rule switched on and left empty is kept rather than quietly discarded — which is why the save is refused while one is there. The stage’s own impossibilities are refused here too: a shortest longer than the longest, and a longest of no characters at all, which the interview could never accept because it asks every participant for a passphrase.',
      },
    },
  },
  args: {
    stageId: 'anonymisation-1',
    sectionTitle: 'Passphrase validation',
    children: <PassphraseRules />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * No requirements at all: both rules are off and neither has a number, because
 * a rule that is not in force has no length to show.
 */
export const NoRulesYet: Story = {
  args: { seedEdit: noRules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('checkbox', { name: 'Minimum text length' }),
    ).not.toBeChecked();
    await expect(
      canvas.getByRole('checkbox', { name: 'Maximum text length' }),
    ).not.toBeChecked();
    await expect(canvas.queryAllByRole('spinbutton')).toHaveLength(0);
  },
};

/**
 * The lengths the fixture's stage holds: between four and twelve characters.
 * Each rule's number sits under the checkbox that switched it on.
 */
export const TheLengthsAStageHolds: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('checkbox', { name: 'Minimum text length' }),
    ).toBeChecked();
    await expect(
      canvas.getByRole('spinbutton', { name: 'Minimum text length' }),
    ).toHaveValue(4);
    await expect(
      canvas.getByRole('spinbutton', { name: 'Maximum text length' }),
    ).toHaveValue(12);
  },
};

/**
 * Switching a requirement on: the number appears with the rule, and the stage
 * saves holding it. A rule is one decision made in two places — that it applies
 * at all, and what it is — so the number cannot be typed before the checkbox.
 */
export const SwitchingARuleOn: Story = {
  args: { seedEdit: noRules },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('checkbox', { name: 'Minimum text length' }),
    );

    await expect(
      await canvas.findByRole('spinbutton', { name: 'Minimum text length' }),
    ).toHaveValue(1);
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('"minLength":1');
    });
  },
};

/**
 * Held elsewhere: the rules are there to read and none of them can be changed.
 * They stay on screen rather than being replaced by a summary — what the stage
 * requires is the thing a spectator came to read.
 */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('checkbox', { name: 'Minimum text length' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('spinbutton', { name: 'Minimum text length' }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole('checkbox', { name: 'Maximum text length' }),
    ).toBeDisabled();
  },
};

/**
 * A shortest passphrase longer than the longest one: no passphrase could
 * satisfy both, so the save is refused and the stage is not written.
 *
 * The refusal arrives at the submit rather than while the researcher is still
 * deciding, because it is the field's `custom` validation and a form runs that
 * when the stage is saved.
 */
export const TheSaveIsRefusedWhenTheShortestExceedsTheLongest: Story = {
  args: { seedEdit: holdingLengths({ minLength: 40, maxLength: 5 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText(
        'The shortest passphrase you allow cannot be longer than the longest one.',
      ),
    ).toBeInTheDocument();
    // And nothing was written: the refusal is what the researcher gets, not a
    // stage saved with requirements no participant could meet.
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/**
 * A longest passphrase of no characters at all. The interview asks every
 * participant for a passphrase and refuses an empty one, so a maximum of zero
 * is a length no passphrase can have: the stage would render and the interview
 * could never be finished.
 */
export const TheSaveIsRefusedWhenNoLengthIsPossible: Story = {
  args: { seedEdit: holdingLengths({ maxLength: 0 }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText(
        'The longest passphrase you allow must be at least one character.',
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};
