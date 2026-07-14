import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../PreviewText', () => ({
  default: () => <span>Rule summary</span>,
  Join: ({ value }: { value: string }) => <span>{value}</span>,
}));

import { PreviewRule } from '../PreviewRule';

describe('PreviewRule', () => {
  it('exposes independent semantic edit and delete actions', () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();

    render(
      <PreviewRule
        type="ego"
        options={{}}
        onClick={onClick}
        onDelete={onDelete}
      />,
    );

    const edit = screen.getByRole('button', { name: 'Edit rule' });
    const remove = screen.getByRole('button', { name: 'Delete rule' });

    expect(edit).not.toContainElement(remove);

    fireEvent.click(remove);
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onClick).not.toHaveBeenCalled();

    fireEvent.click(edit);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps the delete action visible for keyboard focus', () => {
    render(
      <PreviewRule
        type="ego"
        options={{}}
        onClick={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete rule' })).toHaveClass(
      'group-focus-within:opacity-100',
    );
  });
});
