import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, useState, type ContextType, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import Field from '../Field/Field';
import UnconnectedField from '../Field/UnconnectedField';
import Form from '../Form';
import { FormStoreContext } from '../store/formStoreProvider';
import ColorPickerField, { resolveSwatchColor } from './ColorPicker';

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
