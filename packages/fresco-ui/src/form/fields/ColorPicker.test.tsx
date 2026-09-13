import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, useState, type ContextType, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import UnconnectedField from '../Field/UnconnectedField';
import Form from '../Form';
import { FormStoreContext } from '../store/formStoreProvider';
import ColorPickerField, {
  COLOR_SEQUENCE_HUE_NAMES,
  resolveSwatchColor,
} from './ColorPicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

// The theme's own names for what these tokens paint: `--node-1` is
// `--neon-coral` (`tooling/tailwind/fresco/themes/default.css`).
const palette = [
  { value: 'node-color-seq-1', label: 'Neon Coral' },
  { value: 'node-color-seq-2', label: 'Sea Serpent' },
  { value: 'node-color-seq-3', label: 'Purple Pizazz' },
];

let storeApi: StoreApi | null = null;

const CaptureStore = () => {
  storeApi = useContext(FormStoreContext) ?? null;
  return null;
};

const renderInForm = (children: ReactNode) => {
  storeApi = null;

  return render(
    <Form onSubmit={() => ({ success: true })}>
      <CaptureStore />
      {children}
    </Form>,
  );
};

const storedColor = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi.getState().getFormValues().color as string | undefined;
};

const swatchColorOf = (name: string) =>
  screen.getByRole('radio', { name }).style.getPropertyValue('--swatch-color');

