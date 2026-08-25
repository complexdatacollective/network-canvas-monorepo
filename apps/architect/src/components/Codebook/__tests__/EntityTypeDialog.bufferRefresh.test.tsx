import { render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

/**
 * What a nested editor left OPEN is holding when the editing buffer under it is
 * replaced.
 *
 * `useProtocolTabLock` re-reads the canonical row to hand editing back to this
 * tab, and this editor is rendered from the route tree, so it stays mounted
 * across that. These two cases together are why the lock refuses to refresh
 * while ANY nested editor is open, and not only one already holding unsaved
 * work: an editor mounted before the refresh goes on showing the values it was
 * seeded with, so changing one field and saving would write the rest of the old
 * definition back over what the other tab saved.
 *
 * If a future change makes an open editor re-seed itself from the buffer, the
 * first case here is what will notice — and the lock's rule could then be
 * relaxed back to blocking on dirtiness alone.
 */ vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: FormStoreProvider } =
    await import('@codaco/fresco-ui/form/store/formStoreProvider');
  return {
    default: (props: { children?: ReactNode }) => (
      <FormStoreProvider>
        <div data-testid="dialog-form">{props.children}</div>
      </FormStoreProvider>
    ),
  };
});

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The pickers are irrelevant here and drag in canvas/motion work jsdom cannot
// do.
vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('~/components/TypeEditor/IconPicker', () => ({ default: () => null }));
vi.mock('~/components/TypeEditor/ShapePicker', () => ({
  ShapePickerControl: () => null,
}));
vi.mock('~/components/TypeEditor/ShapeVariableMapping', () => ({
  default: () => null,
}));

const protocolWithName = (name: string) => ({
  codebook: {
    node: {
      person: {
        name,
        color: 'node-color-seq-1',
        iconVariant: 'add-a-person',
        variables: {},
      },
    },
    edge: {},
  },
});

let protocol = protocolWithName('Person');

vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => protocol,
  getCodebook: () => protocol.codebook,
}));

vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import EntityTypeDialog from '../EntityTypeDialog';

describe('EntityTypeDialog across a reclaim refresh', () => {
  it('goes on showing the values it was seeded with', () => {
    protocol = protocolWithName('Person');
    const props = { entity: 'node' as const, type: 'person', onClose: vi.fn() };

    const { rerender } = render(<EntityTypeDialog show {...props} />);
    const nameField = () =>
      screen.getByRole('textbox', { name: 'Node type name' });
    expect(nameField()).toHaveValue('Person');

    // The other tab renamed this type and saved; the reclaim re-reads the
    // canonical row and replaces the editing buffer under the open dialog.
    protocol = protocolWithName('Household member');
    rerender(<EntityTypeDialog show {...props} />);

    // Still the old name. Saving now would write it back over the rename.
    expect(nameField()).toHaveValue('Person');
  });

  it('reads the current row when it is opened afresh', () => {
    protocol = protocolWithName('Household member');

    render(
      <EntityTypeDialog show entity="node" type="person" onClose={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: 'Node type name' })).toHaveValue(
      'Household member',
    );
  });
});
