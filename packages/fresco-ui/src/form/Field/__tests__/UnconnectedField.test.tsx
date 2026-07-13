import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '../../fields/InputField';
import UnconnectedField from '../UnconnectedField';

describe('UnconnectedField', () => {
  it('emits data-field-name on the field wrapper for e2e targeting', () => {
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
  });
});
