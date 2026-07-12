import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HeadingInput } from './StageHeading';

describe('HeadingInput', () => {
  it('preserves hero styling while using required and shared error semantics', () => {
    render(
      <HeadingInput
        required
        input={{
          name: 'label',
          value: '',
          onChange: vi.fn(),
          onBlur: vi.fn(),
          onFocus: vi.fn(),
        }}
        meta={{ touched: true, invalid: true, error: 'Required' }}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Stage name' });
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Required');
  });
});
