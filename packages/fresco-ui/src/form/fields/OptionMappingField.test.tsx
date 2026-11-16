import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { findDanglingIdReferences } from '../../utils/ariaIdReferences';
import OptionMappingField, {
  type OptionMappingValue,
} from './OptionMappingField';

const options = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square', ariaLabel: 'Select shape Square' },
];

const rows = [
  { id: 'row one', label: 'Friend' },
  { id: '友 2', label: 'Family', note: 'Uses the default shape' },
];

const renderField = (
  props: Partial<Parameters<typeof OptionMappingField>[0]> = {},
) => {
  const onChange = vi.fn<(value: OptionMappingValue | undefined) => void>();
  const view = render(
    <OptionMappingField
      aria-label="Shape for each value"
      name="shapes"
      rows={rows}
      options={options}
      renderOption={(option) => <span data-testid={`tile-${option.value}`} />}
      value={[{ id: 'row one', value: 'circle' }]}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange, ...view };
};

describe('OptionMappingField', () => {
  it('names each row’s radio group from its label and describes it by its note', () => {
    const { container } = renderField();

    expect(
      screen.getByRole('group', { name: 'Shape for each value' }),
    ).toBeVisible();
    expect(screen.getByRole('radiogroup', { name: 'Friend' })).toBeVisible();
    expect(
      screen.getByRole('radiogroup', { name: 'Family' }),
    ).toHaveAccessibleDescription('Uses the default shape');
    for (const el of container.querySelectorAll('[id]')) {
      expect(el.id).not.toMatch(/\s/);
    }
    expect(findDanglingIdReferences(container)).toEqual([]);
  });

  it('marks the mapped option and names a tile by its accessible name', () => {
    renderField();
    const friend = within(screen.getByRole('radiogroup', { name: 'Friend' }));

    expect(friend.getByRole('radio', { name: 'Circle' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(
      friend.getByRole('radio', { name: 'Select shape Square' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('emits an entry for every mapped row and none for an unmapped one', () => {
    const { onChange } = renderField();

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Friend' })).getByRole(
        'radio',
        { name: 'Select shape Square' },
      ),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'row one', value: 'square' },
    ]);

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Family' })).getByRole(
        'radio',
        { name: 'Circle' },
      ),
    );
    expect(onChange).toHaveBeenLastCalledWith([
      { id: 'row one', value: 'circle' },
      { id: '友 2', value: 'circle' },
    ]);
  });

  it('changes nothing while read-only', () => {
    const { onChange } = renderField({ readOnly: true });

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Friend' })).getByRole(
        'radio',
        { name: 'Select shape Square' },
      ),
    );

    expect(onChange).not.toHaveBeenCalled();
  });

  it('gives a single unlabelled row the field’s own name', () => {
    renderField({
      rows: [{ id: 'shape', label: '' }],
      rowLabelsHidden: true,
      value: [{ id: 'shape', value: 'square' }],
    });

    expect(
      screen.getByRole('radiogroup', { name: 'Shape for each value' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('group', { name: 'Shape for each value' }),
    ).toBeNull();
  });

  it('shows option labels as captions only when asked to', () => {
    const { rerender } = renderField();
    expect(screen.queryByText('Circle')).toBeNull();

    rerender(
      <OptionMappingField
        aria-label="Shape for each value"
        name="shapes"
        rows={rows}
        options={options}
        renderOption={() => null}
        showOptionLabels
      />,
    );
    expect(screen.getAllByText('Circle')).toHaveLength(2);
  });
});
