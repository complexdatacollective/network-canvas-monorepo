import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

// Only the type-name field is under test. The pickers drag in canvas and
// motion work jsdom cannot do, and none of them contributes an error.
vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('@codaco/fresco-ui/form/fields/IconPicker', () => ({
  default: () => null,
}));
vi.mock('../ShapePicker', () => ({ ShapePickerControl: () => null }));
vi.mock('../ShapeVariableMapping', () => ({ default: () => null }));

const existingCodebook = vi.hoisted(
  (): {
    current: {
      node: Record<string, { name: string }>;
      edge: Record<string, { name: string }>;
    };
  } => ({ current: { node: {}, edge: {} } }),
);
vi.mock('~/selectors/protocol', () => ({
  getCodebook: () => existingCodebook.current,
}));
vi.mock('~/ducks/hooks', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import TypeEditor from '../TypeEditor';

const renderTypeEditor = (entity: 'node' | 'edge') =>
  render(
    <Form onSubmit={() => ({ success: true })}>
      <TypeEditor entity={entity} isNew initialValues={{}} />
      <SubmitButton>Save and Close</SubmitButton>
    </Form>,
  );

const submit = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Save and Close' }));
};

const messagesFor = (name: string) => {
  const field = document.querySelector(`[data-field-name="${name}"]`);
  if (!field) throw new Error(`no field named ${name}`);
  return [...field.querySelectorAll('li, p')]
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text.length > 0);
};

/**
 * One condition, one message.
 *
 * Saving a type with an empty name used to produce a bulleted list of two:
 * "This field is required." AND "Not a valid variable name…", because the
 * pattern rule prefaulted an absent value to `''` and then tested THAT against
 * the expression. The second message was wrong twice over — it fired on a
 * field the researcher had simply not filled in, and it called a node type
 * name a variable name.
 */
describe('<TypeEditor /> name validation', () => {
  beforeEach(() => {
    existingCodebook.current = { node: {}, edge: {} };
  });

  it('groups controls in untitled Sections', () => {
    const { container } = renderTypeEditor('node');

    expect(container.querySelectorAll('section')).toHaveLength(4);
    expect(screen.getByText('Node type name')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: /^(Node Type|Color|Shape|Icon)$/,
      }),
    ).toBeNull();
  });

  it('reports only that the name is required when it is empty', async () => {
    renderTypeEditor('node');

    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual(['This field is required.']);
    });
  });

  it('reports only that the name is required when it is whitespace', async () => {
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: '   ' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual(['This field is required.']);
    });
  });

  it('refuses a node type name with a control character, naming nothing about letters or symbols', async () => {
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: 'Close\tfriend' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([
        'This can’t contain tabs, line breaks or other control characters',
      ]);
    });
  });

  it('refuses an edge type name with a control character', async () => {
    renderTypeEditor('edge');

    fireEvent.change(screen.getByRole('textbox', { name: 'Edge type name' }), {
      target: { value: 'Works\u0000With' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([
        'This can’t contain tabs, line breaks or other control characters',
      ]);
    });
  });

  it('refuses a name that another type already has, ignoring case and composition', async () => {
    existingCodebook.current = {
      node: { a: { name: 'Collègue' } },
      edge: { b: { name: 'Works With' } },
    };
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: 'COLLE\u0300GUE ' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual(['"COLLÈGUE" is already in use']);
    });
  });

  it.each([
    'Person',
    'Close friend',
    'amigo cercano',
    'Collègue',
    '友人',
    'Works With (at the office)',
    'Parent/guardian',
  ])('accepts the name %s', async (name) => {
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: name },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([]);
    });
  });
});
