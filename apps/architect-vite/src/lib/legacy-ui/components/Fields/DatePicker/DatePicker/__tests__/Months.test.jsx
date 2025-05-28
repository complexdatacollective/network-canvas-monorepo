import { describe, it, expect, vi } from 'vitest';

import React from 'react';
import { render } from '@testing-library/react';
import DatePicker from '../DatePicker';
import Months from '../Months';

describe('<Months>', () => {
  it('can render', () => {
    const mockChild = vi.fn(() => <div>Months Test</div>);
    
    const { getByText } = render(
      <DatePicker date="2019-12-09">
        <Months>{mockChild}</Months>
      </DatePicker>
    );

    expect(getByText('Months Test')).toBeInTheDocument();
    expect(mockChild).toHaveBeenCalled();
  });
});
