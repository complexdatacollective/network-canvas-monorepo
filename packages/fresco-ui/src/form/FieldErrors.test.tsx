import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import FieldErrors from './FieldErrors';

describe('FieldErrors', () => {
  it('renders every validation message when a field has multiple errors', () => {
    render(
      <FieldErrors
        id="field-error"
        show
        errors={['Required', 'Must be unique']}
      />,
    );

    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getByText('Required')).toBeVisible();
    expect(screen.getByText('Must be unique')).toBeVisible();
  });
});
