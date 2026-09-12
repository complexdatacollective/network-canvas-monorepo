import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';

import type { ParameterShape } from '../codebook/variableParameters.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import ComposerParametersField, {
  type ComposerParameters,
} from './ComposerParametersField.tsx';

/**
 * What the codebook attribute this field records into already accepts.
 *
 * Worked out by the row from the attribute and the control it chose, and
 * passed in: this control is told what it would inherit rather than reading a
 * codebook, because which attribute is being asked for is the row's business.
 */
const FROM_THE_ATTRIBUTE: ComposerParameters = {
  type: 'full',
  min: '1920-01-01',
  max: '2024-12-31',
};

/** A narrower window, written on this field alone. */
const ITS_OWN: ComposerParameters = {
  type: 'full',
  min: '2015-01-01',
  max: '2024-12-31',
};

/** A window with no date in it, which is the one thing these settings refuse. */
const BACKWARDS: ComposerParameters = {
  type: 'full',
  min: '2024-12-31',
  max: '2015-01-01',
};

/** Said above the settings while the field is still following the attribute. */
const INHERITED_SENTENCE =
  'These come from the “date of birth” attribute, and this field follows them. Change any of them and this field keeps a set of its own.';

/**
 * One field's settings, as a network composer's row dialog mounts them.
 *
 * `shape` is the pair the row holds — which attribute, and which control was
 * chosen to ask for it — resolved to the settings that control takes. A date
 * picker's is bounded by two dates and a resolution; the other two shapes are
 * a relative window of days, and the two words at the ends of a scale.
 */
function TheSettings({
  initialValue,
  inherited,
  shape = 'datePicker',
}: Readonly<{
  initialValue?: ComposerParameters;
  inherited?: ComposerParameters;
  shape?: ParameterShape;
}>) {
  return (
    <Field<typeof ComposerParametersField>
      name="parameters"
      component={ComposerParametersField}
      label="What this field accepts"
      hint="These settings belong to this field rather than to the attribute, so the same attribute can be asked for differently on another stage."
      shape={shape}
      {...(initialValue === undefined ? {} : { initialValue })}
      {...(inherited === undefined
        ? {}
        : { inherited, inheritedFrom: 'date of birth' })}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Form field settings',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'What one field of a network composer’s form accepts: the window a date must fall in, the words at the ends of a scale. The same controls the codebook’s own attribute editor renders, because the question is identical — what differs is where the answer is written. Everywhere else these settings belong to the attribute; here they belong to the FIELD, so one attribute can be a date picker bounded by two dates on this form and a relative window on the next. A field that has written none of its own runs on the attribute’s, which is what the interview reads too, so those are shown and edited as though they were this field’s — and writing anything different is what gives the field a set of its own.',
      },
    },
  },
  args: {
    stageId: 'network-composer-1',
    // What the host stands in for is the row dialog that edits one form field.
    sectionTitle: 'One field of this form',
    children: <TheSettings />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A field whose attribute accepts anything, so there is nothing to inherit and
 * nothing written.
 *
 * Shown on the scale shape — the two words at the ends of a scale — because
 * that is a shape whose settings can be genuinely empty. A date picker cannot:
 * it has to collect a date at some precision, so a resolution is always in
 * force and its two bounds are the interview's own until somebody narrows
 * them. The other stories in this file show that shape.
 */
export const NothingSet: Story = {
  args: { children: <TheSettings shape="scalar" /> },
};

/**
 * Settings of this field's own, which is what stops it following the
 * attribute. The attribute still accepts the wider window; this form asks for
 * the narrower one.
 */
export const SettingsOfItsOwn: Story = {
  args: {
    children: (
      <TheSettings initialValue={ITS_OWN} inherited={FROM_THE_ATTRIBUTE} />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(await canvas.findByLabelText('Earliest date')).toHaveValue(
      '2015-01-01',
    );
    await expect(canvas.queryByText(INHERITED_SENTENCE)).toBeNull();
  },
};

/**
 * A field following the attribute, which is said rather than left to be
 * inferred from an empty-looking block: an absent set of settings is not an
 * absent setting, because the interview reads the attribute's when the field
 * has none.
 *
 * Changing one of them is what gives the field a set of its own, and the play
 * is that change. What the researcher is shown while they make it is the whole
 * block they would run with — an override typed over blanks would replace the
 * inherited settings with the one just written and silently drop the rest.
 */
export const InheritedFromTheAttribute: Story = {
  args: { children: <TheSettings inherited={FROM_THE_ATTRIBUTE} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(await canvas.findByText(INHERITED_SENTENCE)).toBeVisible();

    await userEvent.selectOptions(
      canvas.getByRole('combobox', { name: 'Date resolution' }),
      'year',
    );

    // The two bounds are stored AT the resolution they were chosen under, so
    // coarsening it throws them away — which the control says will happen
    // before it does, and says has happened once it has.
    await expect(
      await canvas.findByText(
        'The earliest and latest dates were cleared, because they were set at the previous resolution. Set them again if you still need them.',
      ),
    ).toBeVisible();
    await expect(canvas.queryByText(INHERITED_SENTENCE)).toBeNull();
  },
};

/** Held elsewhere: the settings can be read and none of them changed. */
export const ASpectator: Story = {
  args: {
    readOnly: true,
    children: <TheSettings initialValue={ITS_OWN} />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Date resolution' }),
    ).toBeDisabled();
  },
};

/**
 * A window that ends before it starts, which leaves the participant no date to
 * choose.
 *
 * Said under the date that ends it, while the researcher is still looking at
 * it, rather than waiting for the save: the pair is on screen, so the one that
 * is wrong can be named. The protocol's own parameter schema is asked last and
 * only when nothing above it has a complaint, so what is shown here is this
 * editor's sentence rather than the schema's.
 */
export const AWindowThatEndsBeforeItStarts: Story = {
  args: { children: <TheSettings initialValue={BACKWARDS} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'The latest date cannot be earlier than the earliest date.',
      ),
    ).toBeVisible();
  },
};
