import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { messageRuleValidation } from '@codaco/fresco-ui/form/validation/helpers';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import { IntegerFieldControl, wholeNumberRule } from './IntegerField.tsx';

/** Where a name generator holds the most people one stage may name. */
const MAX_FIELD = 'behaviours.maxNodes';

const STAGE = sectionId({ kind: 'stage', stageId: 'name-generator-1' });

const MAX_LABEL = 'Most people';

const NOT_A_WHOLE_NUMBER = 'This has to be a whole number of people.';

/**
 * The rule that can actually refuse the save, stated by the caller.
 *
 * The control holds text it could not read as a count instead of dropping it,
 * and only a field's own validation reaches the form's validity — so a section
 * that rendered this control without the rule would show a refusal nothing
 * enforced, and save the text. `AlterLimitsSection` states it first among its
 * own rules for that reason, and so does this story.
 */
const COUNT_VALIDATION = messageRuleValidation([wholeNumberRule]);

/**
 * How long after the last keystroke the rule speaks, as the section sets it.
 *
 * The commonest refusal here is about the text in the box, and hearing it on
 * the keystroke that caused it is the only way it reads as being about that
 * keystroke.
 */
const REFUSAL_DELAY = 250;

/** A count of people, rendered the way a section that counts them renders it. */
const peopleCount = (
  <Field<typeof IntegerFieldControl>
    name={MAX_FIELD}
    component={IntegerFieldControl}
    label={MAX_LABEL}
    hint="Leave empty for no maximum."
    placeholder="No limit"
    custom={COUNT_VALIDATION}
    validateOnChange
    validateOnChangeDelay={REFUSAL_DELAY}
  />
);

/** A stage that already caps how many people it may name. */
const holdingAMaximum = (host: InMemoryHost) => {
  const { document } = host.store.read(STAGE);
  host.store.applyAsCollaborator(STAGE, {
    ...document,
    behaviours: { maxNodes: 25 },
  });
};

const meta = {
  title: 'Protocol Builder/Fields/Whole number',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'A box holding a count of people — the most a stage may name, the fewest it must. What reaches the protocol is a number rather than the text that was typed, which is the whole reason the control exists: a stage storing “3” is refused by the schema in its own words, against a path, long after the researcher has moved on. Text that is not a count yet is kept in the box rather than reported as no answer, because the box renders from the value it reported and emptying it mid-keystroke made a limit impossible to type — and because a count the stage had already saved would otherwise be deleted by a save the researcher was being told, in red, had been refused. The refusal itself belongs to the section: the control cannot stop a submit, so every caller owes its fields `wholeNumberRule`.',
      },
    },
  },
  args: {
    stageId: 'name-generator-1',
    sectionTitle: 'How many people this stage may name',
    children: peopleCount,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the protocol holds it: no maximum at all. An empty box is an
 * absent count rather than empty text, because absence is how the schema
 * spells "no limit".
 */
export const NoLimit: Story = {};

/** A cap the researcher has already set. */
export const ALimitTheStageHolds: Story = {
  args: { seedEdit: holdingAMaximum },
};

/** Held elsewhere: the count can be read and not changed. */
export const ASpectator: Story = {
  args: { seedEdit: holdingAMaximum, readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('spinbutton', { name: MAX_LABEL }),
    ).toBeDisabled();
  },
};

/**
 * Text the box could not read as a count. It stays where the researcher typed
 * it — `2.5` on its way to `25` loses its own last character if the control
 * reports it as no answer — and the rule says what is wrong with it, in the
 * field's own error region, where every other refusal in the builder appears.
 */
export const SomethingThatIsNotACount: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('spinbutton', { name: MAX_LABEL });
    await userEvent.type(box, '2.5');

    await expect(await canvas.findByText(NOT_A_WHOLE_NUMBER)).toBeVisible();
    // Both halves, because the control used to have one without the other: it
    // marked itself invalid and printed its reason in a paragraph nothing
    // named, so it announced as invalid with nothing attached saying why.
    await waitFor(async () => {
      await expect(box).toHaveAccessibleDescription(
        new RegExp(NOT_A_WHOLE_NUMBER),
      );
    });
    await expect(box).toHaveAttribute('aria-invalid', 'true');
  },
};

/**
 * What the box shows and what the stage stores are two different things, and
 * only the saved document can tell them apart: `"maxNodes":3` is the count,
 * and `"maxNodes":"3"` would be the characters — a stage the schema refuses.
 */
export const TheCountReachesTheStageAsANumber: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.type(
      await canvas.findByRole('spinbutton', { name: MAX_LABEL }),
      '3',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent(/"maxNodes":3[,}]/);
    });
  },
};

/**
 * An emptied box takes the key with it rather than parking `""` on it. A stage
 * with no maximum is a stage whose document has no maximum in it: `""` is not
 * a value the schema accepts anywhere, and neither is the container an absence
 * written INTO one would leave standing.
 */
export const AnEmptiedBoxIsNoLimit: Story = {
  args: { seedEdit: holdingAMaximum },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('spinbutton', { name: MAX_LABEL });
    await expect(box).toHaveValue(25);
    await userEvent.clear(box);
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    // Waited for the save rather than read straight after the click: the host
    // answers a turn later, and "the stage holds no maximum" is true of a save
    // that has not happened yet as well as of one that has.
    const status = canvas.getByRole('status', { name: 'Save status' });
    await waitFor(async () => {
      await expect(status).toHaveTextContent('Saved:');
    });
    await expect(status).not.toHaveTextContent('maxNodes');
  },
};
