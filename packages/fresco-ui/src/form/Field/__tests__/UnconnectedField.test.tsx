import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '../../fields/InputField';
import UnconnectedField from '../UnconnectedField';

describe('UnconnectedField', () => {
  it('names the field wrapper for e2e targeting and still forwards name to the inner field', () => {
    // Consumers like SegmentedCodeField and RadioMatrixField derive test ids /
    // per-row group names from `name`, so pulling it out for the wrapper must
    // not stop it reaching the wrapped component.
    const { container } = render(
      <UnconnectedField
        name="introductionPanel.title"
        label="Title"
        component={InputField}
      />,
    );
    expect(
      container.querySelector('[data-field-name="introductionPanel.title"]'),
    ).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute(
      'name',
      'introductionPanel.title',
    );
  });
});
