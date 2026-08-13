import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import ArchitectField from '~/components/Form/ArchitectField';

// EntityTypeDialog (inside NewTypeDialog) reads the redux store even while
// hidden; stub the dialog with a trigger that completes with a fixed new id.
vi.mock('~/components/Dialog/NewTypeDialog', () => ({
  default: (props: {
    show?: boolean;
    onComplete?: (newTypeId?: string) => void;
  }) =>
    props.show ? (
      <button
        type="button"
        data-testid="complete-new-type"
        onClick={() => props.onComplete?.('new-edge-type')}
      >
        Complete new type
      </button>
    ) : null,
}));

import type { EdgeEntry } from '../EdgeTypeMultiSelect';
import EdgeTypeMultiSelectField, {
  EdgeTypeMultiSelectInner,
} from '../EdgeTypeMultiSelect';

type RenderPickerOptions = {
  edgeTypes: { value: string; label: string }[];
  value: EdgeEntry[];
  onChange: (edges: EdgeEntry[]) => void;
};

const renderPicker = ({ edgeTypes, value, onChange }: RenderPickerOptions) =>
  render(
    <EdgeTypeMultiSelectInner
      edgeTypes={edgeTypes}
      value={value}
      onChange={onChange}
    />,
  );

describe('EdgeTypeMultiSelectInner', () => {
  it('adds an edges entry with a generated id when an edge type is selected', () => {
    const onChange = vi.fn();
    renderPicker({
      edgeTypes: [{ value: 'knows', label: 'Knows' }],
      value: [],
      onChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Knows' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ subject: { entity: 'edge', type: 'knows' } }),
    ]);

    const [result] = onChange.mock.calls[0] as [EdgeEntry[]];
    expect(result[0]).toHaveProperty('id');
    expect(typeof result[0]!.id).toBe('string');
    expect(result[0]!.id).not.toBe('');
  });

  it('removes the entry (keeping others) when an edge type is deselected', () => {
    const onChange = vi.fn();
    renderPicker({
      edgeTypes: [
        { value: 'knows', label: 'Knows' },
        { value: 'likes', label: 'Likes' },
      ],
      value: [
        {
          id: 'a',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [] },
        },
        { id: 'b', subject: { entity: 'edge', type: 'likes' } },
      ],
      onChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Likes' }));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith([
      {
        id: 'a',
        subject: { entity: 'edge', type: 'knows' },
        form: { fields: [] },
      },
    ]);
  });

  it('does not duplicate an entry when re-selecting an already-present type', () => {
    const onChange = vi.fn();
    renderPicker({
      edgeTypes: [{ value: 'knows', label: 'Knows' }],
      value: [{ id: 'existing', subject: { entity: 'edge', type: 'knows' } }],
      onChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Knows' }));

    // Clicking on a checked item should deselect (remove), not re-add
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('shows an empty-state message (and no checkboxes) when no edge types exist', () => {
    renderPicker({ edgeTypes: [], value: [], onChange: vi.fn() });

    expect(screen.getByText(/no edge types currently defined/i)).toBeDefined();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(
      screen.getByRole('button', { name: /create new edge type/i }),
    ).toBeDefined();
  });

  it('creates a new edge type and selects it immediately', () => {
    const onChange = vi.fn();
    renderPicker({ edgeTypes: [], value: [], onChange });

    fireEvent.click(
      screen.getByRole('button', { name: /create new edge type/i }),
    );
    fireEvent.click(screen.getByTestId('complete-new-type'));

    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({
        subject: { entity: 'edge', type: 'new-edge-type' },
      }),
    ]);
    const [result] = onChange.mock.calls[0] as [EdgeEntry[]];
    expect(typeof result[0]!.id).toBe('string');
    expect(result[0]!.id).not.toBe('');
  });

  it('appends the created type to an existing selection without disturbing it', () => {
    const onChange = vi.fn();
    renderPicker({
      edgeTypes: [{ value: 'knows', label: 'Knows' }],
      value: [
        {
          id: 'a',
          subject: { entity: 'edge', type: 'knows' },
          form: { fields: [] },
        },
      ],
      onChange,
    });

    fireEvent.click(
      screen.getByRole('button', { name: /create new edge type/i }),
    );
    fireEvent.click(screen.getByTestId('complete-new-type'));

    expect(onChange).toHaveBeenCalledOnce();
    const [result] = onChange.mock.calls[0] as [EdgeEntry[]];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'a',
      subject: { entity: 'edge', type: 'knows' },
      form: { fields: [] },
    });
    expect(result[1]!.subject).toEqual({
      entity: 'edge',
      type: 'new-edge-type',
    });
  });

  it('preserves the form field of still-selected entries when another is toggled', () => {
    const onChange = vi.fn();
    renderPicker({
      edgeTypes: [
        { value: 'knows', label: 'Knows' },
        { value: 'likes', label: 'Likes' },
      ],
      value: [
        {
          id: 'a',
          subject: { entity: 'edge', type: 'knows' },
          form: {
            fields: [{ variable: 'strength', component: 'NumberInput' }],
          },
        },
      ],
      onChange,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Likes' }));

    const [result] = onChange.mock.calls[0] as [EdgeEntry[]];
    const knowsEntry = result.find((e) => e.subject.type === 'knows');
    expect(knowsEntry).toBeDefined();
    expect(knowsEntry?.form).toEqual({
      fields: [{ variable: 'strength', component: 'NumberInput' }],
    });
  });
});

describe('EdgeTypeMultiSelectField', () => {
  const renderField = (edgeTypes: Record<string, { name: string }>) => {
    const store = configureStore({
      reducer: {
        activeProtocol: (
          state = { present: { codebook: { edge: edgeTypes } } },
        ) => state,
      },
    });

    return render(
      <Provider store={store}>
        <Form onSubmit={() => ({ success: true })}>
          <ArchitectField
            name="edges"
            label="Edge types"
            labelHidden
            component={EdgeTypeMultiSelectField}
          />
        </Form>
      </Provider>,
    );
  };

  it('sources its options from the codebook edge types', () => {
    renderField({ knows: { name: 'Knows' } });

    expect(screen.getByRole('checkbox', { name: 'Knows' })).toBeInTheDocument();
  });

  it('renders with no options checked when the field has no initial value', () => {
    renderField({ knows: { name: 'Knows' } });

    expect(screen.getByRole('checkbox', { name: 'Knows' })).not.toBeChecked();
  });
});
