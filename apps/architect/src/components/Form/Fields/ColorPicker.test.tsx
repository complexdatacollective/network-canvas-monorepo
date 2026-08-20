import { fireEvent, render, screen } from '@testing-library/react';
import { useContext, type ContextType, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { FormStoreContext } from '@codaco/fresco-ui/form/store/formStoreProvider';
import { COLOR_PALETTES } from '~/config';

import ArchitectField from '../ArchitectField';
import ColorPicker from './ColorPicker';

type StoreApi = NonNullable<ContextType<typeof FormStoreContext>>;

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

const getColor = () => {
  if (!storeApi) throw new Error('form store was not captured');
  return storeApi.getState().getFormValues().color as string | undefined;
};

describe('ColorPicker', () => {
  it('uses radio-group semantics and writes the selection to the form store', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Node color"
        component={ColorPicker}
        initialValue="node-color-seq-1"
        validation={{ required: true }}
        options={[
          { label: 'Red', value: 'node-color-seq-1' },
          { label: 'Blue', value: 'node-color-seq-2' },
        ]}
      />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Node color' });
    expect(group).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));

    expect(getColor()).toBe('node-color-seq-2');
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('renders every generated palette color, including the final index', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Palette"
        component={ColorPicker}
        palette="node-color-seq"
        paletteRange={3}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // Named for the hue the theme resolves that position to, never the
    // internal token: `--node-3` is `oklch(var(--purple-pizazz))`.
    expect(
      screen.getByRole('radio', { name: 'Purple Pizazz' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /color-seq/ })).toBeNull();
  });

  it('names every swatch of every palette by its hue', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Palette"
        component={ColorPicker}
        palette="ord-color-seq"
        paletteRange={COLOR_PALETTES['ord-color-seq']}
      />,
    );

    expect(
      screen
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('aria-label')),
    ).toEqual([
      'Sea Green',
      'Sea Serpent',
      'Tomato',
      'Neon Carrot',
      'Kiwi',
      'Cerulean Blue',
      'Paradise Pink',
      'Mustard',
    ]);
  });

  // A protocol authored against an over-ranged picker (Narrative Pedigree
  // offered ten swatches of an eight-colour palette) still holds a value the
  // list no longer offers. Dropping it from the list would show the researcher
  // an unselected required field and hide what the protocol actually contains.
  it('keeps a stored colour the palette no longer offers, selected and named', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Disease color"
        component={ColorPicker}
        initialValue="node-color-seq-10"
        palette="node-color-seq"
        paletteRange={COLOR_PALETTES['node-color-seq']}
      />,
    );

    const swatches = screen.getAllByRole('radio');
    expect(swatches).toHaveLength(COLOR_PALETTES['node-color-seq'] + 1);

    const stored = screen.getByRole('radio', { name: 'Color 10' });
    expect(stored).toHaveAttribute('aria-checked', 'true');
    // Last, so the palette proper still reads as the palette proper.
    expect(swatches.at(-1)).toBe(stored);
    expect(getColor()).toBe('node-color-seq-10');
  });

  it('offers only the palette when the stored colour is one of its own', () => {
    renderInForm(
      <ArchitectField
        name="color"
        label="Disease color"
        component={ColorPicker}
        initialValue="node-color-seq-2"
        palette="node-color-seq"
        paletteRange={COLOR_PALETTES['node-color-seq']}
      />,
    );

    expect(screen.getAllByRole('radio')).toHaveLength(
      COLOR_PALETTES['node-color-seq'],
    );
    expect(screen.getByRole('radio', { name: 'Sea Serpent' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
