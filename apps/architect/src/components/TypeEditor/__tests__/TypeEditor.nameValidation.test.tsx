import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

// Only the type-name field is under test. The pickers drag in canvas and
// motion work jsdom cannot do, and none of them contributes an error.
vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('../IconPicker', () => ({ default: () => null }));
vi.mock('../ShapePicker', () => ({ ShapePickerControl: () => null }));
vi.mock('../ShapeVariableMapping', () => ({ default: () => null }));

vi.mock('~/selectors/protocol', () => ({
  getCodebook: () => ({ node: {}, edge: {} }),
  // The synthetic-data section reads the whole protocol, to collect the rules
  // its interfaces imply for each of the type's attributes.
  getProtocol: () => ({ stages: [] }),
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
  it('groups controls in untitled Sections', () => {
    const { container } = renderTypeEditor('node');

    // Name, colour, shape, icon, and the synthetic-data section.
    expect(container.querySelectorAll('section')).toHaveLength(5);
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

  it('names a node type name as such when the characters are wrong', async () => {
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: 'Not a valid name!' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([
        'Not a valid node type name. Only letters, numbers and the symbols ._-: are supported',
      ]);
    });
  });

  it('names an edge type name as such when the characters are wrong', async () => {
    renderTypeEditor('edge');

    fireEvent.change(screen.getByRole('textbox', { name: 'Edge type name' }), {
      target: { value: 'Works With!' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([
        'Not a valid edge type name. Only letters, numbers and the symbols ._-: are supported',
      ]);
    });
  });

  it('accepts a valid name', async () => {
    renderTypeEditor('node');

    fireEvent.change(screen.getByRole('textbox', { name: 'Node type name' }), {
      target: { value: 'Person' },
    });
    submit();

    await waitFor(() => {
      expect(messagesFor('name')).toEqual([]);
    });
  });
});
