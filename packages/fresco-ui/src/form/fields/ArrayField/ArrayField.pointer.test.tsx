import { act, fireEvent, render, screen } from '@testing-library/react';
import type { CSSProperties, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import DialogProvider from '../../../dialogs/DialogProvider';

const reorderHarness = vi.hoisted(() => ({
  values: [] as unknown[],
  reorder: undefined as ((values: unknown[]) => void) | undefined,
}));

vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  const { forwardRef } = await import('react');

  type GroupProps = {
    children: ReactNode;
    className?: string;
    onReorder: (values: unknown[]) => void;
    role?: string;
    style?: CSSProperties;
    values: unknown[];
  };
  type ItemProps = {
    children: ReactNode;
    className?: string;
    onDragEnd?: () => void;
    onDragStart?: () => void;
    style?: CSSProperties;
    value: unknown;
  };

  const Group = ({
    children,
    className,
    onReorder,
    role,
    style,
    values,
  }: GroupProps) => {
    reorderHarness.reorder = onReorder;
    reorderHarness.values = values;
    return (
      <ul className={className} role={role} style={style}>
        {children}
      </ul>
    );
  };

  const Item = forwardRef<HTMLLIElement, ItemProps>(
    ({ children, className, onDragEnd, onDragStart, style, value }, ref) => {
      const itemId =
        value && typeof value === 'object' && 'id' in value
          ? String(value.id)
          : undefined;
      return (
        <li
          ref={ref}
          className={className}
          data-item-id={itemId}
          style={style}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {children}
        </li>
      );
    },
  );
  Item.displayName = 'MockReorderItem';

  return {
    ...actual,
    Reorder: { ...actual.Reorder, Group, Item },
    useDragControls: () => ({ start: vi.fn() }),
  };
});

import ArrayField, { type ArrayFieldItemProps } from './ArrayField';

type Item = {
  id: string;
  label: string;
};

const PointerItem = ({ item }: ArrayFieldItemProps<Item>) => (
  <span>{item.label}</span>
);

describe('ArrayField pointer reordering', () => {
  it('previews repeated pointer moves locally and commits one final move', () => {
    const onOperation = vi.fn();
    render(
      <DialogProvider>
        <ArrayField<Item>
          value={[
            { id: 'one', label: 'one' },
            { id: 'two', label: 'two' },
            { id: 'three', label: 'three' },
          ]}
          sortable
          getId={(item) => item.id}
          itemTemplate={() => ({ id: 'new', label: 'new' })}
          itemComponent={PointerItem}
          confirmDelete={false}
          onOperation={onOperation}
        />
      </DialogProvider>,
    );

    const firstItem = document.querySelector('[data-item-id="one"]');
    expect(firstItem).toBeInstanceOf(HTMLElement);
    fireEvent.dragStart(firstItem!);

    const [one, two, three] = reorderHarness.values;
    act(() => reorderHarness.reorder?.([two, one, three]));
    act(() => reorderHarness.reorder?.([two, three, one]));

    expect(onOperation).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['two', 'three', 'one']);

    const movedItem = document.querySelector('[data-item-id="one"]');
    fireEvent.dragEnd(movedItem!);

    expect(onOperation).toHaveBeenCalledOnce();
    expect(onOperation).toHaveBeenCalledWith({
      type: 'move',
      from: 0,
      to: 2,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Moved item 1 to position 3 of 3.',
    );
  });
});
