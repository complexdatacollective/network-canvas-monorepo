import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '../InputField';

describe('InputField styling ownership', () => {
  it('keeps container and native-input classes on their respective elements', () => {
    render(
      <InputField
        aria-label="Styled input"
        className="w-screen"
        inputClassName="uppercase"
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Styled input' });
    const wrapper = input.parentElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('w-screen');
    expect(wrapper).not.toHaveClass('uppercase');
    expect(input).toHaveClass('uppercase');
    expect(input).not.toHaveClass('w-screen');
  });
});
