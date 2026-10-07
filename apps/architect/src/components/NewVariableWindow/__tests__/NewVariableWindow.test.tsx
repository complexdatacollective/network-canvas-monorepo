import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { type ContextType, type ReactNode, useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the props DialogForm receives so the test can invoke the
// backdrop/Esc dismiss path (onClose) the same way the base-ui Dialog does,
// while still mounting a real form store around the fields.
const dialogFormSpy = vi.fn<(props: { onClose: () => void }) => void>();
const formStoreRef = vi.hoisted(
  (): {
    current: ContextType<
      typeof import('@codaco/fresco-ui/form/store/formStoreProvider').FormStoreContext
    >;
  } => ({ current: undefined }),
);
vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: FormStoreProvider, FormStoreContext } =
    await import('@codaco/fresco-ui/form/store/formStoreProvider');
  const CaptureStore = () => {
    formStoreRef.current = useContext(FormStoreContext);
    return null;
  };
  return {
    default: (props: { onClose: () => void; children?: ReactNode }) => {
      dialogFormSpy(props);
      return (
        <FormStoreProvider>
          <CaptureStore />
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

vi.mock('~/components/Form/arrayFields/Options', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/components/Form/arrayFields/Options')
  >()),
  default: () => null,
}));
vi.mock('~/components/Options/LockedOptions', () => ({ default: () => null }));

// The attributes the new one is created next to; a stable object, as the
// selector's memoised result is.
const siblingVariables = vi.hoisted(
  (): { current: Record<string, Record<string, unknown>> } => ({
    current: {},
  }),
);
vi.mock('~/selectors/codebook', () => ({
  getVariablesForSubject: () => siblingVariables.current,
}));
vi.mock('~/ducks/modules/protocol/codebook', () => ({
  createVariableAsync: vi.fn(),
}));

const dispatchSpy = vi.fn();
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import NewVariableWindow from '../NewVariableWindow';

const CONTROL_CHARACTERS =
  'This can’t contain tabs, line breaks or other control characters';

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

const nameInput = () => screen.getByRole('textbox', { name: 'Attribute name' });

// Typed, then left, as a researcher does: the field reports once it is touched.
const typeName = (value: string) => {
  fireEvent.change(nameInput(), { target: { value } });
  fireEvent.blur(nameInput());
};

const nameErrors = () => {
  const field = document.querySelector('[data-field-name="name"]');
  if (!field) throw new Error('no name field');
  return [...field.querySelectorAll('li, p')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text.length > 0);
};

describe('NewVariableWindow attribute names', () => {
  beforeEach(() => {
    siblingVariables.current = {};
  });

  // Names are never used as keys or paths, so nothing is stripped as it is
  // typed: a name is kept exactly as the researcher writes it, and trimmed and
  // composed only when it is saved.
  it.each([
    'my.name[0]',
    'amigo cercano',
    'Collègue',
    '友人',
    'Nickname (old)',
  ])('keeps %s exactly as typed and accepts it', async (name) => {
    renderWindow(vi.fn());

    typeName(name);

    expect(nameInput()).toHaveValue(name);
    await waitFor(() => expect(nameErrors()).toEqual([]));
  });

  it('refuses a name with a control character', async () => {
    renderWindow(vi.fn());

    typeName('bad\tname');

    expect(await screen.findByText(CONTROL_CHARACTERS)).toBeInTheDocument();
  });

  it('still refuses a name another attribute already has, however it is written', async () => {
    siblingVariables.current = { a: { name: 'Collègue', type: 'text' } };
    renderWindow(vi.fn());

    typeName('colle\u0300gue ');

    expect(await screen.findByText(/already in use/i)).toBeInTheDocument();
  });

  describe('export columns', () => {
    const renderWithType = (type: string) =>
      render(
        <NewVariableWindow
          show
          entity="node"
          type="person"
          initialValues={{ type }}
          onComplete={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

    it('refuses a name that is a column of a categorical attribute’s option', async () => {
      siblingVariables.current = {
        a: { name: 'foo', type: 'categorical', options: [{ value: 'bar' }] },
      };
      renderWithType('text');

      typeName('foo_bar');

      expect(
        await screen.findByText(
          'Exported data already includes the column “foo_bar” for the option “bar” of the attribute “foo”, so an attribute can’t use this name.',
        ),
      ).toBeInTheDocument();
    });

    it('refuses a name that is a layout attribute’s coordinate column', async () => {
      siblingVariables.current = { a: { name: 'pos', type: 'layout' } };
      renderWithType('text');

      typeName('pos_Y');

      expect(
        await screen.findByText(
          'Exported data already includes the column “pos_y” for the position of the layout attribute “pos”, so an attribute can’t use this name.',
        ),
      ).toBeInTheDocument();
    });

    it('refuses a layout attribute whose coordinate column is another attribute’s name', async () => {
      siblingVariables.current = { a: { name: 'pos_x', type: 'text' } };
      renderWithType('layout');

      typeName('pos');

      expect(
        await screen.findByText(
          'A layout attribute is exported as one column for each coordinate, and the column “pos_x” is already used by the attribute “pos_x”. Choose a different name.',
        ),
      ).toBeInTheDocument();
    });

    it('refuses a name that is a built-in column of the exported file', async () => {
      renderWithType('text');

      typeName('networkCanvasUUID');

      expect(
        await screen.findByText(
          'Exported data already includes a built-in column named “networkCanvasUUID”, so an attribute can’t use this name.',
        ),
      ).toBeInTheDocument();
    });

    it('accepts a name that merely resembles another attribute’s column', async () => {
      siblingVariables.current = {
        a: { name: 'foo', type: 'categorical', options: [{ value: 'bar' }] },
      };
      renderWithType('text');

      typeName('foo bar');

      await waitFor(() => expect(nameErrors()).toEqual([]));
    });
  });
});

// The options list is mocked out of this file, but the field that carries its
// rules is still registered, so a save is judged by the real ones.
describe('NewVariableWindow option export columns', () => {
  const fieldErrors = async (initialValues: Record<string, unknown>) => {
    render(
      <NewVariableWindow
        show
        entity="node"
        type="person"
        initialValues={initialValues}
        onComplete={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const store = formStoreRef.current;
    if (!store) throw new Error('form store was not captured');
    await act(async () => {
      await store.getState().validateForm();
    });
    return store.getState().errors.fieldErrors;
  };

  const options = [
    { label: { en: 'Bar' }, value: 'bar' },
    { label: { en: 'Baz' }, value: 'baz' },
  ];

  beforeEach(() => {
    siblingVariables.current = {};
  });

  it('refuses an option whose column is another attribute’s name', async () => {
    siblingVariables.current = { a: { name: 'foo_bar', type: 'text' } };

    expect(
      await fieldErrors({ name: 'foo', type: 'categorical', options }),
    ).toEqual({
      options: [
        'The option “bar” would be exported to the column “foo_bar”, which the attribute “foo_bar” already uses. Change the option’s value or the attribute’s name.',
      ],
    });
  });

  it('judges the options against the name as it will be saved', async () => {
    siblingVariables.current = { a: { name: 'foo_bar', type: 'text' } };

    expect(
      await fieldErrors({ name: ' foo ', type: 'categorical', options }),
    ).toHaveProperty('options');
  });

  it('is satisfied when no column clashes', async () => {
    siblingVariables.current = { a: { name: 'foo_qux', type: 'text' } };

    expect(
      await fieldErrors({ name: 'foo', type: 'categorical', options }),
    ).toEqual({});
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
