import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../PersonNameField', () => ({
  default: () => <div data-testid="person-name-field" />,
}));

vi.mock('../../BiologicalSexField', () => ({
  default: () => <div data-testid="biological-sex-field" />,
}));

import EgoSexStep from '../EgoSexStep';

describe('EgoSexStep', () => {
  test('does not ask the pedigree node-label question about ego', () => {
    const { getByTestId, queryByTestId } = render(<EgoSexStep />);

    expect(getByTestId('biological-sex-field')).toBeInTheDocument();
    expect(queryByTestId('person-name-field')).not.toBeInTheDocument();
  });
});
