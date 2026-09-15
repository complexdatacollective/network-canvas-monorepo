import type { Meta, StoryObj } from '@storybook/react-vite';
import { type ComponentProps, useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { awaitPassiveEffects } from '../../storybook-support/awaitPassiveEffects';
import {
  contrastRatio,
  opacityOf,
} from '../../storybook-support/colorContrast';
import Paragraph from '../../typography/Paragraph';
import Field from '../Field/Field';
import UnconnectedField from '../Field/UnconnectedField';
import Form from '../Form';
import SubmitButton from '../SubmitButton';
import ColorPickerField, { type ColorSwatchOption } from './ColorPicker';

// A swatch's name is what the colour is to a reader who cannot see it, so
// these are the theme's own names for the colours these tokens paint —
// `--node-1` is `--neon-coral`, `--edge-1` is `--mustard`, and so on
// (`tooling/tailwind/fresco/themes/default.css`). `PaletteNames` holds them to
// it against the theme itself.
const nodePalette: ColorSwatchOption[] = [
  { value: 'node-color-seq-1', label: 'Neon Coral' },
  { value: 'node-color-seq-2', label: 'Sea Serpent' },
  { value: 'node-color-seq-3', label: 'Purple Pizazz' },
  { value: 'node-color-seq-4', label: 'Neon Carrot' },
  { value: 'node-color-seq-5', label: 'Kiwi' },
  { value: 'node-color-seq-6', label: 'Cerulean Blue' },
  { value: 'node-color-seq-7', label: 'Paradise Pink' },
  { value: 'node-color-seq-8', label: 'Mustard' },
];

const edgePalette: ColorSwatchOption[] = [
  { value: 'edge-color-seq-1', label: 'Mustard' },
  { value: 'edge-color-seq-2', label: 'Purple Pizazz' },
  { value: 'edge-color-seq-3', label: 'Neon Coral' },
  { value: 'edge-color-seq-4', label: 'Kiwi' },
];

/** Colours a caller may hand a swatch that the group is itself painted in. */
const backgroundLikePalette: ColorSwatchOption[] = [
  { value: 'white', label: 'White' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'node-color-seq-2', label: 'Sea Serpent' },
];

/** Colours that let what is behind them through, beside the ones that do not. */
const seeThroughPalette: ColorSwatchOption[] = [
  { value: 'white', label: 'White' },
  { value: 'transparent', label: 'Transparent' },
  { value: 'oklch(0.72 0.19 45 / 0.35)', label: 'Ember Wash' },
  { value: 'node-color-seq-2', label: 'Sea Serpent' },
];

const cssColorPalette: ColorSwatchOption[] = [
  { value: 'rebeccapurple', label: 'Rebecca Purple' },
  { value: '#0f7b6c', label: 'Pine' },
  { value: 'oklch(0.72 0.19 45)', label: 'Ember' },
];

/**
 * The arg-driven examples, holding the colour they are shown choosing.
 *
 * The control is always controlled — a `<Field>` or an `UnconnectedField` owns
 * the value — so a story that only spread its args would render a palette
 * nothing could be chosen from, and the docs page's first example would look
 * broken. Each story keys this on the value it is given, so the Controls panel
 * still sets the selection. (Storybook's own `useArgs` would keep the value in
 * args, but its updates never reach the story under `test:storybook`, which
 * leaves the example's operability unprovable.)
 */
function ExampleColorPicker(props: ComponentProps<typeof ColorPickerField>) {
  const [value, setValue] = useState(props.value);

  return (
    <ColorPickerField
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
    />
  );
}

const meta = {
  title: 'Systems/Form/Fields/ColorPicker',
  component: ColorPickerField,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component: `
A palette of colour swatches, chosen one at a time.

\`\`\`tsx
import Field from '@codaco/fresco-ui/form/Field/Field';
import ColorPickerField from '@codaco/fresco-ui/form/fields/ColorPicker';

<Field
  name="color"
  label="Node color"
  component={ColorPickerField}
  options={[
    { value: 'node-color-seq-1', label: 'Neon Coral' },
    { value: 'node-color-seq-2', label: 'Sea Serpent' },
  ]}
  required
/>;
\`\`\`

- \`options\` — the palette, in the order the swatches are offered. Each entry
  is \`{ value, label }\`: \`value\` is what the form stores AND the colour the
  swatch paints with; \`label\` is the swatch's accessible name.
- A value naming one of the theme's colour sequences
  (\`node-\`/\`edge-\`/\`ord-\`/\`cat-color-seq-N\`) paints with that sequence's
  design token, so it re-resolves inside a themed region. Any other value is
  used as a CSS colour verbatim.
- The chosen swatch is marked by an outline standing off it in the theme's
  \`selected\` colour — a change of shape in a colour that is not the swatch's,
  so the selection is legible without perceiving the swatch's colour at all.
  Hovering an unchosen swatch previews the same outline at reduced strength.
- Every swatch is bordered in the group's foreground, so a swatch filled with
  the colour the group is painted in — white, transparent — is still visibly a
  swatch.
- A see-through fill — \`transparent\`, or any colour carrying an alpha channel
  — shows the chequerboard every swatch is painted on, so it is never the same
  disc as an opaque swatch of the colour behind it.
- Labelling belongs to the surrounding field: use it as the \`component\` of a
  \`<Field>\`, or of an \`UnconnectedField\` when the value is not the form's.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    'aria-invalid': { control: 'boolean' },
    'disabled': { control: 'boolean' },
    'readOnly': { control: 'boolean' },
    'options': { control: false },
  },
  args: {
    'options': nodePalette,
    'aria-label': 'Node color',
  },
  render: (args) => <ExampleColorPicker key={args.value} {...args} />,
} satisfies Meta<typeof ColorPickerField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const swatch = canvas.getByRole('radio', { name: 'Purple Pizazz' });

    await expect(swatch).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(swatch);

    await expect(swatch).toHaveAttribute('aria-checked', 'true');
  },
};

export const WithSelection: Story = {
  args: {
    value: 'node-color-seq-3',
  },
};

/** Any palette the theme publishes as a colour sequence, not only node colours. */
export const EdgePalette: Story = {
  args: {
    'options': edgePalette,
    'value': 'edge-color-seq-2',
    'aria-label': 'Edge color',
  },
};

/** A palette that is not one of the theme's sequences: plain CSS colours. */
export const CssColors: Story = {
  args: {
    'options': cssColorPalette,
    'value': '#0f7b6c',
    'aria-label': 'Brand color',
  },
};

/**
 * A palette is free to hand a swatch the colour the group is painted in —
 * white, transparent, anything near `--input`. The swatch's edge is drawn in
 * the group's foreground and its chosen state in the theme's `selected`
 * colour, so neither can be a colour that vanishes.
 */
export const ColorsCloseToTheBackground: Story = {
  args: {
    'options': backgroundLikePalette,
    'aria-label': 'Brand color',
  },
  // This play reads a style that exists only while the swatch matches
  // `:focus-visible`, which never matches in Chromatic's unfocused capture
  // tab. `test:storybook` is where it runs; the boundary it is about is in
  // every other story's snapshot, since every swatch now carries one.
  parameters: { chromatic: { disableSnapshot: true } },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const white = canvas.getByRole('radio', { name: 'White' });
    const fill = getComputedStyle(white).backgroundColor;
    const ground = getComputedStyle(
      canvas.getByRole('radiogroup', { name: 'Brand color' }),
    ).backgroundColor;

    // Where the swatch is: a border round its edge, in neither the colour it
    // is filled with nor the colour it sits on.
    const edge = getComputedStyle(white);
    await expect(edge.borderTopStyle).toBe('solid');
    await expect(edge.borderTopWidth).not.toBe('0px');
    await expect(edge.borderTopColor).not.toBe(fill);
    await expect(edge.borderTopColor).not.toBe(ground);

    // Being a different colour is not enough to be a boundary. When the fill
    // is the colour the group is painted in, this border is the whole of the
    // swatch's edge, so it is held to the 3:1 that telling a control from its
    // background asks for — measured as painted, which is what a faded ring
    // fails: the group's foreground at 30% over white came to 1.84:1.
    await expect(
      contrastRatio(edge.borderTopColor, ground),
    ).toBeGreaterThanOrEqual(3);

    // Unchosen and unhovered, there is nothing standing off the swatch.
    await expect(edge.outlineStyle).toBe('none');

    // Choosing it changes the swatch in a colour-independent way. Focus moves
    // off afterwards, so what is read is the chosen state and not a focus
    // ring.
    await userEvent.tab();
    await expect(white).toHaveFocus();

    // Focus is the reader's cue rather than the palette's, so it is never the
    // swatch's own colour either. `waitFor` because `transition-all` eases the
    // outline in: the settled value is the one the reader sees.
    await waitFor(async () => {
      await expect(getComputedStyle(white).outlineColor).not.toBe(fill);
    });

    await userEvent.keyboard(' ');
    await expect(white).toHaveAttribute('aria-checked', 'true');
    await userEvent.tab();
    await expect(white).not.toHaveFocus();

    const chosen = getComputedStyle(white);
    await expect(chosen.outlineStyle).toBe('solid');
    await expect(chosen.outlineColor).not.toBe(fill);
    await expect(chosen.outlineColor).not.toBe(ground);
  },
};

/** The colour the theme marks a chosen thing with, as this document paints it. */
const selectedColor = (canvasElement: HTMLElement): string => {
  const probe = canvasElement.appendChild(document.createElement('div'));
  probe.style.backgroundColor = 'var(--selected)';
  const color = getComputedStyle(probe).backgroundColor;
  probe.remove();

  if (color === 'rgba(0, 0, 0, 0)') {
    throw new Error('The theme paints nothing for `--selected`.');
  }

  return color;
};

/**
 * What being chosen, and being pointed at, look like.
 *
 * Both are an outline standing off the swatch in the theme's own `selected`
 * colour, so the cue is the same one the rest of the system uses for a chosen
 * thing and never the swatch's own colour — which says nothing about a colour
 * being the chosen one, and which a swatch filled with the group's background
 * has none of to draw with. Hover shows it faded, so pointing at a swatch is
 * not mistaken for having chosen it.
 */
export const SelectionAndHover: Story = {
  args: {
    value: 'node-color-seq-3',
  },
  // Hover is a state Chromatic's capture has no pointer to produce, and the
  // chosen swatch is already in `WithSelection`'s snapshot.
  parameters: { chromatic: { disableSnapshot: true } },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const selected = selectedColor(canvasElement);
    const chosen = canvas.getByRole('radio', { name: 'Purple Pizazz' });
    const unchosen = canvas.getByRole('radio', { name: 'Kiwi' });

    await expect(chosen).toHaveAttribute('aria-checked', 'true');

    // The chosen swatch: an outline standing off it, at full strength, in the
    // theme's selection colour rather than in its own fill.
    await waitFor(async () => {
      const style = getComputedStyle(chosen);
      await expect(style.outlineStyle).toBe('solid');
      await expect(style.outlineWidth).toBe('4px');
      await expect(style.outlineOffset).toBe('2px');
      await expect(style.outlineColor).toBe(selected);
      await expect(style.outlineColor).not.toBe(style.backgroundColor);
    });

    // Untouched, an unchosen swatch has no outline at all: the two states are
    // told apart by shape, not only by strength.
    await expect(getComputedStyle(unchosen).outlineStyle).toBe('none');

    await userEvent.hover(unchosen);

    // Pointed at, a swatch GROWS. The offer is a different kind of cue from
    // the answer — size against outline — so pointing can never be read as
    // having chosen, and it needs no second colour to tell the two apart.
    //
    // Only Chromium's runner routes the synthetic pointer into `:hover`;
    // Firefox's leaves the rule unmatched, so there the cue is read off the
    // rule the swatch carries rather than off a state the engine will not
    // enter. Which is checked is decided by asking the engine, never assumed:
    // a silent fallback in the browser that CAN hover would leave the measured
    // growth unproven everywhere.
    const ground = unchosen.parentElement;
    await expect(ground).not.toBeNull();
    const idleWidth = ground!.getBoundingClientRect().width;
    if (ground?.matches(':hover')) {
      // Measured as the box the researcher sees, not as the property that
      // carries it: Tailwind writes this growth to CSS `scale`, leaving
      // `transform` at `none`, so a transform reading would call a working
      // cue broken.
      await waitFor(async () => {
        await expect(ground.getBoundingClientRect().width).toBeGreaterThan(
          idleWidth,
        );
      });
      // Growing is not choosing: the offer never borrows the answer's ring.
      // Unless the pointer also moved focus here — a ring then says "focused",
      // which since this change is the same ring as "chosen", so the check is
      // asked only of a swatch the keyboard is not on.
      if (document.activeElement !== unchosen) {
        await expect(getComputedStyle(unchosen).outlineStyle).toBe('none');
      }
    } else {
      await expect(ground).toHaveClass('hover:scale-110');
    }

    // Focus draws the ring the chosen swatch already wears, rather than a
    // second cue in another colour at another width. Read off the engine: the
    // unified treatment is the whole point of the change, so a class check
    // would not prove it.
    unchosen.focus();
    await waitFor(async () => {
      const focused = getComputedStyle(unchosen);
      await expect(focused.outlineStyle).toBe('solid');
      await expect(focused.outlineWidth).toBe('4px');
      await expect(focused.outlineOffset).toBe('2px');
      await expect(focused.outlineColor).toBe(selected);
    });
    // Put the keyboard back where it was: the ring this leaves behind is the
    // focus ring, and the assertions below are about the pointer's cue.
    unchosen.blur();

    // Hovering never makes a swatch the chosen one.
    await expect(unchosen).toHaveAttribute('aria-checked', 'false');
    await expect(chosen).toHaveAttribute('aria-checked', 'true');

    await userEvent.unhover(unchosen);

    await waitFor(async () => {
      await expect(getComputedStyle(unchosen).outlineStyle).toBe('none');
    });
  },
};

/**
 * A colour is free to be see-through: `transparent`, or any colour carrying an
 * alpha channel. Every swatch is painted on a chequerboard, so what a
 * see-through fill lets through is that pattern rather than the group's
 * background — the difference between `white` and `transparent` is something
 * to look at, not only something in the accessible name. An opaque fill covers
 * the chequerboard completely, so nothing else in the palette changes.
 */
export const SeeThroughColors: Story = {
  args: {
    'options': seeThroughPalette,
    'value': 'transparent',
    'aria-label': 'Brand color',
  },
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const swatch = (name: string) => canvas.getByRole('radio', { name });

    // What the two discs differ by. White covers what it is painted on;
    // transparent covers nothing, and the alpha colour covers part of it.
    await expect(
      opacityOf(getComputedStyle(swatch('White')).backgroundColor),
    ).toBe(1);
    await expect(
      opacityOf(getComputedStyle(swatch('Transparent')).backgroundColor),
    ).toBe(0);
    await expect(
      opacityOf(getComputedStyle(swatch('Ember Wash')).backgroundColor),
    ).toBeLessThan(1);

    const underlay = swatch('Transparent').parentElement;
    if (!underlay) throw new Error('A swatch is painted on nothing.');

    const checkerboard = getComputedStyle(underlay);
    await expect(checkerboard.backgroundImage).not.toBe('none');

    // A cue a low-vision reader cannot make out is not a cue: the
    // chequerboard's squares are held to 3:1 against each other.
    await expect(
      contrastRatio(
        checkerboard.getPropertyValue('--swatch-check'),
        checkerboard.backgroundColor,
      ),
    ).toBeGreaterThanOrEqual(3);
  },
};

export const Disabled: Story = {
  args: {
    value: 'node-color-seq-2',
    disabled: true,
  },
};

export const ReadOnly: Story = {
  args: {
    value: 'node-color-seq-2',
    readOnly: true,
  },
};

/** A caller with nothing to offer says so, rather than showing an empty box. */
export const EmptyPalette: Story = {
  args: {
    options: [],
  },
};

/** The swatches wrap: the group shrinks with its container, never past it. */
export const NarrowContainer: Story = {
  args: {
    value: 'node-color-seq-5',
  },
  render: (args) => (
    <div className="w-56">
      <ExampleColorPicker key={args.value} {...args} />
    </div>
  ),
};

function KeyboardSelectionExample() {
  const [color, setColor] = useState<string | undefined>(undefined);

  return (
    <>
      <UnconnectedField
        name="color"
        label="Node color"
        component={ColorPickerField}
        options={nodePalette}
        value={color}
        onChange={setColor}
      />
      <Paragraph margin="none">
        Value:&nbsp;
        <span data-testid="chosen-color">{color ?? 'unset'}</span>
      </Paragraph>
    </>
  );
}

/**
 * The palette is fully operable from the keyboard: Space chooses the focused
 * swatch, and the arrow keys move through the palette, choosing as they go.
 */
export const KeyboardSelection: Story = {
  render: () => <KeyboardSelectionExample />,
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const chosen = canvas.getByTestId('chosen-color');
    const swatch = (name: string) => canvas.getByRole('radio', { name });

    await expect(chosen).toHaveTextContent('unset');

    // Nothing is chosen, so the group's tab stop is its first swatch.
    await userEvent.tab();
    await expect(swatch('Neon Coral')).toHaveFocus();

    await userEvent.keyboard(' ');
    await expect(chosen).toHaveTextContent('node-color-seq-1');
    await expect(swatch('Neon Coral')).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    await expect(chosen).toHaveTextContent('node-color-seq-3');
    await expect(swatch('Purple Pizazz')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await userEvent.keyboard('{ArrowLeft}');
    await expect(chosen).toHaveTextContent('node-color-seq-2');
    await expect(swatch('Sea Serpent')).toHaveAttribute('aria-checked', 'true');

    // Take focus off the palette, so what is left on the chosen swatch is the
    // selection ring and not a focus ring: the selection has to be legible
    // without perceiving the swatch's colour, and an outline is the shape
    // change that makes it so.
    await userEvent.tab();
    await expect(swatch('Sea Serpent')).not.toHaveFocus();
    // `outlineStyle`, not width or offset: an unchosen swatch reports its
    // would-be width with `outline-style: none`, and the chosen one's offset
    // is still easing out of the hover value when the play reads it.
    await expect(getComputedStyle(swatch('Sea Serpent')).outlineStyle).toBe(
      'solid',
    );
    await expect(getComputedStyle(swatch('Kiwi')).outlineStyle).toBe('none');
  },
};

function ErrorStateExample() {
  return (
    <Form onSubmit={() => ({ success: true })}>
      <Field
        name="color"
        label="Node color"
        hint="Interviewers see this color wherever this type appears."
        component={ColorPickerField}
        options={nodePalette}
        required
      />
      <SubmitButton>Save</SubmitButton>
    </Form>
  );
}

/**
 * Left unanswered, the palette reports the same way every other field does:
 * the group is marked invalid and the field's own error region says why.
 */
export const ErrorState: Story = {
  render: () => <ErrorStateExample />,
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup', { name: 'Node color' });

    await expect(group).toHaveAttribute('aria-required', 'true');
    await expect(group).not.toHaveAttribute('aria-invalid', 'true');

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }));

    await expect(group).toHaveAttribute('aria-invalid', 'true');
    await expect(
      await canvas.findByText(
        'You must answer this question before continuing.',
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('radio', { name: 'Kiwi' }));

    await expect(group).not.toHaveAttribute('aria-invalid', 'true');
  },
};

/**
 * A swatch's accessible name is the whole of what its colour is to a reader
 * who cannot see it, so the name has to be the name of the colour the theme
 * paints. Each swatch is compared against the theme's own token for the colour
 * it is named after: a name the theme does not define paints nothing, and a
 * name belonging to another colour paints that other colour.
 */
export const PaletteNames: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  render: () => (
    <>
      <ExampleColorPicker options={nodePalette} aria-label="Node color" />
      <ExampleColorPicker options={edgePalette} aria-label="Edge color" />
    </>
  ),
  play: async ({ canvasElement }) => {
    await awaitPassiveEffects();
    const canvas = within(canvasElement);
    const probe = document.createElement('div');
    canvasElement.append(probe);

    const namesMatchColors = async (
      groupName: string,
      palette: ColorSwatchOption[],
    ) => {
      const group = within(canvas.getByRole('radiogroup', { name: groupName }));

      for (const { label } of palette) {
        // Every swatch in these palettes is named by its caller; a palette
        // that left the naming to the picker has nothing for this play to
        // resolve a token from.
        if (label === undefined) throw new Error('this palette names nothing');
        // Painted with the theme's token for the name the swatch carries.
        // Cleared first: an invalid value leaves the previous one in place.
        probe.style.backgroundColor = '';
        probe.style.backgroundColor = `oklch(var(--${label.toLowerCase().replaceAll(' ', '-')}))`;

        const named = getComputedStyle(probe).backgroundColor;
        await expect(named).not.toBe('rgba(0, 0, 0, 0)');
        await expect(
          getComputedStyle(group.getByRole('radio', { name: label }))
            .backgroundColor,
        ).toBe(named);
      }
    };

    await namesMatchColors('Node color', nodePalette);
    await namesMatchColors('Edge color', edgePalette);

    probe.remove();
  },
};
