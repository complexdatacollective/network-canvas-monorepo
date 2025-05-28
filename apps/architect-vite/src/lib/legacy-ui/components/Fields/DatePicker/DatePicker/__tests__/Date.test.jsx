import { describe, it, expect, vi } from 'vitest';

import React from 'react';
import { render } from '@testing-library/react';
import DatePicker from '../DatePicker';
import Date from '../Date';

describe('<Date>', () => {
  it('can render', () => {
    const mockChild = vi.fn(() => <div>Test</div>);
    
    const { getByText } = render(
      <DatePicker date="2019-12-09">
        <Date>{mockChild}</Date>
      </DatePicker>
    );

    expect(getByText('Test')).toBeInTheDocument();
    expect(mockChild).toHaveBeenCalled();
  });
});
