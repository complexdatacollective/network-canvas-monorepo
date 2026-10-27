import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Prompt from '../Prompt';

const renderPrompt = (sortOrder: unknown) =>
  render(<Prompt text={{ en: 'Who do you know?' }} sortOrder={sortOrder} />);

describe('Protocol Summary prompt sort order', () => {
  it('prints each sort rule of the prompt', () => {
    renderPrompt([
      { property: '*', direction: 'desc' },
      { property: 'name', direction: 'asc' },
    ]);

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it.each([
    ['text', 'name'],
    ['an object', { property: 'name', direction: 'asc' }],
    ['rules without a direction', [{ property: 'name' }]],
    ['rules without a property', [{ direction: 'asc' }]],
    ['rules that are not objects', ['name']],
  ])('prints no sort rules for %s', (_label, sortOrder) => {
    renderPrompt(sortOrder);

    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });
});
