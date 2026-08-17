import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import EditEgoRule from '../EditEgoRule';

it('groups ego-rule controls in untitled Sections', () => {
  const rule = { type: 'ego', options: {} };
  const codebook = {
    ego: {
      variables: {
        age: { name: 'Age', type: 'number' },
      },
    },
  };

  const { container } = render(
    <EditEgoRule rule={rule} codebook={codebook} onChange={vi.fn()} />,
  );

  expect(container.querySelectorAll('section')).toHaveLength(1);
  expect(screen.getByText('Ego attribute')).toBeInTheDocument();
  expect(
    screen.getByText('Select the ego attribute this rule will be based on.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Ego Variable' })).toBeNull();
});
