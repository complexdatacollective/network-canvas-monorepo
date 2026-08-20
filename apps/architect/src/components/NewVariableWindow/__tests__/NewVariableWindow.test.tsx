import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

// Capture the props DialogForm receives so the test can invoke the
// backdrop/Esc dismiss path (onClose) the same way the base-ui Dialog does,
// while still mounting a real form store around the fields.
const dialogFormSpy = vi.fn<(props: { onClose: () => void }) => void>();
vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: FormStoreProvider } =
    await import('@codaco/fresco-ui/form/store/formStoreProvider');
  return {
    default: (props: { onClose: () => void; children?: ReactNode }) => {
      dialogFormSpy(props);
      return (
        <FormStoreProvider>
          <div data-testid="dialog-form">
            <button type="button" onClick={() => props.onClose()}>
              dismiss
            </button>
            {props.children}
          </div>
        </FormStoreProvider>
      );
    },
  };
});

vi.mock('~/components/EditorLayout', () => ({
  Section: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Subsection: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('~/components/Form/arrayFields/Options', () => ({
  default: () => null,
  optionsValidation: {},
}));
vi.mock('~/components/Options/LockedOptions', () => ({ default: () => null }));
vi.mock('~/selectors/codebook', () => ({ getVariablesForSubject: () => ({}) }));
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  createVariableAsync: vi.fn(),
}));

const dispatchSpy = vi.fn();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import NewVariableWindow from '../NewVariableWindow';

const renderWindow = (onCancel: () => void) =>
  render(
    <NewVariableWindow
      show
      entity="node"
      type="person"
      onComplete={vi.fn()}
      onCancel={onCancel}
    />,
  );

// Variable names are NMTOKENs, so the characters safeName strips can never be
// typed into the field.
describe('NewVariableWindow name normalisation', () => {
  it('drops characters a variable name cannot contain', () => {
    renderWindow(vi.fn());
    const input = screen.getByRole('textbox', { name: 'Attribute name' });

    fireEvent.change(input, { target: { value: 'my.name[0]' } });

    expect(input).toHaveValue('myname0');
  });
});

// The window is mounted for the lifetime of the picker that owns it and only
// toggles `show`, so nothing but its DialogForm `key` guarantees the next
// variable a clean field store. This mirrors the case the key exists for: the
// form stays mounted across the close (in the app, an exit animation cancelled
// by an immediate reopen), so the second variable's fields re-register over
// the first one's parked values — which `registerField` prefers over
// `initialValue`.
describe('NewVariableWindow seeding across opens', () => {
  it('seeds the next variable from its own initial values, not the last one', () => {
    const first = { name: 'firstVariable', type: 'text' };
    const second = { name: 'secondVariable', type: 'boolean' };
    const props = {
      entity: 'node' as const,
      type: 'person',
      onComplete: vi.fn(),
      onCancel: vi.fn(),
    };

    const { rerender } = render(
      <NewVariableWindow {...props} show initialValues={first} />,
    );
    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'firstVariable',
    );

    rerender(
      <NewVariableWindow {...props} show={false} initialValues={first} />,
    );
    rerender(<NewVariableWindow {...props} show initialValues={second} />);

    expect(screen.getByRole('textbox', { name: 'Attribute name' })).toHaveValue(
      'secondVariable',
    );
  });
});
