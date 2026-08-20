import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Mirrors NewVariableWindow's mock: keep the children mounted across the
// `show` toggle (in the app, an exit animation whose removal is cancelled by
// an immediate reopen) while still wrapping them in a real form store, so the
// only thing that can give the next dialog a clean store is DialogForm's
// `key`.
vi.mock('~/components/DialogForm/DialogForm', async () => {
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
  Subsection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The pickers are irrelevant to store identity and drag in canvas/motion work
// jsdom cannot do.
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

// An empty codebook: enough for `getNewTypeTemplate`'s next-colour pick and
// for the name field's uniqueness rule. Both selectors are mocked, so the
// state the component threads through them is never read.
vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => ({ codebook: { node: {}, edge: {} } }),
  getCodebook: () => ({ node: {}, edge: {} }),
}));

const dispatchSpy = vi.fn();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import EntityTypeDialog from '../EntityTypeDialog';

// The dialog is mounted for the lifetime of its owner (NewTypeDialog keeps it
// rendered and only toggles `show`), and every "Create node type" is a
// DIFFERENT type — so each open needs its own field store. Keying on
// `type ?? \`new-${entity}\`` cannot provide one: the key is identical for two
// consecutive creations of the same entity, so the second creation re-registers
// its fields over the first one's parked values (`registerField` prefers a
// dormant value over `initialValue`). Two edge types created back to back —
// exactly what the sample protocol's edge-creation sociogram does — is the
// real-world case.
describe('EntityTypeDialog seeding across opens', () => {
  it.each([
    ['node', 'Node type name'],
    ['edge', 'Edge type name'],
  ] as const)(
    'starts a second new %s type from an empty name, not the abandoned one',
    (entity, nameLabel) => {
      const props = { entity, onClose: vi.fn() };

      const { rerender } = render(<EntityTypeDialog show {...props} />);
      fireEvent.change(screen.getByRole('textbox', { name: nameLabel }), {
        target: { value: 'Abandoned' },
      });

      rerender(<EntityTypeDialog show={false} {...props} />);
      rerender(<EntityTypeDialog show {...props} />);

      expect(screen.getByRole('textbox', { name: nameLabel })).toHaveValue('');
    },
  );
});