describe('ColorPickerField', () => {
  it('is a radio group whose swatches are named, and writes the chosen name to the form store', () => {
    renderInForm(
      <Field
        name="color"
        label="Node color"
        component={ColorPickerField}
        initialValue="node-color-seq-1"
        options={palette}
        required
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Node color' });
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['Neon Coral', 'Sea Serpent', 'Purple Pizazz']);
    expect(screen.getByRole('radio', { name: 'Neon Coral' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Purple Pizazz' }));

    expect(storedColor()).toBe('node-color-seq-3');
    expect(
      screen.getByRole('radio', { name: 'Purple Pizazz' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('paints a colour-sequence name with that sequence’s theme variable', () => {
    renderInForm(
      <Field
        name="color"
        label="Node color"
        component={ColorPickerField}
        options={[
          { value: 'node-color-seq-3', label: 'Purple Pizazz' },
          { value: 'edge-color-seq-6', label: 'Tomato' },
          { value: 'ord-color-seq-10', label: 'Slate Blue' },
          { value: 'cat-color-seq-1', label: 'Sea Serpent' },
        ]}
      />,
    );

    // The theme publishes the sequences as --node-N/--edge-N/--ord-N/--cat-N,
    // which re-resolve inside a themed region; the swatch must reference them
    // rather than freeze one rendering of the palette.
    expect(swatchColorOf('Purple Pizazz')).toBe('var(--node-3)');
    expect(swatchColorOf('Tomato')).toBe('var(--edge-6)');
    expect(swatchColorOf('Slate Blue')).toBe('var(--ord-10)');
    expect(swatchColorOf('Sea Serpent')).toBe('var(--cat-1)');
  });

  it('paints a value that is not a colour-sequence name as the CSS colour it is', () => {
    expect(resolveSwatchColor('rebeccapurple')).toBe('rebeccapurple');
    expect(resolveSwatchColor('#ff0000')).toBe('#ff0000');
    expect(resolveSwatchColor('node-color-seq-8')).toBe('var(--node-8)');
  });

  it('says the palette is empty rather than showing an empty box', () => {
    renderInForm(
      <Field
        name="color"
        label="Node color"
        component={ColorPickerField}
        options={[]}
      />,
    );

    expect(screen.queryAllByRole('radio')).toEqual([]);
    expect(
      screen.getByText('No colors are available to choose from.'),
    ).toBeInTheDocument();
  });

  it('shows the stored colour but refuses a change while read-only', () => {
    renderInForm(
      <Field
        name="color"
        label="Node color"
        component={ColorPickerField}
        initialValue="node-color-seq-1"
        options={palette}
        readOnly
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Sea Serpent' }));

    expect(storedColor()).toBe('node-color-seq-1');
    expect(screen.getByRole('radio', { name: 'Neon Coral' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('works through UnconnectedField, taking its name from the field’s label', () => {
    function Standalone() {
      const [color, setColor] = useState<string | undefined>(
        'node-color-seq-2',
      );

      return (
        <>
          <UnconnectedField
            name="color"
            label="Disease color"
            component={ColorPickerField}
            options={palette}
            value={color}
            onChange={setColor}
            errors={['Choose a color for this disease.']}
            showErrors
          />
          <p data-testid="stored-color">{color ?? 'unset'}</p>
        </>
      );
    }

    render(<Standalone />);

    expect(
      screen.getByRole('radiogroup', { name: 'Disease color' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Choose a color for this disease.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Purple Pizazz' }));

    expect(screen.getByTestId('stored-color')).toHaveTextContent(
      'node-color-seq-3',
    );
  });
});

/**
 * The theme decides which hue each position of a colour sequence resolves to,
 * so the names the picker announces are only correct while it still does. This
 * reads the stylesheet that decides it, ported from Architect's own
 * `config/__tests__/colorSwatchNames.test.ts` at `74a07e626`: a reordered
 * palette fails here rather than silently teaching a screen-reader user that
 * swatch 3 is "Purple Pizazz" when it is now green.
 *
 * Read off disk rather than imported, because this project sets `css: false`
 * and an `?raw` import of a stylesheet would arrive empty. Resolved against
 * this file, so it cannot drift with a working directory.
 */
const THEME_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../tooling/tailwind/fresco/themes/default.css',
);

/** `--node-3: oklch(var(--purple-pizazz));` -> `{ 'node-3': 'purple-pizazz' }` */
const readThemeHues = (): Map<string, string> => {
  const css = readFileSync(THEME_PATH, 'utf8');
  const hues = new Map<string, string>();
  const declaration =
    /--((?:node|edge|ord|cat)-\d+)\s*:\s*oklch\(var\(--([a-z-]+)\)\)/g;
  let match = declaration.exec(css);
  while (match) {
    const [, token, hue] = match;
    if (token && hue) hues.set(token, hue);
    match = declaration.exec(css);
  }
  return hues;
};

/** `purple-pizazz` -> `Purple Pizazz`, the form the names are written in. */
const titleCase = (hue: string) =>
  hue
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

describe('the names the picker gives the theme’s own swatches', () => {
  const themeHues = readThemeHues();

  it('reads the theme it is pinned against', () => {
    // Guards the regex and the path: an empty map would make every assertion
    // below vacuous.
    expect(themeHues.size).toBeGreaterThan(0);
  });

  it.each(Object.keys(COLOR_SEQUENCE_HUE_NAMES))(
    'names every %s swatch after the hue the theme gives it',
    (sequence) => {
      const prefix = sequence.replace('-color-seq', '');
      const names = COLOR_SEQUENCE_HUE_NAMES[sequence] ?? [];
      const expected = names.map((_, index) => {
        const hue = themeHues.get(`${prefix}-${index + 1}`);
        expect(hue).toBeDefined();
        return titleCase(hue ?? '');
      });

      expect(names.map((message) => message.defaultMessage)).toEqual(expected);
    },
  );

  it.each(Object.keys(COLOR_SEQUENCE_HUE_NAMES))(
    'names every position the theme defines for %s',
    (sequence) => {
      const prefix = sequence.replace('-color-seq', '');
      const definedPositions = [...themeHues.keys()].filter((token) =>
        token.startsWith(`${prefix}-`),
      ).length;

      expect(COLOR_SEQUENCE_HUE_NAMES[sequence]).toHaveLength(definedPositions);
    },
  );

  it('announces a sequence swatch by its hue when the caller names none', () => {
    // The whole point of moving the naming here: a caller offering the
    // theme's palette says only which colours it offers, and every picker
    // that offers `node-color-seq-2` announces the same hue.
    renderInForm(
      <Field
        name="color"
        label="Node color"
        component={ColorPickerField}
        initialValue="node-color-seq-1"
        options={[
          { value: 'node-color-seq-1' },
          { value: 'edge-color-seq-6' },
          { value: 'ord-color-seq-10' },
          { value: 'cat-color-seq-8' },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['Neon Coral', 'Tomato', 'Slate Blue', 'Barbie Pink']);
  });

  it('lets a caller name a colour the theme has no name for, and falls back to the value', () => {
    renderInForm(
      <Field
        name="color"
        label="Highlight color"
        component={ColorPickerField}
        options={[
          { value: 'transparent', label: 'Transparent' },
          { value: 'rebeccapurple' },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual(['Transparent', 'rebeccapurple']);
  });
});
